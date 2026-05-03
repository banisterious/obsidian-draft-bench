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
 *
 * **Asymmetry guard (#22):** if the wikilink and id arrays have
 * different lengths, the function returns the inputs unchanged with
 * `changed: false`. The previous implementation used `Math.min` which
 * silently truncated to the shorter side and dropped data. Asymmetric
 * state is corruption; refusing to sort gives the integrity service a
 * chance to surface it rather than masking with a permutation that
 * loses entries.
 *
 * **Optional `knownOrders` map (#22):** caller-provided overrides for
 * specific ids, used by the linker to pass the just-added child's
 * order directly. This avoids relying on `findNoteById` against the
 * metadataCache for the just-modified file, which can return null in a
 * narrow timing window between cache reparse and `'changed'`-event
 * fire. If a child's id is in the map, the map value wins; otherwise
 * `findNoteById` is consulted as before.
 */
export function sortReverseArraysByOrder(
	app: App,
	wikilinks: string[],
	ids: string[],
	knownOrders: Map<string, number> = new Map()
): { wikilinks: string[]; ids: string[]; changed: boolean } {
	if (wikilinks.length !== ids.length) {
		return { wikilinks, ids, changed: false };
	}
	const len = wikilinks.length;
	const indices = Array.from({ length: len }, (_, i) => i);
	indices.sort(
		(a, b) =>
			orderForId(app, ids[a], knownOrders) -
			orderForId(app, ids[b], knownOrders)
	);

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
 * Look up the child's `dbench-order`. Caller-provided `knownOrders`
 * win when the id is in the map (used by the linker to pass the
 * just-added child's order directly, sidestepping the cache-timing
 * window in `findNoteById`). Falls back to `findNoteById` against the
 * metadataCache, then to `Number.POSITIVE_INFINITY` for missing
 * children, missing fields, and non-numeric values. The infinity
 * fallback preserves stable-sort ordering for unordered children
 * (drafts, malformed entries) while pushing them after any properly-
 * ordered siblings.
 */
function orderForId(
	app: App,
	id: string,
	knownOrders: Map<string, number>
): number {
	if (!id) return Number.POSITIVE_INFINITY;
	const known = knownOrders.get(id);
	if (typeof known === 'number') return known;
	const child = findNoteById(app, id);
	if (!child) return Number.POSITIVE_INFINITY;
	const fm = child.frontmatter as unknown as Record<string, unknown>;
	const order = fm['dbench-order'];
	return typeof order === 'number' ? order : Number.POSITIVE_INFINITY;
}
