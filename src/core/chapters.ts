import type { App, TFile } from 'obsidian';
import type { DbenchId, DbenchStatus } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import type { ProjectNote } from './discovery';
import { findChaptersInProject, findScenesInProject } from './discovery';
import { stampChapterEssentials } from './essentials';

/**
 * Chapter creation: resolves the target file path, writes the built-in
 * chapter template body, stamps essentials linked to the parent project,
 * and appends to the project's `dbench-chapters` / `dbench-chapter-ids`
 * reverse arrays.
 *
 * Per [chapter-type.md § 9](../../docs/planning/chapter-type.md), a
 * project's children are either chapters or direct scenes, never both.
 * `createChapter` enforces this strictly: if the project already has
 * direct scenes (scenes without a `dbench-chapter-id`), the operation
 * refuses with a clear error so the writer can convert the project
 * intentionally rather than silently entering a mixed-children state.
 *
 * Per the spec's "suspended states" list, callers should run this
 * inside `linker.withSuspended(...)` so the linker doesn't try to sync
 * intermediate states. The reverse-array update happens inline; once
 * the linker handles project↔chapter (Step 4), this manual update can
 * become belt-and-suspenders or be removed.
 *
 * Chapter template customization (settings.chapterTemplatePath +
 * Templater pass-through) is deferred to a follow-up step. V1's first
 * chapter implementation ships with a hardcoded built-in template.
 */

const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/;

/**
 * Built-in chapter template. Mirrors the V1 scene template shape
 * (planning sections + `## Draft`) per [chapter-type.md § 1](../../docs/planning/chapter-type.md):
 * the chapter body's `## Draft` is chapter-introductory prose only,
 * emitting before the chapter's scenes in compile.
 *
 * Settings-customizable chapter template + Templater pass-through land
 * in a follow-up step (mirroring the existing scene-template machinery
 * in templates.ts).
 */
export const BUILTIN_CHAPTER_TEMPLATE = `## Source passages

## Beat outline

## Open questions

## Draft

`;

export interface CreateChapterOptions {
	/** The project this chapter belongs to. */
	project: ProjectNote;

	/** Chapter title (also the filename). */
	title: string;

	/** Sort position; defaults to `max(existing dbench-order) + 1`. */
	order?: number;

	/** Initial workflow status; defaults to `settings.statusVocabulary[0]`. */
	status?: DbenchStatus;

	/**
	 * Override for the chapters-folder template. Falls back to
	 * `settings.chaptersFolder`. Supports `{project}` token, replaced
	 * with the project's basename.
	 */
	location?: string;
}

export interface ResolvedChapterPaths {
	folderPath: string;
	filePath: string;
}

/**
 * Pure path resolution. The folder path is `settings.chaptersFolder`
 * (or `options.location`) interpreted **relative to the project's
 * folder**, with `{project}` expanded to the project's basename. An
 * empty template (the default) places the chapter alongside the
 * project note; a non-empty template nests it in a subfolder. The
 * file path appends `<title>.md`.
 */
