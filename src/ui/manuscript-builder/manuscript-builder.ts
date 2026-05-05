import { Component, MarkdownRenderer, setIcon, type App } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import { CompileService } from '../../core/compile-service';
import {
	compileAndNotify,
	formatPresetLabel,
} from '../../core/compile/operations';
import {
	findCompilePresetsOfProject,
	findProjects,
	findScenesInProject,
	type CompilePresetNote,
	type ProjectNote,
} from '../../core/discovery';
import type { DraftBenchLinker } from '../../core/linker';
import type {
	ManuscriptBuilderTab,
	PreviewFontFamily,
	PreviewReadingWidth,
	PreviewTextAlign,
} from '../../model/settings';
import { renderSection } from '../manuscript-view/sections/section-base';
import { NewCompilePresetModal } from '../modals/new-compile-preset-modal';
import { renderContentHandlingSection } from './sections/content-handling';
import { renderInclusionSection } from './sections/inclusion';
import { renderLastCompileSection } from './sections/last-compile';
import { renderMetadataSection } from './sections/metadata';
import { renderOutputSection } from './sections/output';

/**
 * Preview-typography mappings. The settings store named values
 * ("full" / "narrow" / "serif" / etc.); these tables resolve them
 * to the actual CSS values written onto the host contentEl as
 * `--dbench-preview-*` overrides. Keeping the named values in
 * settings (rather than raw CSS strings) means future renames or
 * additions don't break stored data.
 */
/*
 * Reading-width values are tuned against the modal's
 * `min(960px, 92vw)` width: each step needs to clip below the
 * effective inner content width to be visible. 65em (~1040px) was
 * larger than the modal itself, so "Medium" looked identical to
 * "Full"; 50em (~800px) and 40em (~640px) give three visibly
 * distinct widths on a 960px modal.
 */
const PREVIEW_READING_WIDTH_VALUE: Record<PreviewReadingWidth, string> = {
	full: 'none',
	medium: '50em',
	narrow: '40em',
};

const PREVIEW_FONT_FAMILY_VALUE: Record<PreviewFontFamily, string> = {
	default: 'var(--font-text)',
	serif: 'Georgia, "Times New Roman", serif',
	sans: 'system-ui, -apple-system, sans-serif',
	mono: 'var(--font-monospace)',
};

const PREVIEW_FONT_SIZE_MIN = 12;
const PREVIEW_FONT_SIZE_MAX = 24;

/**
 * Manuscript Builder shell — host-agnostic core that renders the
 * full Builder UI (header with project + preset pickers, Run
 * compile, Build / Preview tabs, sticky-header behavior) into any
 * provided `contentEl`.
 *
 * The class doesn't subclass Modal or ItemView; instead it's
 * delegated to from both surfaces:
 *
 * - `ManuscriptBuilderModal` (in manuscript-builder-modal.ts) is
 *   the historical entry point. Modal's `onOpen` calls
 *   `shell.mount()`; `onClose` calls `shell.unmount()`.
 * - `ManuscriptBuilderView` (the dockable leaf, target #27) uses
 *   the same shell against its own `contentEl`.
 *
 * Splitting the rendering core out of the Modal subclass lets both
 * surfaces share state-management code (project selection, preset
 * persistence, tab switching, Preview render plumbing) without
 * duplication. State that needs to survive across modal opens or
 * reload (active project, last-active tab, Preview typography)
 * lives in plugin settings; the shell reads on mount and writes
 * through change handlers.
 *
 * No Modal-specific or ItemView-specific code lives here — only
 * `app`, `plugin`, `linker`, and a `contentEl` to render into.
 */
export class ManuscriptBuilder {
	private project: ProjectNote | null = null;
	private presets: CompilePresetNote[] = [];
	private selectedPresetId: string | null = null;
	private tabBodyEl: HTMLElement | null = null;
	private activeTab: ManuscriptBuilderTab = 'build';
	private previewComponent: Component | null = null;
	private previewRenderToken = 0;

