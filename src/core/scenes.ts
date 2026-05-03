import { Notice, type App, type TFile } from 'obsidian';
import type { DbenchId, DbenchStatus } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import type { ChapterNote, ProjectNote, SceneNote } from './discovery';
import { findScenesInChapter, findScenesInProject } from './discovery';
import { stampSceneEssentials } from './essentials';
import {
	ensureSceneTemplateFile,
	isoDate,
	substituteTokens,
	type TemplateContext,
} from './templates';
import {
	isTemplaterEnabled,
	renderTemplateThroughTemplater,
} from './templater';

/**
 * Scene creation: resolves the target file path, renders the scene
 * template (seeding the built-in default if the user's template file
 * is absent), stamps essentials linked to the parent project, and
 * appends to the project's `dbench-scenes` / `dbench-scene-ids`
 * reverse arrays.
 *
 * Per the spec's "suspended states" list, callers should run this
 * inside `linker.withSuspended(...)` so the linker doesn't try to
 * sync intermediate states. The reverse-array update happens here
 * inline; once the linker handlers are real, this manual update
 * becomes redundant and can be removed.
 */

const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/;

export interface CreateSceneOptions {
	/** The project this scene belongs to. */
	project: ProjectNote;

	/**
	 * Optional chapter parent. When set, the new scene's
	 * `dbench-chapter` + `dbench-chapter-id` point to this chapter, the
	 * chapter's `dbench-scenes` reverse array gets the new wikilink (not
	 * the project's), and `dbench-order` defaults to position-within-
	 * this-chapter. Per
	 * [chapter-type.md § 9](../../docs/planning/chapter-type.md), the
	 * project must already be chapter-aware (have at least one chapter
	 * existing) — `createChapter` enforces this; `createScene`'s
	 * companion check refuses to drop a scene directly into a project
	 * that already has chapters when `chapter` is omitted.
	 */
	chapter?: ChapterNote;

	/** Scene title (also the filename). */
	title: string;

	/** Sort position; defaults to `max(existing dbench-order) + 1`. */
	order?: number;

	/** Initial workflow status; defaults to 'idea'. */
	status?: DbenchStatus;

	/**
	 * Override for the scenes-folder template. Falls back to
	 * `settings.scenesFolder`. Supports `{project}` and `{chapter}`
	 * tokens, replaced with the project's basename and (when present)
	 * the parent chapter's basename. For chapter-less scenes, `{chapter}`
	 * expands to `''`, which collapses to flat-at-project-root once the
	 * resolver normalizes slashes — so the default `{chapter}/` template
	 * gracefully degrades to the V1 flat layout for chapter-less projects.
	 */
	location?: string;

	/**
	 * Optional explicit template file to use for this scene's body,
	 * picked by the writer in the new-scene modal. Falls back to
	 * the configured default (per `settings.sceneTemplatePath`) when
	 * absent. Bypasses the auto-seed flow — the file is assumed to
	 * exist (it was discovered by `discoverTemplates`).
	 */
	templateFile?: TFile;
}

export interface ResolvedScenePaths {
	folderPath: string;
	filePath: string;
}

/**
 * Pure path resolution. The folder path is `settings.scenesFolder`
 * (or `options.location`) interpreted **relative to the project's
 * folder**, with `{project}` expanded to the project's basename and
 * `{chapter}` to the parent chapter's basename (or `''` for chapter-
 * less scenes, which collapses to flat-at-project-root). The default
 * `{chapter}/` nests scenes under their chapter for chapter-aware
 * projects and degrades to flat for chapter-less ones; an explicit
 * empty template places the scene alongside the project note. The
 * file path appends `<title>.md`.
 */
