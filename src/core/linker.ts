import { TFile, TFolder, type App, type EventRef } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import {
	findChapters,
	findNoteById,
	findProjects,
	findScenes,
	findSubScenes,
} from './discovery';

/**
 * `DraftBenchLinker` — live bidirectional sync service.
 *
 * Listens to vault `modify`, `delete`, and `rename` events. When a
 * forward reference changes (e.g., a scene's `dbench-project`
 * pointer), the linker reconciles the parent's reverse array
 * (`dbench-scenes` / `dbench-scene-ids`). When a note is deleted,
 * the linker removes its entry from the parent's reverse array.
 *
 * Per-relationship handler logic (project<->scene, scene<->draft)
 * is added in subsequent commits as each relationship lands. This
 * scaffold provides:
 *
 * - **Lifecycle**: `start()` registers listeners; `stop()` removes them.
 *   `start()` honors the `enableBidirectionalSync` setting and the
 *   `syncOnFileModify` setting independently.
 * - **Suspend/resume**: counted nesting via `suspend()` / `resume()`,
 *   plus a `withSuspended(fn)` helper that restores state on throw.
 *   Used by plugin-driven bulk operations (new project, new scene,
 *   new draft) that write multiple files in sequence and don't want
 *   intermediate states to trigger sync.
 *
 * Per the spec's failure-mode section: a primary file write happens
 * first, then the reverse-array update, so the user's content is
 * always safe even if the second step fails. The integrity service
 * (deferred) reconciles any inconsistency on a later manual repair.
 */