	/**
	 * @param dockHandler  Optional callback invoked when the dock-to-
	 *   leaf button in the sticky header is clicked. The button is
	 *   only rendered when this handler is provided; the modal passes
	 *   it (closes modal + opens leaf), the leaf doesn't (no
	 *   dock-to-leaf affordance from the leaf form, per the design
	 *   ratification's passive reverse-path resolution).
	 */
	constructor(
		private app: App,
		private plugin: DraftBenchPlugin,
		private linker: DraftBenchLinker,
		private contentEl: HTMLElement,
		private dockHandler?: () => void
	) {}

	/** Initialize state from plugin settings + render the UI. */
	mount(): void {
		this.initState();
		this.renderAll();
	}

	/** Tear down preview-rendered children and clear the host element. */
	unmount(): void {
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
		this.selectedPresetId = this.loadSelectedPresetId();
		this.activeTab = this.loadActiveTab();
	}

	private loadSelectedPresetId(): string | null {
		if (this.presets.length === 0) return null;
		if (this.project) {
			const projectId = this.project.frontmatter['dbench-id'];
			const saved =
				this.plugin.settings.manuscriptBuilderSelectedPresetId[projectId];
			if (
				saved &&
				this.presets.some((p) => p.frontmatter['dbench-id'] === saved)
			) {
				return saved;
			}
		}
		return this.presets[0].frontmatter['dbench-id'];
	}

	private persistSelectedPresetId(): void {
		if (!this.project || !this.selectedPresetId) return;
		const projectId = this.project.frontmatter['dbench-id'];
		this.plugin.settings.manuscriptBuilderSelectedPresetId[projectId] =
			this.selectedPresetId;
		void this.plugin.saveSettings();
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

		// Sticky region: title, project + preset header, tab strip.
		// Stays pinned to the top of the host's scroll container so
		// the writer can switch projects, presets, and tabs from any
		// scroll position when the Preview tab's prose is long. Per
		// docs/planning/manuscript-builder-preview.md § 6 "long-scroll
		// consideration".
		const sticky = this.contentEl.createDiv({
			cls: 'dbench-manuscript-builder__sticky-header',
		});

		sticky.createEl('h2', {
			cls: 'dbench-manuscript-builder__title',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- branded surface name (parallel to "Manuscript view")
			text: 'Manuscript Builder',
		});

		// Optional dock-to-leaf button. Only rendered when the host
		// (currently only the modal) provides a handler; the leaf
		// itself doesn't show one (passive reverse path per #27's
		// design ratification).
		if (this.dockHandler) {
			const dockBtn = sticky.createEl('button', {
				cls: 'dbench-manuscript-builder__dock-button clickable-icon',
				attr: {
					type: 'button',
					'aria-label': 'Open as workspace tab',
				},
			});
			setIcon(dockBtn, 'panel-right');
			dockBtn.addEventListener('click', () => this.dockHandler?.());
		}

		if (this.project === null) {
			this.renderEmptyNoProject();
			return;
		}

		this.renderHeader(sticky);
		this.renderTabs(sticky);
		this.refreshPreviewToolbar();

		this.tabBodyEl = this.contentEl.createDiv({
			cls: 'dbench-manuscript-builder__tab-body',
		});
		this.applyPreviewTypography();
		this.renderActiveTab();
	}

	/*
	 * Preview typography wiring. Toolbar above the rendered prose
	 * (only visible on the Preview tab) lets the writer tune text
	 * alignment, reading width, font size, and font family. Choices
	 * persist globally via plugin settings (these are reading-
	 * register preferences, not project-specific). Applied as
	 * inline `--dbench-preview-*` overrides on contentEl so the
	 * existing CSS rules in manuscript-builder.css light up
	 * unchanged.
	 *
	 * The Style Settings hooks declared in style-settings.css remain
	 * for power users who prefer body-scope persistence; the toolbar
	 * is the primary affordance and works without depending on the
	 * Style Settings community plugin.
	 */
	private applyPreviewTypography(): void {
		const t = this.plugin.settings.previewTypography;
		this.contentEl.style.setProperty(
			'--dbench-preview-text-align',
			t.textAlign
		);
		this.contentEl.style.setProperty(
			'--dbench-preview-max-width',
			PREVIEW_READING_WIDTH_VALUE[t.readingWidth]
		);
		this.contentEl.style.setProperty(
			'--dbench-preview-font-size',
			`${t.fontSize}px`
		);
		this.contentEl.style.setProperty(
			'--dbench-preview-font-family',
			PREVIEW_FONT_FAMILY_VALUE[t.fontFamily]
		);
	}

