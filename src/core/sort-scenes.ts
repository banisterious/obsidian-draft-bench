import type { SceneNote, SubSceneNote } from './discovery';

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

/**
 * Pure sort: returns a copy of `subScenes` sorted by `dbench-order`
 * ascending. Same shape as `sortScenesByOrder`; separate function
 * because `SubSceneNote` doesn't structurally satisfy `SceneNote`
 * (different `dbench-type` discriminator). Consumed by the Manuscript
 * view's scene-card body to render sub-scenes in story order.
 */
export function sortSubScenesByOrder(
	subScenes: SubSceneNote[]
): SubSceneNote[] {
	return [...subScenes].sort(
		(a, b) => a.frontmatter['dbench-order'] - b.frontmatter['dbench-order']
	);
}
