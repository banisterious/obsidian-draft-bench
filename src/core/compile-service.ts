import type { App } from 'obsidian';
import { buildChapterHeading } from './compile/chapter-rules';
import { applyContentRules } from './compile/content-rules';
import { renumberFootnotes } from './compile/footnote-renumber';
import { buildSectionBreak } from './compile/section-breaks';
import { djb2, formatChapterHash } from './compile/hash';
import {
	createStripAccumulator,
	type StripAccumulator,
	type StripSummary,
} from './compile/strip-accumulator';
import {
	findChaptersInProject,
	findScenesInChapter,
	findScenesInProject,
	type ChapterNote,
	type CompilePresetNote,
	type SceneNote,
} from './discovery';
import { sortScenesByOrder } from './sort-scenes';
import type { DbenchId } from '../model/types';

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
	 *
	 * Chapter-aware compiles still emit one hash per scene; chapter-body
	 * hashing is post-V1.
	 */
	chapterHashes: string[];
	/**
	 * Aggregate strip counts across every scene in this compile (P3.F).
	 * Populated by the shared accumulator threaded into
	 * `applyContentRules`; surfaced via the dispatcher's success
	 * outcome so the Run notice can list "3 image embeds, 1 base embed"
	 * without per-embed Notice spam.
	 */
	stripSummary: StripSummary;
}

export interface CompileError {
	scenePath: string;
	message: string;
}

/**
 * Mutable per-compile state threaded through `processScene`. Kept
 * internal to this module so the public `CompileResult` shape stays
 * stable while the walkers share a common per-scene helper.
 */
interface SceneAccumulator {
	bodies: string[];
	chapterHashes: string[];
	errors: CompileError[];
	scenesCompiled: number;
	footnoteOffset: number;
	stripAccumulator: StripAccumulator;
}

