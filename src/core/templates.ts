import type { App, TFile } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';

/**
 * V1 built-in scene template body. Per
 * [specification.md § Scene Templates](../../docs/planning/specification.md),
 * the four section headings match the UC-01 short-story-from-sources
 * archetype. Writers can override by editing the seeded template file.
 */
export const BUILTIN_SCENE_TEMPLATE = `## Source passages

## Beat outline

## Open questions

## Draft

`;

/**
 * V1 built-in chapter template body. Mirrors the scene template's
 * planning-sections-plus-`## Draft` shape per
 * [chapter-type.md § 1](../../docs/planning/chapter-type.md). The
 * chapter body's `## Draft` section is chapter-introductory prose
 * only; it emits before the chapter's scenes in compile.
 */
export const BUILTIN_CHAPTER_TEMPLATE = `## Source passages

## Beat outline

## Open questions

## Draft

`;

export const SCENE_TEMPLATE_FILENAME = 'scene-template.md';
export const CHAPTER_TEMPLATE_FILENAME = 'chapter-template.md';

/**
 * Context for plugin-token substitution on scene templates.
 *
 * - `project`: wikilink form, e.g. `[[My Novel]]`.
 * - `projectTitle`: plain text, e.g. `My Novel`.
 * - `sceneTitle`: plain text, the new scene's basename.
 * - `sceneOrder`: numeric order assigned to the new scene.
 * - `date`: ISO date (YYYY-MM-DD) captured at substitution time.
 * - `previousSceneTitle`: basename of the scene one order below the
 *   new scene, or `''` if this is the first scene in the project.
 */
export interface TemplateContext {
	project: string;
	projectTitle: string;
	sceneTitle: string;
	sceneOrder: number;
	date: string;
	previousSceneTitle: string;
}

/**
 * Context for plugin-token substitution on chapter templates. Parallels
 * `TemplateContext` with chapter-flavored token names — `chapter_title`,
 * `chapter_order`, `previous_chapter_title` replace the scene tokens;
 * the shared tokens (`project`, `project_title`, `date`) carry the
 * same meaning.
 */
export interface ChapterTemplateContext {
	project: string;
	projectTitle: string;
	chapterTitle: string;
	chapterOrder: number;
	date: string;
	previousChapterTitle: string;
}

const TOKEN_PATTERN = /\{\{([a-z_]+)\}\}/g;

/**
 * Replace `{{token}}` occurrences in `body` from `tokenMap`. Tokens
 * absent from the map pass through untouched so Templater (or the
 * writer's own tooling) can handle them later. Case-sensitive by
 * design — `{{Project}}` is left alone.
 */
function substituteFromMap(
	body: string,
	tokenMap: Record<string, string>
): string {
	return body.replace(TOKEN_PATTERN, (match, token: string) => {
		return Object.prototype.hasOwnProperty.call(tokenMap, token)
			? tokenMap[token]
			: match;
	});
}

/**
 * Pure token substitution over a scene-template body. Recognized tokens
 * (see `TemplateContext`) are replaced with the corresponding context
 * value; unknown `{{token}}` sequences are left untouched.
 */
export function substituteTokens(
	body: string,
	context: TemplateContext
): string {
	return substituteFromMap(body, {
		project: context.project,
		project_title: context.projectTitle,
		scene_title: context.sceneTitle,
		scene_order: String(context.sceneOrder),
		date: context.date,
		previous_scene_title: context.previousSceneTitle,
	});
}

/**
 * Pure token substitution over a chapter-template body. Recognized
 * tokens (see `ChapterTemplateContext`) are replaced with the
 * corresponding context value; unknown `{{token}}` sequences are left
 * untouched.
 */
export function substituteChapterTokens(
	body: string,
	context: ChapterTemplateContext
): string {
	return substituteFromMap(body, {
		project: context.project,
		project_title: context.projectTitle,
		chapter_title: context.chapterTitle,
		chapter_order: String(context.chapterOrder),
		date: context.date,
		previous_chapter_title: context.previousChapterTitle,
	});
}

/**
 * Resolve a template file path from an override field + folder + default
 * filename. Used by both scene and chapter resolution. Override (when
 * trimmed non-empty) wins; otherwise joins the folder and the filename
 * with leading/trailing slashes normalized so `'Templates'`,
 * `'Templates/'`, and `'/Templates/'` all produce the same result. An
 * empty folder places the file at the vault root.
 */
function resolveTemplatePathHelper(
	override: string,
	templatesFolder: string,
	defaultFilename: string
): string {
	const trimmed = override.trim();
	if (trimmed !== '') {
		return trimmed.replace(/^\/+/, '');
	}
	const normalized = templatesFolder.replace(/^\/+|\/+$/g, '');
	return normalized === ''
		? defaultFilename
		: `${normalized}/${defaultFilename}`;
}

