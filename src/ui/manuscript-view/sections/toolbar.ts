import { Notice, setIcon } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import type { ProjectNote } from '../../../core/discovery';
import { isSceneFrontmatter } from '../../../model/scene';
import { NewDraftModal } from '../../modals/new-draft-modal';
import { NewSceneModal } from '../../modals/new-scene-modal';
import { ReorderScenesModal } from '../../modals/reorder-scenes-modal';

/**
 * Manuscript-leaf toolbar — four primary project actions surfaced as
 * icon buttons at the top of the leaf content. Adapted from the
 * Control Center's former Manuscript-tab toolbar; the lifetime is
 * different (leaf stays open on action-modal invocation instead of
 * closing like the modal) but the actions themselves are identical.
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
		new ReorderScenesModal(plugin.app, plugin.linker, selectedProject).open();
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
