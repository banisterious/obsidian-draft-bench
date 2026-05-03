import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	createSubScene,
	nextSubSceneOrder,
	resolveSubScenePaths,
} from '../../src/core/sub-scenes';
import { createScene } from '../../src/core/scenes';
import { createProject } from '../../src/core/projects';
import {
	findProjects,
	findScenes,
	findSubScenesInScene,
	type SceneNote,
} from '../../src/core/discovery';
import { isValidDbenchId } from '../../src/core/id';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';

async function seedProject(app: App, settings: DraftBenchSettings, title: string) {
	await createProject(app, settings, { title, shape: 'folder' });
	const projects = findProjects(app);
	if (projects.length === 0) throw new Error('seedProject failed');
	return projects[projects.length - 1];
}

async function seedScene(
	app: App,
	settings: DraftBenchSettings,
	parentTitle: string,
	sceneTitle: string
): Promise<SceneNote> {
	const project = await seedProject(app, settings, parentTitle);
	await createScene(app, settings, { project, title: sceneTitle });
	const scene = findScenes(app).find((s) => s.file.basename === sceneTitle);
	if (!scene) throw new Error(`seedScene failed for ${sceneTitle}`);
	return scene;
}

function stripFrontmatter(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
	return match ? match[1] : content;
}

describe('resolveSubScenePaths', () => {
	const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };

	it("defaults to '{scene}/' (nested under parent scene)", async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'Meridian Drift');
		await createScene(app, settings, { project, title: 'The auction' });
		const scene = findScenes(app)[0];

		const paths = resolveSubScenePaths(settings, project, scene, {
			project,
			scene,
			title: 'Lot 47',
		});
		expect(paths.folderPath).toBe(
			'Draft Bench/Meridian Drift/The auction'
		);
		expect(paths.filePath).toBe(
			'Draft Bench/Meridian Drift/The auction/Lot 47.md'
		);
	});

	it('places sub-scenes alongside the project note when subScenesFolder is empty (flat opt-out)', async () => {
		const app = new App();
		const flatSettings: DraftBenchSettings = {
			...DEFAULT_SETTINGS,
			subScenesFolder: '',
		};
		const project = await seedProject(app, flatSettings, 'Meridian Drift');
		await createScene(app, flatSettings, { project, title: 'The auction' });
		const scene = findScenes(app)[0];

		const paths = resolveSubScenePaths(flatSettings, project, scene, {
			project,
			scene,
			title: 'The auction - Lot 47',
		});
		expect(paths.folderPath).toBe('Draft Bench/Meridian Drift');
		expect(paths.filePath).toBe(
			'Draft Bench/Meridian Drift/The auction - Lot 47.md'
		);
	});

	it('expands {project} and {scene} in custom location templates', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'Meridian Drift');
		await createScene(app, settings, { project, title: 'The auction' });
		const scene = findScenes(app)[0];

		const paths = resolveSubScenePaths(settings, project, scene, {
			project,
			scene,
			title: 'Lot 47',
			location: 'Sub-scenes/{scene}/',
		});
		expect(paths.folderPath).toBe(
			'Draft Bench/Meridian Drift/Sub-scenes/The auction'
		);
	});

	it('rejects empty title and forbidden characters', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];

		expect(() =>
			resolveSubScenePaths(settings, project, scene, {
				project,
				scene,
				title: '',
			})
		).toThrow(/empty/i);
		expect(() =>
			resolveSubScenePaths(settings, project, scene, {
				project,
				scene,
				title: 'Bad/Sub',
			})
		).toThrow(/not allowed/i);
	});
});

