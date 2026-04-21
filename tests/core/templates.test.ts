import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	BUILTIN_SCENE_TEMPLATE,
	SCENE_TEMPLATE_FILENAME,
	isoDate,
	loadSceneTemplateBody,
	resolveSceneTemplate,
	resolveSceneTemplatePath,
	substituteTokens,
	type TemplateContext,
} from '../../src/core/templates';
import {
	DEFAULT_SETTINGS,
	type DraftBenchSettings,
} from '../../src/model/settings';

function makeContext(over: Partial<TemplateContext> = {}): TemplateContext {
	return {
		project: '[[My Novel]]',
		projectTitle: 'My Novel',
		sceneTitle: 'Chapter 1',
		sceneOrder: 1,
		date: '2026-04-21',
		previousSceneTitle: '',
		...over,
	};
}

describe('substituteTokens', () => {
	it('substitutes every recognized token', () => {
		const body =
			'{{project}} | {{project_title}} | {{scene_title}} | ' +
			'{{scene_order}} | {{date}} | {{previous_scene_title}}';
		expect(
			substituteTokens(
				body,
				makeContext({
					previousSceneTitle: 'Prologue',
					sceneOrder: 3,
				})
			)
		).toBe(
			'[[My Novel]] | My Novel | Chapter 1 | 3 | 2026-04-21 | Prologue'
		);
	});

	it('leaves unknown tokens untouched', () => {
		expect(substituteTokens('{{unknown}} keep me', makeContext())).toBe(
			'{{unknown}} keep me'
		);
	});

	it('substitutes repeated tokens in place', () => {
		expect(
			substituteTokens('{{scene_title}} - {{scene_title}}', makeContext())
		).toBe('Chapter 1 - Chapter 1');
	});

	it('does nothing when the body has no tokens', () => {
		expect(substituteTokens('plain text\n\nno tokens', makeContext())).toBe(
			'plain text\n\nno tokens'
		);
	});

	it('emits the empty string for missing previous scene', () => {
		expect(
			substituteTokens('before: {{previous_scene_title}}', makeContext())
		).toBe('before: ');
	});

	it('ignores capitalized tokens (case-sensitive by design)', () => {
		expect(substituteTokens('{{Project}}', makeContext())).toBe(
			'{{Project}}'
		);
	});
});

describe('resolveSceneTemplatePath', () => {
	it('joins the folder and filename with trailing slash', () => {
		expect(resolveSceneTemplatePath('Draft Bench/Templates/')).toBe(
			`Draft Bench/Templates/${SCENE_TEMPLATE_FILENAME}`
		);
	});

	it('joins the folder and filename without trailing slash', () => {
		expect(resolveSceneTemplatePath('Draft Bench/Templates')).toBe(
			`Draft Bench/Templates/${SCENE_TEMPLATE_FILENAME}`
		);
	});

	it('strips leading slashes', () => {
		expect(resolveSceneTemplatePath('/Templates/')).toBe(
			`Templates/${SCENE_TEMPLATE_FILENAME}`
		);
	});

	it('places the file at the vault root for an empty folder', () => {
		expect(resolveSceneTemplatePath('')).toBe(SCENE_TEMPLATE_FILENAME);
	});

	it('treats a slash-only value as vault root', () => {
		expect(resolveSceneTemplatePath('/')).toBe(SCENE_TEMPLATE_FILENAME);
	});
});

describe('loadSceneTemplateBody', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('seeds the template file with the built-in body when absent', async () => {
		const body = await loadSceneTemplateBody(app, settings);

		expect(body).toBe(BUILTIN_SCENE_TEMPLATE);

		const path = resolveSceneTemplatePath(settings.templatesFolder);
		const seeded = app.vault.getAbstractFileByPath(path);
		expect(seeded).toBeInstanceOf(TFile);
		expect(await app.vault.read(seeded as TFile)).toBe(
			BUILTIN_SCENE_TEMPLATE
		);
	});

	it('creates the templates folder on demand', async () => {
		await loadSceneTemplateBody(app, settings);

		const folderPath = settings.templatesFolder.replace(/\/+$/, '');
		expect(app.vault.getAbstractFileByPath(folderPath)).not.toBeNull();
	});

	it('returns the existing template body without reseeding', async () => {
		const customBody = '## Custom\n\n{{scene_title}}\n';
		const path = resolveSceneTemplatePath(settings.templatesFolder);
		const folder = path.slice(0, path.lastIndexOf('/'));
		await app.vault.createFolder(folder);
		await app.vault.create(path, customBody);

		const body = await loadSceneTemplateBody(app, settings);
		expect(body).toBe(customBody);
	});

	it('places the file at vault root when templatesFolder is empty', async () => {
		settings.templatesFolder = '';
		const body = await loadSceneTemplateBody(app, settings);

		expect(body).toBe(BUILTIN_SCENE_TEMPLATE);
		expect(
			app.vault.getAbstractFileByPath(SCENE_TEMPLATE_FILENAME)
		).toBeInstanceOf(TFile);
	});
});

describe('resolveSceneTemplate', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('loads the template and substitutes tokens end to end', async () => {
		const customBody = '# {{scene_title}} ({{scene_order}})\n\n{{date}}\n';
		const path = resolveSceneTemplatePath(settings.templatesFolder);
		const folder = path.slice(0, path.lastIndexOf('/'));
		await app.vault.createFolder(folder);
		await app.vault.create(path, customBody);

		const rendered = await resolveSceneTemplate(
			app,
			settings,
			makeContext({ sceneTitle: 'Opening', sceneOrder: 1, date: '2026-04-21' })
		);

		expect(rendered).toBe('# Opening (1)\n\n2026-04-21\n');
	});

	it('uses the built-in body on a cold vault', async () => {
		const rendered = await resolveSceneTemplate(app, settings, makeContext());
		expect(rendered).toBe(BUILTIN_SCENE_TEMPLATE);
	});
});

describe('isoDate', () => {
	it('formats YYYY-MM-DD', () => {
		expect(isoDate(new Date('2026-04-21T15:30:00Z'))).toBe('2026-04-21');
	});

	it('defaults to the current date when called with no arg', () => {
		expect(isoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
