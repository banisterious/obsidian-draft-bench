import type { Plugin } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftBenchSettings } from '../model/settings';
import { revealLeafIfFirstProject } from '../ui/manuscript-view/first-reveal';
import { NewProjectModal } from '../ui/modals/new-project-modal';

/**
 * Register the "Draft Bench: Create project" command.
 *
 * Obsidian auto-prefixes the command name with the plugin's manifest
 * `name`, so we just register `'Create project'` here.
 *
 * The `getSettings` thunk is used (rather than a captured snapshot)
 * so the modal sees the latest settings if the user changes them.
 * The `onCreated` hook auto-reveals the Manuscript leaf on the
 * first-ever project creation (see D-07 Block A).
 */
export function registerCreateProjectCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	getPlugin: () => DraftBenchPlugin
): void {
	plugin.addCommand({
		id: 'create-project',
		name: 'Create project',
		callback: () => {
			new NewProjectModal(
				plugin.app,
				getSettings(),
				(projectId) => revealLeafIfFirstProject(getPlugin(), projectId)
			).open();
		},
	});
}
