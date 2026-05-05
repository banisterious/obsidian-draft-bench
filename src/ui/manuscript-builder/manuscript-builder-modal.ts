import { Modal, type App } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import type { DraftBenchLinker } from '../../core/linker';
import { activateManuscriptBuilderView } from './activate';
import { ManuscriptBuilder } from './manuscript-builder';

/**
 * Manuscript Builder modal — the focused, dedicated surface for
 * editing a project's compile presets and triggering a compile run.
 *
 * The actual UI is rendered by the host-agnostic
 * [`ManuscriptBuilder`](./manuscript-builder.ts) shell so the same
 * code can drive both this modal and the dockable leaf
 * ([`ManuscriptBuilderView`](./manuscript-builder-view.ts), per
 * [#27](https://github.com/banisterious/obsidian-draft-bench/issues/27)).
 * The modal subclass is a thin lifecycle wrapper: `onOpen` calls
 * `shell.mount()`, `onClose` calls `shell.unmount()`. It also wires
 * the dock-to-leaf button (sticky-header icon) to a handler that
 * closes the modal and opens the leaf with the same project /
 * preset / tab state (read from settings on the leaf's open).
 *
 * Replaces the earlier two-tab Control Center modal. The Control
 * Center concept (a multi-tab plugin operations hub) is preserved
 * as a future direction in
 * [docs/planning/control-center-reference.md](../../../../docs/planning/control-center-reference.md);
 * Draft Bench will adopt that pattern when there's enough
 * cross-cutting content to fill it. Until then, the Manuscript
 * Builder is the compile-specific surface.
 */
export class ManuscriptBuilderModal extends Modal {
	private builder: ManuscriptBuilder;

	constructor(
		app: App,
		plugin: DraftBenchPlugin,
		linker: DraftBenchLinker
	) {
		super(app);
		this.modalEl.addClass('dbench-scope');
		this.modalEl.addClass('dbench-manuscript-builder-modal');
		this.builder = new ManuscriptBuilder(
			app,
			plugin,
			linker,
			this.contentEl,
			() => this.dockToLeaf()
		);
	}

	onOpen(): void {
		this.builder.mount();
	}

	onClose(): void {
		this.builder.unmount();
	}

	private dockToLeaf(): void {
		// Close the modal first so the workspace can take focus, then
		// open the leaf. The leaf reads project / preset / tab state
		// from plugin settings on `onOpen`, so the user lands where
		// they were in the modal.
		this.close();
		void activateManuscriptBuilderView(this.app);
	}
}
