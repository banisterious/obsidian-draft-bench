import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import type { DraftBenchLinker } from '../../core/linker';
import { ManuscriptBuilder } from './manuscript-builder';

export const VIEW_TYPE_MANUSCRIPT_BUILDER = 'draft-bench-manuscript-builder';

/**
 * Manuscript Builder workspace leaf — the dockable counterpart to
 * the modal. Renders the same Build / Preview tab UI via the shared
 * `ManuscriptBuilder` shell, but in a workspace leaf so writers can
 * leave Preview pinned next to a scene they're editing in another
 * pane. Per [#27](https://github.com/banisterious/obsidian-draft-bench/issues/27).
 *
 * Multi-leaf state: single Builder leaf only. The activation helper
 * (`activateManuscriptBuilderView`) reveals an existing leaf rather
 * than creating a second.
 *
 * Persistence: state lives in plugin settings (active project via
 * `plugin.selection`, last-active tab in `manuscriptBuilderTabState`,
 * last-selected preset in `manuscriptBuilderSelectedPresetId`). The
 * leaf itself is essentially stateless — `getState` / `setState`
 * carry no project-specific data; everything reads from settings on
 * `onOpen`. Mirrors the Manuscript view leaf pattern.
 *
 * Reverse path: passive only. No "convert to modal" affordance on
 * the leaf; writers who prefer modal close the leaf and open via
 * existing entry points (palette, Compile CTA in the Manuscript
 * view).
 */
export class ManuscriptBuilderView extends ItemView {
	private builder: ManuscriptBuilder | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: DraftBenchPlugin,
		private linker: DraftBenchLinker
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_MANUSCRIPT_BUILDER;
	}

	getDisplayText(): string {
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- branded surface name (parallel to "Manuscript view")
		return 'Manuscript Builder';
	}

	getIcon(): string {
		return 'book-up';
	}

	onOpen(): Promise<void> {
		this.containerEl.addClass('dbench-scope');
		this.containerEl.addClass('dbench-manuscript-builder-view');
		this.builder = new ManuscriptBuilder(
			this.app,
			this.plugin,
			this.linker,
			this.contentEl
			// No dockHandler: leaf doesn't render a dock button (passive
			// reverse path per #27).
		);
		this.builder.mount();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.builder?.unmount();
		this.builder = null;
		this.containerEl.removeClass('dbench-scope');
		this.containerEl.removeClass('dbench-manuscript-builder-view');
		return Promise.resolve();
	}
}
