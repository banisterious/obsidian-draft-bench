import { Notice, type App, type TFile } from 'obsidian';
import type { DbenchId, DbenchStatus } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import type { ProjectNote, SceneNote } from './discovery';
import { findScenesInProject } from './discovery';
import { stampSceneEssentials } from './essentials';
import {
	ensureSceneTemplateFile,
	isoDate,
	resolveSceneTemplate,
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

	/** Scene title (also the filename). */
	title: string;

	/** Sort position; defaults to `max(existing dbench-order) + 1`. */
	order?: number;

	/** Initial workflow status; defaults to 'idea'. */
	status?: DbenchStatus;

	/**
	 * Override for the scenes-folder template. Falls back to
	 * `settings.scenesFolder`. Supports `{project}` token, replaced
	 * with the project's basename.
	 */
	location?: string;
}

export interface ResolvedScenePaths {
	folderPath: string;
	filePath: string;
}

/**
 * Pure path resolution. The folder path is `settings.scenesFolder`
 * (or `options.location`) interpreted **relative to the project's
 * folder**, with `{project}` expanded to the project's basename. An
 * empty template (the default) places the scene alongside the project
 * note; a non-empty template nests it in a subfolder. The file path
 * appends `<title>.md`.
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
 * Compute the next sort order for a new scene in `projectId`.
 * Returns `max(existing dbench-order) + 1`, or 1 if none exist.
 */
export function nextSceneOrder(app: App, projectId: DbenchId): number {
	const existing = findScenesInProject(app, projectId);
	if (existing.length === 0) return 1;
	const maxOrder = Math.max(
		...existing.map((s) => s.frontmatter['dbench-order'])
	);
	return maxOrder + 1;
}

/**
 * Create a new scene note in `options.project`.
 *
 * Two-file write per spec § Relationship Integrity:
 *   1. Create the scene note with the V1 template body and stamped
 *      essentials. Forward references (`dbench-project`,
 *      `dbench-project-id`) point at `options.project`.
 *   2. Update the project's reverse arrays (`dbench-scenes`,
 *      `dbench-scene-ids`).
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

	const projectId = options.project.frontmatter['dbench-id'];
	const projectWikilink = `[[${options.project.file.basename}]]`;
	const order = options.order ?? nextSceneOrder(app, projectId);
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

	const file = await renderSceneBody(app, settings, context, filePath);

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set scene-specific fields so stampSceneEssentials' setIfMissing
		// leaves them alone.
		frontmatter['dbench-project'] = projectWikilink;
		frontmatter['dbench-project-id'] = projectId;
		frontmatter['dbench-order'] = order;
		frontmatter['dbench-status'] = status;
		stampSceneEssentials(frontmatter, {
			basename: file.basename,
			defaultStatus,
		});
	});

	const sceneId = String(
		app.metadataCache.getFileCache(file)?.frontmatter?.['dbench-id'] ?? ''
	);
	const sceneWikilink = `[[${file.basename}]]`;

	await app.fileManager.processFrontMatter(options.project.file, (frontmatter) => {
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
	filePath: string
): Promise<TFile> {
	if (isTemplaterEnabled(app)) {
		const templateFile = await ensureSceneTemplateFile(app, settings);
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

	const body = await resolveSceneTemplate(app, settings, context);
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
