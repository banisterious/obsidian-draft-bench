import type { App, TFile } from 'obsidian';
import type { DbenchStatus } from '../model/types';
import type { ProjectNote, SceneNote } from './discovery';
import { findScenesInProject } from './discovery';
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
 * - `total`: sum of word counts across every scene in the project.
 * - `wordsByStatus`: words contributed by scenes at each status
 *   (`idea` / `draft` / `revision` / `final`). Useful for "there's
 *   still 3k words sitting in revision" at-a-glance insight.
 * - `scenesByStatus`: scene count per status, for UIs that want to
 *   show both measures ("3 scenes, 2,500 words in revision").
 */
export interface ProjectWordCounts {
	total: number;
	wordsByStatus: Record<DbenchStatus, number>;
	scenesByStatus: Record<DbenchStatus, number>;
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
	 * Aggregate counts across every scene in `project`. Missing scenes
	 * (e.g., orphan IDs that no longer resolve) are skipped; each
	 * resolved scene contributes to `total` and to the bucket named by
	 * its `dbench-status`.
	 */
	async countForProject(project: ProjectNote): Promise<ProjectWordCounts> {
		const scenes = findScenesInProject(
			this.app,
			project.frontmatter['dbench-id']
		);
		const result = emptyCounts();
		for (const scene of scenes) {
			const count = await this.countForScene(scene);
			const status = scene.frontmatter['dbench-status'];
			result.total += count;
			result.wordsByStatus[status] += count;
			result.scenesByStatus[status] += 1;
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
		wordsByStatus: { idea: 0, draft: 0, revision: 0, final: 0 },
		scenesByStatus: { idea: 0, draft: 0, revision: 0, final: 0 },
	};
}
