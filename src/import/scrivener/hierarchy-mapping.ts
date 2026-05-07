import type { BinderItem } from './scrivx-parser';

/**
 * Auto-detect heuristic + override model for the wizard's Hierarchy
 * step (step 7 of [scrivener-import.md § Implementation](../../../docs/planning/scrivener-import.md);
 * design ratified in § 2).
 *
 * Scrivener allows arbitrary binder nesting; DB has 4 levels (project
 * / chapter / scene / sub-scene). The heuristic maps Scrivener binder
 * shape to DB target types via a modal-depth analysis of Text leaves
 * inside the DraftFolder, then classifies each binder item by its
 * Type + depth relative to that scene depth.
 *
 * **Pure function; no I/O.** The wizard step computes the auto-mapping
 * once per parse and overlays writer-driven per-row overrides on top
 * via `effectiveTarget()`.
 */

/**
 * DB target type for a given Scrivener binder item. Drives how the
 * Import write pass (step 11) treats the item:
 *
 * - `chapter` -> create a DB chapter note + folder
 * - `scene` -> create a DB scene note (top-level scene with no
 *   sub-scenes) under its chapter / project
 * - `sub-scene` -> create a DB sub-scene note under its parent scene
 * - `extras-above` -> not its own note; the writer's "Part" / "Book"
 *   level becomes `scrivener-part` frontmatter on the chapters it
 *   contains (per § 2)
 * - `extras-below` -> body content concatenated as nested markdown
 *   headings into the parent sub-scene's body (per § 2)
 * - `skip` -> not imported (non-Text non-Folder types like media; the
 *   media-extraction pass handles them separately if relevant)
 */
export type HierarchyTarget =
	| 'chapter'
	| 'scene'
	| 'sub-scene'
	| 'extras-above'
	| 'extras-below'
	| 'skip';

/**
 * The full set of writer-overridable target types. `skip` is included
 * so writers can demote individual items out of the import (e.g., a
 * stub "Notes" doc placed alongside scenes that the writer doesn't
 * want as a DB note).
 */
export const HIERARCHY_TARGETS: readonly HierarchyTarget[] = [
	'chapter',
	'scene',
	'sub-scene',
	'extras-above',
	'extras-below',
	'skip',
] as const;

export interface HierarchyMapping {
	/** Auto-detected target per binder item ID. Includes only items
	 *  inside the DraftFolder. Items at the DraftFolder root itself
	 *  are not mapped (the root is the project, handled separately). */
	byId: Map<string, HierarchyTarget>;
	/** Aggregate counts by target. Useful for the wizard summary
	 *  badges ("N documents will be merged into parents"). */
	counts: Record<HierarchyTarget, number>;
	/** Detected scene depth relative to the DraftFolder root (1-based:
	 *  direct children of DraftFolder are at depth 1). 0 means no
	 *  Text leaves were found in the Draft subtree. */
	sceneDepth: number;
}

/**
 * Walk the DraftFolder subtree and produce an auto-detected target
 * for every descendant binder item. The heuristic:
 *
 * 1. Collect the depths of all Text leaves under the DraftFolder.
 * 2. The mode of those depths is "scene depth"; on ties prefer the
 *    lower depth (handles mixed-shape projects where a scene-folder-
 *    with-sub-scenes sits alongside leaf-text scenes — counting the
 *    leaves at the chapter level keeps the chapter level intact).
 * 3. Classify each item by Type + depth (see `classify`):
 *    - Text at scene depth -> scene
 *    - Text at scene depth + 1 -> sub-scene
 *    - Text deeper than +1 -> extras-below
 *    - Text shallower than scene depth -> scene (chapter-less leaf)
 *    - Folder at scene depth - 1 -> chapter
 *    - Folder at scene depth -> scene (a scene-folder with sub-scenes)
 *    - Folder at scene depth + 1 -> sub-scene (rare; sub-scene with
 *      nested children that fall to extras-below)
 *    - Folder shallower than chapter level -> extras-above
 *    - Folder deeper than +1 -> extras-below
 *    - Other types (Image / PDF / WebArchive / etc.) -> skip
 *
 * Edge cases:
 * - Empty Draft (no Text leaves anywhere): everything maps to `skip`,
 *   `sceneDepth` is 0. The Hierarchy step UI surfaces a warning.
 * - Single Text leaf at depth 1: chapter-less single-scene project;
 *   the leaf is `scene`, no `chapter` items.
 *
 * The writer overrides the auto-mapping via per-row dropdowns in the
 * wizard; combine via `effectiveTarget()`.
 */