/**
 * Resolve the template TFile at `templatePath`, seeding it with
 * `builtinBody` if the file is absent. The parent folder is created on
 * demand. Used by both scene and chapter `ensureXxxTemplateFile`
 * callers.
 */
async function ensureTemplateFile(
	app: App,
	templatePath: string,
	builtinBody: string
): Promise<TFile> {
	const existing = app.vault.getAbstractFileByPath(templatePath);

	if (existing !== null && isFile(existing)) {
		return existing;
	}

	const folder = parentPath(templatePath);
	if (folder !== '' && app.vault.getAbstractFileByPath(folder) === null) {
		await app.vault.createFolder(folder);
	}

	return app.vault.create(templatePath, builtinBody);
}

/**
 * Resolve the scene-template file path. Uses `sceneTemplatePath` when
 * set (trimmed), otherwise falls back to
 * `<templatesFolder>/scene-template.md`.
 */
export function resolveSceneTemplatePath(settings: DraftBenchSettings): string {
	return resolveTemplatePathHelper(
		settings.sceneTemplatePath,
		settings.templatesFolder,
		SCENE_TEMPLATE_FILENAME
	);
}

/**
 * Resolve the scene-template TFile, seeding the file with
 * `BUILTIN_SCENE_TEMPLATE` on the path from `resolveSceneTemplatePath`
 * if it doesn't exist.
 *
 * The Templater integration uses the returned TFile as the input to
 * `read_and_parse_template`; the plain flow reads the file via
 * `loadSceneTemplateBody`. Either way the seed-on-first-use behavior
 * lives here.
 */
export async function ensureSceneTemplateFile(
	app: App,
	settings: DraftBenchSettings
): Promise<TFile> {
	return ensureTemplateFile(
		app,
		resolveSceneTemplatePath(settings),
		BUILTIN_SCENE_TEMPLATE
	);
}

/**
 * Load the scene-template body from disk, seeding the file with
 * `BUILTIN_SCENE_TEMPLATE` if it doesn't exist.
 *
 * Returns the raw body (pre-substitution). Callers chain
 * `substituteTokens` to produce the final body, or use
 * `resolveSceneTemplate` which does both.
 */
export async function loadSceneTemplateBody(
	app: App,
	settings: DraftBenchSettings
): Promise<string> {
	const file = await ensureSceneTemplateFile(app, settings);
	return app.vault.read(file);
}

/**
 * Load the scene template and apply `context` substitution.
 */
export async function resolveSceneTemplate(
	app: App,
	settings: DraftBenchSettings,
	context: TemplateContext
): Promise<string> {
	const body = await loadSceneTemplateBody(app, settings);
	return substituteTokens(body, context);
}

/**
 * Resolve the chapter-template file path. Uses `chapterTemplatePath`
 * when set (trimmed), otherwise falls back to
 * `<templatesFolder>/chapter-template.md`.
 */
export function resolveChapterTemplatePath(
	settings: DraftBenchSettings
): string {
	return resolveTemplatePathHelper(
		settings.chapterTemplatePath,
		settings.templatesFolder,
		CHAPTER_TEMPLATE_FILENAME
	);
}

/**
 * Resolve the chapter-template TFile, seeding the file with
 * `BUILTIN_CHAPTER_TEMPLATE` on the path from
 * `resolveChapterTemplatePath` if it doesn't exist.
 */
export async function ensureChapterTemplateFile(
	app: App,
	settings: DraftBenchSettings
): Promise<TFile> {
	return ensureTemplateFile(
		app,
		resolveChapterTemplatePath(settings),
		BUILTIN_CHAPTER_TEMPLATE
	);
}

/**
 * Load the chapter-template body from disk, seeding the file with
 * `BUILTIN_CHAPTER_TEMPLATE` if it doesn't exist.
 */
export async function loadChapterTemplateBody(
	app: App,
	settings: DraftBenchSettings
): Promise<string> {
	const file = await ensureChapterTemplateFile(app, settings);
	return app.vault.read(file);
}

/**
 * Load the chapter template and apply `context` substitution.
 */
export async function resolveChapterTemplate(
	app: App,
	settings: DraftBenchSettings,
	context: ChapterTemplateContext
): Promise<string> {
	const body = await loadChapterTemplateBody(app, settings);
	return substituteChapterTokens(body, context);
}

/**
 * Current date as `YYYY-MM-DD`. Pulled out so tests can assert the
 * substitution shape without mocking global Date.
 */
export function isoDate(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

function parentPath(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return '';
	return filePath.slice(0, idx);
}

function isFile(target: unknown): target is TFile {
	return (
		typeof target === 'object' &&
		target !== null &&
		'extension' in target &&
		typeof (target as { extension: unknown }).extension === 'string'
	);
}
