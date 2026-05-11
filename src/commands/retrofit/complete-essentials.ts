import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import { completeEssentials } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';
import { COMMAND_IDS } from '../ids';

/**
 * Register `Draft Bench: Complete essential properties`. Dispatches
 * to the stamper matching the existing `dbench-type`; skips cleanly
 * when the note is untyped or fully stamped.
 */
export function registerCompleteEssentialsCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings
): void {
	plugin.addCommand({
		id: COMMAND_IDS.COMPLETE_ESSENTIAL_PROPERTIES,
		name: 'Complete essential properties',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await completeEssentials(
						plugin.app,
						getSettings(),
						file
					);
					noticeForResult(result, {
						success: 'Completed essential properties',
						failureVerb: 'complete essential properties',
					});
				})();
			}
			return true;
		},
	});
}
