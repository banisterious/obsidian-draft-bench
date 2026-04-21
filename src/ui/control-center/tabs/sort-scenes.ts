import type { SceneNote } from '../../../core/discovery';

/**
 * Pure sort: returns a copy of `scenes` sorted by `dbench-order`
 * ascending. Scenes with equal orders preserve their relative input
 * order (stable sort). Extracted from the Manuscript tab so tests
 * can exercise it without pulling in modal dependencies.
 */
export function sortScenesByOrder(scenes: SceneNote[]): SceneNote[] {
	return [...scenes].sort(
		(a, b) => a.frontmatter['dbench-order'] - b.frontmatter['dbench-order']
	);
}
