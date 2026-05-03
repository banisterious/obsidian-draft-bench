import type { App, TFile } from 'obsidian';
import type { DbenchId } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import type { ChapterNote, SceneNote } from './discovery';
import {
	findDraftsOfChapter,
	findNoteById,
	findScenesInChapter,
} from './discovery';
import { stampDraftEssentials } from './essentials';

/**
 * Chapter-level draft creation: snapshots a chapter's body plus each
 * child scene's body, concatenated in `dbench-order` with HTML-comment
 * scene boundaries, into a new file in the configured drafts folder.
 * Stamps draft essentials with chapter parent refs and appends to the
 * chapter's `dbench-drafts` / `dbench-draft-ids` reverse arrays.
 *
 * Per [chapter-type.md § 4](../../docs/planning/chapter-type.md), this
 * is the B1 snapshot form: raw file content (frontmatter stripped),
 * planning sections preserved, scene boundaries marked with
 * `<!-- scene: <basename> -->` between concatenated bodies. The chapter
 * note + each scene note are untouched — writers continue revising
 * them as the new working draft.
 *
 * Mirrors `createDraft` in drafts.ts: per the spec's "suspended
 * states" list, callers should run `createChapterDraft` inside
 * `linker.withSuspended(...)` so the linker doesn't try to sync the
 * intermediate two-file-write state.
 */

const DEFAULT_DRAFTS_FOLDER_NAME = 'Drafts';

/**
 * Options for `createChapterDraft`.
 */
export interface CreateChapterDraftOptions {
	/** The chapter whose current body + scenes will be snapshotted. */
	chapter: ChapterNote;

	/**
	 * Override "today" for deterministic filename generation in tests.
	 * Production callers pass nothing (defaults to `new Date()`).
	 */
	date?: Date;
}

/**
 * Result of `resolveChapterDraftPaths`. Plain strings so the preview
 * UI can render the filename and full path without re-running the
 * resolver.
 */
export interface ResolvedChapterDraftPaths {
	folderPath: string;
	filename: string;
	filePath: string;
	draftNumber: number;
}

/**
 * Compute the next draft number for a given chapter: `max(existing
 * dbench-draft-number) + 1`, or 1 if none exist.
 *
 * Drafts of other chapters / scenes / projects are excluded by
 * `findDraftsOfChapter`, which filters on `dbench-chapter-id`.
 */
export function nextChapterDraftNumber(
	app: App,
	chapterId: DbenchId
): number {
	const existing = findDraftsOfChapter(app, chapterId);
	if (existing.length === 0) return 1;
	const maxNumber = Math.max(
		...existing.map((d) => d.frontmatter['dbench-draft-number'])
	);
	return maxNumber + 1;
}

/**
 * Resolve the folder where a draft of `chapter` will live, honoring
 * `settings.draftsFolderPlacement`. Mirrors `resolveDraftFolder` in
 * drafts.ts with the chapter substituted for the scene; the
 * `per-scene` placement is interpreted as per-parent (a sibling
 * `<chapter basename> - <draftsFolderName>/` folder next to the
 * chapter), keeping the "draft history co-located with its parent"
 * intent of that mode.
 */
export function resolveChapterDraftFolder(
	app: App,
	settings: DraftBenchSettings,
	chapter: ChapterNote
): string {
	const folderName = normalizeFolderName(settings.draftsFolderName);

	if (settings.draftsFolderPlacement === 'vault-wide') {
		return folderName;
	}

	if (settings.draftsFolderPlacement === 'per-scene') {
		const parent = parentPath(chapter.file.path);
		const base = `${chapter.file.basename} - ${folderName}`;
		return parent === '' ? base : `${parent}/${base}`;
	}

	// project-local (default).
	const projectId = chapter.frontmatter['dbench-project-id'];
	const projectNote = projectId === '' ? null : findNoteById(app, projectId);
	const projectFolder = projectNote
		? parentPath(projectNote.file.path)
		: parentPath(chapter.file.path);
	return projectFolder === '' ? folderName : `${projectFolder}/${folderName}`;
}

/**
 * Build the chapter-draft filename: `<Chapter> - Draft N (YYYYMMDD).md`.
 * Same shape as scene drafts so chapter and scene drafts mingle in
 * the same Drafts/ folder; their frontmatter parent refs disambiguate.
 */
export function resolveChapterDraftFilename(
	chapter: ChapterNote,
	draftNumber: number,
	date: Date
): string {
	const stamp = formatDateStamp(date);
	return `${chapter.file.basename} - Draft ${draftNumber} (${stamp}).md`;
}

/**
 * Pure path resolution: returns the folder, filename, full path, and
 * the auto-computed draft number without any filesystem side effects.
 * Useful for the confirm modal's preview text.
 */
