import type { App, TFile } from 'obsidian';
import type { DbenchId } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import type { SubSceneNote } from './discovery';
import { findDraftsOfSubScene, findNoteById } from './discovery';
import { stampDraftEssentials } from './essentials';

/**
 * Sub-scene-level draft creation: snapshots a sub-scene's body into a
 * new file in the configured drafts folder, stamps draft essentials
 * with sub-scene parent refs (per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md)),
 * and appends to the sub-scene's `dbench-drafts` / `dbench-draft-ids`
 * reverse arrays.
 *
 * Mirrors `createDraft` in drafts.ts and `createChapterDraft` in
 * chapter-drafts.ts at the sub-scene level. The sub-scene note itself
 * is untouched — writers continue revising it as the new working draft.
 *
 * Per the spec's "suspended states" list, callers should run
 * `createSubSceneDraft` inside `linker.withSuspended(...)` so the
 * intermediate two-file-write state doesn't trigger sync.
 */

const DEFAULT_DRAFTS_FOLDER_NAME = 'Drafts';

/**
 * Options for `createSubSceneDraft`.
 */
export interface CreateSubSceneDraftOptions {
	/** The sub-scene whose current body will be snapshotted. */
	subScene: SubSceneNote;

	/**
	 * Override "today" for deterministic filename generation in tests.
	 * Production callers pass nothing (defaults to `new Date()`).
	 */
	date?: Date;
}

/**
 * Result of `resolveSubSceneDraftPaths`. Plain strings so the preview
 * UI can render the filename and full path without re-running the
 * resolver.
 */
export interface ResolvedSubSceneDraftPaths {
	folderPath: string;
	filename: string;
	filePath: string;
	draftNumber: number;
}

/**
 * Compute the next draft number for a given sub-scene: `max(existing
 * dbench-draft-number) + 1`, or 1 if none exist. Uses
 * `findDraftsOfSubScene` which filters on the rename-safe
 * `dbench-sub-scene-id` companion so other-sub-scene drafts don't
 * pollute the count.
 */
export function nextSubSceneDraftNumber(
	app: App,
	subSceneId: DbenchId
): number {
	const existing = findDraftsOfSubScene(app, subSceneId);
	if (existing.length === 0) return 1;
	const maxNumber = Math.max(
		...existing.map((d) => d.frontmatter['dbench-draft-number'])
	);
	return maxNumber + 1;
}

/**
 * Resolve the folder where a draft of `subScene` will live, honoring
 * `settings.draftsFolderPlacement`. Mirrors `resolveDraftFolder` in
 * drafts.ts; the `per-scene` placement is interpreted as
 * per-sub-scene (a sibling `<sub-scene basename> - <draftsFolderName>/`
 * folder next to the sub-scene), keeping the "draft history co-located
 * with its parent" intent of that mode.
 */
export function resolveSubSceneDraftFolder(
	app: App,
	settings: DraftBenchSettings,
	subScene: SubSceneNote
): string {
	const folderName = normalizeFolderName(settings.draftsFolderName);

	if (settings.draftsFolderPlacement === 'vault-wide') {
		return folderName;
	}

	if (settings.draftsFolderPlacement === 'per-scene') {
		const parent = parentPath(subScene.file.path);
		const base = `${subScene.file.basename} - ${folderName}`;
		return parent === '' ? base : `${parent}/${base}`;
	}

	// project-local (default): walk up to the project's folder.
	const projectId = subScene.frontmatter['dbench-project-id'];
	const projectNote =
		projectId === '' ? null : findNoteById(app, projectId);
	const projectFolder = projectNote
		? parentPath(projectNote.file.path)
		: parentPath(subScene.file.path);
	return projectFolder === '' ? folderName : `${projectFolder}/${folderName}`;
}

/**
 * Build the sub-scene-draft filename:
 * `<Scene> - <Sub-scene> - Draft N (YYYYMMDD).md`.
 *
 * Per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md),
 * the `<Scene> - <Sub-scene>` prefix disambiguates sub-scene drafts
 * from scene drafts in the same folder. The parent scene's basename
 * comes from the sub-scene's `dbench-scene` wikilink ref.
 */
export function resolveSubSceneDraftFilename(
	subScene: SubSceneNote,
	draftNumber: number,
	date: Date
): string {
	const stamp = formatDateStamp(date);
	const sceneBasename = parseWikilinkBasename(
		subScene.frontmatter['dbench-scene']
	);
	const prefix =
		sceneBasename === ''
			? subScene.file.basename
			: `${sceneBasename} - ${subScene.file.basename}`;
	return `${prefix} - Draft ${draftNumber} (${stamp}).md`;
}

/**
 * Pure path resolution: returns the folder, filename, full path, and
 * the auto-computed draft number without any filesystem side effects.
 * Useful for the confirm modal's preview text.
 */
