import { TFile, type App, type EventRef } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import { findNoteById, findProjects, findScenes } from './discovery';

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

		const declaredParentId = readString(childFm[config.childParentIdField]);
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
}

/**
 * Per-type reconciliation rules. Keyed by `dbench-type` of the child.
 *
 * - `scene`: one parent, the enclosing project.
 * - `draft`: two possible parents depending on the declared fields.
 *   Scene-parented drafts live in folder projects; project-parented
 *   drafts live in single-scene projects. Both configs run on every
 *   draft modify; the one whose declared parent id doesn't resolve
 *   is a no-op on adds but still cleans up any stale references —
 *   which lets the linker recover when a writer converts a project
 *   between folder and single-scene shapes.
 * - `compile-preset`: one parent, the enclosing project (either shape).
 *   Reverse arrays `dbench-compile-presets` / `dbench-compile-preset-ids`
 *   live on the project note.
 */
const RELATIONSHIPS: Record<string, RelationshipConfig[]> = {
	scene: [
		{
			childParentIdField: 'dbench-project-id',
			parentWikilinkField: 'dbench-scenes',
			parentIdField: 'dbench-scene-ids',
			candidateParents: (app) =>
				findProjects(app).map((p) => ({
					file: p.file,
					frontmatter: p.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	draft: [
		{
			childParentIdField: 'dbench-scene-id',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findScenes(app).map((s) => ({
					file: s.file,
					frontmatter: s.frontmatter as unknown as Record<string, unknown>,
				})),
		},
		{
			childParentIdField: 'dbench-project-id',
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
	],
	'compile-preset': [
		{
			childParentIdField: 'dbench-project-id',
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
