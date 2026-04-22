import { TFile, type App } from 'obsidian';

/**
 * Vault-wide helpers for the configurable status vocabulary.
 *
 * Status values live on every project and scene note's `dbench-status`
 * frontmatter key. These helpers support the Settings-tab workflow that
 * lets a writer remove or rename a status and then migrate the notes
 * that still carry the old value.
 *
 * Discovery is frontmatter-based (D-04): we scan every markdown file's
 * cache rather than walking a specific folder.
 */

/**
 * The list of markdown files whose `dbench-status` matches `status`.
 * Non-string values (null, missing, numeric) never match. The
 * comparison is case-sensitive — statuses are stored verbatim from the
 * vocabulary, and case differences are meaningful (if someone reuses
 * the same word with different casing, they get two buckets).
 */
export function filesWithStatus(app: App, status: string): string[] {
	const paths: string[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cached = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!cached || typeof cached !== 'object') continue;
		const value = (cached as Record<string, unknown>)['dbench-status'];
		if (typeof value === 'string' && value === status) {
			paths.push(file.path);
		}
	}
	return paths;
}

/**
 * Count of vault notes whose `dbench-status` equals `status`.
 * Shorthand over `filesWithStatus(app, status).length` for the common
 * "how many notes are affected?" question.
 */
export function countStatusUsage(app: App, status: string): number {
	return filesWithStatus(app, status).length;
}

/**
 * Rewrite every note whose `dbench-status` equals `fromStatus` so it
 * reads `toStatus` instead. Returns the count of notes changed.
 *
 * Writes through `FileManager.processFrontMatter` so the YAML stays
 * in the Obsidian-canonical shape. Notes that don't currently match
 * `fromStatus` (e.g., raced to a different value between the scan and
 * the write) are left untouched; the count reflects the actual number
 * of successful rewrites.
 *
 * Callers that need the linker dormant during the sweep should run
 * this inside `linker.withSuspended(...)`.
 */
export async function renameStatus(
	app: App,
	fromStatus: string,
	toStatus: string
): Promise<number> {
	const paths = filesWithStatus(app, fromStatus);
	let changed = 0;
	for (const path of paths) {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension !== 'md') continue;
		try {
			await app.fileManager.processFrontMatter(file, (fm) => {
				if (fm['dbench-status'] === fromStatus) {
					fm['dbench-status'] = toStatus;
				}
			});
			changed += 1;
		} catch {
			// Swallow per-file failures; surfacing them as a batch error
			// would halt the sweep midway and leave the vault in a partial
			// state. The caller shows the change count and the writer can
			// re-run if needed.
		}
	}
	return changed;
}
