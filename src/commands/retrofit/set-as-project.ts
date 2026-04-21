import type { Plugin } from 'obsidian';
import { setAsProject } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';

/**
 * Register `Draft Bench: Set as project`.
 *
 * Gated to markdown files via `checkCallback`. The core layer refuses
 * already-typed notes (returns `skipped`), so the command stays visible
 * in the palette and surfaces a helpful notice when it can't apply.
 */
export function registerSetAsProjectCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: 'set-as-project',
		name: 'Set as project',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await setAsProject(plugin.app, file);
					noticeForResult(result, {
						success: 'Set as project',
						failureVerb: 'set as project',
					});
				})();
			}
			return true;
		},
	});
}
