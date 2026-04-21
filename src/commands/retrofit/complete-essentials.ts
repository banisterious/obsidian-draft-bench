import type { Plugin } from 'obsidian';
import { completeEssentials } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';

/**
 * Register `Draft Bench: Complete essential properties`. Dispatches
 * to the stamper matching the existing `dbench-type`; skips cleanly
 * when the note is untyped or fully stamped.
 */
export function registerCompleteEssentialsCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: 'complete-essential-properties',
		name: 'Complete essential properties',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await completeEssentials(plugin.app, file);
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
