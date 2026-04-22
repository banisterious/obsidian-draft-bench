import type { App, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MANUSCRIPT } from './manuscript-view';

/**
 * Reveal the Manuscript workspace leaf. Reuses an existing leaf if
 * one is already open; otherwise creates a new one in the right
 * sidebar per the D-07 default-position decision.
 *
 * The signature accepts a `preferredSide` override but callers in
 * practice should rely on the default. The parameter is exposed for
 * tests and for future writer-facing settings (post-V1) that might
 * let writers choose a left-sidebar preference.
 */
export type LeafPreferredSide = 'right' | 'left' | 'root';

export async function activateManuscriptView(
	app: App,
	preferredSide: LeafPreferredSide = 'right'
): Promise<WorkspaceLeaf | null> {
	const { workspace } = app;

	const existing = workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT);
	if (existing.length > 0) {
		await workspace.revealLeaf(existing[0]);
		return existing[0];
	}

	let leaf: WorkspaceLeaf | null;
	switch (preferredSide) {
		case 'left':
			leaf = workspace.getLeftLeaf(false);
			break;
		case 'root':
			leaf = workspace.getLeaf('tab');
			break;
		case 'right':
		default:
			leaf = workspace.getRightLeaf(false);
			break;
	}

	if (!leaf) return null;

	await leaf.setViewState({ type: VIEW_TYPE_MANUSCRIPT, active: true });
	await workspace.revealLeaf(leaf);
	return leaf;
}
