import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import { setAsDraft } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';

/**
 * Register `Draft Bench: Set as draft`. Companion to `set-as-project`;
 * see that file's doc comment for the gating rationale. The core
 * action also attempts to infer `dbench-draft-number` from the
 * filename (see D-05 open follow-up).
 */
export function registerSetAsDraftCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings
): void {
	plugin.addCommand({
		id: 'set-as-draft',
		name: 'Set as draft',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await setAsDraft(plugin.app, getSettings(), file);
					noticeForResult(result, {
						success: 'Set as draft',
						failureVerb: 'set as draft',
					});
				})();
			}
			return true;
		},
	});
}
