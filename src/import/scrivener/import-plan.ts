import type { DraftBenchSettings } from '../../model/settings';
import { resolveProjectPaths } from '../../core/projects';
import {
	effectiveTarget,
	type HierarchyMapping,
	type HierarchyTarget,
} from './hierarchy-mapping';
import type { BinderItem, ScrivProject } from './scrivx-parser';
import type { ImportOptions } from './import-wizard-modal';

/**
 * Pure import-plan builder consumed by the wizard's Preview step (10
 * of [scrivener-import.md § Implementation](../../../docs/planning/scrivener-import.md))
 * and (eventually) the Import write pass (step 11).
 *
 * The plan is a flat list of `PlanEntry` records (project folder /
 * project note / chapter notes / scene notes / sub-scene notes) in
 * creation order, plus aggregate counts and warnings. Pure: no I/O,
 * no DOM. Dest paths are resolved from `settings.projectsFolder`,
 * `settings.chaptersFolder`, `settings.scenesFolder`, and
 * `settings.subScenesFolder` templates against string project /
 * chapter / scene basenames — mirrors the path resolvers in
 * `core/projects.ts`, `core/chapters.ts`, `core/scenes.ts`,
 * `core/sub-scenes.ts` but takes plain strings (no TFile).
 */

/** Filesystem-unsafe characters (excluding `:`, which is handled
 *  separately to preserve the typical "Word: Word" -> "Word - Word"
 *  spacing rather than producing "Word- Word"). The `-` replacement
 *  matches `core/drafts.ts`'s `resolveDraftFilename` for the
 *  remaining characters. */
const FILENAME_UNSAFE = /[\\/*?"<>|]/g;

export type PlanEntryKind =
	| 'folder'
	| 'project-note'
	| 'chapter-note'
	| 'scene-note'
	| 'sub-scene-note';

export interface PlanEntry {
	kind: PlanEntryKind;
	/** Vault path that will be created. */
	path: string;
	/** Source binder item ID, or null for synthetic entries (e.g.,
	 *  the project folder itself). */
	sourceId: string | null;
	/** Source binder item title for tree display, or null. */
	sourceTitle: string | null;
	/** Indent depth for tree rendering. 0 = project-level entries
	 *  (folder + note); 1 = chapters; 2 = scenes; 3 = sub-scenes. */
	depth: number;
}

export interface PlanCounts {
	chapters: number;
	scenes: number;
	subScenes: number;
	extrasAbove: number;
	extrasBelow: number;
	skipped: number;
	images: number;
}

export interface ImportPlan {
	entries: PlanEntry[];
	counts: PlanCounts;
	warnings: string[];
}

/**
 * Build an import plan from the wizard's accumulated form data. The
 * plan describes what step 11's write pass will create; step 10
 * renders it as a preview tree + count summary + warnings.
 *
 * Currently does NOT enumerate inline-image extractions or snapshot
 * files; those require RTF body parsing / vault-adapter walks the
 * Preview step doesn't perform. Image and snapshot tallies surface
 * via `counts` only (per binder Image-typed items + the existing
 * `snapshotCount` from the Parse step).
 */
