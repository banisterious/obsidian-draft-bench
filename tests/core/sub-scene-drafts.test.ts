import { beforeEach, describe, expect, it } from 'vitest';
import { App, type TFile } from 'obsidian';
import {
	createSubSceneDraft,
	nextSubSceneDraftNumber,
	resolveSubSceneDraftFilename,
	resolveSubSceneDraftFolder,
	resolveSubSceneDraftPaths,
} from '../../src/core/sub-scene-drafts';
import { createProject } from '../../src/core/projects';
import { createScene } from '../../src/core/scenes';
import { createSubScene } from '../../src/core/sub-scenes';
import {
	findDraftsOfSubScene,
	findProjects,
	findScenes,
	findSubScenesInScene,
	type ProjectNote,
	type SceneNote,
	type SubSceneNote,
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
	const project = projects[projects.length - 1];
	if (!project) throw new Error('seedProject failed');
	return project;
}

async function seedScene(
	app: App,
	settings: DraftBenchSettings,
	project: ProjectNote,
	title: string
): Promise<SceneNote> {
	await createScene(app, settings, { project, title });
	const scene = findScenes(app).find((s) => s.file.basename === title);
	if (!scene) throw new Error(`seedScene failed for ${title}`);
	return scene;
}

async function seedSubScene(
	app: App,
	settings: DraftBenchSettings,
	project: ProjectNote,
	scene: SceneNote,
	title: string
): Promise<SubSceneNote> {
	await createSubScene(app, settings, { project, scene, title });
	const subScene = findSubScenesInScene(app, scene.frontmatter['dbench-id']).find(
		(s) => s.file.basename === title
	);
	if (!subScene) throw new Error(`seedSubScene failed for ${title}`);
	return subScene;
}

async function setBody(app: App, file: TFile, body: string): Promise<void> {
	const content = await app.vault.read(file);
	const match = content.match(/^---\n[\s\S]*?\n---\n?/);
	const frontmatterBlock = match ? match[0] : '';
	await app.vault.modify(file, frontmatterBlock + body);
}

function stripFrontmatterForTest(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
	return match ? match[1] : content;
}

const FIXED_DATE = new Date(2026, 4, 2); // 2026-05-02 local time

describe('nextSubSceneDraftNumber', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let project: ProjectNote;
	let scene: SceneNote;
	let subScene: SubSceneNote;

	beforeEach(async () => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		project = await seedProject(app, settings, 'Drift');
		scene = await seedScene(app, settings, project, 'The auction');
		subScene = await seedSubScene(app, settings, project, scene, 'Lot 47');
	});

	it('returns 1 when no drafts exist', () => {
		expect(
			nextSubSceneDraftNumber(app, subScene.frontmatter['dbench-id'])
		).toBe(1);
	});

	it('returns max+1 across existing drafts of the same sub-scene', async () => {
		await createSubSceneDraft(app, settings, { subScene, date: FIXED_DATE });
		await createSubSceneDraft(app, settings, {
			subScene,
			date: new Date(FIXED_DATE.getTime() + 86400000),
		});
		expect(
			nextSubSceneDraftNumber(app, subScene.frontmatter['dbench-id'])
		).toBe(3);
	});
});

describe('resolveSubSceneDraftFilename', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let project: ProjectNote;
	let scene: SceneNote;
	let subScene: SubSceneNote;

	beforeEach(async () => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		project = await seedProject(app, settings, 'Drift');
		scene = await seedScene(app, settings, project, 'The auction');
		subScene = await seedSubScene(app, settings, project, scene, 'Lot 47');
	});

	it('produces "<Scene> - <Sub-scene> - Draft N (date).md"', () => {
		const filename = resolveSubSceneDraftFilename(subScene, 1, FIXED_DATE);
		expect(filename).toBe('The auction - Lot 47 - Draft 1 (20260502).md');
	});

	it('falls back to just the sub-scene basename when scene ref is absent', () => {
		const orphan: SubSceneNote = {
			file: subScene.file,
			frontmatter: {
				...subScene.frontmatter,
				'dbench-scene': '',
			},
		};
		const filename = resolveSubSceneDraftFilename(orphan, 2, FIXED_DATE);
		expect(filename).toBe('Lot 47 - Draft 2 (20260502).md');
	});
});

describe('resolveSubSceneDraftFolder', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let project: ProjectNote;
	let scene: SceneNote;
	let subScene: SubSceneNote;

	beforeEach(async () => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		project = await seedProject(app, settings, 'Drift');
		scene = await seedScene(app, settings, project, 'The auction');
		subScene = await seedSubScene(app, settings, project, scene, 'Lot 47');
	});

	it('project-local: walks up to the project folder', () => {
		const folder = resolveSubSceneDraftFolder(app, settings, subScene);
		expect(folder).toBe('Draft Bench/Drift/Drafts');
	});

	it('per-scene: produces a sibling folder named after the sub-scene', () => {
		const perScene: DraftBenchSettings = {
			...settings,
			draftsFolderPlacement: 'per-scene',
		};
		const folder = resolveSubSceneDraftFolder(app, perScene, subScene);
		expect(folder).toMatch(/Lot 47 - Drafts$/);
	});

	it('vault-wide: returns the bare drafts-folder name', () => {
		const vaultWide: DraftBenchSettings = {
			...settings,
			draftsFolderPlacement: 'vault-wide',
		};
		const folder = resolveSubSceneDraftFolder(app, vaultWide, subScene);
		expect(folder).toBe('Drafts');
	});

	it('honors a custom drafts-folder name', () => {
		const custom: DraftBenchSettings = {
			...settings,
			draftsFolderName: 'Snapshots',
		};
		const folder = resolveSubSceneDraftFolder(app, custom, subScene);
		expect(folder).toBe('Draft Bench/Drift/Snapshots');
	});
});