export class DraftBenchLinker {
	private suspended = 0;
	private modifyRef: EventRef | null = null;
	private deleteRef: EventRef | null = null;
	private renameRef: EventRef | null = null;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => DraftBenchSettings
	) {}

	/**
	 * Register vault + metadataCache event listeners. Idempotent:
	 * calling start twice without an intervening stop is a no-op for
	 * already-registered events.
	 *
	 * Honors settings at registration time:
	 * - If `enableBidirectionalSync` is false, no listeners register.
	 * - If `syncOnFileModify` is false, the metadataCache 'changed'
	 *   listener doesn't register (delete and rename still do, since
	 *   those are cheap and represent intent the linker shouldn't miss).
	 *
	 * Why `metadataCache.on('changed')` instead of `vault.on('modify')`:
	 * vault 'modify' fires synchronously when the file is written,
	 * BEFORE Obsidian has reparsed the new frontmatter. The linker
	 * reads `metadataCache.getFileCache(file)?.frontmatter` to decide
	 * how to reconcile, so reading at modify-time returned the
	 * pre-write cache and produced stale-state reconciliations
	 * (surfaced 2026-04-26 by the chapter-type walkthrough's Test 11
	 * revert path). The 'changed' event fires AFTER the cache reparse,
	 * so the cache is always current when the handler runs.
	 *
	 * `delete` and `rename` stay on vault: their cache state isn't
	 * race-prone in the same way (delete clears the cache, rename
	 * carries the file reference itself; neither relies on a
	 * fresh-frontmatter read).
	 */
	start(): void {
		const settings = this.getSettings();
		if (!settings.enableBidirectionalSync) return;

		if (settings.syncOnFileModify && this.modifyRef === null) {
			this.modifyRef = this.app.metadataCache.on('changed', (file) => {
				if (this.suspended > 0) return;
				if (!(file instanceof TFile)) return;
				this.handleModify(file);
			});
		}
		if (this.deleteRef === null) {
			this.deleteRef = this.app.vault.on('delete', (file) => {
				if (this.suspended > 0) return;
				if (!(file instanceof TFile)) return;
				this.handleDelete(file);
			});
		}
		if (this.renameRef === null) {
			this.renameRef = this.app.vault.on('rename', (file, oldPath) => {
				if (this.suspended > 0) return;
				if (!(file instanceof TFile)) return;
				this.handleRename(file, oldPath);
			});
		}
	}

	/**
	 * Remove all registered event listeners. Idempotent.
	 *
	 * Called via `Plugin.register(() => linker.stop())` so plugin
	 * teardown runs it automatically.
	 */
	stop(): void {
		if (this.modifyRef) {
			this.app.metadataCache.offref(this.modifyRef);
			this.modifyRef = null;
		}
		if (this.deleteRef) {
			this.app.vault.offref(this.deleteRef);
			this.deleteRef = null;
		}
		if (this.renameRef) {
			this.app.vault.offref(this.renameRef);
			this.renameRef = null;
		}
	}

	/**
	 * Suspend live sync. Nested suspends are counted; `resume()`
	 * must be called the same number of times to actually re-enable.
	 *
	 * Use `withSuspended()` instead in most cases — it pairs the
	 * suspend/resume calls correctly even if the wrapped operation
	 * throws.
	 */
	suspend(): void {
		this.suspended++;
	}

	resume(): void {
		if (this.suspended > 0) this.suspended--;
	}

	/**
	 * Run `fn` with the linker suspended. Restores the previous
	 * suspend state in a `finally`, so an exception in `fn` doesn't
	 * leak a suspended state.
	 */
	async withSuspended<T>(fn: () => Promise<T>): Promise<T> {
		this.suspend();
		try {
			return await fn();
		} finally {
			this.resume();
		}
	}

	isSuspended(): boolean {
		return this.suspended > 0;
	}

	// Handlers launch async work fire-and-forget: vault events are
	// synchronous listeners so we can't await from inside them. Errors
	// are logged to the console; the integrity service (P1.C) catches
	// any inconsistencies that slip through.
	//
	// Per-relationship logic is driven by the RELATIONSHIPS table
	// (declared below) rather than per-type hardcoded branches. A single
	// file's type may map to multiple configs — e.g., a draft has a
	// config for its scene parent AND for its project parent (single-
	// scene projects). Each config is idempotent and independent.

	private handleModify(file: TFile): void {
		void this.onModify(file).catch((err) => {
			console.error('[DraftBench] linker handleModify failed:', err);
		});
	}

	private handleDelete(file: TFile): void {
		void this.onDelete(file).catch((err) => {
			console.error('[DraftBench] linker handleDelete failed:', err);
		});
	}

	private handleRename(file: TFile, oldPath: string): void {
		void this.onRename(file, oldPath).catch((err) => {
			console.error('[DraftBench] linker handleRename failed:', err);
		});
	}

	private async onModify(file: TFile): Promise<void> {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || typeof fm !== 'object') return;
		const type = (fm as Record<string, unknown>)['dbench-type'];
		if (typeof type !== 'string') return;
		const configs = RELATIONSHIPS[type];
		if (!configs) return;
		for (const config of configs) {
			await this.reconcileChildInParent(
				file,
				fm as Record<string, unknown>,
				config
			);
		}
	}

	/**
	 * Scan-based reconciliation. For the child's declared parent id,
	 * ensure the parent's reverse arrays include this child. For every
	 * other candidate parent that currently references this child,
	 * remove the stale entry. Idempotent; no writes when already in sync.
	 */
	private async reconcileChildInParent(
		childFile: TFile,
		childFm: Record<string, unknown>,
		config: RelationshipConfig
	): Promise<void> {
		const childId = readString(childFm['dbench-id']);
		if (childId === '') return;

		// When `appliesToChild` returns false, the config still runs to
		// clean up stale references but treats the declared parent as
		// empty so it never adds the child to any reverse array. Used by
		// scene→project: a scene-in-chapter (one with `dbench-chapter-id`
		// set) carries both project + chapter ids per § 3, but per § 9
		// the project's reverse arrays list direct children only, so the
		// scene must not appear there.
		const applies = config.appliesToChild?.(childFm) ?? true;
		let declaredParentId = applies
			? readString(childFm[config.childParentIdField])
			: '';

		// Wikilink-only retrofit backfill (issues #4 and #6). When a
		// writer manually sets a relationship wikilink in the Properties
		// panel (e.g., dbench-scene: [[Some Scene]]) without copying the
		// parent's id into the companion (dbench-scene-id), resolve the
		// link, find the matching candidate parent, and write the
		// companion via processFrontMatter. Reconciliation in this pass
		// then proceeds with the resolved id so the parent's reverse
		// arrays update on the same event.
		//
		// Resolution prefers Obsidian's `frontmatterLinks` cache: it
		// authoritatively resolves the link regardless of how the YAML
		// stored the value. The Properties panel saves wikilinks
		// unquoted (`dbench-scene: [[Foo]]`), which YAML parses as a
		// nested array — `parseWikilinkBasename` would miss that on its
		// own. `frontmatterLinks` covers the case (#6); the raw-value
		// parser stays as a defense-in-depth fallback for cases where
		// the link cache isn't populated (older Obsidian, certain edge
		// formats).
		if (applies && declaredParentId === '') {
			const wikilinkBasename = this.resolveParentBasename(
				childFile,
				childFm,
				config.childParentWikilinkField
			);
			if (wikilinkBasename !== '') {
				const matched = config
					.candidateParents(this.app)
					.find((c) => c.file.basename === wikilinkBasename);
				if (matched) {
					const matchedId = readString(matched.frontmatter['dbench-id']);
					if (matchedId !== '') {
						await this.app.fileManager.processFrontMatter(
							childFile,
							(fm) => {
								fm[config.childParentIdField] = matchedId;
								// Re-canonicalize the wikilink field so the
								// serializer writes a clean quoted string,
								// not block-style nested-array YAML (#7).
								fm[config.childParentWikilinkField] =
									canonicalizeWikilinkValue(
										fm[config.childParentWikilinkField]
									);
							}
						);
						declaredParentId = matchedId;
					}
				}
			}
		}

		const childWikilink = `[[${childFile.basename}]]`;

		for (const candidate of config.candidateParents(this.app)) {
			const isDeclaredParent =
				declaredParentId !== '' &&
				candidate.frontmatter['dbench-id'] === declaredParentId;

			if (isDeclaredParent) {
				await this.ensureChildInReverse(
					candidate.file,
					childWikilink,
					childId,
					config
				);
			} else {
				// Only touch parents that actually reference this child;
				// skip the rest so we don't churn every unrelated note.
				if (
					!containsWikilinkOrId(
						candidate.frontmatter[config.parentWikilinkField],
						candidate.frontmatter[config.parentIdField],
						childWikilink,
						childId
					)
				) {
					continue;
				}
				await this.removeChildFromReverse(
					candidate.file,
					childWikilink,
					childId,
					config
				);
			}
		}
	}

	/**
	 * Resolve the basename of the wikilink target stored at the given
	 * frontmatter field on `childFile`. Used by the wikilink-only
	 * retrofit backfill (#4 / #6) when the ID companion is empty.
	 *
	 * Two-tier resolution:
	 *
	 * 1. **`frontmatterLinks` cache** (authoritative). Obsidian
	 *    populates this for every resolved wikilink reference in a
	 *    file's frontmatter, regardless of YAML encoding (string,
	 *    flow-notation, alias). The entry's `link` field is the link
	 *    target, possibly with subpath; basename it.
	 *
	 * 2. **Raw frontmatter value** (fallback). Direct parse via
	 *    `parseWikilinkBasename`, which handles the quoted-string and
	 *    flow-notation forms. Useful when `frontmatterLinks` isn't
	 *    populated (older Obsidian builds, certain edge cases).
	 *
	 * Returns `''` when neither path yields a basename.
	 */
	private resolveParentBasename(
		childFile: TFile,
		childFm: Record<string, unknown>,
		fieldName: string
	): string {
		const cache = this.app.metadataCache.getFileCache(childFile);
		const fmLink = cache?.frontmatterLinks?.find((l) => l.key === fieldName);
		if (fmLink?.link) {
			const basename = basenameFromLinkpath(fmLink.link);
			if (basename !== '') return basename;
		}
		return parseWikilinkBasename(childFm[fieldName]);
	}

	private async ensureChildInReverse(
		parent: TFile,
		childWikilink: string,
		childId: string,
		config: RelationshipConfig
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(parent, (fm) => {
			const warr = readArray(fm[config.parentWikilinkField]);
			const iarr = readArray(fm[config.parentIdField]);
			const hasWikilink = warr.includes(childWikilink);
			const hasId = iarr.includes(childId);
			if (hasWikilink && hasId) return; // already in sync; no write
			if (!hasWikilink) warr.push(childWikilink);
			if (!hasId) iarr.push(childId);
			fm[config.parentWikilinkField] = warr;
			fm[config.parentIdField] = iarr;
		});
	}

	private async removeChildFromReverse(
		parent: TFile,
		childWikilink: string,
		childId: string,
		config: RelationshipConfig
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(parent, (fm) => {
			const warr = readArray(fm[config.parentWikilinkField]);
			const iarr = readArray(fm[config.parentIdField]);
			const filteredWikilinks = warr.filter((x) => x !== childWikilink);
			const filteredIds = iarr.filter((x) => x !== childId);
			if (
				filteredWikilinks.length !== warr.length ||
				filteredIds.length !== iarr.length
			) {
				fm[config.parentWikilinkField] = filteredWikilinks;
				fm[config.parentIdField] = filteredIds;
			}
		});
	}

	private async onDelete(file: TFile): Promise<void> {
		// Cache may already be cleared on delete; rely on the file's
		// basename (which we still have) to match reverse-array entries.
		// Walk every parent candidate that could reference this file,
		// regardless of the deleted file's type (we may not know it).
		const wikilink = `[[${file.basename}]]`;
		const configs = Object.values(RELATIONSHIPS).flat();

		for (const config of configs) {
			for (const parent of config.candidateParents(this.app)) {
				const wikilinks = readArray(
					parent.frontmatter[config.parentWikilinkField]
				);
				if (!wikilinks.includes(wikilink)) continue;

				await this.app.fileManager.processFrontMatter(parent.file, (fm) => {
					const warr = readArray(fm[config.parentWikilinkField]);
					const iarr = readArray(fm[config.parentIdField]);
					const i = warr.indexOf(wikilink);
					if (i >= 0) {
						warr.splice(i, 1);
						// Parallel arrays: remove companion id at same index.
						if (i < iarr.length) iarr.splice(i, 1);
						fm[config.parentWikilinkField] = warr;
						fm[config.parentIdField] = iarr;
					}
				});
			}
		}
	}

	private async onRename(file: TFile, oldPath: string): Promise<void> {
		const oldBasename = basenameFromPath(oldPath);
		if (oldBasename === file.basename) return;

		const oldWikilink = `[[${oldBasename}]]`;
		const newWikilink = `[[${file.basename}]]`;

		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || typeof fm !== 'object') return;
		const type = (fm as Record<string, unknown>)['dbench-type'];
		if (typeof type !== 'string') return;
		const configs = RELATIONSHIPS[type];
		if (!configs) return;

		for (const config of configs) {
			const parentId = readString(
				(fm as Record<string, unknown>)[config.childParentIdField]
			);
			if (parentId === '') continue;

			const parent = findNoteById(this.app, parentId);
			if (!parent) continue;

			await this.app.fileManager.processFrontMatter(parent.file, (pfm) => {
				const wikilinks = readArray(pfm[config.parentWikilinkField]);
				const idx = wikilinks.indexOf(oldWikilink);
				if (idx >= 0) {
					wikilinks[idx] = newWikilink;
					pfm[config.parentWikilinkField] = wikilinks;
				}
			});
		}

		// Sub-scene-folder auto-rename per [sub-scene-type.md § 10](../../docs/planning/sub-scene-type.md):
		// when a SCENE is renamed AND the configured `subScenesFolder`
		// template uses `{scene}`, find any sibling folder matching the
		// old scene basename containing sub-scenes that reference the
		// renamed scene's id, and rename the folder to the new basename.
		if (type === 'scene') {
			await this.renameSubSceneFolderIfNeeded(
				file,
				fm as Record<string, unknown>,
				oldBasename
			);
		}

		// Chapter-scenes-folder auto-rename (issue #11): mirrors the
		// sub-scene case one level up. When a CHAPTER is renamed AND
		// the configured `scenesFolder` template uses `{chapter}`, find
		// any sibling folder matching the old chapter basename containing
		// scenes that reference the renamed chapter's id, and rename the
		// folder to the new basename.
		if (type === 'chapter') {
			await this.renameChapterScenesFolderIfNeeded(
				file,
				fm as Record<string, unknown>,
				oldBasename
			);
		}
	}

	/**
	 * § 10 auto-rename: keep the sub-scene folder name in sync with its
	 * parent scene's basename when the writer renames the scene file.
	 *
	 * Skipped when:
	 * - The configured `subScenesFolder` template doesn't include
	 *   `{scene}` (flat opt-out or any template that doesn't depend on
	 *   the parent-scene basename).
	 * - The scene's project ref is empty / unresolvable.
	 * - The expected old folder doesn't exist (writer manually renamed
	 *   it to something else, or no sub-scenes have been created yet).
	 * - The folder doesn't contain at least one sub-scene that references
	 *   this scene's id (defends against renaming an unrelated folder
	 *   that happens to share the old basename).
	 * - The new folder path is already occupied (some other folder
	 *   exists at the target name); we skip rather than overwrite.
	 */
	private async renameSubSceneFolderIfNeeded(
		sceneFile: TFile,
		sceneFm: Record<string, unknown>,
		oldSceneBasename: string
	): Promise<void> {
		const sceneId = readString(sceneFm['dbench-id']);
		if (sceneId === '') return;

		const settings = this.getSettings();
		if (!settings.subScenesFolder.includes('{scene}')) return;

		const projectId = readString(sceneFm['dbench-project-id']);
		if (projectId === '') return;
		const project = findNoteById(this.app, projectId);
		if (!project) return;

		const oldFolderPath = computeSubSceneFolderPath(
			settings.subScenesFolder,
			project.file,
			oldSceneBasename
		);
		const newFolderPath = computeSubSceneFolderPath(
			settings.subScenesFolder,
			project.file,
			sceneFile.basename
		);

		if (oldFolderPath === newFolderPath) return;

		const oldFolder = this.app.vault.getAbstractFileByPath(oldFolderPath);
		if (!oldFolder || !(oldFolder instanceof TFolder)) return;

		// Defend against renaming an unrelated folder that happens to
		// share the old basename: only rename when the folder contains
		// at least one sub-scene whose `dbench-scene-id` matches.
		const subSceneInFolder = findSubScenes(this.app).some(
			(s) =>
				s.file.path.startsWith(`${oldFolderPath}/`) &&
				s.frontmatter['dbench-scene-id'] === sceneId
		);
		if (!subSceneInFolder) return;

		// Skip if the new folder path is already occupied; let integrity
		// surface the conflict rather than silently overwriting.
		if (this.app.vault.getAbstractFileByPath(newFolderPath) !== null) {
			return;
		}

		await this.app.fileManager.renameFile(oldFolder, newFolderPath);
	}

	/**
	 * Issue #11 auto-rename: keep the chapter-aware scenes folder name
	 * in sync with its parent chapter's basename when the writer renames
	 * the chapter file. Mirrors `renameSubSceneFolderIfNeeded` one level
	 * up.
	 *
	 * Skipped when:
	 * - The configured `scenesFolder` template doesn't include
	 *   `{chapter}` (flat opt-out or any template that doesn't depend on
	 *   the chapter basename).
	 * - The chapter's project ref is empty / unresolvable.
	 * - The expected old folder doesn't exist (writer manually renamed
	 *   it to something else, or no scenes have been created in this
	 *   chapter yet).
	 * - The folder doesn't contain at least one scene that references
	 *   this chapter's id (defends against renaming an unrelated folder
	 *   that happens to share the old basename).
	 * - The new folder path is already occupied; we skip rather than
	 *   overwrite.
	 */
	private async renameChapterScenesFolderIfNeeded(
		chapterFile: TFile,
		chapterFm: Record<string, unknown>,
		oldChapterBasename: string
	): Promise<void> {
		const chapterId = readString(chapterFm['dbench-id']);
		if (chapterId === '') return;

		const settings = this.getSettings();
		if (!settings.scenesFolder.includes('{chapter}')) return;

		const projectId = readString(chapterFm['dbench-project-id']);
		if (projectId === '') return;
		const project = findNoteById(this.app, projectId);
		if (!project) return;

		const oldFolderPath = computeChapterScenesFolderPath(
			settings.scenesFolder,
			project.file,
			oldChapterBasename
		);
		const newFolderPath = computeChapterScenesFolderPath(
			settings.scenesFolder,
			project.file,
			chapterFile.basename
		);

		if (oldFolderPath === newFolderPath) return;

		const oldFolder = this.app.vault.getAbstractFileByPath(oldFolderPath);
		if (!oldFolder || !(oldFolder instanceof TFolder)) return;

		const sceneInFolder = findScenes(this.app).some(
			(s) =>
				s.file.path.startsWith(`${oldFolderPath}/`) &&
				s.frontmatter['dbench-chapter-id'] === chapterId
		);
		if (!sceneInFolder) return;

		if (this.app.vault.getAbstractFileByPath(newFolderPath) !== null) {
			return;
		}

		await this.app.fileManager.renameFile(oldFolder, newFolderPath);
	}
}

