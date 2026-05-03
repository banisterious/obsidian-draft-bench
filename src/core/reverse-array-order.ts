import type { App } from 'obsidian';
import { findNoteById } from './discovery';

/**
 * Sort parallel reverse-array (wikilink, id) pairs by each child's
 * `dbench-order` field, breaking ties via `Array.prototype.sort`'s
 * stable-sort guarantee (insertion order preserved). Children whose
 * `dbench-order` is missing or non-numeric (e.g., drafts, which use
 * `dbench-draft-number` instead) sort to the end and keep their
 * relative position.
 *
 * Used by both the integrity-repair defensive post-prune and the
 * linker's live `ensureChildInReverse` path to keep reverse-array
 * order aligned with the writer's narrative order, so a writer
 * inspecting frontmatter sees children in the same order the
 * Manuscript view renders them. Refs #19.
 *
 * Idempotent on already-sorted arrays: returns the inputs as-is when
 * the sort produces no permutation, so callers can use the result for
 * change-detection (`output === input` short-circuit) and skip
 * unnecessary writes.
 */
export function sortReverseArraysByOrder(
	app: App,
	wikilinks: string[],
	ids: string[]
): { wikilinks: string[]; ids: string[]; changed: boolean } {
	const len = Math.min(wikilinks.length, ids.length);
	const indices = Array.from({ length: len }, (_, i) => i);
	indices.sort((a, b) => orderForId(app, ids[a]) - orderForId(app, ids[b]));

	let changed = false;
	for (let i = 0; i < len; i++) {
		if (indices[i] !== i) {
			changed = true;
			break;
		}
	}
	if (!changed) {
		return { wikilinks, ids, changed: false };
	}

	return {
		wikilinks: indices.map((i) => wikilinks[i]),
		ids: indices.map((i) => ids[i]),
		changed: true,
	};
}

/**
 * Look up the child's `dbench-order`, falling back to
 * `Number.POSITIVE_INFINITY` for missing children, missing fields, and
 * non-numeric values. The infinity fallback preserves stable-sort
 * ordering for unordered children (drafts, malformed entries) while
 * pushing them after any properly-ordered siblings.
 */
function orderForId(app: App, id: string): number {
	if (!id) return Number.POSITIVE_INFINITY;
	const child = findNoteById(app, id);
	if (!child) return Number.POSITIVE_INFINITY;
	const fm = child.frontmatter as unknown as Record<string, unknown>;
	const order = fm['dbench-order'];
	return typeof order === 'number' ? order : Number.POSITIVE_INFINITY;
}
