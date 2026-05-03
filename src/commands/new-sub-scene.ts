import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';
import { findNoteById, type SceneNote } from '../core/discovery';
import { NewSubSceneModal } from '../ui/modals/new-sub-scene-modal';

/**
 * Register the "Draft Bench: New sub-scene in scene" palette command.
 *
 * Uses `checkCallback` so the command is hidden from the palette and
 * disabled from hotkeys unless the active note is a scene (the parent
 * scene needed by `NewSubSceneModal`). Resolves the parent project
 * via the scene's `dbench-project-id` companion before opening the
 * modal so the writer can submit without picking a project.
 */
export function registerNewSubSceneCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'new-sub-scene-in-scene',
		name: 'New sub-scene in scene',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;
			const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!isSceneFrontmatter(fm)) return false;
			const scene: SceneNote = { file, frontmatter: fm };
			const projectId = fm['dbench-project-id'];
			if (typeof projectId !== 'string' || projectId === '') return false;
			const projectMatch = findNoteById(plugin.app, projectId);
			if (!projectMatch || !isProjectFrontmatter(projectMatch.frontmatter)) {
				return false;
			}

			if (!checking) {
				new NewSubSceneModal(
					plugin.app,
					getSettings(),
					linker,
					{
						file: projectMatch.file,
						frontmatter: projectMatch.frontmatter,
					},
					scene
				).open();
			}
			return true;
		},
	});
}
