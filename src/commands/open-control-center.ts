import type { Plugin } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftBenchLinker } from '../core/linker';
import { ControlCenterModal } from '../ui/control-center/control-center-modal';

/**
 * Register the "Draft Bench: Open control center" command.
 *
 * Post-D-07 scope: opens the action-shaped modal (Templates +
 * Compile tabs). Manuscript / project-overview content lives in the
 * Manuscript leaf — use `Draft Bench: Show manuscript view` for
 * that surface.
 */
export function registerOpenControlCenterCommand(
	plugin: Plugin,
	getPlugin: () => DraftBenchPlugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'open-control-center',
		name: 'Open control center',
		callback: () => {
			new ControlCenterModal(plugin.app, getPlugin(), linker).open();
		},
	});
}
