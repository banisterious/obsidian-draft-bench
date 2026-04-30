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
import {
	populateMenuSurface,
	runBatch,
	type MenuItemSpec,
} from './shared';

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
 *
 * Per #5, items appear under a `Draft Bench` submenu on desktop and a
 * `Draft Bench:`-prefixed flat list on mobile.
 */
export function buildFilesMenuItems(
	plugin: DraftBenchPlugin,
	menu: Menu,
	targets: TAbstractFile[]
): void {
	const specs = buildFilesMenuItemSpecs(plugin, targets);
	populateMenuSurface(menu, specs);
}

function buildFilesMenuItemSpecs(
	plugin: DraftBenchPlugin,
	targets: TAbstractFile[]
): MenuItemSpec[] {
	const { app, settings } = plugin;
	const files = targets.filter(
		(f): f is TFile => f instanceof TFile && f.extension === 'md'
	);
	if (files.length === 0) return [];

	const anyUntyped = files.some((f) => readDbenchType(app, f) === null);
	const anyIncomplete = files.some((f) => hasMissingEssentials(app, f));
	const anyMissingId = files.some((f) => hasMissingId(app, f));

	const specs: MenuItemSpec[] = [];

	if (anyUntyped) {
		specs.push(
			{
				title: 'Set as project',
				icon: 'folder',
				onClick: () =>
					runBatch(app, settings, files, setAsProject, {
						action: 'Set as project',
					}),
			},
			{
				title: 'Set as chapter',
				icon: 'book-marked',
				onClick: () =>
					runBatch(app, settings, files, setAsChapter, {
						action: 'Set as chapter',
					}),
			},
			{
				title: 'Set as scene',
				icon: 'align-left',
				onClick: () =>
					runBatch(app, settings, files, setAsScene, {
						action: 'Set as scene',
					}),
			},
			{
				title: 'Set as draft',
				icon: 'file-text',
				onClick: () =>
					runBatch(app, settings, files, setAsDraft, {
						action: 'Set as draft',
					}),
			}
		);
	}

	if (anyIncomplete) {
		specs.push({
			title: 'Complete essential properties',
			icon: 'check-circle',
			onClick: () =>
				runBatch(app, settings, files, completeEssentials, {
					action: 'Complete essential properties',
				}),
		});
	}

	if (anyMissingId) {
		specs.push({
			title: 'Add identifier',
			icon: 'hash',
			onClick: () =>
				runBatch(app, settings, files, addDbenchId, {
					action: 'Add identifier',
				}),
		});
	}

	return specs;
}
