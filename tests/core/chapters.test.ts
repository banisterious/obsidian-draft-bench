import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	BUILTIN_CHAPTER_TEMPLATE,
	createChapter,
	nextChapterOrder,
	resolveChapterPaths,
} from '../../src/core/chapters';
import { createProject } from '../../src/core/projects';
import { createScene } from '../../src/core/scenes';
import {
	findChaptersInProject,
	findProjects,
	findScenesInChapter,
	type ProjectNote,
} from '../../src/core/discovery';
import { isValidDbenchId } from '../../src/core/id';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';

async function seedProject(
	app: App,
	settings: DraftBenchSettings,
	title: string
): Promise<ProjectNote> {
	await createProject(app, settings, { title, shape: 'folder' });
	const projects = findProjects(app);
	if (projects.length === 0) throw new Error('seedProject failed');
	return projects[projects.length - 1];
}

function stripFrontmatter(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
	return match ? match[1] : content;
}

describe('resolveChapterPaths', () => {
	const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };

	it('defaults to the project folder (empty chaptersFolder)', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		const paths = resolveChapterPaths(settings, project, {
			project,
			title: 'Chapter 1',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel');
		expect(paths.filePath).toBe('Draft Bench/My Novel/Chapter 1.md');
	});

	it('nests chapters in a subfolder when chaptersFolder is set', async () => {
		const app = new App();
		const customSettings = { ...settings, chaptersFolder: 'Chapters/' };
		const project = await seedProject(app, customSettings, 'My Novel');

		const paths = resolveChapterPaths(customSettings, project, {
			project,
			title: 'Chapter 1',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel/Chapters');
		expect(paths.filePath).toBe('Draft Bench/My Novel/Chapters/Chapter 1.md');
	});

	it('honors location override', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		const paths = resolveChapterPaths(settings, project, {
			project,
			title: 'Chapter 1',
			location: 'Parts/',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel/Parts');
		expect(paths.filePath).toBe('Draft Bench/My Novel/Parts/Chapter 1.md');
	});

	it('expands {project} in chaptersFolder template', async () => {
		const app = new App();
		const customSettings = { ...settings, chaptersFolder: '{project} Chapters/' };
		const project = await seedProject(app, customSettings, 'My Novel');

		const paths = resolveChapterPaths(customSettings, project, {
			project,
			title: 'Chapter 1',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel/My Novel Chapters');
	});

	it('rejects empty title', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		expect(() =>
			resolveChapterPaths(settings, project, { project, title: '' })
		).toThrow(/empty/i);
		expect(() =>
			resolveChapterPaths(settings, project, { project, title: '   ' })
		).toThrow(/empty/i);
	});

	it('rejects forbidden characters', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		expect(() =>
			resolveChapterPaths(settings, project, { project, title: 'Bad/Title' })
		).toThrow(/not allowed/i);
		expect(() =>
			resolveChapterPaths(settings, project, { project, title: 'Bad:Title' })
		).toThrow(/not allowed/i);
	});

	it('trims surrounding whitespace from the title', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		const paths = resolveChapterPaths(settings, project, {
			project,
			title: '  Chapter 1  ',
		});
		expect(paths.filePath).toBe('Draft Bench/My Novel/Chapter 1.md');
	});
});

describe('nextChapterOrder', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('returns 1 when no chapters exist in the project', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const order = nextChapterOrder(app, project.frontmatter['dbench-id']);
		expect(order).toBe(1);
	});

	it('returns max+1 across existing chapters in the project', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		await createChapter(app, settings, { project, title: 'Chapter 1' });
		await createChapter(app, settings, { project, title: 'Chapter 2' });
		const order = nextChapterOrder(app, project.frontmatter['dbench-id']);
		expect(order).toBe(3);
	});

	it('scopes to project (excludes chapters in other projects)', async () => {
		const projectA = await seedProject(app, settings, 'Novel A');
		const projectB = await seedProject(app, settings, 'Novel B');
		await createChapter(app, settings, { project: projectA, title: 'A1' });
		await createChapter(app, settings, { project: projectA, title: 'A2' });
		await createChapter(app, settings, { project: projectB, title: 'B1' });

		expect(nextChapterOrder(app, projectA.frontmatter['dbench-id'])).toBe(3);
		expect(nextChapterOrder(app, projectB.frontmatter['dbench-id'])).toBe(2);
	});
});

describe('createChapter', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('creates a chapter note with stamped essentials', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const file = await createChapter(app, settings, {
			project,
			title: 'Chapter 1',
		});

		expect(file.path).toBe('Draft Bench/My Novel/Chapter 1.md');

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('chapter');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-project']).toBe('[[My Novel]]');
		expect(fm?.['dbench-project-id']).toBe(project.frontmatter['dbench-id']);
		expect(fm?.['dbench-order']).toBe(1);
		expect(fm?.['dbench-status']).toBe('idea');
		expect(fm?.['dbench-scenes']).toEqual([]);
		expect(fm?.['dbench-scene-ids']).toEqual([]);
		expect(fm?.['dbench-drafts']).toEqual([]);
		expect(fm?.['dbench-draft-ids']).toEqual([]);
	});

	it('writes the built-in chapter template body', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const file = await createChapter(app, settings, {
			project,
			title: 'Chapter 1',
		});
		const content = await app.vault.read(file);
		const body = stripFrontmatter(content);
		expect(body).toBe(BUILTIN_CHAPTER_TEMPLATE);
	});

	it('updates the project reverse arrays', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const file = await createChapter(app, settings, {
			project,
			title: 'Chapter 1',
		});

		const projectFm = app.metadataCache.getFileCache(project.file)?.frontmatter;
		expect(projectFm?.['dbench-chapters']).toContain('[[Chapter 1]]');
		const chapterId = app.metadataCache.getFileCache(file)?.frontmatter?.['dbench-id'];
		expect(projectFm?.['dbench-chapter-ids']).toContain(chapterId);
	});

	it('refuses if the project has direct scenes (no-mixed-children)', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		await createScene(app, settings, { project, title: 'Direct Scene' });

		await expect(
			createChapter(app, settings, { project, title: 'Chapter 1' })
		).rejects.toThrow(/direct scene/i);
	});

	it('allows chapters when the project only has chapter-children', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		await createChapter(app, settings, { project, title: 'Chapter 1' });
		// Refresh project from cache so it sees its updated reverse array.
		const refreshedProject = findProjects(app).find(
			(p) => p.frontmatter['dbench-id'] === project.frontmatter['dbench-id']
		)!;
		const file = await createChapter(app, settings, {
			project: refreshedProject,
			title: 'Chapter 2',
		});
		expect(file.path).toBe('Draft Bench/My Novel/Chapter 2.md');
	});

	it('refuses to overwrite an existing file', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		await createChapter(app, settings, { project, title: 'Chapter 1' });

		await expect(
			createChapter(app, settings, { project, title: 'Chapter 1' })
		).rejects.toThrow(/already exists/i);
	});

	it('honors the order option', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const file = await createChapter(app, settings, {
			project,
			title: 'Chapter 5',
			order: 5,
		});
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-order']).toBe(5);
	});

	it('honors the status option', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const file = await createChapter(app, settings, {
			project,
			title: 'Chapter 1',
			status: 'final',
		});
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-status']).toBe('final');
	});
});
