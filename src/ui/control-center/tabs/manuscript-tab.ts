import { Notice, setIcon } from 'obsidian';
import { isSceneFrontmatter } from '../../../model/scene';
import type { SceneNote } from '../../../core/discovery';
import { NewSceneModal } from '../../modals/new-scene-modal';
import { NewDraftModal } from '../../modals/new-draft-modal';
import { ReorderScenesModal } from '../../modals/reorder-scenes-modal';
import type { TabContext, TabDefinition } from './types';

export { sortScenesByOrder } from './sort-scenes';

function render(container: HTMLElement, context: TabContext): void {
	renderToolbar(container, context);

	if (!context.selectedProject) {
		container.createEl('p', {
			cls: 'dbench-control-center__empty',
			text: 'Select a project from the dropdown above to view its manuscript.',
		});
		return;
	}

	const scenes = context.scenes ?? [];
	if (scenes.length === 0) {
		container.createEl('p', {
			cls: 'dbench-control-center__empty',
			text: 'No scenes yet. Add the first one from the toolbar above.',
		});
		return;
	}

	renderSceneList(container, scenes, context);
}

function renderToolbar(container: HTMLElement, context: TabContext): void {
	const toolbar = container.createDiv({
		cls: 'dbench-control-center__toolbar',
	});

	addToolbarButton(toolbar, 'New scene', 'file-plus', () => {
		new NewSceneModal(
			context.app,
			context.plugin.settings,
			context.linker
		).open();
		context.requestClose();
	});

	addToolbarButton(toolbar, 'New draft of current scene', 'file-stack', () => {
		const file = context.app.workspace.getActiveFile();
		if (!file) {
			new Notice('Open a scene first, then use this button.');
			return;
		}
		const fm = context.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!isSceneFrontmatter(fm)) {
			new Notice('The active note is not a scene.');
			return;
		}
		new NewDraftModal(
			context.app,
			context.plugin.settings,
			context.linker,
			{ file, frontmatter: fm }
		).open();
		context.requestClose();
	});

	addToolbarButton(toolbar, 'Reorder scenes', 'list-ordered', () => {
		new ReorderScenesModal(
			context.app,
			context.linker,
			context.selectedProject
		).open();
		context.requestClose();
	});

	addToolbarButton(toolbar, 'Compile', 'book-marked', () => {
		new Notice('Compile arrives in a later phase.');
	});
}

function addToolbarButton(
	toolbar: HTMLElement,
	label: string,
	icon: string,
	onClick: () => void
): void {
	const button = toolbar.createEl('button', {
		cls: 'dbench-control-center__toolbar-button',
	});
	const iconEl = button.createSpan({
		cls: 'dbench-control-center__toolbar-icon',
	});
	setIcon(iconEl, icon);
	button.createSpan({
		cls: 'dbench-control-center__toolbar-label',
		text: label,
	});
	button.addEventListener('click', onClick);
}

function renderSceneList(
	container: HTMLElement,
	scenes: SceneNote[],
	context: TabContext
): void {
	const list = container.createEl('ol', {
		cls: 'dbench-control-center__scene-list',
	});

	for (const scene of scenes) {
		const item = list.createEl('li', {
			cls: 'dbench-control-center__scene-row',
		});

		item.createSpan({
			cls: 'dbench-control-center__scene-order',
			text: String(scene.frontmatter['dbench-order']),
		});

		const titleEl = item.createEl('a', {
			cls: 'dbench-control-center__scene-title',
			text: scene.file.basename,
			href: '#',
		});
		titleEl.addEventListener('click', (evt) => {
			evt.preventDefault();
			void context.app.workspace.getLeaf(false).openFile(scene.file);
			context.requestClose();
		});

		item.createSpan({
			cls: 'dbench-control-center__scene-status',
			text: scene.frontmatter['dbench-status'],
		});

		const draftCount = scene.frontmatter['dbench-drafts']?.length ?? 0;
		item.createSpan({
			cls: 'dbench-control-center__scene-drafts',
			text: draftCount === 1 ? '1 draft' : `${draftCount} drafts`,
		});
	}
}

export const manuscriptTab: TabDefinition = {
	id: 'manuscript',
	name: 'Manuscript',
	icon: 'align-left',
	render,
};
