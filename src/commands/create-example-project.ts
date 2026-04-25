import { Notice } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftBenchLinker } from '../core/linker';
import { createExampleProject } from '../core/example-project';

/**
 * Register the "Draft Bench: Create example project" command.
 *
 * Wraps the `createExampleProject` orchestration with user-facing
 * concerns: success / already-exists / error notices, and opening the
 * project note in the active leaf when creation succeeds or the
 * example was already present. Per the onboarding planning doc, the
 * already-exists path doesn't overwrite — it surfaces the existing
 * project so writers who deleted only the frontmatter (rather than the
 * whole folder) still get a frictionless "show me where it is"
 * experience.
 *
 * Used by the onboarding welcome modal's "Try with an example
 * project" CTA in addition to the palette command.
 */
export function registerCreateExampleProjectCommand(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'create-example-project',
		name: 'Create example project',
		callback: () => {
			void runCreateExampleProject(plugin, linker);
		},
	});
}

/**
 * Run the orchestration and surface the outcome. Exported so the
 * welcome modal's CTA can call the same flow (palette command and
 * modal button share one entry point — different surfaces, identical
 * behavior).
 */
export async function runCreateExampleProject(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker
): Promise<void> {
	try {
		const result = await createExampleProject(
			plugin.app,
			plugin.settings,
			linker
		);
		if (result.outcome === 'created') {
			new Notice(`✓ Created example project "${result.file.basename}"`);
		} else {
			new Notice(`Example project already exists. Opening "${result.file.basename}".`);
		}
		const leaf = plugin.app.workspace.getLeaf(false);
		await leaf.openFile(result.file);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		new Notice(`Could not create example project: ${message}`);
	}
}
