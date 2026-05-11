import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { isSubSceneFrontmatter } from '../model/sub-scene';
import type { SubSceneNote } from '../core/discovery';
import { NewSubSceneDraftModal } from '../ui/modals/new-sub-scene-draft-modal';
import { COMMAND_IDS } from './ids';

/**
 * Register the "Draft Bench: New draft of this sub-scene" palette
 * command. Mirrors `registerNewChapterDraftCommand` for the sub-scene
 * side per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md):
 * uses `checkCallback` so the command is hidden from the palette and
 * disabled from hotkeys unless the active note is a sub-scene.
 */
export function registerNewSubSceneDraftCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: COMMAND_IDS.NEW_DRAFT_OF_THIS_SUB_SCENE,
		name: 'New draft of this sub-scene',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;
			const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!isSubSceneFrontmatter(fm)) return false;

			if (!checking) {
				const subScene: SubSceneNote = { file, frontmatter: fm };
				new NewSubSceneDraftModal(
					plugin.app,
					getSettings(),
					linker,
					subScene
				).open();
			}
			return true;
		},
	});
}
