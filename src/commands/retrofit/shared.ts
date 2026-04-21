import { Notice, TFile, type Plugin } from 'obsidian';
import type { RetrofitResult } from '../../core/retrofit';

/**
 * Shared helpers for retrofit palette commands.
 *
 * Each retrofit command follows the same shape: check that the active
 * file is a markdown file, run a core action against it, show a notice.
 * These helpers keep that shape consistent and the individual command
 * files small.
 */

export interface RetrofitCommandLabels {
	/** The present-tense verb phrase for success, e.g., "Set as scene". */
	success: string;
	/** The present-tense verb phrase for failure, e.g., "set as scene". */
	failureVerb: string;
}

/**
 * Return the active file if it's a markdown file, else null. Used as
 * the gate for retrofit palette commands via `checkCallback`.
 */
export function activeMarkdownFile(plugin: Plugin): TFile | null {
	const file = plugin.app.workspace.getActiveFile();
	if (!file || file.extension !== 'md') return null;
	return file;
}

/**
 * Show the appropriate notice for a retrofit result, using the
 * provided labels to format success and failure messages.
 */
export function noticeForResult(
	result: RetrofitResult,
	labels: RetrofitCommandLabels
): void {
	if (result.outcome === 'updated') {
		new Notice(`\u2713 ${labels.success}`);
	} else if (result.outcome === 'skipped') {
		new Notice(result.reason ?? 'Nothing to change.');
	} else {
		const reason = result.reason ? ` ${result.reason}` : '';
		new Notice(`Could not ${labels.failureVerb}.${reason}`);
	}
}
