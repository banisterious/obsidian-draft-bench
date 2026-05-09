import type { DraftBenchSettings } from '../../model/settings';
import { resolveProjectPaths } from '../../core/projects';
import {
	effectiveTarget,
	type HierarchyMapping,
	type HierarchyTarget,
} from './hierarchy-mapping';
import type { BinderItem, ScrivProject } from './scrivx-parser';
import type { ImportOptions, SnapshotCap } from './import-wizard-modal';
import type { SnapshotMetadata } from './snapshots';
import {
	applySnapshotFilenameTemplate,
	disambiguateFilename,
} from './snapshot-filename';

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
	| 'sub-scene-note'
	| 'snapshot-draft';

export interface PlanEntry {
	kind: PlanEntryKind;
	/** Vault path that will be created. */
	path: string;
	/** Source binder item ID, or null for synthetic entries (e.g.,
	 *  the project folder itself). For `snapshot-draft` entries, this
	 *  is the parent scene's binder UUID. */
	sourceId: string | null;
	/** Source binder item title for tree display, or null. For
	 *  `snapshot-draft` entries, this is the snapshot's title (verbatim
	 *  from index.xml — may be the literal "Untitled Snapshot"). */
	sourceTitle: string | null;
	/** Indent depth for tree rendering. 0 = project-level entries
	 *  (folder + note); 1 = chapters; 2 = scenes; 3 = sub-scenes and
	 *  snapshot drafts. */
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
	/** Total snapshots that will be imported as drafts (after the
	 *  per-scene cap is applied). Zero when `importSnapshots` is off. */
	snapshots: number;
	/** Total snapshots that will be skipped due to the per-scene cap.
	 *  Surfaced as a warning so writers know what's being dropped. */
	snapshotsCapped: number;
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
 * When `options.importSnapshots` is true and `snapshotsByUuid` carries
 * per-document metadata, the plan emits one `snapshot-draft` entry per
 * kept snapshot (after the per-scene cap is applied) alongside the
 * scene it belongs to. When the toggle is off (default), snapshot
 * arguments are ignored and no draft entries are emitted.
 *
 * Inline-image extractions are NOT enumerated — those require RTF body
 * parsing the Preview step doesn't perform; the Image count surfaces
 * binder Image-typed items only.
 */
export function buildImportPlan(
	project: ScrivProject,
	hierarchyAuto: HierarchyMapping,
	hierarchyOverrides: Map<string, HierarchyTarget>,
	destinationName: string,
	settings: DraftBenchSettings,
	options: ImportOptions,
	snapshotsByUuid: Map<string, SnapshotMetadata[]> = new Map()
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
		snapshots: 0,
		snapshotsCapped: 0,
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
		options,
		snapshotsByUuid,
		entries,
		counts,
		warnings,
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
	if (counts.snapshotsCapped > 0) {
		warnings.push(
			`${counts.snapshotsCapped} snapshot${counts.snapshotsCapped === 1 ? '' : 's'} will be skipped due to the per-scene cap (raise the cap in Options to keep more).`
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
	options: ImportOptions,
	snapshotsByUuid: Map<string, SnapshotMetadata[]>,
	entries: PlanEntry[],
	counts: PlanCounts,
	warnings: string[],
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
					options,
					snapshotsByUuid,
					entries,
					counts,
					warnings,
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
				emitSnapshotDrafts(
					item.id,
					sanitizedTitle,
					sceneFolder,
					projectFolderPath,
					settings,
					options,
					snapshotsByUuid,
					entries,
					counts
				);
				walkDraft(
					item.children,
					hierarchyAuto,
					hierarchyOverrides,
					projectName,
					projectFolderPath,
					settings,
					options,
					snapshotsByUuid,
					entries,
					counts,
					warnings,
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
					options,
					snapshotsByUuid,
					entries,
					counts,
					warnings,
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
					options,
					snapshotsByUuid,
					entries,
					counts,
					warnings,
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
					options,
					snapshotsByUuid,
					entries,
					counts,
					warnings,
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

/**
 * Emit `snapshot-draft` plan entries for one scene's snapshots when
 * the writer has `importSnapshots` enabled. Sorts the document's
 * snapshots chronologically (oldest first), applies the per-scene cap
 * (keeping the most recent N), resolves filenames via the writer's
 * template, and disambiguates collisions in the rare case that the
 * template doesn't produce unique names.
 *
 * No-ops when the toggle is off, when the scene has no snapshots, or
 * when the cap drops to zero.
 */
function emitSnapshotDrafts(
	sceneId: string,
	sceneBasename: string,
	sceneFolder: string,
	projectFolderPath: string,
	settings: DraftBenchSettings,
	options: ImportOptions,
	snapshotsByUuid: Map<string, SnapshotMetadata[]>,
	entries: PlanEntry[],
	counts: PlanCounts
): void {
	if (!options.importSnapshots) return;
	const snapshots = snapshotsByUuid.get(sceneId);
	if (snapshots === undefined || snapshots.length === 0) return;

	const { kept, capped } = applySnapshotCap(snapshots, options.snapshotCap);
	counts.snapshotsCapped += capped;
	if (kept.length === 0) return;

	const draftFolder = resolveDraftFolderForPlan(
		settings,
		projectFolderPath,
		sceneFolder,
		sceneBasename
	);
	if (draftFolder !== '' && draftFolder !== sceneFolder) {
		entries.push({
			kind: 'folder',
			path: draftFolder,
			sourceId: null,
			sourceTitle: null,
			depth: 3,
		});
	}

	const seen = new Set<string>();
	for (let i = 0; i < kept.length; i++) {
		const snapshot = kept[i];
		const base = applySnapshotFilenameTemplate(
			options.snapshotFilenameTemplate,
			{ basename: sceneBasename },
			snapshot,
			i + 1
		);
		const filename = disambiguateFilename(base, seen);
		seen.add(filename);
		const path =
			draftFolder === ''
				? `${filename}.md`
				: `${draftFolder}/${filename}.md`;
		entries.push({
			kind: 'snapshot-draft',
			path,
			sourceId: sceneId,
			sourceTitle: snapshot.title,
			depth: 3,
		});
		counts.snapshots += 1;
	}
}

/**
 * Sort a scene's snapshots chronologically (oldest first by Scrivener
 * `<Date>`) and apply the per-scene cap. Returns the kept set + the
 * count of dropped entries (capped beyond the most recent N).
 *
 * Lexicographic compare on the date string is correct: Scrivener's
 * `YYYY-MM-DD HH:MM:SS [+-]HHMM` format sorts the same as a real
 * datetime comparison for snapshots taken within the same TZ offset
 * (the common case). Cross-TZ snapshots can drift slightly under
 * lexicographic compare; acceptable for V1 since per-document
 * snapshots are rarely cross-TZ.
 */
function applySnapshotCap(
	snapshots: SnapshotMetadata[],
	cap: SnapshotCap
): { kept: SnapshotMetadata[]; capped: number } {
	const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
	if (cap === 'all' || sorted.length <= cap) {
		return { kept: sorted, capped: 0 };
	}
	// Keep the most-recent `cap` (last N after ascending sort).
	return { kept: sorted.slice(-cap), capped: sorted.length - cap };
}

/**
 * Plan-time draft folder resolution mirroring `resolveDraftFolder` in
 * core/drafts.ts but operating on plain strings (no `App` / no metadata
 * cache lookups).
 */
function resolveDraftFolderForPlan(
	settings: DraftBenchSettings,
	projectFolderPath: string,
	sceneFolderPath: string,
	sceneBasename: string
): string {
	const folderName = settings.draftsFolderName.trim() || 'Drafts';
	if (settings.draftsFolderPlacement === 'vault-wide') {
		return folderName;
	}
	if (settings.draftsFolderPlacement === 'per-scene') {
		const base = `${sceneBasename} - ${folderName}`;
		return sceneFolderPath === '' ? base : `${sceneFolderPath}/${base}`;
	}
	// project-local (default).
	return projectFolderPath === ''
		? folderName
		: `${projectFolderPath}/${folderName}`;
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
