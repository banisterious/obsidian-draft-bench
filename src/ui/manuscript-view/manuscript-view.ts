import {
	ItemView,
	TFile,
	WorkspaceLeaf,
	setIcon,
	type TAbstractFile,
	type ViewStateResult,
} from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import {
	findProjects,
	findScenesInProject,
	type ProjectNote,
	type SceneNote,
} from '../../core/discovery';
import { sortScenesByOrder } from '../../core/sort-scenes';
import { renderSection } from './sections/section-base';
import { renderProjectSummaryBody } from './sections/project-summary-section';
import { renderManuscriptListBody } from './sections/manuscript-list-section';
import { renderToolbar } from './sections/toolbar';

/**
 * The Manuscript workspace-leaf view.
 *
 * Per [D-07](../../../docs/planning/decisions/D-07-control-center-split.md)
 * this is the ambient companion to the modal Control Center. It hosts
 * the Project summary, Manuscript list, and toolbar actions; the
 * modal handles short-lived actions (Templates, Compile).
 *
 * Rendering is split across section modules (sections/*.ts); this
 * class owns the view-level lifecycle, state persistence, project
 * picker, selection reconciliation with plugin state, and the
 * `vault.on('modify')` debounce that keeps the scene list fresh while
 * a writer is drafting.
 */

export const VIEW_TYPE_MANUSCRIPT = 'draft-bench-manuscript';

const SECTION_PROJECT_SUMMARY = 'project-summary';
const SECTION_MANUSCRIPT_LIST = 'manuscript-list';
const MODIFY_DEBOUNCE_MS = 300;

/**
 * JSON-safe serialized view state. Versioned from the start so later
 * shape changes can migrate cleanly.
 */
interface ManuscriptViewState {
	schemaVersion: 1;
	selectedProjectId: string | null;
	sectionStates: Record<string, boolean>;
}

const EMPTY_STATE: ManuscriptViewState = {
	schemaVersion: 1,
	selectedProjectId: null,
	sectionStates: {},
};

