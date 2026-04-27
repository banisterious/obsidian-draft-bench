import type { App } from 'obsidian';
import type { ChapterNote, SceneNote } from './discovery';

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
 * `dbench-order` to decide chapter sequence (Step 8); this is the
 * single writer that chapter callers should use.
 *
 * Sibling function rather than a generic over both types so the
 * call sites stay type-explicit, matching the project's
 * typed-relationships style. A genericized variant becomes worth
 * the abstraction when a third reorder context arrives (the
 * scenes-in-chapter reorder per chapter-type.md § 8 is the natural
 * trigger).
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
