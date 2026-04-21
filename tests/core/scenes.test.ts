import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	createScene,
	nextSceneOrder,
	resolveScenePaths,
} from '../../src/core/scenes';
import { createProject } from '../../src/core/projects';
import { findProjects, findScenesInProject } from '../../src/core/discovery';
import { isValidDbenchId } from '../../src/core/id';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';

async function seedProject(app: App, settings: DraftBenchSettings, title: string) {
	await createProject(app, settings, { title, shape: 'folder' });
	const projects = findProjects(app);
	if (projects.length === 0) throw new Error('seedProject failed');
	return projects[projects.length - 1];
}

describe('resolveScenePaths', () => {
	const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };

	it('expands {project} from project basename', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		const paths = resolveScenePaths(settings, project, {
			project,
			title: 'Chapter 1',
		});
		expect(paths.folderPath).toBe('My Novel');
		expect(paths.filePath).toBe('My Novel/Chapter 1.md');
	});

	it('honors a custom location override', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		const paths = resolveScenePaths(settings, project, {
			project,
			title: 'Scene',
			location: 'Writing/{project}/Scenes/',
		});
		expect(paths.folderPath).toBe('Writing/My Novel/Scenes');
		expect(paths.filePath).toBe('Writing/My Novel/Scenes/Scene.md');
	});

	it('rejects empty title and forbidden characters', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'Project');

		expect(() =>
			resolveScenePaths(settings, project, { project, title: '' })
		).toThrow(/empty/i);
		expect(() =>
			resolveScenePaths(settings, project, { project, title: 'Bad/Scene' })
		).toThrow(/not allowed/i);
	});
});

describe('nextSceneOrder', () => {
	it('returns 1 when no scenes exist', async () => {
		const app = new App();
		const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Project');
		expect(nextSceneOrder(app, project.frontmatter['dbench-id'])).toBe(1);
	});

	it('returns max+1 when scenes exist', async () => {
		const app = new App();
		const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Project');

		await createScene(app, settings, { project, title: 'A' });
		await createScene(app, settings, { project, title: 'B' });
		await createScene(app, settings, { project, title: 'C' });

		expect(nextSceneOrder(app, project.frontmatter['dbench-id'])).toBe(4);
	});
});

describe('createScene', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('creates a scene note with stamped essentials', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const file = await createScene(app, settings, {
			project,
			title: 'Opening',
		});

		expect(file.path).toBe('My Novel/Opening.md');
		expect(file.basename).toBe('Opening');

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('scene');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-project']).toBe('[[My Novel]]');
		expect(fm?.['dbench-project-id']).toBe(project.frontmatter['dbench-id']);
		expect(fm?.['dbench-order']).toBe(1);
		expect(fm?.['dbench-status']).toBe('idea');
		expect(fm?.['dbench-drafts']).toEqual([]);
		expect(fm?.['dbench-draft-ids']).toEqual([]);
	});

	it("appends to project's reverse arrays", async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const scene = await createScene(app, settings, {
			project,
			title: 'Chapter 1',
		});

		// Re-read project frontmatter from cache
		const projectFm = app.metadataCache.getFileCache(project.file)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual(['[[Chapter 1]]']);
		const sceneId = app.metadataCache.getFileCache(scene)?.frontmatter?.[
			'dbench-id'
		];
		expect(projectFm?.['dbench-scene-ids']).toEqual([sceneId]);
	});

	it('appends multiple scenes in creation order', async () => {
		const project = await seedProject(app, settings, 'Novel');
		await createScene(app, settings, { project, title: 'One' });
		await createScene(app, settings, { project, title: 'Two' });
		await createScene(app, settings, { project, title: 'Three' });

		const projectFm = app.metadataCache.getFileCache(project.file)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual([
			'[[One]]',
			'[[Two]]',
			'[[Three]]',
		]);
	});

	it('honors an explicit order parameter', async () => {
		const project = await seedProject(app, settings, 'Project');
		const scene = await createScene(app, settings, {
			project,
			title: 'Custom',
			order: 42,
		});
		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-order']).toBe(42);
	});

	it('honors an explicit status parameter', async () => {
		const project = await seedProject(app, settings, 'Project');
		const scene = await createScene(app, settings, {
			project,
			title: 'Done',
			status: 'final',
		});
		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-status']).toBe('final');
	});

	it('writes the V1 template body into the scene file', async () => {
		const project = await seedProject(app, settings, 'Project');
		const scene = await createScene(app, settings, {
			project,
			title: 'Templated',
		});
		const content = await app.vault.read(scene);
		expect(content).toContain('## Source passages');
		expect(content).toContain('## Beat outline');
		expect(content).toContain('## Open questions');
		expect(content).toContain('## Draft');
	});

	it('refuses to overwrite an existing file', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Dup' });

		await expect(
			createScene(app, settings, { project, title: 'Dup' })
		).rejects.toThrow(/already exists/i);
	});

	it('produces a discoverable scene (findScenesInProject sees it)', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Visible' });

		const scenes = findScenesInProject(app, project.frontmatter['dbench-id']);
		expect(scenes).toHaveLength(1);
		expect(scenes[0].file.basename).toBe('Visible');
	});

	it('honors a custom location', async () => {
		const project = await seedProject(app, settings, 'Project');
		const scene = await createScene(app, settings, {
			project,
			title: 'Elsewhere',
			location: 'Writing/Drafted/',
		});
		expect(scene.path).toBe('Writing/Drafted/Elsewhere.md');
	});
});
