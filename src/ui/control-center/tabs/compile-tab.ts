import { setIcon } from 'obsidian';
import { compileAndNotify } from '../../../core/compile/operations';
import {
	findCompilePresetsOfProject,
	findProjects,
	type CompilePresetNote,
	type ProjectNote,
} from '../../../core/discovery';
import { renderSection } from '../../manuscript-view/sections/section-base';
import { NewCompilePresetModal } from '../../modals/new-compile-preset-modal';
import { renderContentHandlingSection } from '../compile/sections/content-handling';
import { renderInclusionSection } from '../compile/sections/inclusion';
import { renderLastCompileSection } from '../compile/sections/last-compile';
import { renderMetadataSection } from '../compile/sections/metadata';
import { renderOutputSection } from '../compile/sections/output';
import type { TabContext, TabDefinition } from './types';

/**
 * Compile tab.
 *
 * Per [D-06 § UI surfaces](../../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * the Compile tab is a form view of the active project's compile
 * presets. Header carries: project read-out (from `plugin.selection`),
 * preset picker dropdown, "+ New preset" button, "Run compile"
 * button. Body is a stack of collapsible sections (Metadata,
 * Inclusion, Output, Content-handling, Last-compile) — those land in
 * follow-up commits.
 *
 * The tab reads the project from the plugin-level selection rather
 * than carrying its own project picker (selection state moved to the
 * plugin in D-07). If no project is selected, the tab shows an
 * empty-state prompt directing the writer to the Manuscript view to
 * pick one.
 *
 * Internal re-render: the tab owns the picker + body region. State
 * changes (preset switched, new preset created) re-render only the
 * body. Plugin-selection changes mid-modal don't re-render — the
 * Control Center is action-shaped per D-07 (open, do, close), so
 * mid-session selection changes are an edge case writers can resolve
 * by closing and reopening.
 */

interface CompileTabState {
	context: TabContext;
	container: HTMLElement;
	project: ProjectNote | null;
	presets: CompilePresetNote[];
	selectedPresetId: string | null;
	bodyEl: HTMLElement | null;
}

function render(container: HTMLElement, context: TabContext): void {
	const state = initState(container, context);
	renderAll(state);
}

function initState(
	container: HTMLElement,
	context: TabContext
): CompileTabState {
	const projectId = context.plugin.selection.get();
	const project =
		projectId === null
			? null
			: (findProjects(context.app).find(
					(p) => p.frontmatter['dbench-id'] === projectId
				) ?? null);
	const presets = project
		? findCompilePresetsOfProject(
				context.app,
				project.frontmatter['dbench-id']
			)
		: [];
	return {
		context,
		container,
		project,
		presets,
		selectedPresetId:
			presets.length > 0 ? presets[0].frontmatter['dbench-id'] : null,
		bodyEl: null,
	};
}

function renderAll(state: CompileTabState): void {
	state.container.empty();
	state.container.addClass('dbench-compile-tab');

	if (state.project === null) {
		renderEmptyNoProject(state);
		return;
	}

	renderHeader(state);
	state.bodyEl = state.container.createDiv({
		cls: 'dbench-compile-tab__body',
	});
	renderBody(state);
}

function renderEmptyNoProject(state: CompileTabState): void {
	const empty = state.container.createDiv({
		cls: 'dbench-compile-tab__empty',
	});
	empty.createEl('p', {
		cls: 'dbench-compile-tab__empty-message',
		text: 'No project selected.',
	});
	empty.createEl('p', {
		cls: 'dbench-compile-tab__empty-hint',
		text: 'Open the manuscript view and pick a project to manage its compile presets here.',
	});
}

function renderHeader(state: CompileTabState): void {
	if (!state.project) return;

	const header = state.container.createDiv({
		cls: 'dbench-compile-tab__header',
	});

	const projectRow = header.createDiv({
		cls: 'dbench-compile-tab__project-row',
	});
	const projectIcon = projectRow.createSpan({
		cls: 'dbench-compile-tab__project-icon',
		attr: { 'aria-hidden': 'true' },
	});
	setIcon(projectIcon, 'book');
	projectRow.createSpan({
		cls: 'dbench-compile-tab__project-name',
		text: state.project.file.basename,
	});

	const presetRow = header.createDiv({
		cls: 'dbench-compile-tab__preset-row',
	});

	if (state.presets.length === 0) {
		presetRow.createSpan({
			cls: 'dbench-compile-tab__preset-empty',
			text: 'No compile presets yet.',
		});
	} else {
		const select = presetRow.createEl('select', {
			cls: 'dropdown dbench-compile-tab__preset-picker',
			attr: { 'aria-label': 'Compile preset' },
		});
		for (const preset of state.presets) {
			const option = select.createEl('option', {
				value: preset.frontmatter['dbench-id'],
				text: preset.file.basename,
			});
			if (preset.frontmatter['dbench-id'] === state.selectedPresetId) {
				option.selected = true;
			}
		}
		select.addEventListener('change', () => {
			state.selectedPresetId = select.value;
			renderBody(state);
		});
	}

	const buttonRow = presetRow.createDiv({
		cls: 'dbench-compile-tab__buttons',
	});

	// Plain <button> + Obsidian's .mod-cta for the primary action.
	// Per ui-reference.md § 0, no custom button class needed; native
	// padding / focus styling carries the visual.
	const newButton = buttonRow.createEl('button', { text: 'New preset' });
	newButton.addEventListener('click', () => {
		if (!state.project) return;
		new NewCompilePresetModal(
			state.context.app,
			state.context.linker,
			state.project
		).open();
		// Refresh after a short delay so the new preset shows up in the
		// picker. The modal's internal flow is async; a 200ms wait covers
		// the linker-suspend + processFrontMatter round-trip without
		// stitching a callback through.
		window.setTimeout(() => {
			refreshPresets(state);
		}, 200);
	});

	const runButton = buttonRow.createEl('button', {
		cls: 'mod-cta',
		text: 'Run compile',
	});
	runButton.disabled = state.presets.length === 0;
	runButton.addEventListener('click', () => {
		void handleRunClick(state, runButton);
	});
}

