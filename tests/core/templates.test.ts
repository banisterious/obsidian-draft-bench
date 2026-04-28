import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	BUILTIN_CHAPTER_TEMPLATE,
	BUILTIN_SCENE_TEMPLATE,
	CHAPTER_TEMPLATE_FILENAME,
	SCENE_TEMPLATE_FILENAME,
	discoverTemplates,
	isoDate,
	loadChapterTemplateBody,
	loadSceneTemplateBody,
	renderChapterTemplateFile,
	renderSceneTemplateFile,
	resolveChapterTemplate,
	resolveChapterTemplatePath,
	resolveSceneTemplate,
	resolveSceneTemplatePath,
	substituteChapterTokens,
	substituteTokens,
	type ChapterTemplateContext,
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
	function withFolder(templatesFolder: string): DraftBenchSettings {
		return { ...DEFAULT_SETTINGS, templatesFolder, sceneTemplatePath: '' };
	}

	function withOverride(sceneTemplatePath: string): DraftBenchSettings {
		return { ...DEFAULT_SETTINGS, sceneTemplatePath };
	}

	it('joins the folder and filename with trailing slash', () => {
		expect(resolveSceneTemplatePath(withFolder('Draft Bench/Templates/'))).toBe(
			`Draft Bench/Templates/${SCENE_TEMPLATE_FILENAME}`
		);
	});

	it('joins the folder and filename without trailing slash', () => {
		expect(resolveSceneTemplatePath(withFolder('Draft Bench/Templates'))).toBe(
			`Draft Bench/Templates/${SCENE_TEMPLATE_FILENAME}`
		);
	});

	it('strips leading slashes', () => {
		expect(resolveSceneTemplatePath(withFolder('/Templates/'))).toBe(
			`Templates/${SCENE_TEMPLATE_FILENAME}`
		);
	});

	it('places the file at the vault root for an empty folder', () => {
		expect(resolveSceneTemplatePath(withFolder(''))).toBe(
			SCENE_TEMPLATE_FILENAME
		);
	});

	it('treats a slash-only value as vault root', () => {
		expect(resolveSceneTemplatePath(withFolder('/'))).toBe(
			SCENE_TEMPLATE_FILENAME
		);
	});

	it('honors sceneTemplatePath override when set', () => {
		expect(
			resolveSceneTemplatePath(withOverride('Shared/custom.md'))
		).toBe('Shared/custom.md');
	});

	it('override trims whitespace and ignores blank values', () => {
		expect(resolveSceneTemplatePath(withOverride('   '))).toBe(
			`Draft Bench/Templates/${SCENE_TEMPLATE_FILENAME}`
		);
	});

	it('override strips a single leading slash', () => {
		expect(
			resolveSceneTemplatePath(withOverride('/custom/path.md'))
		).toBe('custom/path.md');
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

		const path = resolveSceneTemplatePath(settings);
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
		const path = resolveSceneTemplatePath(settings);
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
		const path = resolveSceneTemplatePath(settings);
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

function makeChapterContext(
	over: Partial<ChapterTemplateContext> = {}
): ChapterTemplateContext {
	return {
		project: '[[My Novel]]',
		projectTitle: 'My Novel',
		chapterTitle: 'Chapter 1',
		chapterOrder: 1,
		date: '2026-04-27',
		previousChapterTitle: '',
		...over,
	};
}

describe('substituteChapterTokens', () => {
	it('substitutes every recognized chapter token', () => {
		const body =
			'{{project}} | {{project_title}} | {{chapter_title}} | ' +
			'{{chapter_order}} | {{date}} | {{previous_chapter_title}}';
		expect(
			substituteChapterTokens(
				body,
				makeChapterContext({
					previousChapterTitle: 'Prologue',
					chapterOrder: 3,
				})
			)
		).toBe(
			'[[My Novel]] | My Novel | Chapter 1 | 3 | 2026-04-27 | Prologue'
		);
	});

	it('leaves unknown tokens untouched', () => {
		expect(
			substituteChapterTokens('{{unknown}} keep me', makeChapterContext())
		).toBe('{{unknown}} keep me');
	});

	it('leaves scene tokens untouched (chapter context only)', () => {
		expect(
			substituteChapterTokens(
				'{{scene_title}} {{previous_scene_title}}',
				makeChapterContext()
			)
		).toBe('{{scene_title}} {{previous_scene_title}}');
	});

	it('emits the empty string for missing previous chapter', () => {
		expect(
			substituteChapterTokens(
				'before: {{previous_chapter_title}}',
				makeChapterContext()
			)
		).toBe('before: ');
	});
});

describe('resolveChapterTemplatePath', () => {
	function withFolder(templatesFolder: string): DraftBenchSettings {
		return {
			...DEFAULT_SETTINGS,
			templatesFolder,
			chapterTemplatePath: '',
		};
	}

	function withOverride(chapterTemplatePath: string): DraftBenchSettings {
		return { ...DEFAULT_SETTINGS, chapterTemplatePath };
	}

	it('joins the folder and filename with trailing slash', () => {
		expect(
			resolveChapterTemplatePath(withFolder('Draft Bench/Templates/'))
		).toBe(`Draft Bench/Templates/${CHAPTER_TEMPLATE_FILENAME}`);
	});

	it('places the file at the vault root for an empty folder', () => {
		expect(resolveChapterTemplatePath(withFolder(''))).toBe(
			CHAPTER_TEMPLATE_FILENAME
		);
	});

	it('honors chapterTemplatePath override when set', () => {
		expect(
			resolveChapterTemplatePath(withOverride('Shared/chapter-custom.md'))
		).toBe('Shared/chapter-custom.md');
	});

	it('override trims whitespace and ignores blank values', () => {
		expect(resolveChapterTemplatePath(withOverride('   '))).toBe(
			`Draft Bench/Templates/${CHAPTER_TEMPLATE_FILENAME}`
		);
	});

	it('override strips a single leading slash', () => {
		expect(
			resolveChapterTemplatePath(withOverride('/custom/chapter.md'))
		).toBe('custom/chapter.md');
	});

	it('uses the chapter filename, not the scene filename', () => {
		const path = resolveChapterTemplatePath(
			withFolder('Draft Bench/Templates/')
		);
		expect(path.endsWith(CHAPTER_TEMPLATE_FILENAME)).toBe(true);
		expect(path.endsWith(SCENE_TEMPLATE_FILENAME)).toBe(false);
	});
});

describe('loadChapterTemplateBody', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('seeds the template file with the built-in body when absent', async () => {
		const body = await loadChapterTemplateBody(app, settings);

		expect(body).toBe(BUILTIN_CHAPTER_TEMPLATE);

		const path = resolveChapterTemplatePath(settings);
		const seeded = app.vault.getAbstractFileByPath(path);
		expect(seeded).toBeInstanceOf(TFile);
		expect(await app.vault.read(seeded as TFile)).toBe(
			BUILTIN_CHAPTER_TEMPLATE
		);
	});

	it('returns the existing template body without reseeding', async () => {
		const customBody = '## Chapter overview\n\n{{chapter_title}}\n';
		const path = resolveChapterTemplatePath(settings);
		const folder = path.slice(0, path.lastIndexOf('/'));
		await app.vault.createFolder(folder);
		await app.vault.create(path, customBody);

		const body = await loadChapterTemplateBody(app, settings);
		expect(body).toBe(customBody);
	});

	it('seeds independently of the scene template', async () => {
		await loadChapterTemplateBody(app, settings);

		const scenePath = resolveSceneTemplatePath(settings);
		const chapterPath = resolveChapterTemplatePath(settings);
		expect(app.vault.getAbstractFileByPath(scenePath)).toBeNull();
		expect(app.vault.getAbstractFileByPath(chapterPath)).toBeInstanceOf(
			TFile
		);
	});
});

describe('resolveChapterTemplate', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('loads the template and substitutes tokens end to end', async () => {
		const customBody =
			'# {{chapter_title}} ({{chapter_order}})\n\n{{date}}\n';
		const path = resolveChapterTemplatePath(settings);
		const folder = path.slice(0, path.lastIndexOf('/'));
		await app.vault.createFolder(folder);
		await app.vault.create(path, customBody);

		const rendered = await resolveChapterTemplate(
			app,
			settings,
			makeChapterContext({
				chapterTitle: 'Crossing the river',
				chapterOrder: 2,
				date: '2026-04-27',
			})
		);

		expect(rendered).toBe('# Crossing the river (2)\n\n2026-04-27\n');
	});

	it('uses the built-in body on a cold vault', async () => {
		const rendered = await resolveChapterTemplate(
			app,
			settings,
			makeChapterContext()
		);
		expect(rendered).toBe(BUILTIN_CHAPTER_TEMPLATE);
	});
});

