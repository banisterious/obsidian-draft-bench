import {
	ItemView,
	WorkspaceLeaf,
	type ViewStateResult,
} from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import { findProjects, type ProjectNote } from '../../core/discovery';

/**
 * The Manuscript workspace-leaf view.
 *
 * Per [D-07](../../../docs/planning/decisions/D-07-control-center-split.md)
 * this is the ambient companion to the modal Control Center. It hosts
 * the Project summary, Manuscript list, and toolbar actions; the
 * modal handles short-lived actions (Templates, Compile).
 *
 * Content is rendered in commit 2 of the split work; this commit
 * ships the view shell, empty-state handling, and plugin-state
 * integration so the leaf can be registered and opened without
 * depending on lifted-from-modal content yet.
 */

export const VIEW_TYPE_MANUSCRIPT = 'draft-bench-manuscript';

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

		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribeSelection?.();
		this.unsubscribeSelection = null;
		return Promise.resolve();
	}

	getState(): Record<string, unknown> {
		return { ...this.viewState };
	}

	setState(
		state: unknown,
		result: ViewStateResult
	): Promise<void> {
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

	private render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('dbench-manuscript-view');

		const project = this.resolveSelectedProject();
		if (!project) {
			this.renderEmptyState(container);
			return;
		}

		this.renderProject(container, project);
	}

	private renderEmptyState(container: HTMLElement): void {
		const wrapper = container.createDiv({
			cls: 'dbench-manuscript-view__empty',
		});

		const projects = findProjects(this.plugin.app);
		if (projects.length === 0) {
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
			return;
		}

		wrapper.createEl('p', {
			cls: 'dbench-manuscript-view__empty-body',
			text: 'Select a project to view its manuscript.',
		});

		const picker = wrapper.createEl('select', {
			cls: 'dropdown dbench-manuscript-view__empty-picker',
			attr: { 'aria-label': 'Select a project' },
		});
		const placeholder = picker.createEl('option', {
			text: 'Select a project…',
			attr: { value: '' },
		});
		placeholder.disabled = true;
		placeholder.selected = true;
		for (const p of projects) {
			picker.createEl('option', {
				text: p.file.basename,
				attr: { value: p.frontmatter['dbench-id'] },
			});
		}
		picker.addEventListener('change', () => {
			const value = picker.value;
			if (value !== '') this.selectProject(value);
		});
	}

	private renderProject(container: HTMLElement, project: ProjectNote): void {
		// Placeholder until commit 2 lifts the Project-summary and
		// Manuscript-list sections from the Control Center tabs.
		const wrapper = container.createDiv({
			cls: 'dbench-manuscript-view__content',
		});
		wrapper.createEl('h2', {
			cls: 'dbench-manuscript-view__project-title',
			text: project.file.basename,
		});
		wrapper.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: 'Project summary and manuscript list render here once section modules land.',
		});
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
