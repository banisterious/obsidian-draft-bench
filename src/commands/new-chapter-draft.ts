import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { isChapterFrontmatter } from '../model/chapter';
import type { ChapterNote } from '../core/discovery';
import { NewChapterDraftModal } from '../ui/modals/new-chapter-draft-modal';

/**
 * Register the "Draft Bench: New draft of this chapter" command.
 *
 * Uses `checkCallback` so the command is hidden from the palette and
 * disabled from hotkeys unless the active note is a chapter. Mirrors
 * the scene-side `New draft of this scene` per
 * [chapter-type.md § 4](../../docs/planning/chapter-type.md).
 */
export function registerNewChapterDraftCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'new-draft-of-this-chapter',
		name: 'New draft of this chapter',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;
			const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!isChapterFrontmatter(fm)) return false;

			if (!checking) {
				const chapter: ChapterNote = { file, frontmatter: fm };
				new NewChapterDraftModal(
					plugin.app,
					getSettings(),
					linker,
					chapter
				).open();
			}
			return true;
		},
	});
}
