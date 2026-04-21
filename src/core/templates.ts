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
 * Filename for the single-template-per-type V1 model (see
 * architecture.md § P2.A). A future iteration may support multiple
 * named templates per type.
 */
export const SCENE_TEMPLATE_FILENAME = 'scene-template.md';

/**
 * Context for plugin-token substitution.
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

const TOKEN_PATTERN = /\{\{([a-z_]+)\}\}/g;

/**
 * Pure token substitution over a template body. Recognized tokens
 * (see `TemplateContext`) are replaced with the corresponding context
 * value; unknown `{{token}}` sequences are left untouched so Templater
 * (or the writer's own tooling) can handle them later.
 */
export function substituteTokens(
	body: string,
	context: TemplateContext
): string {
	return body.replace(TOKEN_PATTERN, (match, token: string) => {
		switch (token) {
			case 'project':
				return context.project;
			case 'project_title':
				return context.projectTitle;
			case 'scene_title':
				return context.sceneTitle;
			case 'scene_order':
				return String(context.sceneOrder);
			case 'date':
				return context.date;
			case 'previous_scene_title':
				return context.previousSceneTitle;
			default:
				return match;
		}
	});
}

/**
 * Resolve the scene-template file path from the configured folder.
 * Normalizes leading / trailing slashes so `'Templates'`, `'Templates/'`,
 * and `'/Templates/'` all produce the same result.
 */
export function resolveSceneTemplatePath(templatesFolder: string): string {
	const normalized = templatesFolder.replace(/^\/+|\/+$/g, '');
	return normalized === ''
		? SCENE_TEMPLATE_FILENAME
		: `${normalized}/${SCENE_TEMPLATE_FILENAME}`;
}

/**
 * Load the scene-template body from disk, seeding the file with
 * `BUILTIN_SCENE_TEMPLATE` if it doesn't exist. The templates folder
 * is created on demand.
 *
 * Returns the raw body (pre-substitution). Callers chain
 * `substituteTokens` to produce the final body, or use
 * `resolveSceneTemplate` which does both.
 */
export async function loadSceneTemplateBody(
	app: App,
	settings: DraftBenchSettings
): Promise<string> {
	const path = resolveSceneTemplatePath(settings.templatesFolder);
	const existing = app.vault.getAbstractFileByPath(path);

	if (existing !== null && isFile(existing)) {
		return app.vault.read(existing);
	}

	const folder = parentPath(path);
	if (folder !== '' && app.vault.getAbstractFileByPath(folder) === null) {
		await app.vault.createFolder(folder);
	}

	await app.vault.create(path, BUILTIN_SCENE_TEMPLATE);
	return BUILTIN_SCENE_TEMPLATE;
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
