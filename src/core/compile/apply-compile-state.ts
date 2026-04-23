import type { App } from 'obsidian';
import type { CompilePresetNote } from '../discovery';

/**
 * Compile-state persistence: write the three `dbench-last-*` fields
 * back to the preset's frontmatter after a successful compile.
 *
 * Per [D-06 § Preset schema shape](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * compile state lives in the preset itself rather than plugin
 * `data.json` — writers see history in git diffs, and multiple
 * presets per project accumulate independent state without any extra
 * plumbing. The three fields:
 *
 * - `dbench-last-compiled-at` — ISO-8601 timestamp.
 * - `dbench-last-output-path` — vault or absolute path of the last
 *   written artifact.
 * - `dbench-last-chapter-hashes` — `"<scene-id>:<djb2>"` array for
 *   the Compile tab's "N scenes changed since last compile" readout
 *   (P3.D).
 *
 * These fields aren't watched by the linker, so no
 * `linker.withSuspended(...)` wrap is needed.
 */

export interface CompileStateUpdate {
	outputPath: string;
	chapterHashes: string[];
	/**
	 * Override for `new Date()` so tests can assert deterministic
	 * `dbench-last-compiled-at` values. Production callers omit this.
	 */
	now?: Date;
}

export async function applyCompileState(
	app: App,
	preset: CompilePresetNote,
	update: CompileStateUpdate
): Promise<void> {
	const compiledAt = (update.now ?? new Date()).toISOString();
	await app.fileManager.processFrontMatter(preset.file, (fm) => {
		fm['dbench-last-compiled-at'] = compiledAt;
		fm['dbench-last-output-path'] = update.outputPath;
		fm['dbench-last-chapter-hashes'] = update.chapterHashes;
	});
}
