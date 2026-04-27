import { TFile, type Menu, type TAbstractFile } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import {
	addDbenchId,
	completeEssentials,
	hasMissingEssentials,
	hasMissingId,
	readDbenchType,
	setAsChapter,
	setAsDraft,
	setAsProject,
	setAsScene,
} from '../core/retrofit';
import { addRetrofitMenuItem, runBatch } from './shared';

/**
 * Populate the `files-menu` event's menu for a multi-file selection.
 *
 * Smart visibility per spec § Menu scope:
 *
 *   "Multi-file. Right-click on a multi-selected group. Smart detection
 *   runs across the selection; the menu offers an action only if at
 *   least one file in the selection would change."
 *
 * Non-markdown files in the selection are ignored. Items that would
 * have no applicable targets across the whole selection are omitted.
 */
export function buildFilesMenuItems(
	plugin: DraftBenchPlugin,
	menu: Menu,
	targets: TAbstractFile[]
): void {
	const { app, settings } = plugin;
	const files = targets.filter(
		(f): f is TFile => f instanceof TFile && f.extension === 'md'
	);
	if (files.length === 0) return;

	const anyUntyped = files.some((f) => readDbenchType(app, f) === null);
	const anyIncomplete = files.some((f) => hasMissingEssentials(app, f));
	const anyMissingId = files.some((f) => hasMissingId(app, f));

	if (anyUntyped) {
		addRetrofitMenuItem(menu, 'Set as project', 'folder', () =>
			runBatch(app, settings, files, setAsProject, {
				action: 'Set as project',
			})
		);
		addRetrofitMenuItem(menu, 'Set as chapter', 'book-marked', () =>
			runBatch(app, settings, files, setAsChapter, {
				action: 'Set as chapter',
			})
		);
		addRetrofitMenuItem(menu, 'Set as scene', 'align-left', () =>
			runBatch(app, settings, files, setAsScene, { action: 'Set as scene' })
		);
		addRetrofitMenuItem(menu, 'Set as draft', 'file-text', () =>
			runBatch(app, settings, files, setAsDraft, { action: 'Set as draft' })
		);
	}

	if (anyIncomplete) {
		addRetrofitMenuItem(
			menu,
			'Complete essential properties',
			'check-circle',
			() =>
				runBatch(app, settings, files, completeEssentials, {
					action: 'Complete essential properties',
				})
		);
	}

	if (anyMissingId) {
		addRetrofitMenuItem(menu, 'Add identifier', 'hash', () =>
			runBatch(app, settings, files, addDbenchId, { action: 'Add identifier' })
		);
	}
}
