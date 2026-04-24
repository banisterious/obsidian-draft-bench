import type { App } from 'obsidian';
import { findScenesInProject, type CompilePresetNote } from '../discovery';
import { sortScenesByOrder } from '../sort-scenes';
import { djb2 } from './hash';

/**
 * Read-only snapshot of a preset's compile state, enriched with
 * "scenes changed since last compile" by diffing stored hashes
 * against current scene content.
 *
 * Consumed by the Compile tab's Last-compile section (P3.D) for the
 * "3 scenes changed since last compile" readout that D-06 calls out
 * as a primary UI affordance.
 */
export interface LastCompileStatus {
	/** ISO timestamp of the last successful compile, or null. */
	compiledAt: string | null;
	/** Path the last compile wrote to, or null. */
	outputPath: string | null;
	/** Number of hashes stored on the preset. Zero = never compiled. */
	storedHashCount: number;
	/**
	 * Count of scenes whose current djb2 hash differs from the stored
	 * hash, plus new scenes added since the last compile, plus scenes
	 * that have disappeared. Returns 0 when `storedHashCount` is 0
	 * (no baseline to diff against).
	 */
	scenesChanged: number;
	/** Total current scenes in the project (post-filter not applied). */
	totalCurrentScenes: number;
}

/**
 * Compute the last-compile snapshot for `preset` against the current
 * scene content of its project. Reads every scene's file — O(n) in
 * scene count — so the result is awaited by the UI and rendered
 * asynchronously.
 *
 * "Changed" means any of:
 *
 * - The stored hash for a scene id exists but doesn't match the
 *   current content (scene edited).
 * - A current scene has no stored hash (new scene since last
 *   compile).
 * - A stored hash references a scene id that no longer exists (scene
 *   removed since last compile).
 */
export async function computeLastCompileStatus(
	app: App,
	preset: CompilePresetNote
): Promise<LastCompileStatus> {
	const compiledAt = preset.frontmatter['dbench-last-compiled-at'] || null;
	const outputPath = preset.frontmatter['dbench-last-output-path'] || null;
	const storedPairs = preset.frontmatter['dbench-last-chapter-hashes'];
	const stored = parseStoredHashes(storedPairs);

	const scenes = sortScenesByOrder(
		findScenesInProject(app, preset.frontmatter['dbench-project-id'])
	);

	if (stored.size === 0) {
		return {
			compiledAt,
			outputPath,
			storedHashCount: 0,
			scenesChanged: 0,
			totalCurrentScenes: scenes.length,
		};
	}

	let changed = 0;
	const currentIds = new Set<string>();
	for (const scene of scenes) {
		const id = scene.frontmatter['dbench-id'];
		currentIds.add(id);
		const raw = await app.vault.read(scene.file);
		const currentHash = djb2(raw);
		const storedHash = stored.get(id);
		if (storedHash === undefined || storedHash !== currentHash) changed++;
	}
	// Scenes in the stored set that no longer exist also count as changed.
	for (const id of stored.keys()) {
		if (!currentIds.has(id)) changed++;
	}

	return {
		compiledAt,
		outputPath,
		storedHashCount: stored.size,
		scenesChanged: changed,
		totalCurrentScenes: scenes.length,
	};
}

/**
 * Parse `"id:hash"` pair strings into a lookup map. Invalid entries
 * (missing colon, empty id) are silently dropped; Draft Bench writes
 * the array consistently so malformed entries imply external
 * tampering the UI shouldn't crash on.
 *
 * Exported for tests.
 */
export function parseStoredHashes(entries: string[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const entry of entries) {
		const colon = entry.indexOf(':');
		if (colon <= 0) continue;
		const id = entry.slice(0, colon);
		const hash = entry.slice(colon + 1);
		if (id.length === 0) continue;
		map.set(id, hash);
	}
	return map;
}
