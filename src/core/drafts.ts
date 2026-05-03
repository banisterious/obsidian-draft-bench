import type { App, TFile } from 'obsidian';
import type { DbenchId } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import type { SceneNote } from './discovery';
import {
	findDraftsOfScene,
	findNoteById,
	findSubScenesInScene,
} from './discovery';
import { stampDraftEssentials } from './essentials';
import { sortSubScenesByOrder } from './sort-scenes';

/**
 * Draft creation: snapshots a scene's current body into a new file in
 * the configured drafts folder, stamps draft essentials, and appends
 * to the scene's `dbench-drafts` / `dbench-draft-ids` reverse arrays.
 *
 * The scene note itself is untouched — writers continue revising it
 * as the new working draft. Per spec § Draft Management:
 *
 *   "After snapshotting, the scene note body continues forward as the
 *   new working draft. Writers are revising, not starting blank."
 *
 * Per the "suspended states" list, callers should run `createDraft`
 * inside `linker.withSuspended(...)` so the linker doesn't try to
 * sync the intermediate two-file-write state.
 */

const DEFAULT_DRAFTS_FOLDER_NAME = 'Drafts';

/**
 * Options for `createDraft`.
 */
export interface CreateDraftOptions {
	/** The scene whose current body will be snapshotted. */
	scene: SceneNote;

	/**
	 * Override "today" for deterministic filename generation in tests.
	 * Production callers pass nothing (defaults to `new Date()`).
	 */
	date?: Date;
}

/**
 * Result of `resolveDraftPaths`. All fields are plain strings so the
 * preview UI can render the filename and full path without re-running
 * the resolver.
 */
export interface ResolvedDraftPaths {
	folderPath: string;
	filename: string;
	filePath: string;
	draftNumber: number;
}

/**
 * Compute the next draft number for a given scene: `max(existing
 * dbench-draft-number) + 1`, or 1 if none exist.
 *
 * Drafts of other scenes or projects are excluded by
 * `findDraftsOfScene`, which filters on the rename-safe
 * `dbench-scene-id` companion.
 */
export function nextDraftNumber(app: App, sceneId: DbenchId): number {
	const existing = findDraftsOfScene(app, sceneId);
	if (existing.length === 0) return 1;
	const maxNumber = Math.max(
		...existing.map((d) => d.frontmatter['dbench-draft-number'])
	);
	return maxNumber + 1;
}

/**
 * Resolve the folder where a draft of `scene` will live, honoring
 * `settings.draftsFolderPlacement`:
 *
 * - `project-local` (default): `<project folder>/<draftsFolderName>/`.
 *   If the scene has no resolvable project, the scene's parent folder
 *   is used instead so orphan-scene drafts still land somewhere sane.
 * - `per-scene`: a sibling folder `<scene basename> - <draftsFolderName>/`
 *   next to the scene. Useful for writers who want draft history
 *   tightly co-located with its scene.
 * - `vault-wide`: `<draftsFolderName>/` at the vault root.
 */
export function resolveDraftFolder(
	app: App,
	settings: DraftBenchSettings,
	scene: SceneNote
): string {
	const folderName = normalizeFolderName(settings.draftsFolderName);

	if (settings.draftsFolderPlacement === 'vault-wide') {
		return folderName;
	}

	if (settings.draftsFolderPlacement === 'per-scene') {
		const parent = parentPath(scene.file.path);
		const base = `${scene.file.basename} - ${folderName}`;
		return parent === '' ? base : `${parent}/${base}`;
	}

	// project-local (default).
	const projectId = scene.frontmatter['dbench-project-id'];
	const projectNote = projectId === '' ? null : findNoteById(app, projectId);
	const projectFolder = projectNote
		? parentPath(projectNote.file.path)
		: parentPath(scene.file.path);
	return projectFolder === '' ? folderName : `${projectFolder}/${folderName}`;
}

/**
 * Build the draft filename: `<Scene> - Draft N (YYYYMMDD).md`.
 *
 * The date stamp is informational (Obsidian's `ctime` is authoritative
 * for creation time); it makes draft files self-describing when
 * browsing the drafts folder in the file explorer.
 */
export function resolveDraftFilename(
	scene: SceneNote,
	draftNumber: number,
	date: Date
): string {
	const stamp = formatDateStamp(date);
	return `${scene.file.basename} - Draft ${draftNumber} (${stamp}).md`;
}

/**
 * Pure path resolution: returns the folder, filename, full path, and
 * the auto-computed draft number without any filesystem side effects.
 * Useful for the confirm modal's preview text.
 */
export function resolveDraftPaths(
	app: App,
	settings: DraftBenchSettings,
	scene: SceneNote,
	date: Date = new Date()
): ResolvedDraftPaths {
	const draftNumber = nextDraftNumber(app, scene.frontmatter['dbench-id']);
	const folderPath = resolveDraftFolder(app, settings, scene);
	const filename = resolveDraftFilename(scene, draftNumber, date);
	const filePath = folderPath === '' ? filename : `${folderPath}/${filename}`;
	return { folderPath, filename, filePath, draftNumber };
}

/**
 * Build the scene-draft snapshot body when the scene has sub-scenes,
 * per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md):
 * the scene's body (frontmatter stripped) followed by each sub-scene's
 * body in `dbench-order`, separated by `<!-- sub-scene: <basename> -->`
 * comment markers (parallel to chapter-draft scene boundaries from
 * chapter-type § 4).
 *
 * Pulled out as a pure helper so tests can assert the exact format
 * without filesystem side effects. Mirrors `buildChapterSnapshot` in
 * chapter-drafts.ts one structural level deeper.
 */
