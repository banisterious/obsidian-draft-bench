import { Notice, type App, type TFile } from 'obsidian';
import type { DbenchId, DbenchStatus } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import type { ProjectNote, SceneNote, SubSceneNote } from './discovery';
import { findSubScenesInScene } from './discovery';
import { stampSubSceneEssentials } from './essentials';
import {
	ensureSubSceneTemplateFile,
	isoDate,
	substituteSubSceneTokens,
	type SubSceneTemplateContext,
} from './templates';
import {
	isTemplaterEnabled,
	renderTemplateThroughTemplater,
} from './templater';

/**
 * Sub-scene creation: resolves the target file path (default
 * `<project>/<scene>/<title>.md` per [sub-scene-type.md § 10](../../docs/planning/sub-scene-type.md)),
 * renders the sub-scene template (seeding the built-in default if the
 * user's template file is absent), stamps essentials linked to the
 * parent scene + project, and appends to the parent scene's
 * `dbench-sub-scenes` / `dbench-sub-scene-ids` reverse arrays.
 *
 * Per the spec's "suspended states" list, callers should run this inside
 * `linker.withSuspended(...)` so the linker doesn't try to sync
 * intermediate states. The reverse-array update happens inline; once the
 * linker handles scene↔sub-scene (Step 4), this manual update can become
 * belt-and-suspenders or be removed.
 *
 * No mixed-children rule applies — per [sub-scene-type.md § 9](../../docs/planning/sub-scene-type.md),
 * a scene with both `## Draft` intro prose AND sub-scenes is a legitimate
 * shape (the `## Draft` becomes scene-introductory prose).
 */

const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/;

export interface CreateSubSceneOptions {
	/** The project this sub-scene's parent scene belongs to. */
	project: ProjectNote;

	/** The parent scene this sub-scene belongs to. */
	scene: SceneNote;

	/** Sub-scene title (also the filename). */
	title: string;

	/** Sort position within the parent scene; defaults to `max(existing dbench-order) + 1`. */
	order?: number;

	/** Initial workflow status; defaults to `settings.statusVocabulary[0]`. */
	status?: DbenchStatus;

	/**
	 * Override for the sub-scenes-folder template. Falls back to
	 * `settings.subScenesFolder`. Supports `{project}` and `{scene}`
	 * tokens, replaced with the project's basename and the parent
	 * scene's basename respectively.
	 */
	location?: string;

	/**
	 * Optional explicit template file to use for this sub-scene's body,
	 * picked by the writer in the new-sub-scene modal. Falls back to
	 * the configured default (per `settings.subSceneTemplatePath`) when
	 * absent. Bypasses the auto-seed flow — the file is assumed to exist
	 * (it was discovered by `discoverTemplates`).
	 */
	templateFile?: TFile;
}

export interface ResolvedSubScenePaths {
	folderPath: string;
	filePath: string;
}

/**
 * Pure path resolution. The folder path is `settings.subScenesFolder`
 * (or `options.location`) interpreted **relative to the parent scene's
 * folder** (per [issue #12](https://github.com/banisterious/obsidian-draft-bench/issues/12)),
 * with `{project}` expanded to the project's basename and `{scene}`
 * expanded to the parent scene's basename. Joining against the scene's
 * folder rather than the project's keeps sub-scenes nested next to
 * their parent scene wherever that scene lives — chapter-aware scenes
 * (post-#11) get sub-scenes nested under the chapter folder; chapter-
 * less scenes get them nested at the project root; writer-customized
 * scene locations carry sub-scenes along automatically. The default
 * `'{scene}/'` produces a `<scene-folder>/<scene-name>/` subfolder; an
 * empty template places the sub-scene alongside the parent scene (flat
 * opt-out per § 10). The file path appends `<title>.md`.
 */
