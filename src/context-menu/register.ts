import type DraftBenchPlugin from '../../main';
import type { DraftBenchLinker } from '../core/linker';
import { buildFileMenuItems } from './file-menu';
import { buildFilesMenuItems } from './files-menu';

/**
 * Register Draft Bench's context-menu integration on plugin load.
 *
 * Hooks Obsidian's `file-menu` (single file or folder) and
 * `files-menu` (multi-selection) events via `plugin.registerEvent`
 * so Obsidian tears down the listeners when the plugin unloads.
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
}