describe('discoverTemplates', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	async function createTemplate(
		path: string,
		fm: Record<string, unknown>,
		body = ''
	): Promise<TFile> {
		const folder = path.slice(0, path.lastIndexOf('/'));
		if (folder !== '' && app.vault.getAbstractFileByPath(folder) === null) {
			await app.vault.createFolder(folder);
		}
		const file = await app.vault.create(path, body);
		await app.fileManager.processFrontMatter(file, (front) => {
			Object.assign(front, fm);
		});
		return file;
	}

	it('returns empty list when templates folder is unset', () => {
		const empty = { ...settings, templatesFolder: '' };
		expect(discoverTemplates(app, empty, 'scene')).toEqual([]);
	});

	it('always includes the well-known scene-template.md as default', async () => {
		await createTemplate(
			`Draft Bench/Templates/${SCENE_TEMPLATE_FILENAME}`,
			{}
		);
		const result = discoverTemplates(app, settings, 'scene');
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('scene-template');
		expect(result[0].isDefault).toBe(true);
	});

	it('includes named scene templates with type frontmatter', async () => {
		await createTemplate(`Draft Bench/Templates/pov-anna.md`, {
			'dbench-template-type': 'scene',
			'dbench-template-name': 'POV — Anna',
		});
		await createTemplate(`Draft Bench/Templates/pov-marcus.md`, {
			'dbench-template-type': 'scene',
		});

		const result = discoverTemplates(app, settings, 'scene');
		expect(result).toHaveLength(2);
		expect(result.map((t) => t.name).sort()).toEqual([
			'POV — Anna',
			'pov-marcus',
		]);
	});

	it('filters out templates of the wrong type', async () => {
		await createTemplate(`Draft Bench/Templates/scene-pov.md`, {
			'dbench-template-type': 'scene',
		});
		await createTemplate(`Draft Bench/Templates/chapter-arc.md`, {
			'dbench-template-type': 'chapter',
		});

		const sceneTemplates = discoverTemplates(app, settings, 'scene');
		const chapterTemplates = discoverTemplates(app, settings, 'chapter');

		expect(sceneTemplates.map((t) => t.file.basename)).toEqual([
			'scene-pov',
		]);
		expect(chapterTemplates.map((t) => t.file.basename)).toEqual([
			'chapter-arc',
		]);
	});

	it('excludes files without the type frontmatter (non-DB templates)', async () => {
		// Simulating a Templater plugin template in the same folder.
		await createTemplate(`Draft Bench/Templates/random.md`, {
			'tags': ['templater'],
		});
		const result = discoverTemplates(app, settings, 'scene');
		expect(result).toEqual([]);
	});

	it('sorts default first, then alphabetical', async () => {
		await createTemplate(
			`Draft Bench/Templates/${SCENE_TEMPLATE_FILENAME}`,
			{}
		);
		await createTemplate(`Draft Bench/Templates/zebra.md`, {
			'dbench-template-type': 'scene',
		});
		await createTemplate(`Draft Bench/Templates/alpha.md`, {
			'dbench-template-type': 'scene',
		});

		const result = discoverTemplates(app, settings, 'scene');
		expect(result.map((t) => t.name)).toEqual([
			'scene-template',
			'alpha',
			'zebra',
		]);
	});

	it('reads the optional description', async () => {
		await createTemplate(`Draft Bench/Templates/with-desc.md`, {
			'dbench-template-type': 'scene',
			'dbench-template-name': 'POV',
			'dbench-template-description': 'Single-POV scene with cue lines',
		});
		const result = discoverTemplates(app, settings, 'scene');
		expect(result[0].description).toBe('Single-POV scene with cue lines');
	});

	it('honors a custom templatesFolder setting', async () => {
		const customSettings = {
			...settings,
			templatesFolder: 'Writing/Templates/',
		};
		await createTemplate(`Writing/Templates/custom.md`, {
			'dbench-template-type': 'chapter',
		});
		// File in the default folder should not appear.
		await createTemplate(
			`Draft Bench/Templates/${CHAPTER_TEMPLATE_FILENAME}`,
			{}
		);

		const result = discoverTemplates(app, customSettings, 'chapter');
		expect(result.map((t) => t.file.basename)).toEqual(['custom']);
	});
});

