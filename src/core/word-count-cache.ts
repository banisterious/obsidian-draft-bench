import type { App, TFile } from 'obsidian';
import type { ChapterNote, ProjectNote, SceneNote } from './discovery';
import { findChaptersInProject, findScenesInProject } from './discovery';
import { readTargetWords } from './targets';
import { countScene } from './word-count';

/**
 * Per-path cache entry: the file's `mtime` at the time of counting
 * plus the resulting word count. Callers compare the file's current
 * `mtime` against the stored value to detect staleness.
 */
interface CacheEntry {
	mtime: number;
	count: number;
}

/**
 * Aggregated counts for a project.
 *
 * - `total`: sum of word counts across every scene in the project,
 *   plus chapter-body word counts for chapter-aware projects. Per
 *   chapter-type.md § 5 + the project-rollup extension that pairs
 *   with it: a chapter body's `## Draft` is real prose, so excluding
 *   it would make the project total mismatch the sum of chapter-card
 *   rollups in the Manuscript view.
 * - `wordsByStatus`: words contributed by scenes at each status (and
 *   by chapter bodies, bucketed by the chapter's `dbench-status`).
 *   Useful for "there's still 3k words sitting in revision" insight.
 * - `scenesByStatus`: scene count per status. Excludes chapters; UIs
 *   that want a combined per-status item count should add
 *   `chaptersByStatus[status]`.
 * - `chaptersByStatus`: chapter count per status. Empty `{}` for
 *   chapter-less projects so existing UI iterations stay backward
 *   compatible.
 *
 * Both maps are populated lazily: only statuses actually found on
 * scenes/chapters appear as keys. UIs that want to render zero-rows
 * for not-yet-used statuses should iterate the vocabulary explicitly
 * and fall back to `0` for absent keys.
 *
 * Target fields (populated from `dbench-target-words` frontmatter):
 *
 * - `projectTarget`: the target on the project note itself, or `null`
 *   when unset. Treated as the authoritative project target; scene
 *   targets are informational (per-scene progress only).
 * - `sceneTargetSum`: sum of `dbench-target-words` across scenes with
 *   targets. Not used by the Project-tab hero bar (that's driven by
 *   `projectTarget` alone) but exposed for UIs that want a
 *   "sum-of-parts" read.
 * - `scenesWithTargets`: count of scenes whose target is set.
 */
export interface ProjectWordCounts {
	total: number;
	wordsByStatus: Record<string, number>;
	scenesByStatus: Record<string, number>;
	chaptersByStatus: Record<string, number>;
	projectTarget: number | null;
	sceneTargetSum: number;
	scenesWithTargets: number;
}

/**
 * Per-scene word-count cache with lazy fill and `mtime`-based
 * invalidation.
 *
 * Keyed by file path. On each `countForScene(scene)`, the cache
 * compares the file's current `mtime` against the stored entry. A
 * miss or stale entry triggers a fresh read via `vault.read()` plus
 * `countScene()`; the result is memoized.
 *
 * `invalidate(path)` and `clear()` handle external invalidation
 * signals. Phase-2 live refresh (P2.B.5) will call `invalidate` from
 * a debounced `vault.on('modify')` listener.
 */
export class WordCountCache {
	private readonly entries = new Map<string, CacheEntry>();
	private readonly app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Return the cached count for `scene`, reading and counting on a
	 * miss or when the file's `mtime` has moved forward since the last
	 * fill.
	 */
	async countForScene(scene: SceneNote): Promise<number> {
		return this.countForFile(scene.file);
	}

	/**
	 * Aggregate word count for a chapter: chapter body's `## Draft`
	 * plus the sum of child scenes' `## Draft` sections. Per § 5 of
	 * chapter-type.md, this is the live-computed rollup that surfaces
	 * on the Manuscript view chapter card. Caller passes the resolved
	 * scenes-in-chapter list (typically from `findScenesInChapter` +
	 * `sortScenesByOrder`) so this method stays free of discovery
	 * concerns.
	 */
	async countForChapter(
		chapter: ChapterNote,
		scenes: SceneNote[]
	): Promise<number> {
		let total = await this.countForFile(chapter.file);
		for (const scene of scenes) {
			total += await this.countForScene(scene);
		}
		return total;
	}

	/**
	 * Aggregate counts across every scene in `project`, plus the
	 * chapter-body word counts for chapter-aware projects. Missing
	 * scenes/chapters (e.g., orphan IDs that no longer resolve) are
	 * skipped; each resolved unit contributes to `total` and to the
	 * status bucket named by its `dbench-status`.
	 *
	 * `findScenesInProject` returns the flat list across all chapters
	 * for chapter-aware projects, so scenes-in-chapter counts already
	 * land here. The chapter loop adds the chapter bodies' `## Draft`
	 * counts on top, matching `countForChapter`'s rollup formula
	 * applied at the project level.
	 */
	async countForProject(project: ProjectNote): Promise<ProjectWordCounts> {
		const projectId = project.frontmatter['dbench-id'];
		const scenes = findScenesInProject(this.app, projectId);
		const chapters = findChaptersInProject(this.app, projectId);
		const result = emptyCounts();
		result.projectTarget = readTargetWords(
			project.frontmatter as unknown as Record<string, unknown>
		);
		for (const scene of scenes) {
			const count = await this.countForScene(scene);
			const status = scene.frontmatter['dbench-status'];
			result.total += count;
			result.wordsByStatus[status] = (result.wordsByStatus[status] ?? 0) + count;
			result.scenesByStatus[status] =
				(result.scenesByStatus[status] ?? 0) + 1;
			const sceneTarget = readTargetWords(
				scene.frontmatter as unknown as Record<string, unknown>
			);
			if (sceneTarget !== null) {
				result.sceneTargetSum += sceneTarget;
				result.scenesWithTargets += 1;
			}
		}
		for (const chapter of chapters) {
			const count = await this.countForFile(chapter.file);
			const status = chapter.frontmatter['dbench-status'];
			result.total += count;
			result.wordsByStatus[status] = (result.wordsByStatus[status] ?? 0) + count;
			result.chaptersByStatus[status] =
				(result.chaptersByStatus[status] ?? 0) + 1;
		}
		return result;
	}

	/** Drop the entry for a specific path. No-op if absent. */
	invalidate(path: string): void {
		this.entries.delete(path);
	}

	/** Drop every entry. Called on plugin unload. */
	clear(): void {
		this.entries.clear();
	}

	/** Inspect the current size (for tests and diagnostics). */
	get size(): number {
		return this.entries.size;
	}

	private async countForFile(file: TFile): Promise<number> {
		const existing = this.entries.get(file.path);
		const mtime = file.stat.mtime;
		if (existing && existing.mtime === mtime) {
			return existing.count;
		}
		const content = await this.app.vault.read(file);
		const count = countScene(content);
		this.entries.set(file.path, { mtime, count });
		return count;
	}
}

function emptyCounts(): ProjectWordCounts {
	return {
		total: 0,
		wordsByStatus: {},
		scenesByStatus: {},
		chaptersByStatus: {},
		projectTarget: null,
		sceneTargetSum: 0,
		scenesWithTargets: 0,
	};
}