export function resolveScenePaths(
	settings: DraftBenchSettings,
	project: ProjectNote,
	options: CreateSceneOptions
): ResolvedScenePaths {
	const title = options.title.trim();
	if (title === '') {
		throw new Error('Scene title cannot be empty.');
	}
	if (FILENAME_FORBIDDEN_CHARS.test(title)) {
		throw new Error(
			`Scene title contains characters not allowed in filenames: ${title}`
		);
	}

	const template = options.location ?? settings.scenesFolder;
	const chapterBasename = options.chapter?.file.basename ?? '';
	const relative = template
		.replace(/\{project\}/g, project.file.basename)
		.replace(/\{chapter\}/g, chapterBasename)
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
 * Compute the next sort order for a new scene directly in `projectId`
 * (chapter-less projects). Returns `max(existing dbench-order) + 1`,
 * or 1 if none exist.
 *
 * Note: in chapter-aware projects, scene order is within-chapter
 * (per [chapter-type.md § 3](../../docs/planning/chapter-type.md)).
 * Use `nextSceneOrderInChapter` for that case.
 */
export function nextSceneOrder(app: App, projectId: DbenchId): number {
	const existing = findScenesInProject(app, projectId).filter((s) => {
		// Chapter-less scenes only — exclude scenes that have a chapter
		// parent so chapter-aware projects don't pollute the count.
		const fm = s.frontmatter as unknown as Record<string, unknown>;
		const chapterId = fm['dbench-chapter-id'];
		return chapterId === undefined || chapterId === '' || chapterId === null;
	});
	if (existing.length === 0) return 1;
	const maxOrder = Math.max(
		...existing.map((s) => s.frontmatter['dbench-order'])
	);
	return maxOrder + 1;
}

/**
 * Compute the next sort order for a new scene inside `chapterId`.
 * Returns `max(existing dbench-order in this chapter) + 1`, or 1 if
 * none exist.
 */
export function nextSceneOrderInChapter(app: App, chapterId: DbenchId): number {
	const existing = findScenesInChapter(app, chapterId);
	if (existing.length === 0) return 1;
	const maxOrder = Math.max(
		...existing.map((s) => s.frontmatter['dbench-order'])
	);
	return maxOrder + 1;
}

/**
 * Create a new scene note in `options.project` (chapter-less) or
 * inside `options.chapter` (chapter-aware).
 *
 * Two-file write per spec § Relationship Integrity:
 *   1. Refuse to create a direct project-child scene in a project that
 *      already has chapters (no-mixed-children rule per
 *      [chapter-type.md § 9](../../docs/planning/chapter-type.md)).
 *   2. Create the scene note with the V1 template body and stamped
 *      essentials. Forward references — when chapter-less:
 *      `dbench-project` + `dbench-project-id` point at the project.
 *      When in a chapter: those still point at the project, plus
 *      `dbench-chapter` + `dbench-chapter-id` point at the chapter.
 *   3. Update the parent's reverse arrays — chapter-less: project's
 *      `dbench-scenes` / `dbench-scene-ids`. In a chapter: chapter's
 *      `dbench-scenes` / `dbench-scene-ids` instead.
 *
 * Returns the created scene file. Callers should run inside
 * `linker.withSuspended(...)` so intermediate states don't trigger
 * sync.
 */
export async function createScene(
	app: App,
	settings: DraftBenchSettings,
	options: CreateSceneOptions
): Promise<TFile> {
	const projectId = options.project.frontmatter['dbench-id'];

	// No-mixed-children check (chapter-type.md § 9): if no chapter parent
	// is supplied AND the project has chapters, refuse.
	if (options.chapter === undefined) {
		const projectFm = options.project.frontmatter as unknown as Record<string, unknown>;
		const existingChapterIds = readArray(projectFm['dbench-chapter-ids']);
		if (existingChapterIds.length > 0) {
			throw new Error(
				`Project "${options.project.file.basename}" has chapters; new scenes must be created inside a chapter.`
			);
		}
	}

	const { folderPath, filePath } = resolveScenePaths(
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
	const chapterId = options.chapter?.frontmatter['dbench-id'] ?? '';
	const chapterWikilink = options.chapter
		? `[[${options.chapter.file.basename}]]`
		: '';

	// Order semantic depends on parent: within-chapter for scene-in-chapter,
	// within-project for chapter-less scenes (per § 3).
	const order = options.order
		?? (options.chapter
			? nextSceneOrderInChapter(app, chapterId)
			: nextSceneOrder(app, projectId));

	const defaultStatus = settings.statusVocabulary[0];
	const status = options.status ?? defaultStatus;

	const context: TemplateContext = {
		project: projectWikilink,
		projectTitle: options.project.file.basename,
		sceneTitle: options.title.trim(),
		sceneOrder: order,
		date: isoDate(),
		previousSceneTitle: previousSceneTitleAt(app, projectId, order),
	};

	const file = await renderSceneBody(
		app,
		settings,
		context,
		filePath,
		options.templateFile
	);

	// Capture id inside the callback to avoid the cache-reparse race. Refs #15.
	let sceneId = '';
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set scene-specific fields so stampSceneEssentials' setIfMissing
		// leaves them alone.
		frontmatter['dbench-project'] = projectWikilink;
		frontmatter['dbench-project-id'] = projectId;
		if (options.chapter) {
			frontmatter['dbench-chapter'] = chapterWikilink;
			frontmatter['dbench-chapter-id'] = chapterId;
		}
		frontmatter['dbench-order'] = order;
		frontmatter['dbench-status'] = status;
		stampSceneEssentials(frontmatter, {
			basename: file.basename,
			defaultStatus,
		});
		sceneId = String(frontmatter['dbench-id'] ?? '');
	});

	const sceneWikilink = `[[${file.basename}]]`;

	// Update reverse array on the *immediate* parent (chapter or project).
	const parentFile = options.chapter?.file ?? options.project.file;
	await app.fileManager.processFrontMatter(parentFile, (frontmatter) => {
		const scenes = readArray(frontmatter['dbench-scenes']);
		const sceneIds = readArray(frontmatter['dbench-scene-ids']);
		if (!scenes.includes(sceneWikilink)) scenes.push(sceneWikilink);
		if (!sceneIds.includes(sceneId)) sceneIds.push(sceneId);
		frontmatter['dbench-scenes'] = scenes;
		frontmatter['dbench-scene-ids'] = sceneIds;
	});

	return file;
}

