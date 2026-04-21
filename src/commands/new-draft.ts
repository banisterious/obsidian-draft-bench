import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { isSceneFrontmatter } from '../model/scene';
import type { SceneNote } from '../core/discovery';
import { NewDraftModal } from '../ui/modals/new-draft-modal';

/**
 * Register the "Draft Bench: New draft of this scene" command.
 *
 * Uses `checkCallback` so the command is hidden from the palette and
 * disabled from hotkeys unless the active note is a scene. That matches
 * the spec's "context-sensitive command" convention and mirrors how
 * Obsidian's own scene-scoped commands behave.
 */
export function registerNewDraftCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'new-draft-of-this-scene',
		name: 'New draft of this scene',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;
			const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!isSceneFrontmatter(fm)) return false;

			if (!checking) {
				const scene: SceneNote = { file, frontmatter: fm };
				new NewDraftModal(
					plugin.app,
					getSettings(),
					linker,
					scene
				).open();
			}
			return true;
		},
	});
}