export class ManuscriptView extends ItemView {
	private readonly plugin: DraftBenchPlugin;
	private viewState: ManuscriptViewState = { ...EMPTY_STATE };
	private unsubscribeSelection: (() => void) | null = null;
	private modifyDebounce: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: DraftBenchPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_MANUSCRIPT;
	}

	getDisplayText(): string {
		const project = this.resolveSelectedProject();
		return project ? `Manuscript: ${project.file.basename}` : 'Manuscript';
	}

	getIcon(): string {
		return 'pencil-ruler';
	}

	onOpen(): Promise<void> {
		// Reconcile plugin state with leaf state on open. Order:
		// 1. If plugin has a selection, trust it (another surface wrote it).
		// 2. Else if leaf state has one and the project still exists,
		//    push it up to plugin state.
		// 3. Else leave empty.
		const pluginSelection = this.plugin.selection.get();
		if (pluginSelection !== null) {
			this.viewState.selectedProjectId = pluginSelection;
		} else if (
			this.viewState.selectedProjectId !== null &&
			this.projectExists(this.viewState.selectedProjectId)
		) {
			this.plugin.selection.set(this.viewState.selectedProjectId);
		}

		// Subscribe to selection changes from other surfaces.
		this.unsubscribeSelection = this.plugin.selection.onChange((id) => {
			if (id === this.viewState.selectedProjectId) return;
			this.viewState.selectedProjectId = id;
			this.render();
		});

		// Freshness: two listeners feed a shared debounced refresh.
		//
		// - vault.on('modify') catches body edits (word-count recompute
		//   on prose additions) and has a project-scoped gate so
		//   unrelated vault noise doesn't trigger work.
		// - metadataCache.on('changed') catches frontmatter-side updates
		//   *after* Obsidian has indexed them. This handles the new-
		//   project race (project just got stamped but findProjects
		//   can't see it yet), property-panel edits on scenes (status
		//   / target changes), and delete + re-stamp flows. No gate:
		//   the debounced re-render is cheap, and catching every
		//   metadata update keeps the leaf trustworthy as an
		//   ambient surface.
		this.registerEvent(
			this.plugin.app.vault.on('modify', (file) => this.onFileModify(file))
		);
		this.registerEvent(
			this.plugin.app.metadataCache.on('changed', () =>
				this.scheduleRefresh()
			)
		);

		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribeSelection?.();
		this.unsubscribeSelection = null;
		if (this.modifyDebounce !== null) {
			window.clearTimeout(this.modifyDebounce);
			this.modifyDebounce = null;
		}
		return Promise.resolve();
	}

	getState(): Record<string, unknown> {
		return { ...this.viewState };
	}

	setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (state && typeof state === 'object') {
			const s = state as Partial<ManuscriptViewState>;
			if (typeof s.selectedProjectId === 'string' || s.selectedProjectId === null) {
				this.viewState.selectedProjectId = s.selectedProjectId;
			}
			if (s.sectionStates && typeof s.sectionStates === 'object') {
				this.viewState.sectionStates = { ...s.sectionStates };
			}
		}
		return super.setState(state, result);
	}

	/**
	 * Programmatically select a project. Used by entry points
	 * (context menu, auto-reveal) that open the leaf already knowing
	 * which project should be active. Writes into plugin-level
	 * selection state; listeners (including this view) react and
	 * render.
	 */
	selectProject(projectId: string | null): void {
		this.plugin.selection.set(projectId);
	}

	private onFileModify(file: TAbstractFile): void {
		if (!this.isMarkdownFile(file)) return;
		const project = this.resolveSelectedProject();
		if (!project) return;

		// Gate: the modified file is the project note itself, or one of
		// its scenes. Non-project vault noise is ignored.
		const scenes = findScenesInProject(
			this.plugin.app,
			project.frontmatter['dbench-id']
		);
		const isProjectNote = file.path === project.file.path;
		const isProjectScene = scenes.some((s) => s.file.path === file.path);
		if (!isProjectNote && !isProjectScene) return;

		// Invalidate word-count cache for the touched file regardless;
		// the re-render reads the fresh count.
		this.plugin.wordCounts.invalidate(file.path);
		this.scheduleRefresh();
	}

	private scheduleRefresh(): void {
		if (this.modifyDebounce !== null) {
			window.clearTimeout(this.modifyDebounce);
		}
		this.modifyDebounce = window.setTimeout(() => {
			this.modifyDebounce = null;
			this.render();
		}, MODIFY_DEBOUNCE_MS);
	}

	private isMarkdownFile(file: TAbstractFile): file is TFile {
		return file instanceof TFile && file.extension === 'md';
	}

	private render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		const previousScroll = container.scrollTop;

		container.empty();
		container.addClass('dbench-manuscript-view');

		const projects = findProjects(this.plugin.app);
		if (projects.length === 0) {
			this.renderEmptyWelcome(container);
			return;
		}

		// Picker header always present when projects exist.
		this.renderPicker(container, projects);

		const project = this.resolveSelectedProject();
		if (!project) {
			this.renderEmptyPrompt(container);
			return;
		}

		const content = container.createDiv({
			cls: 'dbench-manuscript-view__content',
		});

		renderToolbar(content, this.plugin, project);

		const scenes = sortScenesByOrder(
			findScenesInProject(
				this.plugin.app,
				project.frontmatter['dbench-id']
			)
		);

		this.renderProjectSummarySection(content, project);
		this.renderManuscriptListSection(content, scenes);

		// Preserve scroll position after full re-render.
		window.requestAnimationFrame(() => {
			container.scrollTop = previousScroll;
		});
	}

	private renderEmptyWelcome(container: HTMLElement): void {
		const wrapper = container.createDiv({
			cls: 'dbench-manuscript-view__empty',
		});
		wrapper.createEl('h2', {
			cls: 'dbench-manuscript-view__empty-heading',
			text: 'Welcome to Draft Bench',
		});
		wrapper.createEl('p', {
			cls: 'dbench-manuscript-view__empty-body',
			text: 'Create your first project to see its manuscript here. Once a project exists, this view tracks its scenes, word counts, and progress.',
		});
		const cta = wrapper.createEl('button', {
			cls: 'dbench-manuscript-view__empty-cta mod-cta',
			text: 'Create your first project',
		});
		cta.addEventListener('click', () => {
			this.openCreateProjectCommand();
		});
		wrapper.createEl('p', {
			cls: 'dbench-manuscript-view__empty-footnote',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- quoted palette command name preserves its branded casing
			text: 'Templates and compile actions live in the control center (Draft Bench: Open control center).',
		});
	}

	private renderEmptyPrompt(container: HTMLElement): void {
		container.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: 'Select a project above to view its manuscript.',
		});
	}

	private renderPicker(
		container: HTMLElement,
		projects: ProjectNote[]
	): void {
		const header = container.createDiv({
			cls: 'dbench-manuscript-view__header',
		});
		const picker = header.createEl('select', {
			cls: 'dropdown dbench-manuscript-view__picker',
			attr: { 'aria-label': 'Select a project' },
		});
		const placeholder = picker.createEl('option', {
			text: 'Select a project…',
			attr: { value: '' },
		});
		placeholder.disabled = true;
		const selectedId = this.viewState.selectedProjectId;
		if (selectedId === null) {
			placeholder.selected = true;
		}
		for (const p of projects) {
			const id = p.frontmatter['dbench-id'];
			const option = picker.createEl('option', {
				text: p.file.basename,
				attr: { value: id },
			});
			if (id === selectedId) option.selected = true;
		}
		picker.addEventListener('change', () => {
			const value = picker.value;
			this.selectProject(value === '' ? null : value);
		});

		const newProjectButton = header.createEl('button', {
			cls: 'dbench-manuscript-view__new-project',
			attr: {
				'aria-label': 'Create project',
				title: 'Create project',
			},
		});
		setIcon(newProjectButton, 'plus');
		newProjectButton.addEventListener('click', () => {
			this.openCreateProjectCommand();
		});
	}

	private renderProjectSummarySection(
		container: HTMLElement,
		project: ProjectNote
	): void {
		const expanded = this.readSectionState(SECTION_PROJECT_SUMMARY, true);
		const body = renderSection(container, {
			sectionId: SECTION_PROJECT_SUMMARY,
			title: 'Project summary',
			icon: 'book-open',
			expanded,
			onToggle: (id, isExpanded) => {
				this.viewState.sectionStates[id] = isExpanded;
			},
		});
		if (!body) return;
		renderProjectSummaryBody(
			body,
			project,
			this.plugin.settings.statusVocabulary,
			this.plugin.wordCounts.countForProject(project)
		);
	}

	private renderManuscriptListSection(
		container: HTMLElement,
		scenes: SceneNote[],
	): void {
		const expanded = this.readSectionState(SECTION_MANUSCRIPT_LIST, true);
		const summary =
			scenes.length === 0
				? undefined
				: `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}`;
		const body = renderSection(container, {
			sectionId: SECTION_MANUSCRIPT_LIST,
			title: 'Manuscript',
			icon: 'align-left',
			summary,
			expanded,
			onToggle: (id, isExpanded) => {
				this.viewState.sectionStates[id] = isExpanded;
			},
		});
		if (!body) return;
		renderManuscriptListBody(
			body,
			scenes,
			this.plugin.app,
			this.plugin.wordCounts,
			(scene) => {
				void this.plugin.app.workspace.getLeaf(false).openFile(scene.file);
			}
		);
	}

	private readSectionState(sectionId: string, defaultValue: boolean): boolean {
		const v = this.viewState.sectionStates[sectionId];
		if (typeof v === 'boolean') return v;
		return defaultValue;
	}

	private resolveSelectedProject(): ProjectNote | null {
		const id = this.viewState.selectedProjectId;
		if (id === null) return null;
		const match = findProjects(this.plugin.app).find(
			(p) => p.frontmatter['dbench-id'] === id
		);
		if (!match) {
			// Stale selection (project deleted/moved). Clear and fall through.
			this.viewState.selectedProjectId = null;
			if (this.plugin.selection.get() === id) {
				this.plugin.selection.set(null);
			}
			return null;
		}
		return match;
	}

	private projectExists(id: string): boolean {
		return findProjects(this.plugin.app).some(
			(p) => p.frontmatter['dbench-id'] === id
		);
	}

	private openCreateProjectCommand(): void {
		// Use the command palette entry rather than constructing the
		// modal directly — keeps the UX consistent with the palette
		// path and avoids duplicating wiring here.
		const commands = (
			this.plugin.app as unknown as {
				commands?: {
					executeCommandById: (id: string) => boolean;
				};
			}
		).commands;
		commands?.executeCommandById('draft-bench:create-project');
	}
}