async function handleRunClick(
	state: CompileTabState,
	runButton: HTMLButtonElement
): Promise<void> {
	const preset = state.presets.find(
		(p) => p.frontmatter['dbench-id'] === state.selectedPresetId
	);
	if (!preset) return;

	runButton.disabled = true;
	const originalText = runButton.textContent ?? 'Run compile';
	runButton.textContent = 'Compiling...';
	try {
		await compileAndNotify(state.context.app, preset);
		// Re-read the preset's frontmatter so the Last-compile section
		// reflects the fresh compile state, then re-render the body
		// (header stays put).
		refreshPresetFrontmatter(state, preset.frontmatter['dbench-id']);
		renderBody(state);
	} finally {
		runButton.disabled = state.presets.length === 0;
		runButton.textContent = originalText;
	}
}

/**
 * Re-read a single preset's frontmatter from the metadata cache so
 * the in-memory `state.presets` entry reflects freshly-written
 * compile state (`dbench-last-*` fields). Cheaper than a full
 * `refreshPresets` scan when only one preset changed.
 */
function refreshPresetFrontmatter(state: CompileTabState, presetId: string): void {
	const preset = state.presets.find(
		(p) => p.frontmatter['dbench-id'] === presetId
	);
	if (!preset) return;
	const fm = state.context.app.metadataCache.getFileCache(preset.file)
		?.frontmatter;
	if (!fm) return;
	preset.frontmatter = fm as unknown as CompilePresetNote['frontmatter'];
}

function renderBody(state: CompileTabState): void {
	if (!state.bodyEl) return;
	state.bodyEl.empty();

	if (state.presets.length === 0) {
		const empty = state.bodyEl.createDiv({
			cls: 'dbench-compile-tab__empty',
		});
		empty.createEl('p', {
			cls: 'dbench-compile-tab__empty-message',
			text: 'This project has no compile presets.',
		});
		empty.createEl('p', {
			cls: 'dbench-compile-tab__empty-hint',
			text: 'Use the button above to create your first compile configuration.',
		});
		return;
	}

	const preset = state.presets.find(
		(p) => p.frontmatter['dbench-id'] === state.selectedPresetId
	);
	if (!preset) return;

	renderFormSection(state.bodyEl, 'metadata', 'Metadata', 'book-text', (body) => {
		renderMetadataSection(body, state.context.app, preset);
	});

	renderFormSection(state.bodyEl, 'inclusion', 'Inclusion', 'list-filter', (body) => {
		renderInclusionSection(
			body,
			state.context.app,
			preset,
			state.context.plugin.settings
		);
	});

	renderFormSection(state.bodyEl, 'output', 'Output', 'file-output', (body) => {
		renderOutputSection(body, state.context.app, preset);
	});

	renderFormSection(
		state.bodyEl,
		'content-handling',
		'Content handling',
		'wand',
		(body) => {
			renderContentHandlingSection(body, state.context.app, preset);
		}
	);

	renderFormSection(state.bodyEl, 'last-compile', 'Last compile', 'history', (body) => {
		renderLastCompileSection(body, state.context.app, preset);
	});
}

/**
 * Wrap a section's body in the shared collapsible accordion. Reuses
 * the manuscript-view `section-base` primitive (and its CSS class
 * names). Class-name extraction to a shared `dbench-section-*`
 * namespace is a future cleanup; the visual styling carries over
 * cleanly since the section primitive is generic.
 */
function renderFormSection(
	parent: HTMLElement,
	id: string,
	title: string,
	icon: string,
	contentRenderer: (body: HTMLElement) => void
): void {
	renderSection(parent, {
		sectionId: `compile-${id}`,
		title,
		icon,
		expanded: true,
		onToggle: () => {
			// V1 doesn't persist Compile tab section state across modal
			// opens. The Manuscript leaf does (via getState()); the modal
			// can adopt the same pattern when collapse-state retention
			// becomes a writer ask.
		},
		contentRenderer,
	});
}

function refreshPresets(state: CompileTabState): void {
	if (!state.project) return;
	const before = state.presets.map((p) => p.frontmatter['dbench-id']);
	state.presets = findCompilePresetsOfProject(
		state.context.app,
		state.project.frontmatter['dbench-id']
	);
	const after = state.presets.map((p) => p.frontmatter['dbench-id']);
	if (
		before.length === after.length &&
		before.every((id, i) => id === after[i])
	) {
		return; // no change; avoid unnecessary re-render
	}
	// Auto-select the new preset (the one that wasn't in `before`).
	const created = state.presets.find(
		(p) => !before.includes(p.frontmatter['dbench-id'])
	);
	if (created) state.selectedPresetId = created.frontmatter['dbench-id'];
	renderAll(state);
}

export const compileTab: TabDefinition = {
	id: 'compile',
	name: 'Compile',
	icon: 'book-marked',
	render,
};
