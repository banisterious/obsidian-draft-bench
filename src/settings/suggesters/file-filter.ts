/**
 * Case-insensitive substring match over `paths`, sorted alphabetically.
 * An empty query returns all paths.
 *
 * Pure — no Obsidian runtime — so the filter logic can be exercised
 * by unit tests independently of the `FileSuggest` class.
 */
export function filterFiles(paths: string[], query: string): string[] {
	const lower = query.toLowerCase();
	const matches =
		lower === ''
			? paths.slice()
			: paths.filter((p) => p.toLowerCase().includes(lower));
	return matches.sort();
}