export function resolveSubSceneDraftPaths(
	app: App,
	settings: DraftBenchSettings,
	subScene: SubSceneNote,
	date: Date = new Date()
): ResolvedSubSceneDraftPaths {
	const draftNumber = nextSubSceneDraftNumber(
		app,
		subScene.frontmatter['dbench-id']
	);
	const folderPath = resolveSubSceneDraftFolder(app, settings, subScene);
	const filename = resolveSubSceneDraftFilename(subScene, draftNumber, date);
	const filePath = folderPath === '' ? filename : `${folderPath}/${filename}`;
	return { folderPath, filename, filePath, draftNumber };
}

/**
 * Snapshot a sub-scene into a new draft file.
 *
 * Two-file write per spec § Relationship Integrity:
 *   1. Read the sub-scene's current content, strip its frontmatter,
 *      and write the body into a new draft file. Stamp draft
 *      essentials and pre-set forward references (`dbench-project`,
 *      `dbench-project-id`, `dbench-sub-scene`, `dbench-sub-scene-id`,
 *      `dbench-draft-number`) on the draft.
 *   2. Append the new draft to the sub-scene's `dbench-drafts` and
 *      `dbench-draft-ids` reverse arrays.
 *
 * The sub-scene note is not modified: its body is the new working
 * draft. Callers should run inside `linker.withSuspended(...)` so the
 * intermediate state doesn't trigger sync.
 */
export async function createSubSceneDraft(
	app: App,
	settings: DraftBenchSettings,
	options: CreateSubSceneDraftOptions
): Promise<TFile> {
	const { subScene } = options;
	const date = options.date ?? new Date();
	const { folderPath, filePath, draftNumber } = resolveSubSceneDraftPaths(
		app,
		settings,
		subScene,
		date
	);

	if (app.vault.getAbstractFileByPath(filePath) !== null) {
		throw new Error(`A file already exists at ${filePath}.`);
	}

	if (folderPath !== '' && app.vault.getAbstractFileByPath(folderPath) === null) {
		await app.vault.createFolder(folderPath);
	}

	const subSceneContent = await app.vault.read(subScene.file);
	const body = stripFrontmatter(subSceneContent);

	const file = await app.vault.create(filePath, body);

	const projectWikilink = subScene.frontmatter['dbench-project'];
	const projectId = subScene.frontmatter['dbench-project-id'];
	const subSceneWikilink = `[[${subScene.file.basename}]]`;
	const subSceneId = subScene.frontmatter['dbench-id'];

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set draft-specific fields so stampDraftEssentials' setIfMissing
		// leaves them alone. Sub-scene drafts carry both project + sub-scene
		// refs (parallel to scene drafts which carry project + scene refs).
		frontmatter['dbench-project'] = projectWikilink;
		frontmatter['dbench-project-id'] = projectId;
		frontmatter['dbench-sub-scene'] = subSceneWikilink;
		frontmatter['dbench-sub-scene-id'] = subSceneId;
		frontmatter['dbench-draft-number'] = draftNumber;
		stampDraftEssentials(frontmatter, { basename: file.basename });
	});

	const draftId = String(
		app.metadataCache.getFileCache(file)?.frontmatter?.['dbench-id'] ?? ''
	);
	const draftWikilink = `[[${file.basename}]]`;

	await app.fileManager.processFrontMatter(subScene.file, (frontmatter) => {
		const drafts = readArray(frontmatter['dbench-drafts']);
		const draftIds = readArray(frontmatter['dbench-draft-ids']);
		if (!drafts.includes(draftWikilink)) drafts.push(draftWikilink);
		if (!draftIds.includes(draftId)) draftIds.push(draftId);
		frontmatter['dbench-drafts'] = drafts;
		frontmatter['dbench-draft-ids'] = draftIds;
	});

	return file;
}

/**
 * Strip a leading YAML frontmatter block from `content` and return the
 * remaining body. If no frontmatter is present, returns `content`
 * unchanged.
 */
function stripFrontmatter(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
	return match ? match[1] : content;
}

function parentPath(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return '';
	return filePath.slice(0, idx);
}

function formatDateStamp(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}${m}${d}`;
}

function normalizeFolderName(raw: string): string {
	const trimmed = raw.replace(/^\/+|\/+$/g, '');
	return trimmed === '' ? DEFAULT_DRAFTS_FOLDER_NAME : trimmed;
}

function readArray(value: unknown): string[] {
	if (Array.isArray(value)) return value as string[];
	return [];
}

/**
 * Parse the bare basename out of a `[[Wikilink]]` (or `[[Path/To/Foo|Display]]`)
 * value. Returns `''` if the value isn't a recognizable wikilink shape.
 * Defensive helper for reading the sub-scene's `dbench-scene` ref —
 * frontmatter values arrive as `unknown` from the cache.
 */
function parseWikilinkBasename(value: unknown): string {
	if (typeof value !== 'string') return '';
	const m = value.match(/^\[\[(.+?)\]\]$/);
	if (!m) return '';
	let target = m[1];
	const pipeIdx = target.indexOf('|');
	if (pipeIdx >= 0) target = target.slice(0, pipeIdx);
	const hashIdx = target.indexOf('#');
	if (hashIdx >= 0) target = target.slice(0, hashIdx);
	const slashIdx = target.lastIndexOf('/');
	if (slashIdx >= 0) target = target.slice(slashIdx + 1);
	return target.trim();
}
