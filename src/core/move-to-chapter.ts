import type { App } from 'obsidian';
import type { ChapterNote, SceneNote } from './discovery';

/**
 * Reassign a scene's chapter parent.
 *
 * Writes `dbench-chapter` (wikilink) and `dbench-chapter-id` (stable
 * id companion) onto the scene's frontmatter via
 * FileManager.processFrontMatter. The linker reacts to the resulting
 * change event and updates both old-chapter and new-chapter reverse
 * arrays (`dbench-scenes` / `dbench-scene-ids`) on its own — same
 * machinery that walkthrough Test 10 ("move a scene between chapters")
 * exercises in the dev-vault.
 *
 * Caller responsibilities (the modal layer enforces these):
 * - Target chapter must belong to the same project as the source scene.
 * - Target chapter must exist (be discoverable via findChaptersInProject).
 * - This helper is single-file by design; bulk multi-select moves
 *   are post-V1 per the chapter-type § 11.9 plan.
 *
 * Idempotent at the call site: writing the same dbench-chapter-id
 * twice produces the same frontmatter; the linker no-ops if the
 * reverse arrays already reflect the assignment.
 */
export async function moveSceneToChapter(
	app: App,
	scene: SceneNote,
	chapter: ChapterNote
): Promise<void> {
	const chapterWikilink = `[[${chapter.file.basename}]]`;
	const chapterId = chapter.frontmatter['dbench-id'];
	await app.fileManager.processFrontMatter(scene.file, (fm) => {
		fm['dbench-chapter'] = chapterWikilink;
		fm['dbench-chapter-id'] = chapterId;
	});
}
