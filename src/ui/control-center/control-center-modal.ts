import { App, Modal, Platform, Setting, setIcon } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import {
	findProjects,
	findScenesInProject,
	type ProjectNote,
	type SceneNote,
} from '../../core/discovery';
import type { DraftBenchLinker } from '../../core/linker';
import { compileTab } from './tabs/compile-tab';
import { manuscriptTab, sortScenesByOrder } from './tabs/manuscript-tab';
import { projectTab } from './tabs/project-tab';
import { templatesTab } from './tabs/templates-tab';
import type { TabDefinition } from './tabs/types';

export const CONTROL_CENTER_TABS: readonly TabDefinition[] = [
	projectTab,
	manuscriptTab,
	templatesTab,
	compileTab,
] as const;

const DEFAULT_TAB_ID = 'project';

/**
 * "Draft Bench: Control Center" modal.
 *
 * Tabbed hub per spec § Control Center. Phase 1 scope is rendering only:
 * Project / Manuscript show the selected project; Templates / Compile
 * are placeholders; Settings embeds `DraftBenchSettingTab` inline.
 *
 * Scene list for the selected project is cached on the instance and
 * cleared on close.
 */
export class ControlCenterModal extends Modal {
	private readonly plugin: DraftBenchPlugin;
	private readonly linker: DraftBenchLinker;
	private readonly projects: ProjectNote[];
	private selectedProject: ProjectNote | null;
	private cachedScenes: SceneNote[] | null = null;
	private activeTabId: string = DEFAULT_TAB_ID;

	private navEl: HTMLElement | null = null;
	private contentAreaEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: DraftBenchPlugin,
		linker: DraftBenchLinker,
		initialProject: ProjectNote | null = null
	) {
		super(app);
		this.plugin = plugin;
		this.linker = linker;
		this.projects = findProjects(app);
		this.selectedProject =
			initialProject ??
			(this.projects.length > 0 ? this.projects[0] : null);
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
		this.cachedScenes = null;
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

		if (this.projects.length === 0) return;

		new Setting(header)
			.setName('Project')
			.setClass('dbench-control-center__project-picker')
			.addDropdown((dropdown) => {
				for (const p of this.projects) {
					dropdown.addOption(
						p.frontmatter['dbench-id'],
						p.file.basename
					);
				}
				if (this.selectedProject) {
					dropdown.setValue(
						this.selectedProject.frontmatter['dbench-id']
					);
				}
				dropdown.onChange((value) => {
					this.selectedProject =
						this.projects.find(
							(p) => p.frontmatter['dbench-id'] === value
						) ?? null;
					this.cachedScenes = null;
					this.renderActiveTab();
				});
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

		if (this.projects.length === 0) {
			this.renderEmptyVault(this.contentAreaEl);
			return;
		}

		const tab =
			CONTROL_CENTER_TABS.find((t) => t.id === this.activeTabId) ??
			CONTROL_CENTER_TABS[0];

		tab.render(this.contentAreaEl, {
			app: this.app,
			plugin: this.plugin,
			linker: this.linker,
			selectedProject: this.selectedProject,
			scenes: this.getScenes(),
			requestClose: () => this.close(),
		});
	}

	private getScenes(): SceneNote[] | null {
		if (!this.selectedProject) return null;
		if (this.cachedScenes !== null) return this.cachedScenes;
		const raw = findScenesInProject(
			this.app,
			this.selectedProject.frontmatter['dbench-id']
		);
		this.cachedScenes = sortScenesByOrder(raw);
		return this.cachedScenes;
	}

	private renderEmptyVault(container: HTMLElement): void {
		container.createEl('p', {
			cls: 'dbench-control-center__empty',
			text: 'No projects exist yet. Use the command palette to create one.',
		});
	}
}
