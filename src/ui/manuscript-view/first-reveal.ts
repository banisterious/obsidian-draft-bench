import type DraftBenchPlugin from '../../../main';
import { activateManuscriptView } from './activate';

/**
 * Auto-reveal the Manuscript leaf on first-ever project creation in
 * this vault. Per [D-07](../../../docs/planning/decisions/D-07-control-center-split.md)
 * Block A, this is a one-shot: once the `firstProjectRevealed` flag
 * is set, subsequent project creations leave the workspace layout
 * alone. Writers who close the leaf after the auto-reveal stay
 * closed.
 *
 * Call sites: any path that creates the first project — today that's
 * the `Create project` palette command and the `Set as project`
 * retrofit action. The function is idempotent; calling it when the
 * flag is already set is a no-op.
 */
export async function revealLeafIfFirstProject(
	plugin: DraftBenchPlugin,
	newProjectId: string
): Promise<void> {
	if (plugin.settings.firstProjectRevealed) return;

	plugin.settings.firstProjectRevealed = true;
	await plugin.saveSettings();

	plugin.selection.set(newProjectId);
	await activateManuscriptView(plugin.app);
}
