/**
 * Defensive frontmatter-value readers shared across linker submodules.
 * Kept in its own file so reconciliation, folder-auto-rename, and
 * wikilink-backfill can all import from a single canonical source.
 */

/**
 * Returns the array as-is, or `[]` if the value isn't an array.
 * Guards against null, undefined, and corrupted entries.
 */
export function readArray(value: unknown): string[] {
	return Array.isArray(value) ? (value as string[]) : [];
}

/** Read a frontmatter value as a string, defaulting to `''` if absent or wrong type. */
export function readString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}
