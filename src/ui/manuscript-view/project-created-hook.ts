import type DraftBenchPlugin from '../../../main';
import { activateManuscriptView } from './activate';

/**
 * Post-creation hook fired after a successful `createProject` call.
 * Does two things:
 *
 * 1. **Always updates plugin selection** to the new project. If the
 *    Manuscript leaf is open, it re-renders to show the new project;
 *    if not, next time it opens it'll be selected. Writers who just
 *    created a project almost always want to see it, so this is
 *    unconditional.
 *
 * 2. **On first-ever project creation, also reveals the leaf.** Gated
 *    by `settings.firstProjectRevealed` (one-shot flag). Per
 *    [D-07](../../../docs/planning/decisions/D-07-control-center-split.md)
 *    Block A, the reveal is a one-time nudge for new writers; after
 *    the flag is set, subsequent creations respect whatever layout
 *    the writer has chosen (closed leaf stays closed).
 *
 * Call sites: any path that creates a project — today that's the
 * `Create project` palette command. Retrofit paths (`Set as project`)
 * deliberately don't trigger this hook: retrofit writers are
 * converting existing notes and typically have their workspace
 * configured already.
 */
export async function onProjectCreated(
	plugin: DraftBenchPlugin,
	newProjectId: string
): Promise<void> {
	plugin.selection.set(newProjectId);

	if (!plugin.settings.firstProjectRevealed) {
		plugin.settings.firstProjectRevealed = true;
		await plugin.saveSettings();
		await activateManuscriptView(plugin.app);
	}
}