/**
 * Describes one forward-reference / reverse-array pair the linker
 * reconciles. A single child type (e.g., `draft`) can have multiple
 * configs — one for each distinct parent type it may point to.
 */
interface RelationshipConfig {
	/** Field on the child holding the parent's stable id, e.g., `dbench-project-id`. */
	childParentIdField: string;
	/**
	 * Field on the child holding the parent's wikilink, e.g., `dbench-project`.
	 * Used by the wikilink-only retrofit backfill: when the writer manually
	 * sets the wikilink in the Properties panel without copying the parent's
	 * id into the companion, the linker resolves the wikilink against the
	 * candidate-parent pool and writes the companion field. See issue #4.
	 */
	childParentWikilinkField: string;
	/** Reverse-array field on the parent holding wikilinks, e.g., `dbench-scenes`. */
	parentWikilinkField: string;
	/** Reverse-array field on the parent holding stable ids, e.g., `dbench-scene-ids`. */
	parentIdField: string;
	/**
	 * Enumerate candidate parents. Filtering (e.g., project-shape ==
	 * 'single' for the draft->project case) happens here so the
	 * reconciler stays generic.
	 */
	candidateParents: (
		app: App
	) => Array<{ file: TFile; frontmatter: Record<string, unknown> }>;
	/**
	 * Optional gate. When provided and returns false, the reconciler
	 * runs in cleanup-only mode for this config: stale references are
	 * still pruned from candidate parents, but the child is never added
	 * to any reverse array. Used to suppress the scene→project
	 * relationship for scenes-in-chapters (which carry both
	 * `dbench-project-id` and `dbench-chapter-id` but belong only in the
	 * chapter's reverse arrays per § 3 + § 9 of chapter-type.md).
	 */
	appliesToChild?: (childFm: Record<string, unknown>) => boolean;
}

