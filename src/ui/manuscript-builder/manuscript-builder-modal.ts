import { Component, MarkdownRenderer, Modal, setIcon, type App } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import { CompileService } from '../../core/compile-service';
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
import type { ManuscriptBuilderTab } from '../../model/settings';
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
export class ManuscriptBuilderModal extends Modal {
	private project: ProjectNote | null = null;
	private presets: CompilePresetNote[] = [];
	private selectedPresetId: string | null = null;
	private bodyEl: HTMLElement | null = null;
	private tabBodyEl: HTMLElement | null = null;
	private activeTab: ManuscriptBuilderTab = 'build';
	private previewComponent: Component | null = null;
	private previewRenderToken = 0;

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
		this.tearDownPreview();
		this.contentEl.empty();
	}

	private tearDownPreview(): void {
		this.previewRenderToken++;
		if (this.previewComponent) {
			this.previewComponent.unload();
			this.previewComponent = null;
		}
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
		this.activeTab = this.loadActiveTab();
	}

	private loadActiveTab(): ManuscriptBuilderTab {
		if (!this.project) return 'build';
		const projectId = this.project.frontmatter['dbench-id'];
		const saved = this.plugin.settings.manuscriptBuilderTabState[projectId];
		return saved === 'preview' ? 'preview' : 'build';
	}

	private persistActiveTab(): void {
		if (!this.project) return;
		const projectId = this.project.frontmatter['dbench-id'];
		this.plugin.settings.manuscriptBuilderTabState[projectId] =
			this.activeTab;
		void this.plugin.saveSettings();
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
			this.persistActiveTab();
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
		// Switching away from Preview, or re-entering Preview, both
		// invalidate any in-flight preview render and release the
		// component bound to the old DOM before we wipe the body.
		this.tearDownPreview();
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
		void this.renderPreviewAsync(body);
	}

	/*
	 * Preview render path: single-pass MarkdownRenderer.render against
	 * CompileService's markdown intermediate, no chunking, no
	 * virtualization. Per docs/planning/manuscript-builder-preview.md
	 * § 2 (ratified 2026-05-04): trust the renderer for typical
	 * novel-sized projects; fall back to chunked render (descend
	 * chapter-by-chapter, render each, concat) if writers report lag
	 * or the planned large-vault benchmark surfaces unacceptable
	 * render times. Virtualized scroll is the next step beyond that
	 * and remains deferred.
	 *
	 * The renderToken pattern guards against stale renders when the
	 * writer flips tabs / presets faster than CompileService.generate
	 * resolves: each invocation increments the token, the post-await
	 * check abandons any render whose token is no longer current.
	 */
	private async renderPreviewAsync(body: HTMLElement): Promise<void> {
		const token = ++this.previewRenderToken;

		const preset = this.presets.find(
			(p) => p.frontmatter['dbench-id'] === this.selectedPresetId
		);
		if (!preset || !this.project) {
			// Step 6 will render dedicated empty states for the no-
			// project / no-preset / no-scenes / render-error cases.
			return;
		}

		let markdown: string;
		try {
			const result = await new CompileService(this.app).generate(preset);
			markdown = result.markdown;
		} catch {
			// Step 6 handles the render-error empty state.
			return;
		}

		if (token !== this.previewRenderToken) return;

		// Tear down the previous render's component before swapping
		// in the new one, so embeds / dataview blocks / etc. release
		// their resources cleanly.
		if (this.previewComponent) {
			this.previewComponent.unload();
			this.previewComponent = null;
		}

		body.empty();
		const previewEl = body.createDiv({
			cls: 'dbench-manuscript-builder__preview',
		});

		const component = new Component();
		component.load();
		this.previewComponent = component;

		const sourcePath = this.project.file.path;
		try {
			await MarkdownRenderer.render(
				this.app,
				markdown,
				previewEl,
				sourcePath,
				component
			);
		} catch {
			// Step 6 handles the render-error empty state. For now,
			// the partially-rendered DOM stays as-is rather than being
			// wiped, so the writer at least sees what landed.
		}
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