/**
 * Core compile pipeline.
 *
 * Per [D-06 § Inclusion model](../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * the pipeline collects all scenes in the preset's project, filters by
 * the preset's status filter and exclude list, reads each scene's body,
 * and concatenates the bodies into one markdown document. This
 * format-agnostic intermediate is consumed by the output renderers (MD
 * / PDF / ODT) that land in P3.C.
 *
 * Two walk shapes (Step 8 of chapter-type):
 *
 * - **Flat** — chapter-less projects. Scenes sorted by `dbench-order`
 *   across the whole project, processed in order. Pre-Step-8 behavior;
 *   byte-identical to the previous single-loop implementation.
 * - **Chapter-aware** — projects with one or more chapters. Walks
 *   chapters in `dbench-order`, then scenes within each chapter in
 *   `dbench-order`. Per-scene processing is identical to flat; the
 *   chapter-segment emission rule (heading + intro before scenes)
 *   lands in a follow-up commit.
 *
 * Per-scene transformations (frontmatter, body scope, heading
 * prepending, inline transforms) run through
 * `src/core/compile/content-rules.ts`. Footnote renumbering, section
 * breaks, and djb2 hashing live in sibling modules.
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

		const chapters = findChaptersInProject(this.app, projectId);
		if (chapters.length > 0) {
			return this.walkChapterAware(preset, chapters, warnings, errors);
		}
		return this.walkFlat(preset, projectId, warnings, errors);
	}

	private async walkFlat(
		preset: CompilePresetNote,
		projectId: DbenchId,
		warnings: string[],
		errors: CompileError[]
	): Promise<CompileResult> {
		const allScenes = sortScenesByOrder(findScenesInProject(this.app, projectId));
		if (allScenes.length === 0) {
			warnings.push(
				`Project has no scenes; preset "${preset.file.basename}" compiles to an empty document.`
			);
			return emptyResult(warnings, errors);
		}

		const excludeSet = buildExcludeSet(
			preset.frontmatter['dbench-compile-scene-excludes']
		);
		const selected = filterScenes(allScenes, preset.frontmatter, excludeSet);
		const scenesSkipped = allScenes.length - selected.length;
		if (selected.length === 0) {
			warnings.push(
				`Preset "${preset.file.basename}" filtered out all ${allScenes.length} scenes; nothing to compile.`
			);
			return { ...emptyResult(warnings, errors), scenesSkipped };
		}

		const stripAccumulator = createStripAccumulator();
		const acc: SceneAccumulator = {
			bodies: [],
			chapterHashes: [],
			errors,
			scenesCompiled: 0,
			footnoteOffset: 1,
			stripAccumulator,
		};

		for (let i = 0; i < selected.length; i++) {
			await this.processScene(selected[i], i + 1, preset, acc);
		}

		return {
			markdown: acc.bodies.join('\n\n'),
			scenesCompiled: acc.scenesCompiled,
			scenesSkipped,
			warnings,
			errors,
			chapterHashes: acc.chapterHashes,
			stripSummary: stripAccumulator.snapshot(),
		};
	}

	/**
	 * Chapter-aware walker. Two-pass:
	 *
	 * 1. Resolve every chapter's scene list + apply filters; accumulate
	 *    totals. Lets us emit the "no scenes" / "filtered out all"
	 *    warnings before doing any vault I/O, matching `walkFlat`'s
	 *    early-exit semantics.
	 * 2. Process scenes in chapter -> dbench-order, threading the shared
	 *    SceneAccumulator so footnote offsets, hashes, and strip counts
	 *    span the whole compile.
	 *
	 * Scenes orphaned in the project (carry `dbench-project-id` but no
	 * `dbench-chapter-id`) are silently skipped here; the integrity
	 * service's `PROJECT_MIXED_CHILDREN` check is the canonical place
	 * to surface that condition.
	 */
	private async walkChapterAware(
		preset: CompilePresetNote,
		chapters: ChapterNote[],
		warnings: string[],
		errors: CompileError[]
	): Promise<CompileResult> {
		const sortedChapters = [...chapters].sort(
			(a, b) =>
				(a.frontmatter['dbench-order'] ?? 0) -
				(b.frontmatter['dbench-order'] ?? 0)
		);
		const excludeSet = buildExcludeSet(
			preset.frontmatter['dbench-compile-scene-excludes']
		);

		const plans: Array<{ chapter: ChapterNote; selected: SceneNote[] }> = [];
		let totalScenes = 0;
		let totalSelected = 0;
		for (const chapter of sortedChapters) {
			const chapterScenes = sortScenesByOrder(
				findScenesInChapter(this.app, chapter.frontmatter['dbench-id'])
			);
			totalScenes += chapterScenes.length;
			// Excluding a chapter drops the whole segment: heading,
			// intro, every child scene. The chapter's scenes still
			// count toward totalScenes so they're reflected in
			// scenesSkipped, matching the writer's "I dropped N scenes"
			// expectation when they exclude a chapter wikilink.
			if (excludeSet.has(chapter.file.basename)) continue;
			const selected = filterScenes(
				chapterScenes,
				preset.frontmatter,
				excludeSet
			);
			totalSelected += selected.length;
			plans.push({ chapter, selected });
		}

		if (totalScenes === 0) {
			warnings.push(
				`Project has no scenes; preset "${preset.file.basename}" compiles to an empty document.`
			);
			return emptyResult(warnings, errors);
		}
		if (totalSelected === 0) {
			warnings.push(
				`Preset "${preset.file.basename}" filtered out all ${totalScenes} scenes; nothing to compile.`
			);
			return {
				...emptyResult(warnings, errors),
				scenesSkipped: totalScenes,
			};
		}

		const stripAccumulator = createStripAccumulator();
		const acc: SceneAccumulator = {
			bodies: [],
			chapterHashes: [],
			errors,
			scenesCompiled: 0,
			footnoteOffset: 1,
			stripAccumulator,
		};

		const chapterMode =
			preset.frontmatter['dbench-compile-heading-scope'] === 'chapter';
		let chapterIndex = 0;
		let sceneIndex = 0;
		for (const plan of plans) {
			// Skip chapters whose scenes were all filtered out (status
			// filter or scene exclude). Emitting a heading + intro with
			// no prose underneath would surprise writers; chapter
			// numbering also reflects what actually emits, not what
			// might have. The "all filtered" warning earlier still
			// fires when *every* chapter ends up empty.
			if (plan.selected.length === 0) continue;
			chapterIndex++;
			if (chapterMode) {
				acc.bodies.push(
					buildChapterHeading(
						plan.chapter.file.basename,
						chapterIndex,
						preset.frontmatter
					)
				);
				const intro = await this.processChapterIntro(plan.chapter, preset, acc);
				if (intro.length > 0) acc.bodies.push(intro);
			}
			for (let i = 0; i < plan.selected.length; i++) {
				sceneIndex++;
				await this.processScene(
					plan.selected[i],
					sceneIndex,
					preset,
					acc,
					{ suppressSectionBreak: chapterMode && i === 0 }
				);
			}
		}

		return {
			markdown: acc.bodies.join('\n\n'),
			scenesCompiled: acc.scenesCompiled,
			scenesSkipped: totalScenes - totalSelected,
			warnings,
			errors,
			chapterHashes: acc.chapterHashes,
			stripSummary: stripAccumulator.snapshot(),
		};
	}

	private async processScene(
		scene: SceneNote,
		compileIndex: number,
		preset: CompilePresetNote,
		acc: SceneAccumulator,
		options: { suppressSectionBreak?: boolean } = {}
	): Promise<void> {
		try {
			const raw = await this.app.vault.read(scene.file);
			acc.chapterHashes.push(
				formatChapterHash(scene.frontmatter['dbench-id'], djb2(raw))
			);
			const transformed = applyContentRules(raw, {
				preset: preset.frontmatter,
				sceneTitle: scene.file.basename,
				compileIndex,
				stripAccumulator: acc.stripAccumulator,
			});
			const renumbered = renumberFootnotes(transformed, acc.footnoteOffset);
			acc.footnoteOffset += renumbered.consumedCount;
			if (!options.suppressSectionBreak) {
				const sectionBreak = buildSectionBreak(scene, preset.frontmatter);
				if (sectionBreak) acc.bodies.push(sectionBreak);
			}
			acc.bodies.push(renumbered.content);
			acc.scenesCompiled++;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			acc.errors.push({ scenePath: scene.file.path, message });
			acc.bodies.push(
				`<!-- Draft Bench: failed to read "${scene.file.basename}": ${message} -->`
			);
		}
	}

	/**
	 * Process the chapter note's body for inclusion under its heading
	 * in chapter mode. Runs the same content-rule pipeline as scenes
	 * (frontmatter strip, draft slice, H1 shift, inline transforms,
	 * footnote renumber) but without prepending a heading — chapter
	 * headings are emitted separately by the walker.
	 *
	 * Returns the trimmed body content; empty string when the chapter
	 * has no `## Draft` section (the common case — most chapters carry
	 * planning prose plus an empty `## Draft`). Chapter content does
	 * not contribute to `chapterHashes`; per chapter-type § 7, hashing
	 * stays scoped to scenes for V1.
	 */
	private async processChapterIntro(
		chapter: ChapterNote,
		preset: CompilePresetNote,
		acc: SceneAccumulator
	): Promise<string> {
		try {
			const raw = await this.app.vault.read(chapter.file);
			const transformed = applyContentRules(raw, {
				preset: preset.frontmatter,
				sceneTitle: chapter.file.basename,
				compileIndex: 0,
				stripAccumulator: acc.stripAccumulator,
			});
			const renumbered = renumberFootnotes(transformed, acc.footnoteOffset);
			acc.footnoteOffset += renumbered.consumedCount;
			return renumbered.content.trim();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			acc.errors.push({ scenePath: chapter.file.path, message });
			return `<!-- Draft Bench: failed to read chapter "${chapter.file.basename}": ${message} -->`;
		}
	}
}

