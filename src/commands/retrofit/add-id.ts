import type { Plugin } from 'obsidian';
import { addDbenchId } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';

/**
 * Register `Draft Bench: Add identifier`. Stamps a stable `dbench-id`
 * on the active file (typed or untyped) if one is missing; otherwise
 * skips. Named "Add identifier" rather than the literal property name
 * for sentence-case compatibility with Obsidian's plugin UI guidelines.
 */
export function registerAddIdCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: 'add-dbench-id',
		name: 'Add identifier',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await addDbenchId(plugin.app, file);
					noticeForResult(result, {
						success: 'Added identifier',
						failureVerb: 'add identifier',
					});
				})();
			}
			return true;
		},
	});
}
