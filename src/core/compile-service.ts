import type { App } from 'obsidian';
import { applyContentRules } from './compile/content-rules';
import { renumberFootnotes } from './compile/footnote-renumber';
import { buildSectionBreak } from './compile/section-breaks';
import { djb2, formatChapterHash } from './compile/hash';
import {
	findScenesInProject,
	type CompilePresetNote,
	type SceneNote,
} from './discovery';
import { sortScenesByOrder } from './sort-scenes';

/**
 * Outcome of one compile run. Consumed by the output renderers (P3.C)
 * and the Compile tab's last-compile section (P3.D).
 */
export interface CompileResult {
	/**
	 * Concatenated markdown ready for render-md to write to disk, or
	 * render-pdf / render-odt to transform.
	 */
	markdown: string;
	/** Scenes that successfully contributed to `markdown`. */
	scenesCompiled: number;
	/**
	 * Scenes dropped by the inclusion filters (status filter, exclude
	 * list). Distinct from `errors`, which counts scenes that were in
	 * scope but failed to read.
	 */
	scenesSkipped: number;
	/** Advisory messages. Populated for partial-success conditions. */
	warnings: string[];
	/**
	 * Per-scene read failures. The rest of the compile still completes;
	 * each failure leaves an error marker in `markdown` and an entry
	 * here, matching CR Book Builder's per-chapter try/catch semantics.
	 */
	errors: CompileError[];
	/**
	 * `"<scene-id>:<djb2-hash>"` strings for every successfully-read
	 * scene. Suitable for writing into the preset's
	 * `dbench-last-chapter-hashes` on compile completion so the
	 * Compile tab (P3.D) can surface "N scenes changed since last
	 * compile." Omits scenes that failed to read.
	 */
	chapterHashes: string[];
}

export interface CompileError {
	scenePath: string;
	message: string;
}

/**
 * Core compile pipeline.
 *
 * Per [D-06 § Inclusion model](../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * the pipeline collects all scenes in the preset's project (sorted by
 * `dbench-order`), filters by the preset's status filter and exclude
 * list, reads each scene's body, and concatenates the bodies into one
 * markdown document. This format-agnostic intermediate is consumed by
 * the output renderers (MD / PDF / ODT) that land in P3.C.
 *
 * Per-scene transformations (frontmatter, body scope, heading
 * prepending, inline transforms) run through
 * `src/core/compile/content-rules.ts`. Footnote renumbering, section
 * breaks, and djb2 hashing land in sibling modules in later commits.
 */
export class CompileService {
	constructor(private app: App) {}

	async generate(preset: CompilePresetNote): Promise<CompileResult> {
		const warnings: string[] = [];
		const errors: CompileError[] = [];

		const projectId = preset.frontmatter['dbench-project-id'];
		if (projectId === '') {
			warnings.push(
				`Preset "${preset.file.basename}" has no project link; nothing to compile.`
			);
			return emptyResult(warnings, errors);
		}

		const allScenes = sortScenesByOrder(findScenesInProject(this.app, projectId));
		if (allScenes.length === 0) {
			warnings.push(
				`Project has no scenes; preset "${preset.file.basename}" compiles to an empty document.`
			);
			return emptyResult(warnings, errors);
		}

		const selected = filterScenes(allScenes, preset.frontmatter);
		const scenesSkipped = allScenes.length - selected.length;
		if (selected.length === 0) {
			warnings.push(
				`Preset "${preset.file.basename}" filtered out all ${allScenes.length} scenes; nothing to compile.`
			);
			return { ...emptyResult(warnings, errors), scenesSkipped };
		}

		const bodies: string[] = [];
		const chapterHashes: string[] = [];
		let scenesCompiled = 0;
		let footnoteOffset = 1;

		for (let i = 0; i < selected.length; i++) {
			const scene = selected[i];
			try {
				const raw = await this.app.vault.read(scene.file);
				chapterHashes.push(
					formatChapterHash(scene.frontmatter['dbench-id'], djb2(raw))
				);
				const transformed = applyContentRules(raw, {
					preset: preset.frontmatter,
					sceneTitle: scene.file.basename,
					compileIndex: i + 1,
				});
				const renumbered = renumberFootnotes(transformed, footnoteOffset);
				footnoteOffset += renumbered.consumedCount;
				const sectionBreak = buildSectionBreak(scene, preset.frontmatter);
				if (sectionBreak) bodies.push(sectionBreak);
				bodies.push(renumbered.content);
				scenesCompiled++;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				errors.push({ scenePath: scene.file.path, message });
				bodies.push(
					`<!-- Draft Bench: failed to read "${scene.file.basename}": ${message} -->`
				);
			}
		}

		return {
			markdown: bodies.join('\n\n'),
			scenesCompiled,
			scenesSkipped,
			warnings,
			errors,
			chapterHashes,
		};
	}
}

/**
 * Apply the preset's inclusion knobs (status filter + exclude list) to
 * an ordered list of scenes.
 *
 * - **Status filter.** When `dbench-compile-scene-statuses` is
 *   non-empty, only scenes whose `dbench-status` appears in the filter
 *   are kept. Scenes with missing or empty status are excluded (strict
 *   match per D-06 — "missing status = not ready"). A future Data
 *   Quality surface will flag these as fixable pre-compile.
 * - **Excludes.** Any scene whose basename matches an entry in
 *   `dbench-compile-scene-excludes` is dropped. Entries may be
 *   wikilinks (`[[Name]]`) or bare basenames; both forms are
 *   normalized here so the UI affordances (P3.D) can write whichever
 *   is convenient.
 */
function filterScenes(
	scenes: SceneNote[],
	fm: CompilePresetNote['frontmatter']
): SceneNote[] {
	const statuses = fm['dbench-compile-scene-statuses'];
	const excludes = fm['dbench-compile-scene-excludes'];
	const excludeNames = new Set(
		excludes.map((entry) => {
			const match = entry.match(/^\[\[(.+?)\]\]$/);
			return match ? match[1] : entry;
		})
	);

	return scenes.filter((scene) => {
		if (excludeNames.has(scene.file.basename)) return false;
		if (statuses.length > 0) {
			const status = scene.frontmatter['dbench-status'];
			if (!status || !statuses.includes(status)) return false;
		}
		return true;
	});
}

function emptyResult(warnings: string[], errors: CompileError[]): CompileResult {
	return {
		markdown: '',
		scenesCompiled: 0,
		scenesSkipped: 0,
		warnings,
		errors,
		chapterHashes: [],
	};
}
