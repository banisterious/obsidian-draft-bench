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
import { NewDraftModal } from '../ui/modals/new-draft-modal';
import { RepairProjectModal } from '../ui/modals/repair-project-modal';
import {
	presetItemSpecs,
	projectCompileItemSpecs,
	sceneOrDraftCompileItemSpecs,
} from './compile-items';
import {
	noticeForSingleFile,
	populateMenuSurface,
	runBatch,
	type MenuItemSpec,
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
 *   notice. (Folder-scope smarter behavior tracked in #3.)
 *
 * Per #5, all items appear under a `Draft Bench` submenu on desktop
 * and a `Draft Bench:`-prefixed flat list on mobile. The branch is
 * handled by `populateMenuSurface`; this module just builds the spec
 * list.
 */
export function buildFileMenuItems(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	menu: Menu,
	target: TAbstractFile
): void {
	if (target instanceof TFolder) {
		const specs = buildFolderItemSpecs(plugin, target);
		populateMenuSurface(menu, specs);
		return;
	}
	if (target instanceof TFile && target.extension === 'md') {
		const specs = buildSingleFileItemSpecs(plugin, linker, target);
		populateMenuSurface(menu, specs);
	}
}

/**
 * Build the spec list for a single markdown file, respecting smart
 * visibility. Exported so `editor-menu.ts` can reuse the same logic
 * (editor-menu always operates on the active file, so the action set
 * matches single-file file-menu).
 */
export function buildSingleFileItemSpecs(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	file: TFile
): MenuItemSpec[] {
	const app = plugin.app;
	const type = readDbenchType(app, file);
	const specs: MenuItemSpec[] = [];

	if (type === 'project') {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isProjectFrontmatter(fm)) {
			specs.push(
				{
					title: 'Show manuscript view',
					icon: 'scroll-text',
					onClick: () => {
						plugin.selection.set(fm['dbench-id']);
						void activateManuscriptView(app);
					},
				},
				{
					title: 'Build manuscript',
					icon: 'book-up',
					onClick: () => {
						// Set selection first so the Manuscript Builder lands
						// on this project's presets when it opens.
						plugin.selection.set(fm['dbench-id']);
						new ManuscriptBuilderModal(app, plugin, linker).open();
					},
				},
				{
					title: 'Repair project links',
					icon: 'wrench',
					onClick: () => {
						new RepairProjectModal(app, linker, {
							file,
							frontmatter: fm,
						}).open();
					},
				}
			);
			specs.push(...projectCompileItemSpecs(plugin, linker, file));
		}
	}

	if (type === 'compile-preset') {
		specs.push(...presetItemSpecs(plugin, linker, file));
	}

	if (type === 'scene' || type === 'draft') {
		specs.push(...sceneOrDraftCompileItemSpecs(plugin, file));
	}

	if (type === 'scene') {
		specs.push(...newSceneDraftItemSpecs(plugin, linker, file));
		specs.push(...moveToChapterItemSpecs(plugin, file));
	}

	if (type === 'chapter') {
		specs.push(...newChapterDraftItemSpecs(plugin, linker, file));
	}

	if (type === null) {
		specs.push(
			{
				title: 'Set as project',
				icon: 'folder',
				onClick: async () => {
					const result = await setAsProject(app, plugin.settings, file);
					noticeForSingleFile(result, {
						success: 'Set as project',
						failureVerb: 'set as project',
					});
				},
			},
			{
				title: 'Set as chapter',
				icon: 'book-marked',
				onClick: async () => {
					const result = await setAsChapter(app, plugin.settings, file);
					noticeForSingleFile(result, {
						success: 'Set as chapter',
						failureVerb: 'set as chapter',
					});
				},
			},
			{
				title: 'Set as scene',
				icon: 'align-left',
				onClick: async () => {
					const result = await setAsScene(app, plugin.settings, file);
					noticeForSingleFile(result, {
						success: 'Set as scene',
						failureVerb: 'set as scene',
					});
				},
			},
			{
				title: 'Set as draft',
				icon: 'file-text',
				onClick: async () => {
					const result = await setAsDraft(app, plugin.settings, file);
					noticeForSingleFile(result, {
						success: 'Set as draft',
						failureVerb: 'set as draft',
					});
				},
			}
		);
		// Untyped exits here; no Complete / Add id (those apply to
		// already-typed notes that are missing pieces).
		return specs;
	}

	if (hasMissingEssentials(app, file)) {
		specs.push({
			title: 'Complete essential properties',
			icon: 'check-circle',
			onClick: async () => {
				const result = await completeEssentials(app, plugin.settings, file);
				noticeForSingleFile(result, {
					success: 'Completed essential properties',
					failureVerb: 'complete essential properties',
				});
			},
		});
	}

	if (hasMissingId(app, file)) {
		specs.push({
			title: 'Add identifier',
			icon: 'hash',
			onClick: async () => {
				const result = await addDbenchId(app, plugin.settings, file);
				noticeForSingleFile(result, {
					success: 'Added identifier',
					failureVerb: 'add identifier',
				});
			},
		});
	}

	return specs;
}

function buildFolderItemSpecs(
	plugin: DraftBenchPlugin,
	folder: TFolder
): MenuItemSpec[] {
	const app = plugin.app;
	const files = collectMarkdownFiles(app, folder);
	if (files.length === 0) return [];
	const { settings } = plugin;
	const specs: MenuItemSpec[] = [];

	// Smart `Set as project` at folder scope (#3): when the folder
	// follows the conventional folder-note pattern (a markdown file
	// matching the folder's name), target only that file rather than
	// blanket-stamping every markdown child as a project. Hidden when
	// no folder-note exists or when the folder-note is already typed
	// (idempotent skip would just produce a "no change" notice). Other
	// folder-scope retrofits keep their batch behavior since their
	// semantics naturally apply across all markdown children.
	const folderNote = findFolderNote(folder);
	if (folderNote && readDbenchType(app, folderNote) === null) {
		specs.push({
			title: 'Set as project',
			icon: 'folder',
			onClick: async () => {
				const result = await setAsProject(app, settings, folderNote);
				noticeForSingleFile(result, {
					success: 'Set as project',
					failureVerb: 'set as project',
				});
			},
		});
	}

	specs.push(
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
		},
		{
			title: 'Complete essential properties',
			icon: 'check-circle',
			onClick: () =>
				runBatch(app, settings, files, completeEssentials, {
					action: 'Complete essential properties',
				}),
		},
		{
			title: 'Add identifier',
			icon: 'hash',
			onClick: () =>
				runBatch(app, settings, files, addDbenchId, {
					action: 'Add identifier',
				}),
		}
	);
	return specs;
}