/**
 * Per-type reconciliation rules. Keyed by `dbench-type` of the child.
 *
 * - `chapter`: one parent, the enclosing project. Reverse arrays
 *   `dbench-chapters` / `dbench-chapter-ids` on the project. Per § 9 of
 *   chapter-type.md, project shape is not filtered here — integrity
 *   surfaces mixed-children violations (a project carrying both
 *   chapters and direct scenes) rather than the linker silently
 *   dropping them.
 * - `scene`: two possible parents. Chapter-less scenes attach to the
 *   project (existing behavior); scenes-in-chapters attach to their
 *   chapter (per § 3, scenes-in-chapters carry both project + chapter
 *   refs). The scene→project config has an `appliesToChild` gate that
 *   suppresses the add when `dbench-chapter-id` is present, so the
 *   project's `dbench-scenes` reverse array stays a list of *direct*
 *   children only (per § 9 + the doc on `ProjectFrontmatter.dbench-scenes`).
 * - `sub-scene`: one parent, the enclosing scene. Reverse arrays
 *   `dbench-sub-scenes` / `dbench-sub-scene-ids` on the scene (optional
 *   fields per `SceneFrontmatter`; the linker creates them on first
 *   use). Sub-scenes also carry `dbench-project-id` for query
 *   convenience but the project doesn't track sub-scenes directly (per
 *   [sub-scene-type.md § 3](../../docs/planning/sub-scene-type.md));
 *   parallel to how scenes-in-chapters don't appear in their project's
 *   reverse arrays.
 * - `draft`: four possible parents depending on the declared fields.
 *   Scene-parented drafts live in folder projects; project-parented
 *   drafts live in single-scene projects; chapter-parented drafts live
 *   in chapter-aware projects (§ 4); sub-scene-parented drafts live
 *   inside hierarchical scenes (per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md)).
 *   All four configs run on every draft modify; the one whose declared
 *   parent id doesn't resolve is a no-op on adds but still cleans up
 *   any stale references — which lets the linker recover when a writer
 *   converts a draft between target shapes.
 * - `compile-preset`: one parent, the enclosing project (either shape).
 *   Reverse arrays `dbench-compile-presets` / `dbench-compile-preset-ids`
 *   live on the project note.
 */
