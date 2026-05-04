import { Modal, setIcon, type App } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import {
	compileAndNotify,
	formatPresetLabel,
} from '../../core/compile/operations';
import {
	findCompilePresetsOfProject,
	findProjects,
	type CompilePresetNote,
	type ProjectNote,
} from '../../core/discovery';
import type { DraftBenchLinker } from '../../core/linker';
import { renderSection } from '../manuscript-view/sections/section-base';
import { NewCompilePresetModal } from '../modals/new-compile-preset-modal';
import { renderContentHandlingSection } from './sections/content-handling';
import { renderInclusionSection } from './sections/inclusion';
import { renderLastCompileSection } from './sections/last-compile';
import { renderMetadataSection } from './sections/metadata';
import { renderOutputSection } from './sections/output';

/**
 * Manuscript Builder modal — the focused, dedicated surface for
 * editing a project's compile presets and triggering a compile run.
 *
 * Replaces the earlier two-tab Control Center modal. The Control
 * Center concept (a multi-tab plugin operations hub) is preserved
 * as a future direction in
 * [docs/planning/control-center-reference.md](../../../../docs/planning/control-center-reference.md);
 * Draft Bench will adopt that pattern when there's enough
 * cross-cutting content to fill it. Until then, the Manuscript
 * Builder is the compile-specific surface.
 *
 * Header: title, project read-out (from `plugin.selection`), preset
 * picker dropdown, "+ New preset" button, "Run compile" CTA.
 *
 * Body: stack of collapsible form sections — Metadata, Inclusion,
 * Output, Content handling, Last compile. The section renderers
 * live in `./sections/` and were promoted from the retired Control
 * Center's compile-tab subtree without behavior changes.
 *
 * Picks up the project from `plugin.selection`; if no project is
 * selected, shows an empty-state prompt directing the writer to the
 * Manuscript view to pick one.
 */
export type ManuscriptBuilderTab = 'build' | 'preview';

export class ManuscriptBuilderModal extends Modal {
	private project: ProjectNote | null = null;
	private presets: CompilePresetNote[] = [];
	private selectedPresetId: string | null = null;
	private bodyEl: HTMLElement | null = null;
	private tabBodyEl: HTMLElement | null = null;
	private activeTab: ManuscriptBuilderTab = 'build';

	constructor(
		app: App,
		private plugin: DraftBenchPlugin,
		private linker: DraftBenchLinker
	) {
		super(app);
		this.modalEl.addClass('dbench-scope');
		this.modalEl.addClass('dbench-manuscript-builder-modal');
	}