describe('nextSubSceneOrder', () => {
	it('returns 1 when no sub-scenes exist', async () => {
		const app = new App();
		const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };
		const scene = await seedScene(app, settings, 'Project', 'Parent scene');
		expect(nextSubSceneOrder(app, scene.frontmatter['dbench-id'])).toBe(1);
	});

	it('returns max+1 when sub-scenes exist', async () => {
		const app = new App();
		const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];

		await createSubScene(app, settings, { project, scene, title: 'A' });
		await createSubScene(app, settings, { project, scene, title: 'B' });
		await createSubScene(app, settings, { project, scene, title: 'C' });

		expect(nextSubSceneOrder(app, scene.frontmatter['dbench-id'])).toBe(4);
	});

	it('counts only sub-scenes in the named parent scene', async () => {
		const app = new App();
		const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene A' });
		await createScene(app, settings, { project, title: 'Scene B' });
		const sceneA = findScenes(app).find((s) => s.file.basename === 'Scene A')!;
		const sceneB = findScenes(app).find((s) => s.file.basename === 'Scene B')!;

		await createSubScene(app, settings, { project, scene: sceneA, title: 'A1' });
		await createSubScene(app, settings, { project, scene: sceneA, title: 'A2' });
		await createSubScene(app, settings, { project, scene: sceneB, title: 'B1' });

		expect(nextSubSceneOrder(app, sceneA.frontmatter['dbench-id'])).toBe(3);
		expect(nextSubSceneOrder(app, sceneB.frontmatter['dbench-id'])).toBe(2);
	});
});