export function buildSceneSnapshot(
	sceneBody: string,
	subScenes: Array<{ basename: string; body: string }>
): string {
	const trimmedScene = sceneBody.replace(/\s+$/, '');

	if (subScenes.length === 0) {
		return trimmedScene === '' ? '' : `${trimmedScene}\n`;
	}

	const subSceneBlocks = subScenes.map((subScene) => {
		const trimmedSub = subScene.body.replace(/\s+$/, '');
		return `${subSceneBoundary(subScene.basename)}\n\n${trimmedSub}`;
	});

	if (trimmedScene === '') {
		return `${subSceneBlocks.join('\n\n')}\n`;
	}

	return `${trimmedScene}\n\n${subSceneBlocks.join('\n\n')}\n`;
}

function subSceneBoundary(basename: string): string {
	return `<!-- sub-scene: ${basename} -->`;
}

/**
 * Snapshot a scene into a new draft file.
 *
 * Two-file write per spec § Relationship Integrity:
 *   1. Read the scene's current content, strip its frontmatter, and
 *      write the remaining body into a new draft file. When the scene
 *      has sub-scenes (per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md)),
 *      concatenate scene body + each sub-scene body in `dbench-order`
 *      with `<!-- sub-scene: <basename> -->` boundaries via
 *      `buildSceneSnapshot`. Stamp draft essentials and pre-set forward
 *      references (`dbench-project`, `dbench-project-id`, `dbench-scene`,
 *      `dbench-scene-id`, `dbench-draft-number`) on the draft.
 *   2. Append the new draft to the scene's `dbench-drafts` and
 *      `dbench-draft-ids` reverse arrays.
 *
 * The scene note (and any sub-scene notes) are not modified: their
 * bodies remain the new working draft. Callers should run inside
 * `linker.withSuspended(...)` so the intermediate state doesn't
 * trigger sync.
 */
export async function createDraft(
	app: App,
	settings: DraftBenchSettings,
	options: CreateDraftOptions
): Promise<TFile> {
	const { scene } = options;
	const date = options.date ?? new Date();
	const { folderPath, filePath, draftNumber } = resolveDraftPaths(
		app,
		settings,
		scene,
		date
	);

	if (app.vault.getAbstractFileByPath(filePath) !== null) {
		throw new Error(`A file already exists at ${filePath}.`);
	}

	if (folderPath !== '' && app.vault.getAbstractFileByPath(folderPath) === null) {
		await app.vault.createFolder(folderPath);
	}

	const sceneContent = await app.vault.read(scene.file);
	const sceneBody = stripFrontmatter(sceneContent);

	// When the scene has sub-scenes, the snapshot concatenates scene
	// body + child sub-scene bodies in dbench-order. Sub-scene-less
	// scenes use the original single-body snapshot (byte-identical
	// backward compat).
	const subScenes = sortSubScenesByOrder(
		findSubScenesInScene(app, scene.frontmatter['dbench-id'])
	);
	let body: string;
	if (subScenes.length === 0) {
		body = sceneBody;
	} else {
		const subSceneBodies = await Promise.all(
			subScenes.map(async (subScene) => ({
				basename: subScene.file.basename,
				body: stripFrontmatter(await app.vault.read(subScene.file)),
			}))
		);
		body = buildSceneSnapshot(sceneBody, subSceneBodies);
	}

	const file = await app.vault.create(filePath, body);

	const projectWikilink = scene.frontmatter['dbench-project'];
	const projectId = scene.frontmatter['dbench-project-id'];
	const sceneWikilink = `[[${scene.file.basename}]]`;
	const sceneId = scene.frontmatter['dbench-id'];

	// Capture the generated dbench-id INSIDE the processFrontMatter
	// callback. Reading from app.metadataCache.getFileCache after the
	// call returns races the cache reparse: real Obsidian updates the
	// cache asynchronously, so a post-call read often hits the pre-write
	// state and returns ''. The empty string then lands in the parent's
	// dbench-X-ids array. Refs #15.
	let draftId = '';
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set draft-specific fields so stampDraftEssentials' setIfMissing
		// leaves them alone. `dbench-project-id` isn't stamped by essentials
		// (it's empty-by-default for retrofits); set it explicitly here.
		frontmatter['dbench-project'] = projectWikilink;
		frontmatter['dbench-project-id'] = projectId;
		frontmatter['dbench-scene'] = sceneWikilink;
		frontmatter['dbench-scene-id'] = sceneId;
		frontmatter['dbench-draft-number'] = draftNumber;
		stampDraftEssentials(frontmatter, { basename: file.basename });
		draftId = String(frontmatter['dbench-id'] ?? '');
	});

	const draftWikilink = `[[${file.basename}]]`;

	await app.fileManager.processFrontMatter(scene.file, (frontmatter) => {
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

/**
 * Return the parent-folder portion of a path (everything before the
 * final slash). Returns `''` for vault-root files.
 */
function parentPath(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return '';
	return filePath.slice(0, idx);
}

/**
 * Format `date` as `YYYYMMDD` in the local timezone. Matches the spec's
 * draft-filename convention.
 */
function formatDateStamp(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}${m}${d}`;
}

/**
 * Normalize a folder name from settings: drop leading/trailing slashes
 * and fall back to the built-in default if the value is empty.
 */
function normalizeFolderName(raw: string): string {
	const trimmed = raw.replace(/^\/+|\/+$/g, '');
	return trimmed === '' ? DEFAULT_DRAFTS_FOLDER_NAME : trimmed;
}

/**
 * Defensive array reader: returns the array as-is, or `[]` if the value
 * isn't an array (covers null / undefined / corrupted entries).
 */
function readArray(value: unknown): string[] {
	if (Array.isArray(value)) return value as string[];
	return [];
}
