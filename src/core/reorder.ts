import type { App } from 'obsidian';
import type { ChapterNote, SceneNote, SubSceneNote } from './discovery';

/**
 * Write sequential `dbench-order` values onto each scene in
 * `orderedScenes`, matching the array's index (1-based).
 *
 * Per spec § Scene reordering:
 *
 *   "Commit writes dbench-order on each affected scene via
 *   FileManager.processFrontMatter. No file or folder renames."
 *
 * The write is idempotent per scene: a scene already at its desired
 * position is skipped. The return value counts how many files were
 * actually modified, for the caller's success notice.
 *
 * Per the spec's "suspended states" list, callers should run inside
 * `linker.withSuspended(...)`. `dbench-order` isn't a tracked
 * relationship so current linker stubs wouldn't react, but the
 * convention pre-empts future handler wiring.
 */
export async function reorderScenes(
	app: App,
	orderedScenes: SceneNote[]
): Promise<number> {
	let changed = 0;
	for (let i = 0; i < orderedScenes.length; i++) {
		const scene = orderedScenes[i];
		const desired = i + 1;
		if (scene.frontmatter['dbench-order'] === desired) continue;

		await app.fileManager.processFrontMatter(scene.file, (frontmatter) => {
			frontmatter['dbench-order'] = desired;
		});
		changed++;
	}
	return changed;
}

/**
 * Write sequential `dbench-order` values onto each chapter in
 * `orderedChapters`, matching the array's index (1-based).
 *
 * Same semantics as `reorderScenes` but for chapter notes:
 * idempotent per chapter, returns the count of actually-modified
 * files. The chapter walker in the compile pipeline reads
 * `dbench-order` to decide chapter sequence; this is the single
 * writer that chapter callers should use.
 *
 * Sibling function rather than a generic over both types so the
 * call sites stay type-explicit, matching the project's
 * typed-relationships style. The genericized UI lives in
 * `src/ui/modals/reorder-children-modal.ts` (per § 8 of
 * sub-scene-type.md, the third reorder context — sub-scenes-in-scene —
 * triggered the modal-level abstraction).
 */
export async function reorderChapters(
	app: App,
	orderedChapters: ChapterNote[]
): Promise<number> {
	let changed = 0;
	for (let i = 0; i < orderedChapters.length; i++) {
		const chapter = orderedChapters[i];
		const desired = i + 1;
		if (chapter.frontmatter['dbench-order'] === desired) continue;

		await app.fileManager.processFrontMatter(chapter.file, (frontmatter) => {
			frontmatter['dbench-order'] = desired;
		});
		changed++;
	}
	return changed;
}

/**
 * Write sequential `dbench-order` values onto each sub-scene in
 * `orderedSubScenes`, matching the array's index (1-based). Per
 * [sub-scene-type.md § 8](../../docs/planning/sub-scene-type.md):
 * sub-scene order is within-parent-scene, so callers pass the
 * already-resolved sub-scenes for one parent.
 *
 * Same semantics as `reorderScenes` / `reorderChapters`: idempotent
 * per sub-scene, returns the count of actually-modified files.
 */
export async function reorderSubScenes(
	app: App,
	orderedSubScenes: SubSceneNote[]
): Promise<number> {
	let changed = 0;
	for (let i = 0; i < orderedSubScenes.length; i++) {
		const subScene = orderedSubScenes[i];
		const desired = i + 1;
		if (subScene.frontmatter['dbench-order'] === desired) continue;

		await app.fileManager.processFrontMatter(subScene.file, (frontmatter) => {
			frontmatter['dbench-order'] = desired;
		});
		changed++;
	}
	return changed;
}
