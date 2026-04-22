import { App, Modal, Platform, setIcon } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import type { DraftBenchLinker } from '../../core/linker';
import { compileTab } from './tabs/compile-tab';
import { templatesTab } from './tabs/templates-tab';
import type { TabDefinition } from './tabs/types';

export const CONTROL_CENTER_TABS: readonly TabDefinition[] = [
	templatesTab,
	compileTab,
] as const;

const DEFAULT_TAB_ID = 'templates';

/**
 * "Draft Bench: Control Center" modal.
 *
 * Post-split (see D-07), the modal hosts action-shaped flows only:
 * Templates (stub; full UI in Phase 3) and Compile (stub until
 * Book Builder ships). Project overview and Manuscript-list content
 * live in the dockable Manuscript view
 * (`src/ui/manuscript-view/manuscript-view.ts`).
 */
export class ControlCenterModal extends Modal {
	private readonly plugin: DraftBenchPlugin;
	private readonly linker: DraftBenchLinker;
	private activeTabId: string = DEFAULT_TAB_ID;

	private navEl: HTMLElement | null = null;
	private contentAreaEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: DraftBenchPlugin,
		linker: DraftBenchLinker
	) {
		super(app);
		this.plugin = plugin;
		this.linker = linker;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('dbench-scope');
		modalEl.addClass('dbench-control-center-modal');
		if (Platform.isMobile) {
			modalEl.addClass('dbench-control-center-modal--mobile');
		}

		this.renderHeader(contentEl);

		const body = contentEl.createDiv({
			cls: 'dbench-control-center__body',
		});
		this.navEl = body.createDiv({ cls: 'dbench-control-center__nav' });
		this.contentAreaEl = body.createDiv({
			cls: 'dbench-control-center__content',
		});

		this.renderNav();
		this.renderActiveTab();
	}

	onClose(): void {
		this.contentEl.empty();
		this.navEl = null;
		this.contentAreaEl = null;
	}

	private renderHeader(parent: HTMLElement): void {
		const header = parent.createDiv({
			cls: 'dbench-control-center__header',
		});

		header.createEl('h1', {
			cls: 'dbench-control-center__title',
			text: 'Draft Bench',
		});
	}

	private renderNav(): void {
		if (!this.navEl) return;
		this.navEl.empty();

		for (const tab of CONTROL_CENTER_TABS) {
			const button = this.navEl.createEl('button', {
				cls: 'dbench-control-center__nav-item',
			});
			if (tab.id === this.activeTabId) {
				button.addClass('dbench-control-center__nav-item--active');
			}
			const iconEl = button.createSpan({
				cls: 'dbench-control-center__nav-icon',
			});
			setIcon(iconEl, tab.icon);
			button.createSpan({
				cls: 'dbench-control-center__nav-label',
				text: tab.name,
			});
			button.addEventListener('click', () => this.switchTab(tab.id));
		}
	}

	private switchTab(tabId: string): void {
		if (this.activeTabId === tabId) return;
		this.activeTabId = tabId;
		this.renderNav();
		this.renderActiveTab();
	}

	private renderActiveTab(): void {
		if (!this.contentAreaEl) return;
		this.contentAreaEl.empty();
		this.contentAreaEl.scrollTop = 0;

		const tab =
			CONTROL_CENTER_TABS.find((t) => t.id === this.activeTabId) ??
			CONTROL_CENTER_TABS[0];

		tab.render(this.contentAreaEl, {
			app: this.app,
			plugin: this.plugin,
			linker: this.linker,
			selectedProject: null,
			scenes: null,
			requestClose: () => this.close(),
		});
	}
}
