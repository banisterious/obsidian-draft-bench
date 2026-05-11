import { TFile, type App, type EventRef } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import { findNoteById } from '../discovery';
import { readArray, readString } from './readers';
import { reconcileChildInParent, RELATIONSHIPS } from './reconciliation';
import {
	renameChapterScenesFolderIfNeeded,
	renameSubSceneFolderIfNeeded,
} from './folder-auto-rename';

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
			await reconcileChildInParent(
				this.app,
				file,
				fm as Record<string, unknown>,
				config
			);
		}
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

		// Sub-scene-folder auto-rename per [sub-scene-type.md § 10](../../../docs/planning/sub-scene-type.md):
		// when a SCENE is renamed AND the configured `subScenesFolder`
		// template uses `{scene}`, find any sibling folder matching the
		// old scene basename containing sub-scenes that reference the
		// renamed scene's id, and rename the folder to the new basename.
		if (type === 'scene') {
			await renameSubSceneFolderIfNeeded(
				this.app,
				this.getSettings(),
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
			await renameChapterScenesFolderIfNeeded(
				this.app,
				this.getSettings(),
				file,
				fm as Record<string, unknown>,
				oldBasename
			);
		}
	}

}

/** Extract the basename (without extension) from a full file path. */
function basenameFromPath(filePath: string): string {
	const slash = filePath.lastIndexOf('/');
	const tail = slash >= 0 ? filePath.slice(slash + 1) : filePath;
	const dot = tail.lastIndexOf('.');
	return dot > 0 ? tail.slice(0, dot) : tail;
}