	private refreshPreviewToolbar(): void {
		this.contentEl
			.querySelector('.dbench-manuscript-builder__preview-toolbar')
			?.remove();
		if (this.activeTab !== 'preview') return;

		const sticky = this.contentEl.querySelector<HTMLElement>(
			'.dbench-manuscript-builder__sticky-header'
		);
		if (!sticky) return;

		const toolbar = sticky.createDiv({
			cls: 'dbench-manuscript-builder__preview-toolbar',
			attr: { role: 'toolbar', 'aria-label': 'Preview typography' },
		});
		this.renderTextAlignToggle(toolbar);
		this.renderReadingWidthToggle(toolbar);
		this.renderFontSizeStepper(toolbar);
		this.renderFontFamilyDropdown(toolbar);
	}

	private renderTextAlignToggle(parent: HTMLElement): void {
		const group = parent.createDiv({
			cls: 'dbench-manuscript-builder__toolbar-group',
			attr: { role: 'group', 'aria-label': 'Text alignment' },
		});
		const buttons = new Map<PreviewTextAlign, HTMLElement>();
		const setActive = (value: PreviewTextAlign): void => {
			buttons.forEach((btn, val) => {
				btn.toggleClass(
					'dbench-manuscript-builder__toolbar-button--active',
					val === value
				);
			});
		};
		const make = (
			value: PreviewTextAlign,
			label: string,
			icon: string
		): void => {
			const btn = group.createEl('button', {
				cls: 'dbench-manuscript-builder__toolbar-button',
				attr: { type: 'button', 'aria-label': label },
			});
			setIcon(btn, icon);
			btn.addEventListener('click', () => {
				this.plugin.settings.previewTypography.textAlign = value;
				void this.plugin.saveSettings();
				this.applyPreviewTypography();
				setActive(value);
			});
			buttons.set(value, btn);
		};
		make('left', 'Align left', 'align-left');
		make('justify', 'Justify', 'align-justify');
		setActive(this.plugin.settings.previewTypography.textAlign);
	}

	private renderReadingWidthToggle(parent: HTMLElement): void {
		const group = parent.createDiv({
			cls: 'dbench-manuscript-builder__toolbar-group',
			attr: { role: 'group', 'aria-label': 'Reading width' },
		});
		const buttons = new Map<PreviewReadingWidth, HTMLElement>();
		const setActive = (value: PreviewReadingWidth): void => {
			buttons.forEach((btn, val) => {
				btn.toggleClass(
					'dbench-manuscript-builder__toolbar-button--active',
					val === value
				);
			});
		};
		const make = (value: PreviewReadingWidth, label: string): void => {
			const btn = group.createEl('button', {
				cls: 'dbench-manuscript-builder__toolbar-button dbench-manuscript-builder__toolbar-button--text',
				text: label,
				attr: { type: 'button', 'aria-label': `Reading width ${label}` },
			});
			btn.addEventListener('click', () => {
				this.plugin.settings.previewTypography.readingWidth = value;
				void this.plugin.saveSettings();
				this.applyPreviewTypography();
				setActive(value);
			});
			buttons.set(value, btn);
		};
		make('full', 'Full');
		make('medium', 'Med');
		make('narrow', 'Narrow');
		setActive(this.plugin.settings.previewTypography.readingWidth);
	}