export function autoDetectHierarchy(
	draftRoot: BinderItem
): HierarchyMapping {
	const byId = new Map<string, HierarchyTarget>();
	const counts: Record<HierarchyTarget, number> = {
		chapter: 0,
		scene: 0,
		'sub-scene': 0,
		'extras-above': 0,
		'extras-below': 0,
		skip: 0,
	};

	const textDepths: number[] = [];
	walk(draftRoot.children, 1, (_item, depth) => {
		if (_item.type === 'Text') textDepths.push(depth);
	});

	const sceneDepth = textDepths.length === 0 ? 0 : modalDepth(textDepths);

	walk(draftRoot.children, 1, (item, depth) => {
		const target = classify(item, depth, sceneDepth);
		byId.set(item.id, target);
		counts[target] += 1;
	});

	return { byId, counts, sceneDepth };
}

/**
 * Pick the most common value in a non-empty list of depths, breaking
 * ties by preferring lower depth. The lower-depth tiebreaker matters
 * for projects that mix flat-leaf scenes with scene-folder-with-sub-
 * scenes: counting the chapter-level leaves keeps the chapter level
 * intact rather than being pulled deeper by a single sub-scene cluster.
 */
function modalDepth(depths: number[]): number {
	const counts = new Map<number, number>();
	for (const d of depths) counts.set(d, (counts.get(d) ?? 0) + 1);
	const sorted = [...counts.keys()].sort((a, b) => a - b);
	let best = sorted[0];
	let bestCount = counts.get(best) ?? 0;
	for (const k of sorted) {
		const c = counts.get(k) ?? 0;
		if (c > bestCount) {
			best = k;
			bestCount = c;
		}
	}
	return best;
}

function classify(
	item: BinderItem,
	depth: number,
	sceneDepth: number
): HierarchyTarget {
	const isFolder = item.type === 'Folder' || item.type === 'DraftFolder';
	const isText = item.type === 'Text';
	if (!isFolder && !isText) return 'skip';
	if (sceneDepth === 0) return 'skip';

	if (isText) {
		if (depth === sceneDepth) return 'scene';
		if (depth === sceneDepth + 1) return 'sub-scene';
		if (depth > sceneDepth + 1) return 'extras-below';
		// Shallower-than-scene-depth: chapter-less leaf scene.
		return 'scene';
	}

	// isFolder
	if (depth === sceneDepth - 1) return 'chapter';
	if (depth === sceneDepth) return 'scene';
	if (depth === sceneDepth + 1) return 'sub-scene';
	if (depth < sceneDepth - 1) return 'extras-above';
	return 'extras-below';
}

function walk(
	items: BinderItem[],
	depth: number,
	visit: (item: BinderItem, depth: number) => void
): void {
	for (const item of items) {
		visit(item, depth);
		walk(item.children, depth + 1, visit);
	}
}

/**
 * Combine an auto-detected mapping with writer-driven per-row
 * overrides. Returns the effective target for a binder item ID. Falls
 * back to `skip` if neither map has an entry (item is outside the
 * Draft subtree or the writer has manually requested skip).
 */
export function effectiveTarget(
	itemId: string,
	auto: HierarchyMapping,
	overrides: Map<string, HierarchyTarget>
): HierarchyTarget {
	const override = overrides.get(itemId);
	if (override !== undefined) return override;
	return auto.byId.get(itemId) ?? 'skip';
}
