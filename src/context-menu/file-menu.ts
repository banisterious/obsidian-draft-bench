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
	setAsChapter,
	setAsDraft,
	setAsProject,
	setAsScene,
} from '../core/retrofit';
import { isChapterFrontmatter } from '../model/chapter';
import { isProjectFrontmatter } from '../model/project';
import { findChaptersInProject } from '../core/discovery';
import { isSceneFrontmatter } from '../model/scene';
import { ManuscriptBuilderModal } from '../ui/manuscript-builder/manuscript-builder-modal';
import { activateManuscriptView } from '../ui/manuscript-view/activate';
import { MoveToChapterModal } from '../ui/modals/move-to-chapter-modal';
import { NewChapterDraftModal } from '../ui/modals/new-chapter-draft-modal';
import { RepairProjectModal } from '../ui/modals/repair-project-modal';
import {
	addPresetMenuItems,
	addProjectCompileItem,
	addSceneOrDraftCompileItem,
} from './compile-items';
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
				'Show manuscript view',
				'scroll-text',
				() => {
					plugin.selection.set(fm['dbench-id']);
					void activateManuscriptView(app);
				}
			);
			addRetrofitMenuItem(
				menu,
				'Build manuscript',
				'book-up',
				() => {
					// Set selection first so the Manuscript Builder lands
					// on this project's presets when it opens.
					plugin.selection.set(fm['dbench-id']);
					new ManuscriptBuilderModal(app, plugin, linker).open();
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
			addProjectCompileItem(plugin, linker, menu, file);
		}
	}

	if (type === 'compile-preset') {
		addPresetMenuItems(plugin, linker, menu, file);
	}

	if (type === 'scene' || type === 'draft') {
		addSceneOrDraftCompileItem(plugin, menu, file);
	}

	if (type === 'scene') {
		addMoveToChapterMenuItem(plugin, menu, file);
	}

	if (type === 'chapter') {
		addNewChapterDraftMenuItem(plugin, linker, menu, file);
	}

	if (type === null) {
		addRetrofitMenuItem(menu, 'Set as project', 'folder', async () => {
			const result = await setAsProject(app, plugin.settings, file);
			noticeForSingleFile(result, {
				success: 'Set as project',
				failureVerb: 'set as project',
			});
		});
		addRetrofitMenuItem(menu, 'Set as chapter', 'book-marked', async () => {
			const result = await setAsChapter(app, plugin.settings, file);
			noticeForSingleFile(result, {
				success: 'Set as chapter',
				failureVerb: 'set as chapter',
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
	addRetrofitMenuItem(menu, 'Set as chapter', 'book-marked', () =>
		runBatch(app, settings, files, setAsChapter, { action: 'Set as chapter' })
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

/**
 * Add "Move to chapter" for a scene whose project has at least one
 * chapter. Hidden when the scene's project is chapter-less (no
 * chapter to move to) or when the project link can't be resolved.
 *
 * Single-file scope per chapter-type Q2 deferral; multi-select bulk
 * moves are post-V1.
 */
function addMoveToChapterMenuItem(
	plugin: DraftBenchPlugin,
	menu: Menu,
	file: TFile
): void {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!isSceneFrontmatter(fm)) return;
	const projectId = fm['dbench-project-id'];
	if (typeof projectId !== 'string' || projectId === '') return;

	const chapters = findChaptersInProject(plugin.app, projectId);
	if (chapters.length === 0) return;

	addRetrofitMenuItem(menu, 'Move to chapter', 'arrow-right-from-line', () => {
		new MoveToChapterModal(plugin.app, { file, frontmatter: fm }).open();
	});
}

/**
 * Add "New draft of this chapter" on chapter notes. Snapshots the
 * chapter body plus child scenes via `NewChapterDraftModal` per
 * chapter-type Step 10. Hidden when frontmatter doesn't shape as a
 * chapter (defensive).
 */
function addNewChapterDraftMenuItem(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	menu: Menu,
	file: TFile
): void {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!isChapterFrontmatter(fm)) return;

	addRetrofitMenuItem(menu, 'New draft of this chapter', 'file-stack', () => {
		new NewChapterDraftModal(
			plugin.app,
			plugin.settings,
			linker,
			{ file, frontmatter: fm }
		).open();
	});
}
