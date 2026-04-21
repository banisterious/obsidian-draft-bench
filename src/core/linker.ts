import { TFile, type App, type EventRef } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';

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

	// Per-relationship handlers below are stubs. Each fills in as the
	// corresponding feature lands (project<->scene with the new-scene
	// command; scene<->draft with the new-draft command).

	private handleModify(_file: TFile): void {
		// Stub: future per-relationship sync logic dispatches from here.
	}

	private handleDelete(_file: TFile): void {
		// Stub: future delete-cascade logic dispatches from here.
	}

	private handleRename(_file: TFile, _oldPath: string): void {
		// Stub: safety-net rename handler. Most renames go through
		// Obsidian's auto-update; this catches non-Obsidian renames
		// (CLI tools, sync relocations) that left wikilinks stale.
	}
}