	private renderFontSizeStepper(parent: HTMLElement): void {
		const group = parent.createDiv({
			cls: 'dbench-manuscript-builder__toolbar-group',
			attr: { role: 'group', 'aria-label': 'Font size' },
		});
		const minus = group.createEl('button', {
			cls: 'dbench-manuscript-builder__toolbar-button',
			attr: { type: 'button', 'aria-label': 'Decrease font size' },
		});
		setIcon(minus, 'minus');
		const valueEl = group.createSpan({
			cls: 'dbench-manuscript-builder__toolbar-value',
			text: `${this.plugin.settings.previewTypography.fontSize}px`,
			attr: { 'aria-live': 'polite' },
		});
		const plus = group.createEl('button', {
			cls: 'dbench-manuscript-builder__toolbar-button',
			attr: { type: 'button', 'aria-label': 'Increase font size' },
		});
		setIcon(plus, 'plus');

		const refreshDisabled = (): void => {
			const fs = this.plugin.settings.previewTypography.fontSize;
			minus.disabled = fs <= PREVIEW_FONT_SIZE_MIN;
			plus.disabled = fs >= PREVIEW_FONT_SIZE_MAX;
		};
		const step = (delta: number): void => {
			const current = this.plugin.settings.previewTypography.fontSize;
			const next = Math.max(
				PREVIEW_FONT_SIZE_MIN,
				Math.min(PREVIEW_FONT_SIZE_MAX, current + delta)
			);
			if (next === current) return;
			this.plugin.settings.previewTypography.fontSize = next;
			void this.plugin.saveSettings();
			this.applyPreviewTypography();
			valueEl.setText(`${next}px`);
			refreshDisabled();
		};
		minus.addEventListener('click', () => step(-1));
		plus.addEventListener('click', () => step(1));
		refreshDisabled();
	}

	private renderFontFamilyDropdown(parent: HTMLElement): void {
		const select = parent.createEl('select', {
			cls: 'dropdown dbench-manuscript-builder__toolbar-select',
			attr: { 'aria-label': 'Font family' },
		});
		const options: Array<{ value: PreviewFontFamily; label: string }> = [
			{ value: 'default', label: 'Theme default' },
			{ value: 'serif', label: 'Serif' },
			{ value: 'sans', label: 'Sans-serif' },
			{ value: 'mono', label: 'Monospace' },
		];
		const current = this.plugin.settings.previewTypography.fontFamily;
		for (const o of options) {
			const opt = select.createEl('option', {
				value: o.value,
				text: o.label,
			});
			if (o.value === current) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.plugin.settings.previewTypography.fontFamily =
				select.value as PreviewFontFamily;
			void this.plugin.saveSettings();
			this.applyPreviewTypography();
		});
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

