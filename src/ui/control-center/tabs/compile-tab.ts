import { Notice, setIcon } from 'obsidian';
import {
	findCompilePresetsOfProject,
	findProjects,
	type CompilePresetNote,
	type ProjectNote,
} from '../../../core/discovery';
import { NewCompilePresetModal } from '../../modals/new-compile-preset-modal';
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

	const newButton = buttonRow.createEl('button', {
		cls: 'dbench-compile-tab__button',
		text: 'New preset',
	});
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
		cls: 'dbench-compile-tab__button mod-cta',
		text: 'Run compile',
		attr: {
			disabled: 'true',
			title: 'Available once the run-compile command lands.',
		},
	});
	runButton.addEventListener('click', () => {
		new Notice('Run compile lands in a follow-up commit.');
	});
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

	state.bodyEl.createEl('p', {
		cls: 'dbench-compile-tab__placeholder',
		text: `Form sections (Metadata, Inclusion, Output, Content-handling, Last-compile) for "${preset.file.basename}" land in follow-up commits.`,
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
