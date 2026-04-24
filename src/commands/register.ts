import type DraftBenchPlugin from '../../main';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { registerCreateCompilePresetCommand } from './create-compile-preset';
import { registerCreateProjectCommand } from './create-project';
import { registerInstallBasesCommand } from './install-bases';
import { registerNewSceneCommand } from './new-scene';
import { registerNewDraftCommand } from './new-draft';
import { registerOpenControlCenterCommand } from './open-control-center';
import { registerReorderScenesCommand } from './reorder-scenes';
import { registerRepairProjectCommand } from './repair-project';
import { registerRunCompileCommand } from './run-compile';
import { registerShowManuscriptViewCommand } from './show-manuscript-view';
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
	plugin: DraftBenchPlugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker
): void {
	registerCreateProjectCommand(plugin, getSettings, () => plugin);
	registerCreateCompilePresetCommand(plugin, linker);
	registerInstallBasesCommand(plugin);
	registerNewSceneCommand(plugin, getSettings, linker);
	registerNewDraftCommand(plugin, getSettings, linker);
	registerOpenControlCenterCommand(plugin, () => plugin, linker);
	registerShowManuscriptViewCommand(plugin, () => plugin);
	registerReorderScenesCommand(plugin, linker);
	registerRepairProjectCommand(plugin, linker);
	registerRunCompileCommand(plugin);
	registerSetAsProjectCommand(plugin, getSettings);
	registerSetAsSceneCommand(plugin, getSettings);
	registerSetAsDraftCommand(plugin, getSettings);
	registerCompleteEssentialsCommand(plugin, getSettings);
	registerAddIdCommand(plugin, getSettings);
}
