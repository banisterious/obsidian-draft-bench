import { Notice, type App, type Menu, type TFile } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import {
	applyToFiles,
	type BatchResult,
	type RetrofitResult,
} from '../core/retrofit';

/**
 * Shared context-menu helpers.
 *
 * Retrofit items live under Obsidian's standard "action" menu section
 * (a consistent grouping users already recognize from other plugins).
 * Single-file runs show the plain notice from `noticeForResult`; batch
 * runs format a summary in the `Set as scene: 5 updated, 3 skipped, 1 error` shape
 * per spec § Feedback.
 */

export interface BatchNoticeLabels {
	/** The action verb phrase in the summary, e.g., "Set as scene". */
	action: string;
}

/**
 * Show the notice for a single-file retrofit result (success, skipped,
 * or error). Mirrors the palette-command notice shape for consistency.
 */
export function noticeForSingleFile(
	result: RetrofitResult,
	labels: { success: string; failureVerb: string }
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

/**
 * Show the batch summary notice, following the spec's format:
 *
 *   Set as scene: 5 updated, 3 skipped, 1 error
 *
 * Uses "skipped" (rather than the spec's "already typed") because
 * skip reasons vary across actions (already typed, already has id,
 * already complete, etc.). A single generic label keeps the format
 * consistent across actions.
 */
export function noticeForBatch(
	result: BatchResult,
	labels: BatchNoticeLabels
): void {
	const parts: string[] = [];
	if (result.updated > 0) parts.push(`${result.updated} updated`);
	if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
	if (result.errors > 0) {
		parts.push(`${result.errors} ${result.errors === 1 ? 'error' : 'errors'}`);
	}
	if (parts.length === 0) {
		new Notice(`${labels.action}: no files changed.`);
		return;
	}
	const prefix = result.errors === 0 ? '\u2713 ' : '';
	new Notice(`${prefix}${labels.action}: ${parts.join(', ')}.`);
}

/**
 * Run a retrofit action against a list of files and show the
 * batch summary. Thin convenience wrapper around `applyToFiles`
 * and `noticeForBatch`.
 */
export async function runBatch(
	app: App,
	settings: DraftBenchSettings,
	files: TFile[],
	action: (
		app: App,
		settings: DraftBenchSettings,
		file: TFile
	) => Promise<RetrofitResult>,
	labels: BatchNoticeLabels
): Promise<void> {
	const result = await applyToFiles(app, settings, files, action);
	noticeForBatch(result, labels);
}

/**
 * Add a retrofit item to a context menu. The item is placed in
 * Obsidian's "action" section so Draft Bench items cluster with
 * other action verbs.
 */
export function addRetrofitMenuItem(
	menu: Menu,
	title: string,
	icon: string,
	onClick: () => void | Promise<void>
): void {
	menu.addItem((item) => {
		item
			.setTitle(title)
			.setIcon(icon)
			.setSection('action')
			.onClick(() => void onClick());
	});
}
