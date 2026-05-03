import type DraftBenchPlugin from '../../main';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { registerBuildManuscriptCommand } from './build-manuscript';
import { registerCompileCurrentProjectCommand } from './compile-current-project';
import { registerCreateCompilePresetCommand } from './create-compile-preset';
import { registerCreateExampleProjectCommand } from './create-example-project';
import { registerCreateProjectCommand } from './create-project';
import { registerDuplicateCompilePresetCommand } from './duplicate-compile-preset';
import { registerInstallBasesCommand } from './install-bases';
import { registerNewChapterCommand } from './new-chapter';
import { registerNewChapterDraftCommand } from './new-chapter-draft';
import { registerNewSceneCommand } from './new-scene';
import { registerNewSubSceneCommand } from './new-sub-scene';
import { registerNewSubSceneDraftCommand } from './new-sub-scene-draft';
import { registerNewDraftCommand } from './new-draft';
import { registerReorderChaptersCommand } from './reorder-chapters';
import { registerReorderScenesCommand } from './reorder-scenes';
import { registerReorderSubScenesCommand } from './reorder-sub-scenes';
import { registerRepairProjectCommand } from './repair-project';
import { registerRunCompileCommand } from './run-compile';
import { registerShowManuscriptViewCommand } from './show-manuscript-view';
import { registerShowWelcomeCommand } from './show-welcome';
import { registerSetAsProjectCommand } from './retrofit/set-as-project';
import { registerSetAsChapterCommand } from './retrofit/set-as-chapter';
import { registerSetAsSceneCommand } from './retrofit/set-as-scene';
import { registerSetAsSubSceneCommand } from './retrofit/set-as-sub-scene';
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
	registerBuildManuscriptCommand(plugin, () => plugin, linker);
	registerCompileCurrentProjectCommand(plugin);
	registerCreateProjectCommand(plugin, getSettings, () => plugin);
	registerCreateExampleProjectCommand(plugin, linker);
	registerCreateCompilePresetCommand(plugin, linker);
	registerDuplicateCompilePresetCommand(plugin, linker);
	registerInstallBasesCommand(plugin);
	registerNewChapterCommand(plugin, getSettings, linker);
	registerNewChapterDraftCommand(plugin, getSettings, linker);
	registerNewSceneCommand(plugin, getSettings, linker);
	registerNewSubSceneCommand(plugin, getSettings, linker);
	registerNewSubSceneDraftCommand(plugin, getSettings, linker);
	registerNewDraftCommand(plugin, getSettings, linker);
	registerShowManuscriptViewCommand(plugin, () => plugin);
	registerShowWelcomeCommand(plugin);
	registerReorderChaptersCommand(plugin, linker);
	registerReorderScenesCommand(plugin, linker);
	registerReorderSubScenesCommand(plugin, linker);
	registerRepairProjectCommand(plugin, linker);
	registerRunCompileCommand(plugin);
	registerSetAsProjectCommand(plugin, getSettings);
	registerSetAsChapterCommand(plugin, getSettings);
	registerSetAsSceneCommand(plugin, getSettings);
	registerSetAsSubSceneCommand(plugin, getSettings);
	registerSetAsDraftCommand(plugin, getSettings);
	registerCompleteEssentialsCommand(plugin, getSettings);
	registerAddIdCommand(plugin, getSettings);
}
