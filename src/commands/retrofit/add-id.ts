import type { Plugin } from 'obsidian';
import { addDbenchId } from '../../core/retrofit';
import { activeMarkdownFile, noticeForResult } from './shared';

/**
 * Register `Draft Bench: Add dbench-id`. Stamps an id on the active
 * file (typed or untyped) if one is missing; otherwise skips.
 */
export function registerAddIdCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: 'add-dbench-id',
		// "dbench-id" is a literal plugin frontmatter property name —
		// writers recognize it by that exact spelling.
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		name: 'Add dbench-id',
		checkCallback: (checking) => {
			const file = activeMarkdownFile(plugin);
			if (!file) return false;
			if (!checking) {
				void (async () => {
					const result = await addDbenchId(plugin.app, file);
					noticeForResult(result, {
						success: 'Added dbench-id',
						failureVerb: 'add dbench-id',
					});
				})();
			}
			return true;
		},
	});
}
