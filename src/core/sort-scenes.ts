import type { SceneNote } from './discovery';

/**
 * Pure sort: returns a copy of `scenes` sorted by `dbench-order`
 * ascending. Scenes with equal orders preserve their relative input
 * order (stable sort). Consumed by the Manuscript leaf's list
 * renderer; originally lifted from the Control Center's former
 * Manuscript tab to keep the pure sort separable from its caller's
 * DOM dependencies.
 */
export function sortScenesByOrder(scenes: SceneNote[]): SceneNote[] {
	return [...scenes].sort(
		(a, b) => a.frontmatter['dbench-order'] - b.frontmatter['dbench-order']
	);
}