/**
 * Parse `dbench-compile-scene-excludes` into a set of basenames.
 *
 * Entries may be wikilinks (`[[Name]]`) or bare basenames; both forms
 * are normalized here so the UI affordances (P3.D) can write whichever
 * is convenient. The same set is consulted by the chapter walker — a
 * chapter basename match drops the chapter's whole segment (heading +
 * intro + child scenes).
 *
 * The frontmatter key is `dbench-compile-scene-excludes` for V1
 * backward-compat with pre-Step-8 presets; renaming would force a
 * migration. The field accepts both scene and chapter wikilinks.
 */
function buildExcludeSet(excludes: string[]): Set<string> {
	return new Set(
		excludes.map((entry) => {
			const match = entry.match(/^\[\[(.+?)\]\]$/);
			return match ? match[1] : entry;
		})
	);
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
 * - **Excludes.** Any scene whose basename appears in the exclude set
 *   is dropped. The set is built once per compile by the dispatcher
 *   so chapter and scene checks stay consistent and the regex parse
 *   doesn't run per-scene.
 */
function filterScenes(
	scenes: SceneNote[],
	fm: CompilePresetNote['frontmatter'],
	excludeSet: Set<string>
): SceneNote[] {
	const statuses = fm['dbench-compile-scene-statuses'];
	return scenes.filter((scene) => {
		if (excludeSet.has(scene.file.basename)) return false;
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
		stripSummary: createStripAccumulator().snapshot(),
	};
}
