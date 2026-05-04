import { Notice, setIcon } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import { buildSceneReorderConfig } from '../../../commands/reorder-scenes';
import type { ProjectNote } from '../../../core/discovery';
import { isSceneFrontmatter } from '../../../model/scene';
import { ManuscriptBuilderModal } from '../../manuscript-builder/manuscript-builder-modal';
import { NewDraftModal } from '../../modals/new-draft-modal';
import { NewSceneModal } from '../../modals/new-scene-modal';
import { ReorderChildrenModal } from '../../modals/reorder-children-modal';

/**
 * Manuscript-leaf primary CTA — "Compile..." opens the Manuscript
 * Builder modal where the writer picks a preset, optionally previews
 * the output (0.3.0+), and runs compile from the modal's header. The
 * trailing ellipsis follows the standard convention signaling
 * "opens further UI before action."
 *
 * Replaces the earlier instant-compile behavior (which short-circuited
 * to the only preset on single-preset projects, or showed a fuzzy
 * preset picker on multi-preset projects, then ran compile directly
 * without the Builder's configuration / preview surface). Writers
 * who want a true one-click compile path can bind a hotkey to a
 * future "Compile with last preset" command (out of scope here).
 */
export function renderCompileCta(
	container: HTMLElement,
	plugin: DraftBenchPlugin
): void {
	const ctaRow = container.createDiv({
		cls: 'dbench-manuscript-view__compile-cta-row',
	});
	const button = ctaRow.createEl('button', {
		cls: 'mod-cta dbench-manuscript-view__compile-cta',
		attr: { 'aria-label': 'Compile...', title: 'Compile...' },
	});
	const iconEl = button.createSpan({
		cls: 'dbench-manuscript-view__compile-cta-icon',
		attr: { 'aria-hidden': 'true' },
	});
	setIcon(iconEl, 'book-marked');
	button.createSpan({
		cls: 'dbench-manuscript-view__compile-cta-label',
		text: 'Compile...',
	});
	button.addEventListener('click', () => {
		new ManuscriptBuilderModal(
			plugin.app,
			plugin,
			plugin.linker
		).open();
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