export function buildImportPlan(
	project: ScrivProject,
	hierarchyAuto: HierarchyMapping,
	hierarchyOverrides: Map<string, HierarchyTarget>,
	destinationName: string,
	settings: DraftBenchSettings,
	_options: ImportOptions
): ImportPlan {
	const entries: PlanEntry[] = [];
	const counts: PlanCounts = {
		chapters: 0,
		scenes: 0,
		subScenes: 0,
		extrasAbove: 0,
		extrasBelow: 0,
		skipped: 0,
		images: 0,
	};
	const warnings: string[] = [];

	const projectName = sanitize(destinationName.trim());
	if (projectName === '') {
		warnings.push(
			'Destination project name is empty; preview is incomplete.'
		);
		return { entries, counts, warnings };
	}

	const projectPaths = resolveProjectPaths(settings, {
		title: projectName,
		shape: 'folder',
	});
	if (projectPaths.folderPath !== '') {
		entries.push({
			kind: 'folder',
			path: projectPaths.folderPath,
			sourceId: null,
			sourceTitle: null,
			depth: 0,
		});
	}
	entries.push({
		kind: 'project-note',
		path: projectPaths.filePath,
		sourceId: null,
		sourceTitle: projectName,
		depth: 0,
	});

	const draftRoot = project.binder.find((b) => b.type === 'DraftFolder');
	if (!draftRoot) {
		warnings.push(
			'No manuscript folder in this bundle — only the project note will be created.'
		);
		return { entries, counts, warnings };
	}

	// Walk the Draft subtree, tracking the most-recent chapter and
	// scene path so child scenes / sub-scenes can resolve their
	// folder hierarchy. The walker preserves binder order.
	walkDraft(
		draftRoot.children,
		hierarchyAuto,
		hierarchyOverrides,
		projectName,
		projectPaths.folderPath,
		settings,
		entries,
		counts,
		null /* current chapter basename */,
		null /* current scene basename */,
		null /* current scene folder */
	);

	// Cross-cutting Image tally across the whole project (not just
	// Draft). Inline images embedded in RTF bodies aren't tallied
	// here — they surface during the actual import.
	walkAll(project.binder, (item) => {
		if (item.type === 'Image') counts.images += 1;
	});

	if (counts.extrasBelow > 0) {
		warnings.push(
			`${counts.extrasBelow} item${counts.extrasBelow === 1 ? '' : 's'} will merge into parent body as nested headings.`
		);
	}
	if (counts.extrasAbove > 0) {
		warnings.push(
			`${counts.extrasAbove} item${counts.extrasAbove === 1 ? '' : 's'} will become "scrivener-part" frontmatter on contained chapters.`
		);
	}
	if (counts.skipped > 0) {
		warnings.push(
			`${counts.skipped} item${counts.skipped === 1 ? '' : 's'} will be skipped (not imported).`
		);
	}

	return { entries, counts, warnings };
}

