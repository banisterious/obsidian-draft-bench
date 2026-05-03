import type { App } from 'obsidian';
import type { SceneNote, SubSceneNote } from './discovery';

/**
 * Reassign a sub-scene's parent scene.
 *
 * Writes `dbench-scene` (wikilink) and `dbench-scene-id` (stable id
 * companion) onto the sub-scene's frontmatter via
 * `FileManager.processFrontMatter`. The linker reacts to the resulting
 * change event and updates both old-scene and new-scene reverse arrays
 * (`dbench-sub-scenes` / `dbench-sub-scene-ids`) on its own — same
 * machinery the chapter↔scene "Move to chapter" exercises one level up.
 *
 * Mirrors `moveSceneToChapter` per [sub-scene-type.md § 8](../../docs/planning/sub-scene-type.md):
 * the cross-scene sub-scene move is the single-file analog of the
 * "Move to chapter" retrofit. Bulk multi-select moves are post-V1.
 *
 * Caller responsibilities (the modal layer enforces these):
 * - Target scene must belong to the same project as the source sub-scene.
 * - Target scene must exist (be discoverable via `findScenesInProject`).
 *
 * Idempotent at the call site: writing the same `dbench-scene-id`
 * twice produces the same frontmatter; the linker no-ops if the
 * reverse arrays already reflect the assignment.
 */
export async function moveSubSceneToScene(
	app: App,
	subScene: SubSceneNote,
	scene: SceneNote
): Promise<void> {
	const sceneWikilink = `[[${scene.file.basename}]]`;
	const sceneId = scene.frontmatter['dbench-id'];
	await app.fileManager.processFrontMatter(subScene.file, (fm) => {
		fm['dbench-scene'] = sceneWikilink;
		fm['dbench-scene-id'] = sceneId;
	});
}
