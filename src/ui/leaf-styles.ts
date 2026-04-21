import { MarkdownView, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { readDbenchType } from '../core/retrofit';

/**
 * Leaf styling: tag plugin-managed editor leaves with type-identifying
 * CSS classes so themes, Style Settings, and the plugin's own
 * `styles/notes.css` can target them.
 *
 * Per spec § Styling and Style Settings Integration:
 *
 * - `.dbench-project` / `.dbench-scene` / `.dbench-draft` apply to a
 *   leaf whose open file has the matching `dbench-type`.
 * - Each short-form class is paired with its `.draft-bench-*` long-form
 *   sibling (per the project's CSS naming convention).
 * - Applied across every open markdown leaf (not just the active one)
 *   so styling is consistent when multiple panes of different types
 *   are visible side by side.
 * - Reapplied on `active-leaf-change`, `file-open`, `layout-change`,
 *   and metadata-cache `changed` so the class follows the file through
 *   tab switches, pane splits, and frontmatter edits.
 */

const CLASSES_BY_TYPE: Record<string, readonly string[]> = {
	project: ['dbench-project', 'draft-bench-project'],
	scene: ['dbench-scene', 'draft-bench-scene'],
	draft: ['dbench-draft', 'draft-bench-draft'],
};

/** All classes this module ever adds (used for cleanup sweeps). */
const ALL_MANAGED_CLASSES: readonly string[] = Array.from(
	new Set(Object.values(CLASSES_BY_TYPE).flat())
);

/**
 * Return the CSS classes to apply for a note of the given `dbench-type`
 * (or an empty array for an unrecognized or missing type).
 *
 * Pure — no DOM or app access — so the mapping can be exercised by
 * unit tests without a full Obsidian runtime.
 */
export function classesForDbenchType(type: string | null | undefined): string[] {
	if (type == null) return [];
	return [...(CLASSES_BY_TYPE[type] ?? [])];
}

/**
 * Observes workspace events and keeps managed classes in sync with each
 * open markdown leaf's `dbench-type`. Use `start()` on plugin load;
 * cleanup runs automatically via `plugin.register()` on unload.
 */
export class LeafStyles {
	constructor(private readonly plugin: Plugin) {}

	start(): void {
		const { plugin } = this;
		const workspace = plugin.app.workspace;

		plugin.registerEvent(
			workspace.on('active-leaf-change', () => this.refreshAll())
		);
		plugin.registerEvent(
			workspace.on('file-open', () => this.refreshAll())
		);
		plugin.registerEvent(
			workspace.on('layout-change', () => this.refreshAll())
		);
		plugin.registerEvent(
			plugin.app.metadataCache.on('changed', () => this.refreshAll())
		);

		// Run once synchronously, and again after layout-ready so leaves
		// opened at startup (before our listener attached) get classed.
		this.refreshAll();
		workspace.onLayoutReady(() => this.refreshAll());

		plugin.register(() => this.teardown());
	}

	/**
	 * Iterate every leaf in the workspace and update managed classes.
	 * Cheap enough (workspace has few leaves) that we run this wholesale
	 * rather than tracking dirty leaves.
	 */
	private refreshAll(): void {
		this.plugin.app.workspace.iterateAllLeaves((leaf) =>
			this.applyToLeaf(leaf)
		);
	}

	private applyToLeaf(leaf: WorkspaceLeaf): void {
		const view = leaf.view;
		const el = (view as { containerEl?: HTMLElement })?.containerEl;
		if (!el) return;

		if (!(view instanceof MarkdownView)) {
			// Non-markdown view: strip any previously-applied classes.
			stripManagedClasses(el);
			return;
		}

		const file = view.file;
		const type = file ? readDbenchType(this.plugin.app, file) : null;
		const desired = classesForDbenchType(type);

		// Remove any existing managed classes, then add the current set.
		// classList.add/remove are no-ops when the target isn't present,
		// so re-running this doesn't cause layout thrash.
		stripManagedClasses(el);
		if (desired.length > 0) el.classList.add(...desired);
	}

	/**
	 * Sweep every leaf and remove managed classes. Called on plugin
	 * unload so leaves return to their original (theme-only) styling.
	 */
	private teardown(): void {
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const el = (leaf.view as { containerEl?: HTMLElement })
				?.containerEl;
			if (el) stripManagedClasses(el);
		});
	}
}

function stripManagedClasses(el: HTMLElement): void {
	el.classList.remove(...ALL_MANAGED_CLASSES);
}
