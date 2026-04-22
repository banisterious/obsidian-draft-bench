import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	createProject,
	resolveProjectPaths,
	type CreateProjectOptions,
} from '../../src/core/projects';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';
import { isValidDbenchId } from '../../src/core/id';

describe('resolveProjectPaths', () => {
	const settings = DEFAULT_SETTINGS;

	it('expands {project} for folder shape', () => {
		const paths = resolveProjectPaths(settings, {
			title: 'My Novel',
			shape: 'folder',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel');
		expect(paths.filePath).toBe('Draft Bench/My Novel/My Novel.md');
	});

	it('strips {project}/ for single shape', () => {
		const paths = resolveProjectPaths(settings, {
			title: 'A Brief Encounter',
			shape: 'single',
		});
		expect(paths.folderPath).toBe('Draft Bench');
		expect(paths.filePath).toBe('Draft Bench/A Brief Encounter.md');
	});

	it('honors a custom location override', () => {
		const paths = resolveProjectPaths(settings, {
			title: 'Custom',
			shape: 'folder',
			location: 'Writing/Fiction/{project}/',
		});
		expect(paths.folderPath).toBe('Writing/Fiction/Custom');
		expect(paths.filePath).toBe('Writing/Fiction/Custom/Custom.md');
	});

	it('handles a location with no {project} token (puts the file directly in it)', () => {
		const paths = resolveProjectPaths(settings, {
			title: 'Standalone',
			shape: 'single',
			location: 'Writing/Single-sits/',
		});
		expect(paths.folderPath).toBe('Writing/Single-sits');
		expect(paths.filePath).toBe('Writing/Single-sits/Standalone.md');
	});

	it('trims surrounding whitespace from the title', () => {
		const paths = resolveProjectPaths(settings, {
			title: '  Trimmed  ',
			shape: 'folder',
		});
		expect(paths.folderPath).toBe('Draft Bench/Trimmed');
		expect(paths.filePath).toBe('Draft Bench/Trimmed/Trimmed.md');
	});

	it('rejects an empty title', () => {
		expect(() =>
			resolveProjectPaths(settings, { title: '', shape: 'folder' })
		).toThrow(/empty/i);
		expect(() =>
			resolveProjectPaths(settings, { title: '   ', shape: 'folder' })
		).toThrow(/empty/i);
	});

	it('rejects a title with forbidden filesystem characters', () => {
		const cases = [
			'Bad/Title',
			'Bad\\Title',
			'Bad:Title',
			'Bad*Title',
			'Bad?Title',
			'Bad"Title',
			'Bad<Title',
			'Bad>Title',
			'Bad|Title',
		];
		for (const title of cases) {
			expect(() => resolveProjectPaths(settings, { title, shape: 'folder' })).toThrow(
				/not allowed in filenames/i
			);
		}
	});

	it('normalizes redundant slashes', () => {
		const paths = resolveProjectPaths(settings, {
			title: 'Test',
			shape: 'folder',
			location: 'Writing//Fiction///{project}//',
		});
		expect(paths.folderPath).toBe('Writing/Fiction/Test');
	});
});

describe('createProject', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('creates a folder-shape project: folder + project note with stamped essentials', async () => {
		const { file } = await createProject(app, settings, {
			title: 'My Novel',
			shape: 'folder',
		});

		// Returned file
		expect(file.path).toBe('Draft Bench/My Novel/My Novel.md');
		expect(file.basename).toBe('My Novel');

		// Folder created
		expect(app.vault.getAbstractFileByPath('Draft Bench/My Novel')).not.toBeNull();

		// Frontmatter stamped (read via cache, since processFrontMatter updates it)
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm).toBeDefined();
		expect(fm?.['dbench-type']).toBe('project');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-project-shape']).toBe('folder');
		expect(fm?.['dbench-project']).toBe('[[My Novel]]');
		expect(fm?.['dbench-project-id']).toBe(fm?.['dbench-id']);
		expect(fm?.['dbench-status']).toBe('idea');
		expect(fm?.['dbench-scenes']).toEqual([]);
		expect(fm?.['dbench-scene-ids']).toEqual([]);
	});

	it('creates a single-shape project: no nested project folder', async () => {
		const { file } = await createProject(app, settings, {
			title: 'A Brief Encounter',
			shape: 'single',
		});

		expect(file.path).toBe('Draft Bench/A Brief Encounter.md');
		expect(app.vault.getAbstractFileByPath('Draft Bench')).not.toBeNull();
		// No per-project subfolder for single shape:
		expect(
			app.vault.getAbstractFileByPath('Draft Bench/A Brief Encounter')
		).toBeNull();

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-project-shape']).toBe('single');
		expect(fm?.['dbench-type']).toBe('project');
	});

	it('refuses to overwrite an existing file', async () => {
		await createProject(app, settings, { title: 'My Novel', shape: 'folder' });

		await expect(
			createProject(app, settings, { title: 'My Novel', shape: 'folder' })
		).rejects.toThrow(/already exists/i);
	});

	it('honors a custom location', async () => {
		const { file } = await createProject(app, settings, {
			title: 'Custom',
			shape: 'folder',
			location: 'Writing/Fiction/{project}/',
		});
		expect(file.path).toBe('Writing/Fiction/Custom/Custom.md');
	});

	it('passes through resolveProjectPaths errors (empty title, forbidden chars)', async () => {
		await expect(
			createProject(app, settings, { title: '', shape: 'folder' })
		).rejects.toThrow(/empty/i);
		await expect(
			createProject(app, settings, { title: 'Bad/Title', shape: 'folder' })
		).rejects.toThrow(/not allowed/i);
	});

	it('produces a discoverable project (findProjects sees it after creation)', async () => {
		const { findProjects } = await import('../../src/core/discovery');

		expect(findProjects(app)).toEqual([]);
		const { file } = await createProject(app, settings, {
			title: 'Discoverable',
			shape: 'folder',
		});
		const projects = findProjects(app);
		expect(projects).toHaveLength(1);
		expect(projects[0].file.path).toBe(file.path);
	});
});