describe('createSubSceneDraft', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let project: ProjectNote;
	let scene: SceneNote;
	let subScene: SubSceneNote;

	beforeEach(async () => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		project = await seedProject(app, settings, 'Drift');
		scene = await seedScene(app, settings, project, 'The auction');
		subScene = await seedSubScene(app, settings, project, scene, 'Lot 47');
		await setBody(app, subScene.file, '## Draft\nLot 47 prose body.\n');
	});

	it('creates a draft file with stamped essentials and parent refs', async () => {
		const draft = await createSubSceneDraft(app, settings, {
			subScene,
			date: FIXED_DATE,
		});

		expect(draft.path).toBe(
			'Draft Bench/Drift/Drafts/The auction - Lot 47 - Draft 1 (20260502).md'
		);
		const fm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('draft');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-project']).toBe('[[Drift]]');
		expect(fm?.['dbench-project-id']).toBe(project.frontmatter['dbench-id']);
		expect(fm?.['dbench-sub-scene']).toBe('[[Lot 47]]');
		expect(fm?.['dbench-sub-scene-id']).toBe(subScene.frontmatter['dbench-id']);
		expect(fm?.['dbench-draft-number']).toBe(1);
		// Sub-scene drafts don't carry scene/chapter parent refs.
		expect(fm?.['dbench-scene']).toBe('');
		expect(fm?.['dbench-scene-id']).toBe('');
	});

	it('snapshot body excludes the sub-scene type from the source frontmatter', async () => {
		const draft = await createSubSceneDraft(app, settings, {
			subScene,
			date: FIXED_DATE,
		});
		// The new draft file has its own frontmatter (dbench-type: draft);
		// the sub-scene's original `dbench-type: sub-scene` must not leak
		// into the body.
		const content = await app.vault.read(draft);
		const body = stripFrontmatterForTest(content);
		expect(body).not.toContain('dbench-type:');
		expect(body).toContain('Lot 47 prose body.');
	});

	it('appends to the sub-scene reverse arrays', async () => {
		const draft = await createSubSceneDraft(app, settings, {
			subScene,
			date: FIXED_DATE,
		});
		const subSceneFm = app.metadataCache.getFileCache(subScene.file)
			?.frontmatter;
		expect(subSceneFm?.['dbench-drafts']).toEqual([
			'[[The auction - Lot 47 - Draft 1 (20260502)]]',
		]);
		const draftId = app.metadataCache.getFileCache(draft)?.frontmatter?.[
			'dbench-id'
		];
		expect(subSceneFm?.['dbench-draft-ids']).toEqual([draftId]);
	});

	it('refuses to overwrite an existing file at the target path', async () => {
		// Pre-create a file (no draft frontmatter, so
		// nextSubSceneDraftNumber still picks 1) at the path the
		// resolver would produce. Forces the existence check to trip.
		const paths = resolveSubSceneDraftPaths(app, settings, subScene, FIXED_DATE);
		await app.vault.createFolder(paths.folderPath);
		await app.vault.create(paths.filePath, '# Manually-created file');

		await expect(
			createSubSceneDraft(app, settings, { subScene, date: FIXED_DATE })
		).rejects.toThrow(/already exists/i);
	});

	it('produces a discoverable draft (findDraftsOfSubScene sees it)', async () => {
		await createSubSceneDraft(app, settings, { subScene, date: FIXED_DATE });
		const drafts = findDraftsOfSubScene(app, subScene.frontmatter['dbench-id']);
		expect(drafts).toHaveLength(1);
	});
});

describe('resolveSubSceneDraftPaths', () => {
	it('combines folder + filename + draft number into one resolved record', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Drift');
		const scene = await seedScene(app, settings, project, 'The auction');
		const subScene = await seedSubScene(app, settings, project, scene, 'Lot 47');

		const paths = resolveSubSceneDraftPaths(app, settings, subScene, FIXED_DATE);

		expect(paths.draftNumber).toBe(1);
		expect(paths.folderPath).toBe('Draft Bench/Drift/Drafts');
		expect(paths.filename).toBe(
			'The auction - Lot 47 - Draft 1 (20260502).md'
		);
		expect(paths.filePath).toBe(
			'Draft Bench/Drift/Drafts/The auction - Lot 47 - Draft 1 (20260502).md'
		);
	});
});