export function resolveChapterDraftPaths(
	app: App,
	settings: DraftBenchSettings,
	chapter: ChapterNote,
	date: Date = new Date()
): ResolvedChapterDraftPaths {
	const draftNumber = nextChapterDraftNumber(
		app,
		chapter.frontmatter['dbench-id']
	);
	const folderPath = resolveChapterDraftFolder(app, settings, chapter);
	const filename = resolveChapterDraftFilename(chapter, draftNumber, date);
	const filePath = folderPath === '' ? filename : `${folderPath}/${filename}`;
	return { folderPath, filename, filePath, draftNumber };
}

/**
 * Build the snapshot body: the chapter's body (frontmatter stripped)
 * followed by each scene's body in `dbench-order`, separated by
 * `<!-- scene: <basename> -->` comment markers.
 *
 * Pulled out as a pure helper so tests can assert the exact format
 * without filesystem side effects.
 */
export function buildChapterSnapshot(
	chapterBody: string,
	scenes: Array<{ basename: string; body: string }>
): string {
	const trimmedChapter = chapterBody.replace(/\s+$/, '');

	if (scenes.length === 0) {
		return trimmedChapter === '' ? '' : `${trimmedChapter}\n`;
	}

	const sceneBlocks = scenes.map((scene) => {
		const trimmedScene = scene.body.replace(/\s+$/, '');
		return `${sceneBoundary(scene.basename)}\n\n${trimmedScene}`;
	});

	if (trimmedChapter === '') {
		return `${sceneBlocks.join('\n\n')}\n`;
	}

	return `${trimmedChapter}\n\n${sceneBlocks.join('\n\n')}\n`;
}

/**
 * Snapshot a chapter into a new draft file.
 *
 * Two-file write pattern (matches scene drafts):
 *   1. Read the chapter's content + each scene-in-chapter's content
 *      (sorted by `dbench-order`), strip frontmatter from each, and
 *      concatenate with HTML-comment scene boundaries. Write into a new
 *      draft file with stamped essentials and chapter parent refs.
 *   2. Append the new draft to the chapter's `dbench-drafts` and
 *      `dbench-draft-ids` reverse arrays.
 *
 * Neither the chapter note nor any scene note is modified. Callers
 * should run inside `linker.withSuspended(...)`.
 */
export async function createChapterDraft(
	app: App,
	settings: DraftBenchSettings,
	options: CreateChapterDraftOptions
): Promise<TFile> {
	const { chapter } = options;
	const date = options.date ?? new Date();
	const { folderPath, filePath, draftNumber } = resolveChapterDraftPaths(
		app,
		settings,
		chapter,
		date
	);

	if (app.vault.getAbstractFileByPath(filePath) !== null) {
		throw new Error(`A file already exists at ${filePath}.`);
	}

	if (folderPath !== '' && app.vault.getAbstractFileByPath(folderPath) === null) {
		await app.vault.createFolder(folderPath);
	}

	const chapterId = chapter.frontmatter['dbench-id'];
	const chapterContent = await app.vault.read(chapter.file);
	const chapterBody = stripFrontmatter(chapterContent);

	const scenes = findScenesInChapter(app, chapterId).sort(
		(a, b) => a.frontmatter['dbench-order'] - b.frontmatter['dbench-order']
	);
	const sceneBodies = await Promise.all(
		scenes.map(async (scene: SceneNote) => ({
			basename: scene.file.basename,
			body: stripFrontmatter(await app.vault.read(scene.file)),
		}))
	);

	const body = buildChapterSnapshot(chapterBody, sceneBodies);

	const file = await app.vault.create(filePath, body);

	const projectWikilink = chapter.frontmatter['dbench-project'];
	const projectId = chapter.frontmatter['dbench-project-id'];
	const chapterWikilink = `[[${chapter.file.basename}]]`;

	// Capture id inside the callback to avoid the cache-reparse race. Refs #15.
	let draftId = '';
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set draft-specific fields so stampDraftEssentials' setIfMissing
		// leaves them alone. Per § 4, chapter drafts carry both project + chapter
		// refs (parallel to scene drafts which carry project + scene refs).
		frontmatter['dbench-project'] = projectWikilink;
		frontmatter['dbench-project-id'] = projectId;
		frontmatter['dbench-chapter'] = chapterWikilink;
		frontmatter['dbench-chapter-id'] = chapterId;
		frontmatter['dbench-draft-number'] = draftNumber;
		stampDraftEssentials(frontmatter, { basename: file.basename });
		draftId = String(frontmatter['dbench-id'] ?? '');
	});

	const draftWikilink = `[[${file.basename}]]`;

	await app.fileManager.processFrontMatter(chapter.file, (frontmatter) => {
		const drafts = readArray(frontmatter['dbench-drafts']);
		const draftIds = readArray(frontmatter['dbench-draft-ids']);
		if (!drafts.includes(draftWikilink)) drafts.push(draftWikilink);
		if (!draftIds.includes(draftId)) draftIds.push(draftId);
		frontmatter['dbench-drafts'] = drafts;
		frontmatter['dbench-draft-ids'] = draftIds;
	});

	return file;
}

function sceneBoundary(basename: string): string {
	return `<!-- scene: ${basename} -->`;
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