describe('renderSceneTemplateFile', () => {
	it('reads the file body and substitutes scene tokens', async () => {
		const app = new App();
		const folder = 'Draft Bench/Templates';
		await app.vault.createFolder(folder);
		const file = await app.vault.create(
			`${folder}/named.md`,
			'# {{scene_title}}\n\nProject: {{project_title}}'
		);

		const rendered = await renderSceneTemplateFile(app, file, {
			project: '[[My Novel]]',
			projectTitle: 'My Novel',
			sceneTitle: 'Opening',
			sceneOrder: 1,
			date: '2026-04-28',
			previousSceneTitle: '',
		});

		expect(rendered).toBe('# Opening\n\nProject: My Novel');
	});
});

describe('renderChapterTemplateFile', () => {
	it('reads the file body and substitutes chapter tokens', async () => {
		const app = new App();
		const folder = 'Draft Bench/Templates';
		await app.vault.createFolder(folder);
		const file = await app.vault.create(
			`${folder}/named-chapter.md`,
			'# {{chapter_title}} ({{chapter_order}})'
		);

		const rendered = await renderChapterTemplateFile(app, file, {
			project: '[[My Novel]]',
			projectTitle: 'My Novel',
			chapterTitle: 'The Crossing',
			chapterOrder: 1,
			date: '2026-04-28',
			previousChapterTitle: '',
		});

		expect(rendered).toBe('# The Crossing (1)');
	});
});