export function resolveSubScenePaths(
	settings: DraftBenchSettings,
	project: ProjectNote,
	scene: SceneNote,
	options: CreateSubSceneOptions
): ResolvedSubScenePaths {
	const title = options.title.trim();
	if (title === '') {
		throw new Error('Sub-scene title cannot be empty.');
	}
	if (FILENAME_FORBIDDEN_CHARS.test(title)) {
		throw new Error(
			`Sub-scene title contains characters not allowed in filenames: ${title}`
		);
	}

	const template = options.location ?? settings.subScenesFolder;
	const relative = template
		.replace(/\{project\}/g, project.file.basename)
		.replace(/\{scene\}/g, scene.file.basename)
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');

	const sceneFolder = parentPath(scene.file.path);
	const folderPath = relative === ''
		? sceneFolder
		: sceneFolder === ''
			? relative
			: `${sceneFolder}/${relative}`;

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
 * Compute the next sort order for a new sub-scene inside `sceneId`.
 * Returns `max(existing dbench-order in this scene) + 1`, or 1 if none
 * exist.
 */
export function nextSubSceneOrder(app: App, sceneId: DbenchId): number {
	const existing = findSubScenesInScene(app, sceneId);
	if (existing.length === 0) return 1;
	const maxOrder = Math.max(
		...existing.map((s) => s.frontmatter['dbench-order'])
	);
	return maxOrder + 1;
}

/**
 * Create a new sub-scene note inside `options.scene`.
 *
 * Two-file write per spec § Relationship Integrity:
 *   1. Render the sub-scene template (with optional Templater pass-through
 *      and plugin-token substitution), seeding the built-in template file
 *      on first use; create the sub-scene note with that body and stamped
 *      essentials. Forward references (`dbench-project`,
 *      `dbench-project-id`, `dbench-scene`, `dbench-scene-id`) point at
 *      the parents.
 *   2. Update the parent scene's reverse arrays (`dbench-sub-scenes`,
 *      `dbench-sub-scene-ids`).
 *
 * Returns the created sub-scene file. Callers should run inside
 * `linker.withSuspended(...)` so intermediate states don't trigger sync.
 */
export async function createSubScene(
	app: App,
	settings: DraftBenchSettings,
	options: CreateSubSceneOptions
): Promise<TFile> {
	const projectId = options.project.frontmatter['dbench-id'];
	const sceneId = options.scene.frontmatter['dbench-id'];

	const { folderPath, filePath } = resolveSubScenePaths(
		settings,
		options.project,
		options.scene,
		options
	);

	if (app.vault.getAbstractFileByPath(filePath) !== null) {
		throw new Error(`A file already exists at ${filePath}.`);
	}

	if (folderPath !== '' && app.vault.getAbstractFileByPath(folderPath) === null) {
		await app.vault.createFolder(folderPath);
	}

	const projectWikilink = `[[${options.project.file.basename}]]`;
	const sceneWikilink = `[[${options.scene.file.basename}]]`;
	const order = options.order ?? nextSubSceneOrder(app, sceneId);
	const defaultStatus = settings.statusVocabulary[0];
	const status = options.status ?? defaultStatus;

	const context: SubSceneTemplateContext = {
		project: projectWikilink,
		projectTitle: options.project.file.basename,
		scene: sceneWikilink,
		sceneTitle: options.scene.file.basename,
		subSceneTitle: options.title.trim(),
		subSceneOrder: order,
		date: isoDate(),
		previousSubSceneTitle: previousSubSceneTitleAt(app, sceneId, order),
	};

	const file = await renderSubSceneBody(
		app,
		settings,
		context,
		filePath,
		options.templateFile
	);

	// Capture id inside the callback to avoid the cache-reparse race. Refs #15.
	let subSceneId = '';
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set sub-scene-specific fields so stampSubSceneEssentials'
		// setIfMissing leaves them alone.
		frontmatter['dbench-project'] = projectWikilink;
		frontmatter['dbench-project-id'] = projectId;
		frontmatter['dbench-scene'] = sceneWikilink;
		frontmatter['dbench-scene-id'] = sceneId;
		frontmatter['dbench-order'] = order;
		frontmatter['dbench-status'] = status;
		stampSubSceneEssentials(frontmatter, {
			basename: file.basename,
			defaultStatus,
		});
		subSceneId = String(frontmatter['dbench-id'] ?? '');
	});

	const subSceneWikilink = `[[${file.basename}]]`;

	// Update reverse arrays on the parent scene.
	await app.fileManager.processFrontMatter(options.scene.file, (frontmatter) => {
		const subScenes = readArray(frontmatter['dbench-sub-scenes']);
		const subSceneIds = readArray(frontmatter['dbench-sub-scene-ids']);
		if (!subScenes.includes(subSceneWikilink)) subScenes.push(subSceneWikilink);
		if (!subSceneIds.includes(subSceneId)) subSceneIds.push(subSceneId);
		frontmatter['dbench-sub-scenes'] = subScenes;
		frontmatter['dbench-sub-scene-ids'] = subSceneIds;
	});

	return file;
}

/**
 * Produce the sub-scene file with its initial body. Mirrors
 * `renderSceneBody` in scenes.ts: when Templater is installed, the
 * sub-scene file is created empty, Templater processes the template
 * with the new file as its `tp.file.*` context, and the plugin-token
 * substitution runs on the result. When Templater is absent (or throws),
 * the file is created with the plain plugin-token-substituted body. A
 * Templater failure surfaces as a Notice but doesn't block sub-scene
 * creation.
 */
async function renderSubSceneBody(
	app: App,
	settings: DraftBenchSettings,
	context: SubSceneTemplateContext,
	filePath: string,
	explicitTemplateFile?: TFile
): Promise<TFile> {
	const templateFile =
		explicitTemplateFile ?? (await ensureSubSceneTemplateFile(app, settings));

	if (isTemplaterEnabled(app)) {
		const emptyFile = await app.vault.create(filePath, '');
		const processed = await renderTemplateThroughTemplater(
			app,
			templateFile,
			emptyFile
		);
		if (processed === null) {
			new Notice(
				'Templater failed to process the sub-scene template; using the plain template body.'
			);
			const fallback = substituteSubSceneTokens(
				await app.vault.read(templateFile),
				context
			);
			await app.vault.modify(emptyFile, fallback);
			return emptyFile;
		}
		const body = substituteSubSceneTokens(processed, context);
		await app.vault.modify(emptyFile, body);
		return emptyFile;
	}

	const body = substituteSubSceneTokens(
		await app.vault.read(templateFile),
		context
	);
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
 * Return the basename of the sub-scene whose `dbench-order` is the
 * largest value strictly less than `order` within `sceneId`, or `''` if
 * `order` is the first sub-scene in the scene. Used to populate the
 * `{{previous_sub_scene_title}}` template token.
 */
function previousSubSceneTitleAt(
	app: App,
	sceneId: DbenchId,
	order: number
): string {
	const subScenes = findSubScenesInScene(app, sceneId).filter(
		(s) => s.frontmatter['dbench-order'] < order
	);
	if (subScenes.length === 0) return '';
	const previous = subScenes.reduce<SubSceneNote>(
		(best, current) =>
			current.frontmatter['dbench-order'] > best.frontmatter['dbench-order']
				? current
				: best,
		subScenes[0]
	);
	return previous.file.basename;
}
