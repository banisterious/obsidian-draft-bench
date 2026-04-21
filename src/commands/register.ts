import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { registerCreateProjectCommand } from './create-project';
import { registerNewSceneCommand } from './new-scene';
import { registerNewDraftCommand } from './new-draft';
import { registerReorderScenesCommand } from './reorder-scenes';
import { registerRepairProjectCommand } from './repair-project';
import { registerSetAsProjectCommand } from './retrofit/set-as-project';
import { registerSetAsSceneCommand } from './retrofit/set-as-scene';
import { registerSetAsDraftCommand } from './retrofit/set-as-draft';
import { registerCompleteEssentialsCommand } from './retrofit/complete-essentials';
import { registerAddIdCommand } from './retrofit/add-id';

/**
 * Central command registration. Called from `main.ts` once during
 * `onload()`. Each command's registration helper handles its own
 * plugin.addCommand wiring; this is just the dispatch point.
 *
 * The `getSettings` thunk is forwarded so commands always read the
 * latest settings (if the user changes them, the next command
 * invocation sees the new values without needing re-registration).
 *
 * Commands that need the linker (to suspend during bulk operations)
 * receive it directly.
 */
export function registerCommands(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker
): void {
	registerCreateProjectCommand(plugin, getSettings);
	registerNewSceneCommand(plugin, getSettings, linker);
	registerNewDraftCommand(plugin, getSettings, linker);
	registerReorderScenesCommand(plugin, linker);
	registerRepairProjectCommand(plugin, linker);
	registerSetAsProjectCommand(plugin);
	registerSetAsSceneCommand(plugin);
	registerSetAsDraftCommand(plugin);
	registerCompleteEssentialsCommand(plugin);
	registerAddIdCommand(plugin);
}
