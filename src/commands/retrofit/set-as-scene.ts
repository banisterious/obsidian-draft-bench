import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import { setAsScene } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';

/**
 * Register `Draft Bench: Set as scene`. Companion to `set-as-project`;
 * see that file's doc comment for the gating rationale.
 */
export function registerSetAsSceneCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings
): void {
	plugin.addCommand({
		id: 'set-as-scene',
		name: 'Set as scene',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await setAsScene(plugin.app, getSettings(), file);
					noticeForResult(result, {
						success: 'Set as scene',
						failureVerb: 'set as scene',
					});
				})();
			}
			return true;
		},
	});
}
