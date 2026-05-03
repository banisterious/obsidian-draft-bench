import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import { setAsSubScene } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';

/**
 * Register `Draft Bench: Set as sub-scene`. Companion to
 * `set-as-scene` / `set-as-chapter`; same shape and gating rationale.
 *
 * On success, when the inferred parent scene already has whole-scene
 * drafts, the result carries a `notice` field that `noticeForResult`
 * surfaces as an additional notification (per
 * [sub-scene-type.md § 4](../../../docs/planning/sub-scene-type.md)
 * transition handling).
 */
export function registerSetAsSubSceneCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings
): void {
	plugin.addCommand({
		id: 'set-as-sub-scene',
		name: 'Set as sub-scene',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await setAsSubScene(plugin.app, getSettings(), file);
					noticeForResult(result, {
						success: 'Set as sub-scene',
						failureVerb: 'set as sub-scene',
					});
				})();
			}
			return true;
		},
	});
}
