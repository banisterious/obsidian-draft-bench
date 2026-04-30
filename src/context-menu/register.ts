import type DraftBenchPlugin from '../../main';
import type { DraftBenchLinker } from '../core/linker';
import { buildEditorMenuItems } from './editor-menu';
import { buildFileMenuItems } from './file-menu';
import { buildFilesMenuItems } from './files-menu';

/**
 * Register Draft Bench's context-menu integration on plugin load.
 *
 * Hooks three Obsidian workspace events via `plugin.registerEvent` so
 * Obsidian tears down the listeners when the plugin unloads:
 *
 * - `file-menu`: right-click on a file or folder in the file explorer.
 * - `files-menu`: right-click on a multi-file selection.
 * - `editor-menu`: right-click inside an open editor.
 *
 * The `linker` is threaded through because project-context entries
 * (like "Repair project links") run inside `linker.withSuspended(...)`.
 */
export function registerContextMenu(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker
): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, target) => {
			buildFileMenuItems(plugin, linker, menu, target);
		})
	);

	plugin.registerEvent(
		plugin.app.workspace.on('files-menu', (menu, targets) => {
			buildFilesMenuItems(plugin, menu, targets);
		})
	);

	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor, info) => {
			buildEditorMenuItems(plugin, linker, menu, editor, info);
		})
	);
}
