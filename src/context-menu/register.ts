import type { Plugin } from 'obsidian';
import { buildFileMenuItems } from './file-menu';
import { buildFilesMenuItems } from './files-menu';

/**
 * Register Draft Bench's context-menu integration on plugin load.
 *
 * Hooks Obsidian's `file-menu` (single file or folder) and
 * `files-menu` (multi-selection) events via `plugin.registerEvent`
 * so Obsidian tears down the listeners when the plugin unloads.
 */
export function registerContextMenu(plugin: Plugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, target) => {
			buildFileMenuItems(plugin.app, menu, target);
		})
	);

	plugin.registerEvent(
		plugin.app.workspace.on('files-menu', (menu, targets) => {
			buildFilesMenuItems(plugin.app, menu, targets);
		})
	);
}
