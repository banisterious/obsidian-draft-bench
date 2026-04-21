import { TFile, type App, type EventRef } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import { findNoteById, findProjects, type ProjectNote } from './discovery';
import { isProjectFrontmatter } from '../model/project';

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
	 * Register vault event listeners. Idempotent: calling start
	 * twice without an intervening stop is a no-op for already-
	 * registered events.
	 *
	 * Honors settings at registration time:
	 * - If `enableBidirectionalSync` is false, no listeners register.
	 * - If `syncOnFileModify` is false, the modify listener doesn't
	 *   register (delete and rename still do, since those are cheap
	 *   and represent intent the linker shouldn't miss).
	 */
	start(): void {
		const settings = this.getSettings();
		if (!settings.enableBidirectionalSync) return;

		if (settings.syncOnFileModify && this.modifyRef === null) {
			this.modifyRef = this.app.vault.on('modify', (file) => {
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
	 * Remove all registered vault event listeners. Idempotent.
	 *
	 * Called via `Plugin.register(() => linker.stop())` so plugin
	 * teardown runs it automatically.
	 */
	stop(): void {
		if (this.modifyRef) {
			this.app.vault.offref(this.modifyRef);
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

	// Per-relationship handlers dispatch on `dbench-type`. Scene<->project
	// is wired here (P1.A). Scene<->draft and project<->draft land in P1.B.
	//
	// Handlers launch async work fire-and-forget: vault events are
	// synchronous listeners so we can't await from inside them. Errors
	// are logged to the console; the integrity service (P1.C) catches
	// any inconsistencies that slip through.

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
		if (type === 'scene') {
			await this.reconcileSceneProject(file, fm as Record<string, unknown>);
		}
		// P1.B: extend with draft reconciliation here.
	}

	/**
	 * Bring the project<->scene relationship for `sceneFile` into sync
	 * with its declared `dbench-project-id`:
	 *
	 *   - Remove this scene's entry from every project's reverse array
	 *     that isn't the currently-declared parent.
	 *   - Ensure the declared parent's reverse array includes this scene.
	 *
	 * Scan-based (rather than diff-based) so no prior-state cache is
	 * needed. Idempotent: calling repeatedly on an already-in-sync
	 * scene produces no writes.
	 */
	private async reconcileSceneProject(
		sceneFile: TFile,
		sceneFm: Record<string, unknown>
	): Promise<void> {
		const sceneId = readString(sceneFm['dbench-id']);
		if (sceneId === '') return;

		const declaredParentId = readString(sceneFm['dbench-project-id']);
		const sceneWikilink = `[[${sceneFile.basename}]]`;

		for (const project of findProjects(this.app)) {
			const isDeclaredParent =
				declaredParentId !== '' &&
				project.frontmatter['dbench-id'] === declaredParentId;

			if (isDeclaredParent) {
				await this.ensureSceneInReverse(project, sceneWikilink, sceneId);
			} else {
				// Only touch projects that actually reference this scene;
				// skip the rest so we don't churn every unrelated project.
				if (
					!containsWikilinkOrId(
						project.frontmatter['dbench-scenes'],
						project.frontmatter['dbench-scene-ids'],
						sceneWikilink,
						sceneId
					)
				) {
					continue;
				}
				await this.removeSceneFromReverse(
					project,
					sceneWikilink,
					sceneId
				);
			}
		}
	}

	private async ensureSceneInReverse(
		project: ProjectNote,
		sceneWikilink: string,
		sceneId: string
	): Promise<void> {
		const scenes = project.frontmatter['dbench-scenes'] ?? [];
		const ids = project.frontmatter['dbench-scene-ids'] ?? [];
		if (scenes.includes(sceneWikilink) && ids.includes(sceneId)) return;

		await this.app.fileManager.processFrontMatter(project.file, (fm) => {
			const sarr = readArray(fm['dbench-scenes']);
			const iarr = readArray(fm['dbench-scene-ids']);
			if (!sarr.includes(sceneWikilink)) sarr.push(sceneWikilink);
			if (!iarr.includes(sceneId)) iarr.push(sceneId);
			fm['dbench-scenes'] = sarr;
			fm['dbench-scene-ids'] = iarr;
		});
	}

	private async removeSceneFromReverse(
		project: ProjectNote,
		sceneWikilink: string,
		sceneId: string
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(project.file, (fm) => {
			const sarr = readArray(fm['dbench-scenes']);
			const iarr = readArray(fm['dbench-scene-ids']);
			const filteredScenes = sarr.filter((x) => x !== sceneWikilink);
			const filteredIds = iarr.filter((x) => x !== sceneId);
			if (
				filteredScenes.length !== sarr.length ||
				filteredIds.length !== iarr.length
			) {
				fm['dbench-scenes'] = filteredScenes;
				fm['dbench-scene-ids'] = filteredIds;
			}
		});
	}

	private async onDelete(file: TFile): Promise<void> {
		// Cache may already be cleared on delete; rely on the file's
		// basename (which we still have) to match reverse-array entries.
		const wikilink = `[[${file.basename}]]`;

		for (const project of findProjects(this.app)) {
			const scenes = readArray(project.frontmatter['dbench-scenes']);
			const idx = scenes.indexOf(wikilink);
			if (idx < 0) continue;

			await this.app.fileManager.processFrontMatter(project.file, (fm) => {
				const sarr = readArray(fm['dbench-scenes']);
				const iarr = readArray(fm['dbench-scene-ids']);
				const i = sarr.indexOf(wikilink);
				if (i >= 0) {
					sarr.splice(i, 1);
					// Parallel arrays: remove companion id at the same index.
					if (i < iarr.length) iarr.splice(i, 1);
					fm['dbench-scenes'] = sarr;
					fm['dbench-scene-ids'] = iarr;
				}
			});
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
		if (type !== 'scene') return;

		const parentId = readString(
			(fm as Record<string, unknown>)['dbench-project-id']
		);
		if (parentId === '') return;

		const parent = findNoteById(this.app, parentId);
		if (!parent || !isProjectFrontmatter(parent.frontmatter)) return;

		await this.app.fileManager.processFrontMatter(parent.file, (pfm) => {
			const scenes = readArray(pfm['dbench-scenes']);
			const idx = scenes.indexOf(oldWikilink);
			if (idx >= 0) {
				scenes[idx] = newWikilink;
				pfm['dbench-scenes'] = scenes;
			}
		});
	}
}

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