export function resolveChapterPaths(
	settings: DraftBenchSettings,
	project: ProjectNote,
	options: CreateChapterOptions
): ResolvedChapterPaths {
	const title = options.title.trim();
	if (title === '') {
		throw new Error('Chapter title cannot be empty.');
	}
	if (FILENAME_FORBIDDEN_CHARS.test(title)) {
		throw new Error(
			`Chapter title contains characters not allowed in filenames: ${title}`
		);
	}

	const template = options.location ?? settings.chaptersFolder;
	const relative = template
		.replace(/\{project\}/g, project.file.basename)
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');

	const projectFolder = parentPath(project.file.path);
	const folderPath = relative === ''
		? projectFolder
		: projectFolder === ''
			? relative
			: `${projectFolder}/${relative}`;

	const filePath =
		folderPath === '' ? `${title}.md` : `${folderPath}/${title}.md`;

	return { folderPath, filePath };
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
 * Compute the next chapter sort order in `projectId`. Returns
 * `max(existing dbench-order) + 1`, or 1 if none exist.
 */
export function nextChapterOrder(app: App, projectId: DbenchId): number {
	const existing = findChaptersInProject(app, projectId);
	if (existing.length === 0) return 1;
	const maxOrder = Math.max(
		...existing.map((c) => c.frontmatter['dbench-order'])
	);
	return maxOrder + 1;
}

/**
 * Create a new chapter note in `options.project`.
 *
 * Two-file write (matches the project↔scene pattern):
 *   1. Refuse if the project has direct scenes (no-mixed-children rule
 *      per § 9).
 *   2. Create the chapter note with the built-in template body and
 *      stamped essentials. Forward references (`dbench-project`,
 *      `dbench-project-id`) point at `options.project`.
 *   3. Update the project's reverse arrays (`dbench-chapters`,
 *      `dbench-chapter-ids`).
 *
 * Returns the created chapter file. Callers should run inside
 * `linker.withSuspended(...)`.
 */
export async function createChapter(
	app: App,
	settings: DraftBenchSettings,
	options: CreateChapterOptions
): Promise<TFile> {
	const projectId = options.project.frontmatter['dbench-id'];

	// No-mixed-children check (per chapter-type.md § 9). A project that
	// already has direct scenes (scenes without a chapter parent) cannot
	// gain chapters until those scenes are first moved into chapters.
	const directScenes = findScenesInProject(app, projectId).filter((s) => {
		const fm = s.frontmatter as unknown as Record<string, unknown>;
		const chapterId = fm['dbench-chapter-id'];
		return chapterId === undefined || chapterId === '' || chapterId === null;
	});
	if (directScenes.length > 0) {
		throw new Error(
			`Project "${options.project.file.basename}" has ${directScenes.length} direct scene${directScenes.length === 1 ? '' : 's'}; cannot add chapters until they're moved into chapters first.`
		);
	}

	const { folderPath, filePath } = resolveChapterPaths(
		settings,
		options.project,
		options
	);

	if (app.vault.getAbstractFileByPath(filePath) !== null) {
		throw new Error(`A file already exists at ${filePath}.`);
	}

	if (folderPath !== '' && app.vault.getAbstractFileByPath(folderPath) === null) {
		await app.vault.createFolder(folderPath);
	}

	const projectWikilink = `[[${options.project.file.basename}]]`;
	const order = options.order ?? nextChapterOrder(app, projectId);
	const defaultStatus = settings.statusVocabulary[0];
	const status = options.status ?? defaultStatus;

	const file = await app.vault.create(filePath, BUILTIN_CHAPTER_TEMPLATE);

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set chapter-specific fields so stampChapterEssentials'
		// setIfMissing leaves them alone.
		frontmatter['dbench-project'] = projectWikilink;
		frontmatter['dbench-project-id'] = projectId;
		frontmatter['dbench-order'] = order;
		frontmatter['dbench-status'] = status;
		stampChapterEssentials(frontmatter, {
			basename: file.basename,
			defaultStatus,
		});
	});

	const chapterId = String(
		app.metadataCache.getFileCache(file)?.frontmatter?.['dbench-id'] ?? ''
	);
	const chapterWikilink = `[[${file.basename}]]`;

	await app.fileManager.processFrontMatter(options.project.file, (frontmatter) => {
		const chapters = readArray(frontmatter['dbench-chapters']);
		const chapterIds = readArray(frontmatter['dbench-chapter-ids']);
		if (!chapters.includes(chapterWikilink)) chapters.push(chapterWikilink);
		if (!chapterIds.includes(chapterId)) chapterIds.push(chapterId);
		frontmatter['dbench-chapters'] = chapters;
		frontmatter['dbench-chapter-ids'] = chapterIds;
	});

	return file;
}

/**
 * Defensive array reader: returns the array as-is, or [] if the value
 * isn't an array (covers null / undefined / corrupted entries).
 */
function readArray(value: unknown): string[] {
	if (Array.isArray(value)) return value as string[];
	return [];
}