function walkDraft(
	items: BinderItem[],
	hierarchyAuto: HierarchyMapping,
	hierarchyOverrides: Map<string, HierarchyTarget>,
	projectName: string,
	projectFolderPath: string,
	settings: DraftBenchSettings,
	entries: PlanEntry[],
	counts: PlanCounts,
	currentChapterBasename: string | null,
	currentSceneBasename: string | null,
	currentSceneFolderPath: string | null
): void {
	for (const item of items) {
		const target = effectiveTarget(item.id, hierarchyAuto, hierarchyOverrides);
		const sanitizedTitle = sanitize(item.title);

		switch (target) {
			case 'chapter': {
				counts.chapters += 1;
				const chapterFolder = resolveChapterFolder(
					settings,
					projectName,
					projectFolderPath
				);
				const chapterPath =
					chapterFolder === ''
						? `${sanitizedTitle}.md`
						: `${chapterFolder}/${sanitizedTitle}.md`;
				if (chapterFolder !== '' && chapterFolder !== projectFolderPath) {
					entries.push({
						kind: 'folder',
						path: chapterFolder,
						sourceId: null,
						sourceTitle: null,
						depth: 1,
					});
				}
				entries.push({
					kind: 'chapter-note',
					path: chapterPath,
					sourceId: item.id,
					sourceTitle: item.title,
					depth: 1,
				});
				walkDraft(
					item.children,
					hierarchyAuto,
					hierarchyOverrides,
					projectName,
					projectFolderPath,
					settings,
					entries,
					counts,
					sanitizedTitle,
					null,
					null
				);
				break;
			}
			case 'scene': {
				counts.scenes += 1;
				const sceneFolder = resolveSceneFolder(
					settings,
					projectName,
					projectFolderPath,
					currentChapterBasename
				);
				const scenePath =
					sceneFolder === ''
						? `${sanitizedTitle}.md`
						: `${sceneFolder}/${sanitizedTitle}.md`;
				entries.push({
					kind: 'scene-note',
					path: scenePath,
					sourceId: item.id,
					sourceTitle: item.title,
					depth: 2,
				});
				walkDraft(
					item.children,
					hierarchyAuto,
					hierarchyOverrides,
					projectName,
					projectFolderPath,
					settings,
					entries,
					counts,
					currentChapterBasename,
					sanitizedTitle,
					sceneFolder
				);
				break;
			}
			case 'sub-scene': {
				counts.subScenes += 1;
				const subSceneFolder = resolveSubSceneFolder(
					settings,
					projectName,
					currentSceneFolderPath ?? projectFolderPath,
					currentSceneBasename
				);
				const subScenePath =
					subSceneFolder === ''
						? `${sanitizedTitle}.md`
						: `${subSceneFolder}/${sanitizedTitle}.md`;
				entries.push({
					kind: 'sub-scene-note',
					path: subScenePath,
					sourceId: item.id,
					sourceTitle: item.title,
					depth: 3,
				});
				// Sub-scenes don't usually have children, but if they
				// do (extras-below) walk through to count them.
				walkDraft(
					item.children,
					hierarchyAuto,
					hierarchyOverrides,
					projectName,
					projectFolderPath,
					settings,
					entries,
					counts,
					currentChapterBasename,
					currentSceneBasename,
					currentSceneFolderPath
				);
				break;
			}
			case 'extras-above':
				counts.extrasAbove += 1;
				walkDraft(
					item.children,
					hierarchyAuto,
					hierarchyOverrides,
					projectName,
					projectFolderPath,
					settings,
					entries,
					counts,
					currentChapterBasename,
					currentSceneBasename,
					currentSceneFolderPath
				);
				break;
			case 'extras-below':
				counts.extrasBelow += 1;
				walkDraft(
					item.children,
					hierarchyAuto,
					hierarchyOverrides,
					projectName,
					projectFolderPath,
					settings,
					entries,
					counts,
					currentChapterBasename,
					currentSceneBasename,
					currentSceneFolderPath
				);
				break;
			case 'skip':
				counts.skipped += 1;
				break;
		}
	}
}

function resolveChapterFolder(
	settings: DraftBenchSettings,
	projectName: string,
	projectFolderPath: string
): string {
	const relative = settings.chaptersFolder
		.replace(/\{project\}/g, projectName)
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	if (relative === '') return projectFolderPath;
	return projectFolderPath === ''
		? relative
		: `${projectFolderPath}/${relative}`;
}

function resolveSceneFolder(
	settings: DraftBenchSettings,
	projectName: string,
	projectFolderPath: string,
	chapterBasename: string | null
): string {
	const relative = settings.scenesFolder
		.replace(/\{project\}/g, projectName)
		.replace(/\{chapter\}/g, chapterBasename ?? '')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	if (relative === '') return projectFolderPath;
	return projectFolderPath === ''
		? relative
		: `${projectFolderPath}/${relative}`;
}

function resolveSubSceneFolder(
	settings: DraftBenchSettings,
	projectName: string,
	sceneFolderPath: string,
	sceneBasename: string | null
): string {
	const relative = settings.subScenesFolder
		.replace(/\{project\}/g, projectName)
		.replace(/\{scene\}/g, sceneBasename ?? '')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	if (relative === '') return sceneFolderPath;
	return sceneFolderPath === ''
		? relative
		: `${sceneFolderPath}/${relative}`;
}

function sanitize(name: string): string {
	return name
		.replace(/\s*:\s*/g, ' - ')
		.replace(FILENAME_UNSAFE, '-')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

function walkAll(
	items: BinderItem[],
	visit: (item: BinderItem) => void
): void {
	for (const item of items) {
		visit(item);
		walkAll(item.children, visit);
	}
}
