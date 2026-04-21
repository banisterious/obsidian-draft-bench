import { TFile, type App, type Menu, type TAbstractFile } from 'obsidian';
import {
	addDbenchId,
	completeEssentials,
	hasMissingEssentials,
	hasMissingId,
	readDbenchType,
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
	app: App,
	menu: Menu,
	targets: TAbstractFile[]
): void {
	const files = targets.filter(
		(f): f is TFile => f instanceof TFile && f.extension === 'md'
	);
	if (files.length === 0) return;

	const anyUntyped = files.some((f) => readDbenchType(app, f) === null);
	const anyIncomplete = files.some((f) => hasMissingEssentials(app, f));
	const anyMissingId = files.some((f) => hasMissingId(app, f));

	if (anyUntyped) {
		addRetrofitMenuItem(menu, 'Set as project', 'folder', () =>
			runBatch(app, files, setAsProject, { action: 'Set as project' })
		);
		addRetrofitMenuItem(menu, 'Set as scene', 'align-left', () =>
			runBatch(app, files, setAsScene, { action: 'Set as scene' })
		);
		addRetrofitMenuItem(menu, 'Set as draft', 'file-text', () =>
			runBatch(app, files, setAsDraft, { action: 'Set as draft' })
		);
	}

	if (anyIncomplete) {
		addRetrofitMenuItem(
			menu,
			'Complete essential properties',
			'check-circle',
			() =>
				runBatch(app, files, completeEssentials, {
					action: 'Complete essential properties',
				})
		);
	}

	if (anyMissingId) {
		addRetrofitMenuItem(menu, 'Add identifier', 'hash', () =>
			runBatch(app, files, addDbenchId, { action: 'Add identifier' })
		);
	}
}
