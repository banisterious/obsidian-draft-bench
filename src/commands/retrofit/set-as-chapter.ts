import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import { setAsChapter } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';

/**
 * Register `Draft Bench: Set as chapter`. Companion to
 * `set-as-scene`; same shape and gating rationale (see
 * `set-as-project` for the full doc comment).
 */
export function registerSetAsChapterCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings
): void {
	plugin.addCommand({
		id: 'set-as-chapter',
		name: 'Set as chapter',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await setAsChapter(plugin.app, getSettings(), file);
					noticeForResult(result, {
						success: 'Set as chapter',
						failureVerb: 'set as chapter',
					});
				})();
			}
			return true;
		},
	});
}