const RELATIONSHIPS: Record<string, RelationshipConfig[]> = {
	chapter: [
		{
			childParentIdField: 'dbench-project-id',
			childParentWikilinkField: 'dbench-project',
			parentWikilinkField: 'dbench-chapters',
			parentIdField: 'dbench-chapter-ids',
			candidateParents: (app) =>
				findProjects(app).map((p) => ({
					file: p.file,
					frontmatter: p.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	scene: [
		{
			childParentIdField: 'dbench-project-id',
			childParentWikilinkField: 'dbench-project',
			parentWikilinkField: 'dbench-scenes',
			parentIdField: 'dbench-scene-ids',
			candidateParents: (app) =>
				findProjects(app).map((p) => ({
					file: p.file,
					frontmatter: p.frontmatter as unknown as Record<string, unknown>,
				})),
			appliesToChild: (fm) => readString(fm['dbench-chapter-id']) === '',
		},
		{
			childParentIdField: 'dbench-chapter-id',
			childParentWikilinkField: 'dbench-chapter',
			parentWikilinkField: 'dbench-scenes',
			parentIdField: 'dbench-scene-ids',
			candidateParents: (app) =>
				findChapters(app).map((c) => ({
					file: c.file,
					frontmatter: c.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	'sub-scene': [
		{
			childParentIdField: 'dbench-scene-id',
			childParentWikilinkField: 'dbench-scene',
			parentWikilinkField: 'dbench-sub-scenes',
			parentIdField: 'dbench-sub-scene-ids',
			candidateParents: (app) =>
				findScenes(app).map((s) => ({
					file: s.file,
					frontmatter: s.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	draft: [
		{
			childParentIdField: 'dbench-scene-id',
			childParentWikilinkField: 'dbench-scene',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findScenes(app).map((s) => ({
					file: s.file,
					frontmatter: s.frontmatter as unknown as Record<string, unknown>,
				})),
		},
		{
			childParentIdField: 'dbench-chapter-id',
			childParentWikilinkField: 'dbench-chapter',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findChapters(app).map((c) => ({
					file: c.file,
					frontmatter: c.frontmatter as unknown as Record<string, unknown>,
				})),
		},
		{
			childParentIdField: 'dbench-project-id',
			childParentWikilinkField: 'dbench-project',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findProjects(app)
					.filter(
						(p) => p.frontmatter['dbench-project-shape'] === 'single'
					)
					.map((p) => ({
						file: p.file,
						frontmatter: p.frontmatter as unknown as Record<
							string,
							unknown
						>,
					})),
		},
		{
			childParentIdField: 'dbench-sub-scene-id',
			childParentWikilinkField: 'dbench-sub-scene',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findSubScenes(app).map((s) => ({
					file: s.file,
					frontmatter: s.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	'compile-preset': [
		{
			childParentIdField: 'dbench-project-id',
			childParentWikilinkField: 'dbench-project',
			parentWikilinkField: 'dbench-compile-presets',
			parentIdField: 'dbench-compile-preset-ids',
			candidateParents: (app) =>
				findProjects(app).map((p) => ({
					file: p.file,
					frontmatter: p.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
};

/**
 * Defensive array reader: returns the array as-is, or `[]` if the value
 * isn't an array. Guards against null, undefined, and corrupted entries.
 */
function readArray(value: unknown): string[] {
	return Array.isArray(value) ? (value as string[]) : [];
}

/** Read a frontmatter value as a string, defaulting to `''` if absent or wrong type. */
function readString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * True iff either the wikilink array contains `wikilink` or the id array
 * contains `id`. Used to short-circuit work on projects that don't
 * mention this scene at all.
 */
function containsWikilinkOrId(
	wikilinks: unknown,
	ids: unknown,
	wikilink: string,
	id: string
): boolean {
	const warr = readArray(wikilinks);
	const iarr = readArray(ids);
	return warr.includes(wikilink) || iarr.includes(id);
}

/** Extract the basename (without extension) from a full file path. */
function basenameFromPath(filePath: string): string {
	const slash = filePath.lastIndexOf('/');
	const tail = slash >= 0 ? filePath.slice(slash + 1) : filePath;
	const dot = tail.lastIndexOf('.');
	return dot > 0 ? tail.slice(0, dot) : tail;
}

/**
 * Return the parent-folder portion of a path (everything before the
 * final slash). Returns `''` for vault-root files. Mirrors the helper
 * used in scenes.ts / chapters.ts / sub-scenes.ts.
 */
function parentPath(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return '';
	return filePath.slice(0, idx);
}

/**
 * Compute the on-disk folder path for sub-scenes of a given parent scene,
 * applying `{project}` and `{scene}` token expansion against
 * `settings.subScenesFolder`. Mirrors `resolveSubScenePaths` in
 * sub-scenes.ts but takes a bare scene basename instead of a `SceneNote`,
 * so the linker can reconstruct the OLD path during rename handling.
 */
function computeSubSceneFolderPath(
	template: string,
	projectFile: TFile,
	sceneBasename: string
): string {
	const relative = template
		.replace(/\{project\}/g, projectFile.basename)
		.replace(/\{scene\}/g, sceneBasename)
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	const projectFolder = parentPath(projectFile.path);
	return relative === ''
		? projectFolder
		: projectFolder === ''
			? relative
			: `${projectFolder}/${relative}`;
}

/**
 * Compute the on-disk folder path for scenes of a given parent chapter,
 * applying `{project}` and `{chapter}` token expansion against
 * `settings.scenesFolder`. Mirrors `resolveScenePaths` in scenes.ts but
 * takes a bare chapter basename instead of a `ChapterNote`, so the linker
 * can reconstruct the OLD path during rename handling. Issue #11.
 */
function computeChapterScenesFolderPath(
	template: string,
	projectFile: TFile,
	chapterBasename: string
): string {
	const relative = template
		.replace(/\{project\}/g, projectFile.basename)
		.replace(/\{chapter\}/g, chapterBasename)
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	const projectFolder = parentPath(projectFile.path);
	return relative === ''
		? projectFolder
		: projectFolder === ''
			? relative
			: `${projectFolder}/${relative}`;
}

/**
 * Re-canonicalize a frontmatter wikilink value so Obsidian's serializer
 * writes it as a clean quoted string (`"[[Basename]]"`) rather than the
 * block-style nested-array form Obsidian's link-aware parser produces
 * during processFrontMatter round-trips. Issue #7.
 *
 * Behavior:
 * - **String** (already canonical, or user-typed): returned unchanged.
 *   processFrontMatter round-trips strings stably.
 * - **Nested single-element array** `[["..."]]`: unwraps the inner
 *   string and re-wraps as `"[[X]]"`. Preserves whatever's in the inner
 *   string verbatim, including alias (`Foo|Display`), heading
 *   (`Foo#Heading`), or block (`Foo^Block`) suffixes.
 * - **Anything else**: returned unchanged. Defensive; never corrupts
 *   data we don't recognize.
 *
 * Idempotent. Applied inside DB processFrontMatter callbacks that touch
 * a relationship wikilink field, so subsequent linker writes don't
 * progressively reshape the YAML.
 */
function canonicalizeWikilinkValue(value: unknown): unknown {
	if (typeof value === 'string') return value;
	if (Array.isArray(value) && value.length === 1) {
		const inner = value[0];
		if (
			Array.isArray(inner) &&
			inner.length === 1 &&
			typeof inner[0] === 'string'
		) {
			return `[[${inner[0]}]]`;
		}
	}
	return value;
}

/**
 * Strip a Markdown linkpath down to the bare basename. Removes any path
 * prefix (`Path/To/Foo`), alias (`Foo|Display`), heading reference
 * (`Foo#Heading`), and block reference (`Foo^block`). Used by both the
 * `frontmatterLinks` resolution path (where Obsidian's cache exposes
 * the link as a string like `Path/Foo#Heading`) and the raw frontmatter
 * fallback parser. Issue #4 / #6.
 */
function basenameFromLinkpath(linkpath: string): string {
	let target = linkpath;
	const pipeIdx = target.indexOf('|');
	if (pipeIdx >= 0) target = target.slice(0, pipeIdx);
	const hashIdx = target.indexOf('#');
	if (hashIdx >= 0) target = target.slice(0, hashIdx);
	const caretIdx = target.indexOf('^');
	if (caretIdx >= 0) target = target.slice(0, caretIdx);
	const slashIdx = target.lastIndexOf('/');
	if (slashIdx >= 0) target = target.slice(slashIdx + 1);
	return target.trim();
}

/**
 * Parse the target basename from a raw frontmatter value, used as a
 * fallback when Obsidian's `frontmatterLinks` cache doesn't expose the
 * link (issue #6). Returns `''` when the value isn't a recognizable
 * wikilink shape.
 *
 * Handles two on-disk forms:
 *
 * 1. **Quoted-string form** (`dbench-scene: "[[Basename]]"` in YAML):
 *    `frontmatter[key]` is the literal string `'[[Basename]]'`. Supports
 *    aliases, headings, block refs, and path prefixes inside the brackets.
 *
 * 2. **Flow-notation form** (`dbench-scene: [[Basename]]` without quotes):
 *    YAML parses this as a nested array `[["Basename"]]` (an array of one
 *    array of one string). Obsidian's Properties panel writes wikilinks
 *    in this unquoted form by default, which is what surfaced #6. The
 *    nested-array fallback covers writers who edit YAML in this shape
 *    when the `frontmatterLinks` cache happens to be missing.
 *
 * Does NOT handle multi-target wikilinks. Frontmatter wikilink fields
 * are single-target by Draft Bench convention; arrays use reverse-array
 * fields, not parent-pointer fields.
 */
function parseWikilinkBasename(value: unknown): string {
	// Quoted-string form: `dbench-scene: "[[Basename]]"`
	if (typeof value === 'string') {
		const m = value.match(/^\[\[([^\]]+)\]\]$/);
		if (!m) return '';
		return basenameFromLinkpath(m[1]);
	}
	// Flow-notation form: `dbench-scene: [[Basename]]` parses as a
	// nested single-element array (Array(1) of Array(1) of string).
	if (Array.isArray(value) && value.length === 1) {
		const inner = value[0];
		if (
			Array.isArray(inner) &&
			inner.length === 1 &&
			typeof inner[0] === 'string'
		) {
			return basenameFromLinkpath(inner[0]);
		}
	}
	return '';
}
