import { TFile, TFolder, type Menu, type TAbstractFile } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftBenchLinker } from '../core/linker';
import {
	addDbenchId,
	collectMarkdownFiles,
	completeEssentials,
	hasMissingEssentials,
	hasMissingId,
	readDbenchType,
	setAsDraft,
	setAsProject,
	setAsScene,
} from '../core/retrofit';
import { isProjectFrontmatter } from '../model/project';
import { ControlCenterModal } from '../ui/control-center/control-center-modal';
import { RepairProjectModal } from '../ui/modals/repair-project-modal';
import {
	addRetrofitMenuItem,
	noticeForSingleFile,
	runBatch,
} from './shared';

/**
 * Populate the `file-menu` event's menu for a single file or folder.
 *
 * Smart visibility per spec § Smart menu visibility:
 * - Untyped markdown: show Set as project / scene / draft.
 * - Typed markdown: show Complete / Add id when something is missing.
 * - Fully-stamped markdown: no retrofit items.
 * - Folder: always show all five retrofit items (batch). Each action
 *   skips non-applicable files and aggregates results into a summary
 *   notice.
 */
export function buildFileMenuItems(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	menu: Menu,
	target: TAbstractFile
): void {
	if (target instanceof TFolder) {
		buildFolderItems(plugin, menu, target);
		return;
	}
	if (target instanceof TFile && target.extension === 'md') {
		buildSingleFileItems(plugin, linker, menu, target);
	}
}

function buildSingleFileItems(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	menu: Menu,
	file: TFile
): void {
	const app = plugin.app;
	const type = readDbenchType(app, file);

	if (type === 'project') {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isProjectFrontmatter(fm)) {
			addRetrofitMenuItem(
				menu,
				'Open control center',
				'pencil-line',
				() => {
					new ControlCenterModal(app, plugin, linker, {
						file,
						frontmatter: fm,
					}).open();
				}
			);
			addRetrofitMenuItem(
				menu,
				'Repair project links',
				'wrench',
				() => {
					new RepairProjectModal(app, linker, {
						file,
						frontmatter: fm,
					}).open();
				}
			);
		}
	}

	if (type === null) {
		addRetrofitMenuItem(menu, 'Set as project', 'folder', async () => {
			const result = await setAsProject(app, plugin.settings, file);
			noticeForSingleFile(result, {
				success: 'Set as project',
				failureVerb: 'set as project',
			});
		});
		addRetrofitMenuItem(menu, 'Set as scene', 'align-left', async () => {
			const result = await setAsScene(app, plugin.settings, file);
			noticeForSingleFile(result, {
				success: 'Set as scene',
				failureVerb: 'set as scene',
			});
		});
		addRetrofitMenuItem(menu, 'Set as draft', 'file-text', async () => {
			const result = await setAsDraft(app, plugin.settings, file);
			noticeForSingleFile(result, {
				success: 'Set as draft',
				failureVerb: 'set as draft',
			});
		});
		return;
	}

	if (hasMissingEssentials(app, file)) {
		addRetrofitMenuItem(
			menu,
			'Complete essential properties',
			'check-circle',
			async () => {
				const result = await completeEssentials(app, plugin.settings, file);
				noticeForSingleFile(result, {
					success: 'Completed essential properties',
					failureVerb: 'complete essential properties',
				});
			}
		);
	}

	if (hasMissingId(app, file)) {
		addRetrofitMenuItem(menu, 'Add identifier', 'hash', async () => {
			const result = await addDbenchId(app, plugin.settings, file);
			noticeForSingleFile(result, {
				success: 'Added identifier',
				failureVerb: 'add identifier',
			});
		});
	}
}

function buildFolderItems(
	plugin: DraftBenchPlugin,
	menu: Menu,
	folder: TFolder
): void {
	const app = plugin.app;
	const files = collectMarkdownFiles(app, folder);
	if (files.length === 0) return;

	const { settings } = plugin;
	addRetrofitMenuItem(menu, 'Set as project', 'folder', () =>
		runBatch(app, settings, files, setAsProject, { action: 'Set as project' })
	);
	addRetrofitMenuItem(menu, 'Set as scene', 'align-left', () =>
		runBatch(app, settings, files, setAsScene, { action: 'Set as scene' })
	);
	addRetrofitMenuItem(menu, 'Set as draft', 'file-text', () =>
		runBatch(app, settings, files, setAsDraft, { action: 'Set as draft' })
	);
	addRetrofitMenuItem(
		menu,
		'Complete essential properties',
		'check-circle',
		() =>
			runBatch(app, settings, files, completeEssentials, {
				action: 'Complete essential properties',
			})
	);
	addRetrofitMenuItem(menu, 'Add identifier', 'hash', () =>
		runBatch(app, settings, files, addDbenchId, { action: 'Add identifier' })
	);
}
