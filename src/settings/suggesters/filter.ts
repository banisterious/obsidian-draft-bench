/**
 * Case-insensitive substring match over `folders`, sorted alphabetically.
 * An empty query returns all folders.
 *
 * Pure — no Obsidian runtime — so the filter logic can be exercised
 * by unit tests independently of the `FolderSuggest` class.
 */
export function filterFolders(folders: string[], query: string): string[] {
	const lower = query.toLowerCase();
	const matches =
		lower === ''
			? folders.slice()
			: folders.filter((p) => p.toLowerCase().includes(lower));
	return matches.sort();
}