/**
 * Detect the folder-note convention (`<Folder>/<Folder>.md`,
 * case-insensitive). Returns the matching direct-child markdown file
 * if one exists, or `null` otherwise. Folder-scope `Set as project`
 * uses this to target a single file rather than blanket-stamping the
 * whole folder.
 *
 * Walks `folder.children` (direct children only) rather than the
 * recursive `collectMarkdownFiles` result so a sub-folder with a same-
 * named file (e.g., `Novel/Drafts/Novel.md`) doesn't accidentally
 * match.
 */
function findFolderNote(folder: TFolder): TFile | null {
	const target = folder.name.toLowerCase();
	for (const child of folder.children) {
		if (
			child instanceof TFile &&
			child.extension === 'md' &&
			child.basename.toLowerCase() === target
		) {
			return child;
		}
	}
	return null;
}

/**
 * "Move to chapter" for a scene whose project has at least one chapter.
 * Hidden when the scene's project is chapter-less or when the project
 * link can't be resolved. Single-file scope per chapter-type Q2 deferral.
 */
function moveToChapterItemSpecs(
	plugin: DraftBenchPlugin,
	file: TFile
): MenuItemSpec[] {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!isSceneFrontmatter(fm)) return [];
	const projectId = fm['dbench-project-id'];
	if (typeof projectId !== 'string' || projectId === '') return [];
	const chapters = findChaptersInProject(plugin.app, projectId);
	if (chapters.length === 0) return [];
	return [
		{
			title: 'Move to chapter',
			icon: 'arrow-right-from-line',
			onClick: () => {
				new MoveToChapterModal(plugin.app, { file, frontmatter: fm }).open();
			},
		},
	];
}

/**
 * "New draft of this scene" on scene notes. Mirrors the chapter-side
 * affordance via `NewDraftModal` (the same modal the
 * `Draft Bench: New draft of this scene` palette command uses).
 * Hidden when frontmatter doesn't shape as a scene (defensive).
 * Closes #9.
 */
function newSceneDraftItemSpecs(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	file: TFile
): MenuItemSpec[] {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!isSceneFrontmatter(fm)) return [];
	return [
		{
			title: 'New draft of this scene',
			icon: 'file-stack',
			onClick: () => {
				new NewDraftModal(plugin.app, plugin.settings, linker, {
					file,
					frontmatter: fm,
				}).open();
			},
		},
	];
}

/**
 * "New draft of this chapter" on chapter notes. Snapshots the chapter
 * body plus child scenes via `NewChapterDraftModal` per chapter-type
 * Step 10. Hidden when frontmatter doesn't shape as a chapter.
 */
function newChapterDraftItemSpecs(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	file: TFile
): MenuItemSpec[] {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!isChapterFrontmatter(fm)) return [];
	return [
		{
			title: 'New draft of this chapter',
			icon: 'file-stack',
			onClick: () => {
				new NewChapterDraftModal(
					plugin.app,
					plugin.settings,
					linker,
					{ file, frontmatter: fm }
				).open();
			},
		},
	];
}