describe('createSubScene', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('creates a sub-scene note with stamped essentials and parent refs', async () => {
		const project = await seedProject(app, settings, 'Meridian Drift');
		await createScene(app, settings, { project, title: 'The auction' });
		const scene = findScenes(app)[0];

		const file = await createSubScene(app, settings, {
			project,
			scene,
			title: 'Lot 47',
		});

		expect(file.path).toBe(
			'Draft Bench/Meridian Drift/The auction/Lot 47.md'
		);
		expect(file.basename).toBe('Lot 47');

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('sub-scene');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-project']).toBe('[[Meridian Drift]]');
		expect(fm?.['dbench-project-id']).toBe(project.frontmatter['dbench-id']);
		expect(fm?.['dbench-scene']).toBe('[[The auction]]');
		expect(fm?.['dbench-scene-id']).toBe(scene.frontmatter['dbench-id']);
		expect(fm?.['dbench-order']).toBe(1);
		expect(fm?.['dbench-status']).toBe('idea');
		expect(fm?.['dbench-drafts']).toEqual([]);
		expect(fm?.['dbench-draft-ids']).toEqual([]);
	});

	it("appends to the parent scene's reverse arrays", async () => {
		const project = await seedProject(app, settings, 'Meridian Drift');
		await createScene(app, settings, { project, title: 'The auction' });
		const scene = findScenes(app)[0];
		const subScene = await createSubScene(app, settings, {
			project,
			scene,
			title: 'Lot 47',
		});

		const sceneFm = app.metadataCache.getFileCache(scene.file)?.frontmatter;
		expect(sceneFm?.['dbench-sub-scenes']).toEqual(['[[Lot 47]]']);
		const subSceneId = app.metadataCache.getFileCache(subScene)?.frontmatter?.[
			'dbench-id'
		];
		expect(sceneFm?.['dbench-sub-scene-ids']).toEqual([subSceneId]);
	});

	it('appends multiple sub-scenes in creation order', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];

		await createSubScene(app, settings, { project, scene, title: 'One' });
		await createSubScene(app, settings, { project, scene, title: 'Two' });
		await createSubScene(app, settings, { project, scene, title: 'Three' });

		const sceneFm = app.metadataCache.getFileCache(scene.file)?.frontmatter;
		expect(sceneFm?.['dbench-sub-scenes']).toEqual([
			'[[One]]',
			'[[Two]]',
			'[[Three]]',
		]);
	});

	it('honors an explicit order parameter', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];
		const subScene = await createSubScene(app, settings, {
			project,
			scene,
			title: 'Custom',
			order: 42,
		});
		const fm = app.metadataCache.getFileCache(subScene)?.frontmatter;
		expect(fm?.['dbench-order']).toBe(42);
	});

	it('honors an explicit status parameter', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];
		const subScene = await createSubScene(app, settings, {
			project,
			scene,
			title: 'Done',
			status: 'final',
		});
		const fm = app.metadataCache.getFileCache(subScene)?.frontmatter;
		expect(fm?.['dbench-status']).toBe('final');
	});

	it('writes the V1 sub-scene template body into the file', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];
		const subScene = await createSubScene(app, settings, {
			project,
			scene,
			title: 'Templated',
		});
		const content = await app.vault.read(subScene);
		expect(content).toContain('## Source passages');
		expect(content).toContain('## Outline');
		expect(content).toContain('## Open questions');
		expect(content).toContain('## Draft');
		// Sub-scene template uses ## Outline (not ## Beat outline) per
		// the resolved open question on template content.
		expect(content).not.toContain('## Beat outline');
	});

	it('seeds sub-scene-template.md in templatesFolder on first sub-scene creation', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];
		await createSubScene(app, settings, { project, scene, title: 'First' });

		const templatePath = `${settings.templatesFolder.replace(/\/+$/, '')}/sub-scene-template.md`;
		const seeded = app.vault.getAbstractFileByPath(templatePath);
		expect(seeded).not.toBeNull();
	});

	it('honors a user-customized sub-scene-template.md when present', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'The auction' });
		const scene = findScenes(app)[0];

		const templatePath = `${settings.templatesFolder.replace(/\/+$/, '')}/sub-scene-template.md`;
		const folder = templatePath.slice(0, templatePath.lastIndexOf('/'));
		await app.vault.createFolder(folder);
		await app.vault.create(
			templatePath,
			'# {{sub_scene_title}}\n\nParent: {{scene_title}}\nProject: {{project_title}}\n'
		);

		const subScene = await createSubScene(app, settings, {
			project,
			scene,
			title: 'Lot 47',
		});
		const body = stripFrontmatter(await app.vault.read(subScene));
		expect(body).toContain('# Lot 47');
		expect(body).toContain('Parent: The auction');
		expect(body).toContain('Project: Project');
	});

	it('populates {{previous_sub_scene_title}} on subsequent sub-scenes', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];

		const templatePath = `${settings.templatesFolder.replace(/\/+$/, '')}/sub-scene-template.md`;
		const folder = templatePath.slice(0, templatePath.lastIndexOf('/'));
		await app.vault.createFolder(folder);
		await app.vault.create(
			templatePath,
			'Previous: {{previous_sub_scene_title}}\n'
		);

		const first = await createSubScene(app, settings, {
			project,
			scene,
			title: 'First',
		});
		expect(stripFrontmatter(await app.vault.read(first))).toContain(
			'Previous: '
		);
		expect(stripFrontmatter(await app.vault.read(first))).not.toContain(
			'Previous: First'
		);

		const second = await createSubScene(app, settings, {
			project,
			scene,
			title: 'Second',
		});
		expect(stripFrontmatter(await app.vault.read(second))).toContain(
			'Previous: First'
		);
	});

	it('refuses to overwrite an existing file', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];
		await createSubScene(app, settings, { project, scene, title: 'Dup' });

		await expect(
			createSubScene(app, settings, { project, scene, title: 'Dup' })
		).rejects.toThrow(/already exists/i);
	});

	it('produces a discoverable sub-scene (findSubScenesInScene sees it)', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];
		await createSubScene(app, settings, { project, scene, title: 'Visible' });

		const subScenes = findSubScenesInScene(app, scene.frontmatter['dbench-id']);
		expect(subScenes).toHaveLength(1);
		expect(subScenes[0].file.basename).toBe('Visible');
	});

	it('honors a custom location (nested subfolder via {scene} token)', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene' });
		const scene = findScenes(app)[0];
		const subScene = await createSubScene(app, settings, {
			project,
			scene,
			title: 'Elsewhere',
			location: 'Writing/{scene}/',
		});
		expect(subScene.path).toBe(
			'Draft Bench/Project/Writing/Scene/Elsewhere.md'
		);
	});

	it('coexists with sibling sub-scenes in different parent scenes', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Scene A' });
		await createScene(app, settings, { project, title: 'Scene B' });
		const sceneA = findScenes(app).find((s) => s.file.basename === 'Scene A')!;
		const sceneB = findScenes(app).find((s) => s.file.basename === 'Scene B')!;

		await createSubScene(app, settings, {
			project,
			scene: sceneA,
			title: 'A only',
		});
		await createSubScene(app, settings, {
			project,
			scene: sceneB,
			title: 'B only',
		});

		expect(findSubScenesInScene(app, sceneA.frontmatter['dbench-id'])).toHaveLength(1);
		expect(findSubScenesInScene(app, sceneB.frontmatter['dbench-id'])).toHaveLength(1);
	});
});
