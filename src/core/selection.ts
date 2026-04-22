/**
 * Plugin-level selection state for the currently-selected project.
 *
 * Per [D-07](../../docs/planning/decisions/D-07-control-center-split.md)
 * the Manuscript leaf and (post-split) Control Center modal both read
 * and write a single `selectedProjectId` that lives on the plugin
 * instance. Surfaces that want to react to selection changes subscribe
 * via `onChange`; the returned unsubscribe function is idiomatic for
 * `plugin.register(() => ...)` teardown.
 *
 * Selection state is session-scoped by default. The Manuscript leaf
 * additionally persists the value in its own `getState()` so a
 * workspace-layout reload can push the remembered selection back up
 * into plugin state on view open.
 */
export class ProjectSelection {
	private id: string | null = null;
	private readonly listeners = new Set<(id: string | null) => void>();

	/** Current selection, or null when no project is selected. */
	get(): string | null {
		return this.id;
	}

	/**
	 * Set the selection. Notifies all subscribed listeners, in
	 * registration order. No-op when the value is unchanged, so
	 * surfaces can idempotently call `set` from render paths without
	 * triggering a re-render loop.
	 */
	set(id: string | null): void {
		if (this.id === id) return;
		this.id = id;
		for (const listener of this.listeners) {
			listener(id);
		}
	}

	/**
	 * Register a listener for selection changes. Returns an unsubscribe
	 * function suitable for `plugin.register(...)` teardown.
	 */
	onChange(listener: (id: string | null) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Listener count, for tests and diagnostics.
	 */
	get listenerCount(): number {
		return this.listeners.size;
	}
}