/**
 * Produce the scene file with its initial body.
 *
 * When Templater is installed, the scene file is created empty, then
 * Templater processes the template with the new scene file as its
 * `tp.file.*` context. Our plugin-token substitution runs on the
 * result; Templater's `<% %>` and our `{{...}}` don't collide, so the
 * order is interchangeable in practice but fixed for predictability.
 *
 * When Templater isn't installed (or throws), the scene file is
 * created directly with the plain plugin-token-substituted body. A
 * Templater failure surfaces as a Notice but doesn't block scene
 * creation.
 */
async function renderSceneBody(
	app: App,
	settings: DraftBenchSettings,
	context: TemplateContext,
	filePath: string,
	explicitTemplateFile?: TFile
): Promise<TFile> {
	// When the writer picked a named template via the modal, use it
	// directly. Otherwise fall back to the seed-on-first-use flow that
	// resolves `settings.sceneTemplatePath` (or the default well-known
	// file) and creates it if absent.
	const templateFile =
		explicitTemplateFile ?? (await ensureSceneTemplateFile(app, settings));

	if (isTemplaterEnabled(app)) {
		const emptyFile = await app.vault.create(filePath, '');
		const processed = await renderTemplateThroughTemplater(
			app,
			templateFile,
			emptyFile
		);
		if (processed === null) {
			new Notice(
				'Templater failed to process the scene template; using the plain template body.'
			);
			const fallback = substituteTokens(await app.vault.read(templateFile), context);
			await app.vault.modify(emptyFile, fallback);
			return emptyFile;
		}
		const body = substituteTokens(processed, context);
		await app.vault.modify(emptyFile, body);
		return emptyFile;
	}

	// Plain (non-Templater) flow: read + substitute. When the explicit
	// template was provided, this is the named-template path; otherwise
	// the resolved default seeded above.
	const body = substituteTokens(await app.vault.read(templateFile), context);
	return app.vault.create(filePath, body);
}

/**
 * Defensive array reader: returns the array as-is, or [] if the value
 * isn't an array (covers null / undefined / corrupted entries).
 */
function readArray(value: unknown): string[] {
	if (Array.isArray(value)) return value as string[];
	return [];
}

/**
 * Return the basename of the scene whose `dbench-order` is the largest
 * value strictly less than `order` within `projectId`, or `''` if
 * `order` is the first scene in the project.
 *
 * Used to populate the `{{previous_scene_title}}` template token; a
 * pure projection over `findScenesInProject`, so no vault writes here.
 */
function previousSceneTitleAt(
	app: App,
	projectId: DbenchId,
	order: number
): string {
	const scenes = findScenesInProject(app, projectId).filter(
		(s) => s.frontmatter['dbench-order'] < order
	);
	if (scenes.length === 0) return '';
	const previous = scenes.reduce<SceneNote>(
		(best, current) =>
			current.frontmatter['dbench-order'] > best.frontmatter['dbench-order']
				? current
				: best,
		scenes[0]
	);
	return previous.file.basename;
}
