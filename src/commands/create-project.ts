import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import { NewProjectModal } from '../ui/modals/new-project-modal';

/**
 * Register the "Draft Bench: Create project" command.
 *
 * Obsidian auto-prefixes the command name with the plugin's manifest
 * `name`, so we just register `'Create project'` here.
 *
 * The `getSettings` thunk is used (rather than a captured snapshot)
 * so the modal sees the latest settings if the user changes them.
 */
export function registerCreateProjectCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings
): void {
	plugin.addCommand({
		id: 'create-project',
		name: 'Create project',
		callback: () => {
			new NewProjectModal(plugin.app, getSettings()).open();
		},
	});
}
