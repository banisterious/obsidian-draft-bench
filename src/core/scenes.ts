import type { App, TFile } from 'obsidian';
import type { DbenchId, DbenchStatus } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import type { ProjectNote } from './discovery';
import { findScenesInProject } from './discovery';
import { stampSceneEssentials } from './essentials';

/**
 * Scene creation: resolves the target file path, creates the scene
 * note with the V1 template body, stamps essentials linked to the
 * parent project, and appends to the project's `dbench-scenes` /
 * `dbench-scene-ids` reverse arrays.
 *
 * Per the spec's "suspended states" list, callers should run this
 * inside `linker.withSuspended(...)` so the linker doesn't try to
 * sync intermediate states. The reverse-array update happens here
 * inline; once the linker handlers are real, this manual update
 * becomes redundant and can be removed.
 */

const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/;

const V1_SCENE_TEMPLATE = `## Source passages

## Beat outline

## Open questions

## Draft

`;

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
	const status = options.status ?? 'idea';

	const file = await app.vault.create(filePath, V1_SCENE_TEMPLATE);

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set scene-specific fields so stampSceneEssentials' setIfMissing
		// leaves them alone.
		frontmatter['dbench-project'] = projectWikilink;
		frontmatter['dbench-project-id'] = projectId;
		frontmatter['dbench-order'] = order;
		frontmatter['dbench-status'] = status;
		stampSceneEssentials(frontmatter, { basename: file.basename });
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
 * Defensive array reader: returns the array as-is, or [] if the value
 * isn't an array (covers null / undefined / corrupted entries).
 */
function readArray(value: unknown): string[] {
	if (Array.isArray(value)) return value as string[];
	return [];
}
