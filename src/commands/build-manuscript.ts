import type { Plugin } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftBenchLinker } from '../core/linker';
import { ManuscriptBuilderModal } from '../ui/manuscript-builder/manuscript-builder-modal';

/**
 * Register the "Draft Bench: Build manuscript" command.
 *
 * Opens the Manuscript Builder modal — the focused, dedicated
 * surface for editing a project's compile presets and triggering
 * compile runs. Replaces the retired "Open control center" command
 * (the Control Center concept stays parked for a future hub when
 * DB has enough cross-cutting content; see
 * docs/planning/control-center-reference.md).
 *
 * Verb-form command name complements the noun-form modal title
 * ("Manuscript Builder"), per the convention writers can read as
 * "what action am I taking?" -> "build manuscript" and "where am I?"
 * -> "Manuscript Builder."
 */
export function registerBuildManuscriptCommand(
	plugin: Plugin,
	getPlugin: () => DraftBenchPlugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'build-manuscript',
		name: 'Build manuscript',
		callback: () => {
			new ManuscriptBuilderModal(
				plugin.app,
				getPlugin(),
				linker
			).open();
		},
	});
}
