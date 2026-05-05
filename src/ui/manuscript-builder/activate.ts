import type { App, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MANUSCRIPT_BUILDER } from './manuscript-builder-view';

/**
 * Reveal the Manuscript Builder workspace leaf. Reuses an existing
 * leaf if one is already open (multi-leaf prevention per the #27
 * design ratification — single Builder leaf only); otherwise creates
 * a new one as a main-pane tab.
 *
 * Default placement is `'tab'` (main pane) rather than the right
 * sidebar that the Manuscript view uses. The Builder leaf carries
 * the Preview tab's prose-reading surface and benefits from the
 * wider real estate of a main-pane tab; writers who prefer it in a
 * sidebar can drag the tab there.
 */
export type LeafPreferredSide = 'tab' | 'right' | 'left';

export async function activateManuscriptBuilderView(
	app: App,
	preferredSide: LeafPreferredSide = 'tab'
): Promise<WorkspaceLeaf | null> {
	const { workspace } = app;

	const existing = workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT_BUILDER);
	if (existing.length > 0) {
		await workspace.revealLeaf(existing[0]);
		return existing[0];
	}

	let leaf: WorkspaceLeaf | null;
	switch (preferredSide) {
		case 'left':
			leaf = workspace.getLeftLeaf(false);
			break;
		case 'right':
			leaf = workspace.getRightLeaf(false);
			break;
		case 'tab':
		default:
			leaf = workspace.getLeaf('tab');
			break;
	}

	if (!leaf) return null;

	await leaf.setViewState({
		type: VIEW_TYPE_MANUSCRIPT_BUILDER,
		active: true,
	});
	await workspace.revealLeaf(leaf);
	return leaf;
}