	private renderHeader(parent: HTMLElement): void {
		if (!this.project) return;

		const header = parent.createDiv({
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

		const allProjects = findProjects(this.app);
		const projectSelect = projectRow.createEl('select', {
			cls: 'dropdown dbench-manuscript-builder__project-picker',
			attr: { 'aria-label': 'Project' },
		});
		const currentProjectId = this.project.frontmatter['dbench-id'];
		for (const p of allProjects) {
			const option = projectSelect.createEl('option', {
				value: p.frontmatter['dbench-id'],
				text: p.file.basename,
			});
			if (p.frontmatter['dbench-id'] === currentProjectId) {
				option.selected = true;
			}
		}
		projectSelect.addEventListener('change', () => {
			// Routing through plugin.selection notifies the Manuscript
			// leaf and any other subscribed surfaces, so the rest of
			// the workspace stays in sync with the modal's switch.
			this.plugin.selection.set(projectSelect.value);
			this.initState();
			this.renderAll();
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
				this.persistSelectedPresetId();
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

	private renderTabs(parent: HTMLElement): void {
		const tabs = parent.createDiv({
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
			this.refreshPreviewToolbar();
			this.renderActiveTab();
		});
	}

	private refreshTabActiveState(): void {
		const buttons = this.contentEl.querySelectorAll<HTMLElement>(
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

		// Empty state: no compile presets configured. Mirrors the
		// Build tab's parallel state so flipping into Preview from a
		// presets-less project doesn't drop the writer into an
		// unexplained blank pane.
		if (this.presets.length === 0) {
			this.renderPreviewEmpty(
				body,
				'This project has no compile presets.',
				'Use the button above to create your first compile configuration.'
			);
			return;
		}

		const preset = this.presets.find(
			(p) => p.frontmatter['dbench-id'] === this.selectedPresetId
		);
		if (!preset || !this.project) return;

		// 250ms-threshold "Rendering..." spinner. Per
		// docs/planning/manuscript-builder-preview.md § 3 (ratified
		// 2026-05-04): sub-threshold renders skip the spinner so
		// snappy operations don't flash. The timer fires only if the
		// render is still in flight at 250ms; cleared as soon as we
		// either error out or transition to writing the rendered DOM.
		const spinnerTimer = window.setTimeout(() => {
			if (token !== this.previewRenderToken) return;
			this.renderPreviewSpinner(body);
		}, 250);

		let markdown: string;
		let scenesCompiled: number;
		try {
			const result = await new CompileService(this.app).generate(preset);
			markdown = result.markdown;
			scenesCompiled = result.scenesCompiled;
		} catch (err) {
			window.clearTimeout(spinnerTimer);
			if (token !== this.previewRenderToken) return;
			console.error('[DraftBench] preview compile failed:', err);
			this.renderPreviewError(body, err);
			return;
		}

		window.clearTimeout(spinnerTimer);

		if (token !== this.previewRenderToken) return;

		// Empty-state branches per § 7. Discriminate "no scenes at
		// all" from "filters excluded everything" by checking the
		// project's total scene count: scenesCompiled === 0 alone
		// would conflate the two.
		if (scenesCompiled === 0) {
			const projectId = this.project.frontmatter['dbench-id'];
			const totalScenes = findScenesInProject(this.app, projectId);
			if (totalScenes.length === 0) {
				this.renderPreviewEmpty(
					body,
					'No scenes in this project yet.',
					'Create scenes from the Manuscript view.'
				);
			} else {
				this.renderPreviewEmpty(
					body,
					"No scenes match this preset's filters.",
					'Adjust scene-statuses or scene-excludes on the Build tab.'
				);
			}
			return;
		}

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
		} catch (err) {
			if (token !== this.previewRenderToken) return;
			console.error('[DraftBench] preview render failed:', err);
			this.renderPreviewError(body, err);
		}
	}

	private renderPreviewEmpty(
		body: HTMLElement,
		message: string,
		hint: string
	): void {
		body.empty();
		const wrap = body.createDiv({
			cls: 'dbench-manuscript-builder__preview-empty',
		});
		wrap.createEl('p', {
			cls: 'dbench-manuscript-builder__preview-empty-message',
			text: message,
		});
		wrap.createEl('p', {
			cls: 'dbench-manuscript-builder__preview-empty-hint',
			text: hint,
		});
	}

	private renderPreviewError(body: HTMLElement, err: unknown): void {
		const message = err instanceof Error ? err.message : String(err);
		this.renderPreviewEmpty(
			body,
			`Preview render failed: ${message}`,
			'The Build tab settings may be inconsistent; check the console for details.'
		);
	}

	private renderPreviewSpinner(body: HTMLElement): void {
		body.empty();
		const wrap = body.createDiv({
			cls: 'dbench-manuscript-builder__preview-spinner',
			attr: { role: 'status', 'aria-live': 'polite' },
		});
		const icon = wrap.createSpan({
			cls: 'dbench-manuscript-builder__preview-spinner-icon dbench-spinner',
			attr: { 'aria-hidden': 'true' },
		});
		setIcon(icon, 'loader-2');
		wrap.createSpan({
			cls: 'dbench-manuscript-builder__preview-spinner-text',
			text: 'Rendering...',
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
				// V1 doesn't persist section collapse state across mount
				// cycles. Adoptable later if writers ask for it.
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
			this.persistSelectedPresetId();
		}
		this.renderAll();
	}
}
