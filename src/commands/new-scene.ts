import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { NewSceneModal } from '../ui/modals/new-scene-modal';
import { COMMAND_IDS } from './ids';

/**
 * Register the "Draft Bench: New scene in project" command.
 *
 * The modal needs both settings (for scenesFolder defaults) and the
 * linker (to suspend during the two-file write).
 */
export function registerNewSceneCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: COMMAND_IDS.NEW_SCENE_IN_PROJECT,
		name: 'New scene in project',
		callback: () => {
			new NewSceneModal(plugin.app, getSettings(), linker).open();
		},
	});
}