	onOpen(): void {
		this.initState();
		this.renderAll();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private initState(): void {
		const projectId = this.plugin.selection.get();
		this.project =
			projectId === null
				? null
				: (findProjects(this.app).find(
						(p) => p.frontmatter['dbench-id'] === projectId
					) ?? null);
		this.presets = this.project
			? findCompilePresetsOfProject(
					this.app,
					this.project.frontmatter['dbench-id']
				)
			: [];
		this.selectedPresetId =
			this.presets.length > 0
				? this.presets[0].frontmatter['dbench-id']
				: null;
	}

	private renderAll(): void {
		this.contentEl.empty();
		this.contentEl.addClass('dbench-manuscript-builder');

		this.contentEl.createEl('h2', {
			cls: 'dbench-manuscript-builder__title',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- branded surface name (parallel to "Manuscript view")
			text: 'Manuscript Builder',
		});

		if (this.project === null) {
			this.renderEmptyNoProject();
			return;
		}

		this.renderHeader();
		this.bodyEl = this.contentEl.createDiv({
			cls: 'dbench-manuscript-builder__body',
		});
		this.renderTabs();
		this.tabBodyEl = this.bodyEl.createDiv({
			cls: 'dbench-manuscript-builder__tab-body',
		});
		this.renderActiveTab();
	}

	private renderEmptyNoProject(): void {
		const empty = this.contentEl.createDiv({
			cls: 'dbench-manuscript-builder__empty',
		});
		empty.createEl('p', {
			cls: 'dbench-manuscript-builder__empty-message',
			text: 'No project selected.',
		});
		empty.createEl('p', {
			cls: 'dbench-manuscript-builder__empty-hint',
			text: 'Open the manuscript view and pick a project to manage its compile presets here.',
		});
	}

	private renderHeader(): void {
		if (!this.project) return;

		const header = this.contentEl.createDiv({
			cls: 'dbench-manuscript-builder__header',
		});

		const projectRow = header.createDiv({
			cls: 'dbench-manuscript-builder__project-row',
		});
		const projectIcon = projectRow.createSpan({
			cls: 'dbench-manuscript-builder__project-icon',
			attr: { 'aria-hidden': 'true' },
		});
		setIcon(projectIcon, 'book');
		projectRow.createSpan({
			cls: 'dbench-manuscript-builder__project-name',
			text: this.project.file.basename,
		});

		const presetRow = header.createDiv({
			cls: 'dbench-manuscript-builder__preset-row',
		});

		if (this.presets.length === 0) {
			presetRow.createSpan({
				cls: 'dbench-manuscript-builder__preset-empty',
				text: 'No compile presets yet.',
			});
		} else {
			const select = presetRow.createEl('select', {
				cls: 'dropdown dbench-manuscript-builder__preset-picker',
				attr: { 'aria-label': 'Compile preset' },
			});
			for (const preset of this.presets) {
				const option = select.createEl('option', {
					value: preset.frontmatter['dbench-id'],
					text: formatPresetLabel(preset),
				});
				if (preset.frontmatter['dbench-id'] === this.selectedPresetId) {
					option.selected = true;
				}
			}
			select.addEventListener('change', () => {
				this.selectedPresetId = select.value;
				this.renderActiveTab();
			});
		}

		const buttonRow = presetRow.createDiv({
			cls: 'dbench-manuscript-builder__buttons',
		});

		const newButton = buttonRow.createEl('button', { text: 'New preset' });
		newButton.addEventListener('click', () => {
			if (!this.project) return;
			new NewCompilePresetModal(
				this.app,
				this.linker,
				this.project
			).open();
			// Refresh after a short delay so the new preset shows up in
			// the picker. The modal's internal flow is async; a 200ms
			// wait covers the linker-suspend + processFrontMatter
			// round-trip without stitching a callback through.
			window.setTimeout(() => {
				this.refreshPresets();
			}, 200);
		});

		const runButton = buttonRow.createEl('button', {
			cls: 'mod-cta',
			text: 'Run compile',
		});
		runButton.disabled = this.presets.length === 0;
		runButton.addEventListener('click', () => {
			void this.handleRunClick(runButton);
		});
	}

	private async handleRunClick(runButton: HTMLButtonElement): Promise<void> {
		const preset = this.presets.find(
			(p) => p.frontmatter['dbench-id'] === this.selectedPresetId
		);
		if (!preset) return;

		runButton.disabled = true;
		const originalText = runButton.textContent ?? 'Run compile';
		runButton.textContent = 'Compiling...';
		try {
			await compileAndNotify(this.app, preset);
			this.refreshPresetFrontmatter(preset.frontmatter['dbench-id']);
			this.renderActiveTab();
		} finally {
			runButton.disabled = this.presets.length === 0;
			runButton.textContent = originalText;
		}
	}

	private refreshPresetFrontmatter(presetId: string): void {
		const preset = this.presets.find(
			(p) => p.frontmatter['dbench-id'] === presetId
		);
		if (!preset) return;
		const fm = this.app.metadataCache.getFileCache(preset.file)?.frontmatter;
		if (!fm) return;
		preset.frontmatter =
			fm as unknown as CompilePresetNote['frontmatter'];
	}

	private renderTabs(): void {
		if (!this.bodyEl) return;
		const tabs = this.bodyEl.createDiv({
			cls: 'dbench-manuscript-builder__tabs',
			attr: { role: 'tablist' },
		});
		this.renderTabButton(tabs, 'build', 'Build');
		this.renderTabButton(tabs, 'preview', 'Preview');
	}

	private renderTabButton(
		tabs: HTMLElement,
		tab: ManuscriptBuilderTab,
		label: string
	): void {
		const isActive = this.activeTab === tab;
		const button = tabs.createEl('button', {
			cls: isActive
				? 'dbench-manuscript-builder__tab dbench-manuscript-builder__tab--active'
				: 'dbench-manuscript-builder__tab',
			text: label,
			attr: {
				type: 'button',
				role: 'tab',
				'data-tab': tab,
				'aria-selected': isActive ? 'true' : 'false',
			},
		});
		button.addEventListener('click', () => {
			if (this.activeTab === tab) return;
			this.activeTab = tab;
			this.refreshTabActiveState();
			this.renderActiveTab();
		});
	}

	private refreshTabActiveState(): void {
		if (!this.bodyEl) return;
		const buttons = this.bodyEl.querySelectorAll<HTMLElement>(
			'.dbench-manuscript-builder__tab'
		);
		buttons.forEach((btn) => {
			const isActive = btn.dataset.tab === this.activeTab;
			btn.toggleClass(
				'dbench-manuscript-builder__tab--active',
				isActive
			);
			btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});
	}

	private renderActiveTab(): void {
		if (!this.tabBodyEl) return;
		this.tabBodyEl.empty();
		if (this.activeTab === 'build') {
			this.renderBuildTab(this.tabBodyEl);
		} else {
			this.renderPreviewTab(this.tabBodyEl);
		}
	}

	private renderBuildTab(body: HTMLElement): void {
		if (this.presets.length === 0) {
			const empty = body.createDiv({
				cls: 'dbench-manuscript-builder__empty',
			});
			empty.createEl('p', {
				cls: 'dbench-manuscript-builder__empty-message',
				text: 'This project has no compile presets.',
			});
			empty.createEl('p', {
				cls: 'dbench-manuscript-builder__empty-hint',
				text: 'Use the button above to create your first compile configuration.',
			});
			return;
		}

		const preset = this.presets.find(
			(p) => p.frontmatter['dbench-id'] === this.selectedPresetId
		);
		if (!preset) return;

		this.renderFormSection(body, 'metadata', 'Metadata', 'book-text', (sec) => {
			renderMetadataSection(sec, this.app, preset);
		});

		this.renderFormSection(
			body,
			'inclusion',
			'Inclusion',
			'list-filter',
			(sec) => {
				renderInclusionSection(
					sec,
					this.app,
					preset,
					this.plugin.settings
				);
			}
		);

		this.renderFormSection(body, 'output', 'Output', 'file-output', (sec) => {
			renderOutputSection(sec, this.app, preset);
		});

		this.renderFormSection(
			body,
			'content-handling',
			'Content handling',
			'wand',
			(sec) => {
				renderContentHandlingSection(sec, this.app, preset);
			}
		);

		this.renderFormSection(
			body,
			'last-compile',
			'Last compile',
			'history',
			(sec) => {
				renderLastCompileSection(sec, this.app, preset);
			}
		);
	}

	private renderPreviewTab(body: HTMLElement): void {
		// Placeholder for Step 1; render plumbing lands in Step 4 of
		// docs/planning/manuscript-builder-preview.md.
		body.createDiv({
			cls: 'dbench-manuscript-builder__preview',
		});
	}

	private renderFormSection(
		parent: HTMLElement,
		id: string,
		title: string,
		icon: string,
		contentRenderer: (body: HTMLElement) => void
	): void {
		renderSection(parent, {
			sectionId: `manuscript-builder-${id}`,
			title,
			icon,
			expanded: true,
			onToggle: () => {
				// V1 doesn't persist section collapse state across modal
				// opens. Adoptable later if writers ask for it.
			},
			contentRenderer,
		});
	}

	private refreshPresets(): void {
		if (!this.project) return;
		const before = this.presets.map((p) => p.frontmatter['dbench-id']);
		this.presets = findCompilePresetsOfProject(
			this.app,
			this.project.frontmatter['dbench-id']
		);
		const after = this.presets.map((p) => p.frontmatter['dbench-id']);
		if (
			before.length === after.length &&
			before.every((id, i) => id === after[i])
		) {
			return;
		}
		// Auto-select the new preset (the one that wasn't in `before`).
		const created = this.presets.find(
			(p) => !before.includes(p.frontmatter['dbench-id'])
		);
		if (created) {
			this.selectedPresetId = created.frontmatter['dbench-id'];
		}
		this.renderAll();
	}
}
