import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { NewChapterModal } from '../ui/modals/new-chapter-modal';

/**
 * Register the "Draft Bench: New chapter in project" command.
 *
 * Mirrors `registerNewSceneCommand`. The modal needs both settings
 * (for chaptersFolder defaults) and the linker (to suspend during
 * the two-file write: chapter file + project's reverse-array
 * append).
 */
export function registerNewChapterCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'new-chapter-in-project',
		name: 'New chapter in project',
		callback: () => {
			new NewChapterModal(plugin.app, getSettings(), linker).open();
		},
	});
}
