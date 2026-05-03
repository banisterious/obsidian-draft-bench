import { Notice, setIcon } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import { buildSceneReorderConfig } from '../../../commands/reorder-scenes';
import { pickPresetAndCompile } from '../../../core/compile/operations';
import type { ProjectNote } from '../../../core/discovery';
import { isSceneFrontmatter } from '../../../model/scene';
import { NewDraftModal } from '../../modals/new-draft-modal';
import { NewSceneModal } from '../../modals/new-scene-modal';
import { ReorderChildrenModal } from '../../modals/reorder-children-modal';

/**
 * Manuscript-leaf primary CTA — "Compile" promoted out of the
 * 3-button toolbar row into a distinct block above it. The writer's
 * final action on a project gets visual weight matching its
 * importance; per the Ulysses-warm direction (D-design-refinement),
 * the CTA carries `.mod-cta` so Obsidian's native accent treatment
 * does the work.
 *
 * Wired to the shared `pickPresetAndCompile` helper so this path
 * behaves identically to the palette / context-menu entries.
 */
export function renderCompileCta(
	container: HTMLElement,
	plugin: DraftBenchPlugin,
	selectedProject: ProjectNote
): void {
	const ctaRow = container.createDiv({
		cls: 'dbench-manuscript-view__compile-cta-row',
	});
	const button = ctaRow.createEl('button', {
		cls: 'mod-cta dbench-manuscript-view__compile-cta',
		attr: { 'aria-label': 'Compile', title: 'Compile' },
	});
	const iconEl = button.createSpan({
		cls: 'dbench-manuscript-view__compile-cta-icon',
		attr: { 'aria-hidden': 'true' },
	});
	setIcon(iconEl, 'book-marked');
	button.createSpan({
		cls: 'dbench-manuscript-view__compile-cta-label',
		text: 'Compile',
	});
	button.addEventListener('click', () => {
		void pickPresetAndCompile(plugin, selectedProject);
	});
}

/**
 * Manuscript-leaf toolbar — three secondary project actions (New
 * scene / New draft of current scene / Reorder scenes). Compile used
 * to live here as a fourth button; see `renderCompileCta` above.
 */
export function renderToolbar(
	container: HTMLElement,
	plugin: DraftBenchPlugin,
	selectedProject: ProjectNote
): void {
	const toolbar = container.createDiv({
		cls: 'dbench-manuscript-view__toolbar',
	});

	addToolbarButton(toolbar, 'New scene', 'file-plus', () => {
		new NewSceneModal(plugin.app, plugin.settings, plugin.linker).open();
	});

	addToolbarButton(toolbar, 'New draft of current scene', 'file-stack', () => {
		const file = plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice('Open a scene first, then use this button.');
			return;
		}
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!isSceneFrontmatter(fm)) {
			new Notice('The active note is not a scene.');
			return;
		}
		new NewDraftModal(plugin.app, plugin.settings, plugin.linker, {
			file,
			frontmatter: fm,
		}).open();
	});

	addToolbarButton(toolbar, 'Reorder scenes', 'list-ordered', () => {
		const config = buildSceneReorderConfig(plugin.app, selectedProject);
		new ReorderChildrenModal(plugin.app, plugin.linker, config).open();
	});
}

function addToolbarButton(
	toolbar: HTMLElement,
	label: string,
	icon: string,
	onClick: () => void
): void {
	const button = toolbar.createEl('button', {
		cls: 'dbench-manuscript-view__toolbar-button',
		attr: { 'aria-label': label, title: label },
	});
	const iconEl = button.createSpan({
		cls: 'dbench-manuscript-view__toolbar-icon',
		attr: { 'aria-hidden': 'true' },
	});
	setIcon(iconEl, icon);
	button.createSpan({
		cls: 'dbench-manuscript-view__toolbar-label',
		text: label,
	});
	button.addEventListener('click', onClick);
}
