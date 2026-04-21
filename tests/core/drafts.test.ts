import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	createDraft,
	nextDraftNumber,
	resolveDraftFilename,
	resolveDraftFolder,
	resolveDraftPaths,
} from '../../src/core/drafts';
import { createScene } from '../../src/core/scenes';
import { createProject } from '../../src/core/projects';
import {
	findDraftsOfScene,
	findProjects,
	findScenesInProject,
	type SceneNote,
} from '../../src/core/discovery';
import { isValidDbenchId } from '../../src/core/id';
import {
	DEFAULT_SETTINGS,
	type DraftBenchSettings,
} from '../../src/model/settings';

/**
 * Seed a project and a scene in one go. Returns the scene note.
 */
async function seedScene(
	app: App,
	settings: DraftBenchSettings,
	projectTitle: string,
	sceneTitle: string
): Promise<SceneNote> {
	await createProject(app, settings, { title: projectTitle, shape: 'folder' });
	const projects = findProjects(app);
	const project = projects[projects.length - 1];
	await createScene(app, settings, { project, title: sceneTitle });
	const scenes = findScenesInProject(app, project.frontmatter['dbench-id']);
	const scene = scenes.find((s) => s.file.basename === sceneTitle);
	if (!scene) throw new Error('seedScene failed');
	return scene;
}

const FIXED_DATE = new Date(2026, 3, 20); // 2026-04-20 local time

describe('nextDraftNumber', () => {
	it('returns 1 when no drafts exist', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const scene = await seedScene(app, settings, 'Project', 'Scene');
		expect(nextDraftNumber(app, scene.frontmatter['dbench-id'])).toBe(1);
	});

	it('returns max+1 when drafts exist', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const scene = await seedScene(app, settings, 'Project', 'Scene');

		await createDraft(app, settings, { scene, date: FIXED_DATE });
		const sceneAfter1 = findScenesInProject(app, scene.frontmatter['dbench-project-id'])[0];
		await createDraft(app, settings, { scene: sceneAfter1, date: FIXED_DATE });
		const sceneAfter2 = findScenesInProject(app, scene.frontmatter['dbench-project-id'])[0];

		expect(nextDraftNumber(app, sceneAfter2.frontmatter['dbench-id'])).toBe(3);
	});
});

describe('resolveDraftFilename', () => {
	it('formats as `<Scene> - Draft N (YYYYMMDD).md`', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const scene = await seedScene(app, settings, 'Novel', 'Opening');

		const filename = resolveDraftFilename(scene, 2, new Date(2026, 0, 1));
		expect(filename).toBe('Opening - Draft 2 (20260101).md');
	});

	it('zero-pads month and day', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const scene = await seedScene(app, settings, 'Novel', 'Opening');

		const filename = resolveDraftFilename(scene, 1, new Date(2026, 8, 5));
		expect(filename).toBe('Opening - Draft 1 (20260905).md');
	});
});

describe('resolveDraftFolder', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let scene: SceneNote;

	beforeEach(async () => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		scene = await seedScene(app, settings, 'My Novel', 'Opening');
		// Scene lives at "My Novel/Opening.md"; project at "My Novel/My Novel.md".
	});

	it('project-local places drafts inside the project folder', () => {
		const folder = resolveDraftFolder(app, settings, scene);
		expect(folder).toBe('Draft Bench/My Novel/Drafts');
	});

	it('per-scene places drafts in a sibling folder named after the scene', () => {
		settings.draftsFolderPlacement = 'per-scene';
		const folder = resolveDraftFolder(app, settings, scene);
		expect(folder).toBe('Draft Bench/My Novel/Opening - Drafts');
	});

	it('vault-wide places drafts at the vault root', () => {
		settings.draftsFolderPlacement = 'vault-wide';
		const folder = resolveDraftFolder(app, settings, scene);
		expect(folder).toBe('Drafts');
	});

	it('honors a custom draftsFolderName', () => {
		settings.draftsFolderName = 'Archive';
		const folder = resolveDraftFolder(app, settings, scene);
		expect(folder).toBe('Draft Bench/My Novel/Archive');
	});

	it('falls back to scene parent when scene has no project-id (orphan)', () => {
		const orphanScene: SceneNote = {
			...scene,
			frontmatter: { ...scene.frontmatter, 'dbench-project-id': '' },
		};
		const folder = resolveDraftFolder(app, settings, orphanScene);
		expect(folder).toBe('Draft Bench/My Novel/Drafts');
	});
});

describe('resolveDraftPaths', () => {
	it('combines folder, filename, and draft number', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const scene = await seedScene(app, settings, 'Novel', 'Opening');

		const paths = resolveDraftPaths(app, settings, scene, FIXED_DATE);
		expect(paths.draftNumber).toBe(1);
		expect(paths.folderPath).toBe('Draft Bench/Novel/Drafts');
		expect(paths.filename).toBe('Opening - Draft 1 (20260420).md');
		expect(paths.filePath).toBe(
			'Draft Bench/Novel/Drafts/Opening - Draft 1 (20260420).md'
		);
	});
});

describe('createDraft', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let scene: SceneNote;

	beforeEach(async () => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		scene = await seedScene(app, settings, 'My Novel', 'Opening');
	});

	it('creates a draft file at the resolved path', async () => {
		const draft = await createDraft(app, settings, {
			scene,
			date: FIXED_DATE,
		});
		expect(draft.path).toBe(
			'Draft Bench/My Novel/Drafts/Opening - Draft 1 (20260420).md'
		);
		expect(draft.basename).toBe('Opening - Draft 1 (20260420)');
	});

	it('stamps draft essentials with correct forward references', async () => {
		const draft = await createDraft(app, settings, {
			scene,
			date: FIXED_DATE,
		});
		const fm = app.metadataCache.getFileCache(draft)?.frontmatter;

		expect(fm?.['dbench-type']).toBe('draft');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-scene']).toBe('[[Opening]]');
		expect(fm?.['dbench-scene-id']).toBe(scene.frontmatter['dbench-id']);
		expect(fm?.['dbench-project']).toBe('[[My Novel]]');
		expect(fm?.['dbench-project-id']).toBe(
			scene.frontmatter['dbench-project-id']
		);
		expect(fm?.['dbench-draft-number']).toBe(1);
	});

	it("appends to the scene's reverse arrays", async () => {
		const draft = await createDraft(app, settings, {
			scene,
			date: FIXED_DATE,
		});
		const sceneFm = app.metadataCache.getFileCache(scene.file)?.frontmatter;
		const draftId =
			app.metadataCache.getFileCache(draft)?.frontmatter?.['dbench-id'];

		expect(sceneFm?.['dbench-drafts']).toEqual([
			'[[Opening - Draft 1 (20260420)]]',
		]);
		expect(sceneFm?.['dbench-draft-ids']).toEqual([draftId]);
	});

	it('auto-numbers sequentially across multiple drafts', async () => {
		const d1 = await createDraft(app, settings, {
			scene,
			date: new Date(2026, 3, 20),
		});
		const sceneAfter1 = findScenesInProject(
			app,
			scene.frontmatter['dbench-project-id']
		)[0];
		const d2 = await createDraft(app, settings, {
			scene: sceneAfter1,
			date: new Date(2026, 3, 21),
		});
		const sceneAfter2 = findScenesInProject(
			app,
			scene.frontmatter['dbench-project-id']
		)[0];
		const d3 = await createDraft(app, settings, {
			scene: sceneAfter2,
			date: new Date(2026, 3, 22),
		});

		expect(d1.basename).toBe('Opening - Draft 1 (20260420)');
		expect(d2.basename).toBe('Opening - Draft 2 (20260421)');
		expect(d3.basename).toBe('Opening - Draft 3 (20260422)');

		const d3Fm = app.metadataCache.getFileCache(d3)?.frontmatter;
		expect(d3Fm?.['dbench-draft-number']).toBe(3);
	});

	it('carries the scene body forward into the draft', async () => {
		// The scene was created with V1_SCENE_TEMPLATE, which contains
		// "## Draft" etc. The draft file should contain those same headings.
		const draft = await createDraft(app, settings, {
			scene,
			date: FIXED_DATE,
		});
		const content = await app.vault.read(draft);
		expect(content).toContain('## Source passages');
		expect(content).toContain('## Beat outline');
		expect(content).toContain('## Open questions');
		expect(content).toContain('## Draft');
	});

	it('leaves the scene note body unchanged', async () => {
		const sceneContentBefore = await app.vault.read(scene.file);
		await createDraft(app, settings, { scene, date: FIXED_DATE });
		const sceneContentAfter = await app.vault.read(scene.file);

		// Frontmatter changes (reverse arrays updated), but body headings remain.
		expect(sceneContentAfter).toContain('## Source passages');
		expect(sceneContentAfter).toContain('## Draft');

		// Scene still has the template body it started with.
		expect(stripFrontmatterForTest(sceneContentAfter)).toBe(
			stripFrontmatterForTest(sceneContentBefore)
		);
	});

	it('produces a discoverable draft (findDraftsOfScene sees it)', async () => {
		await createDraft(app, settings, { scene, date: FIXED_DATE });
		const drafts = findDraftsOfScene(app, scene.frontmatter['dbench-id']);
		expect(drafts).toHaveLength(1);
		expect(drafts[0].frontmatter['dbench-draft-number']).toBe(1);
	});

	it('refuses to overwrite an existing draft file', async () => {
		await createDraft(app, settings, { scene, date: FIXED_DATE });
		// The second call should compute Draft 2, so it succeeds. Force a
		// collision by deleting the drafts metadata so nextDraftNumber returns 1.
		// (Simpler: create a conflicting file manually at the Draft 2 path.)
		await app.vault.create(
			'Draft Bench/My Novel/Drafts/Opening - Draft 2 (20260420).md',
			''
		);
		const sceneAfter = findScenesInProject(
			app,
			scene.frontmatter['dbench-project-id']
		)[0];
		await expect(
			createDraft(app, settings, { scene: sceneAfter, date: FIXED_DATE })
		).rejects.toThrow(/already exists/i);
	});

	it('honors a custom drafts folder name', async () => {
		settings.draftsFolderName = 'Archive';
		const draft = await createDraft(app, settings, {
			scene,
			date: FIXED_DATE,
		});
		expect(draft.path).toBe(
			'Draft Bench/My Novel/Archive/Opening - Draft 1 (20260420).md'
		);
	});

	it('honors per-scene placement', async () => {
		settings.draftsFolderPlacement = 'per-scene';
		const draft = await createDraft(app, settings, {
			scene,
			date: FIXED_DATE,
		});
		expect(draft.path).toBe(
			'Draft Bench/My Novel/Opening - Drafts/Opening - Draft 1 (20260420).md'
		);
	});

	it('honors vault-wide placement', async () => {
		settings.draftsFolderPlacement = 'vault-wide';
		const draft = await createDraft(app, settings, {
			scene,
			date: FIXED_DATE,
		});
		expect(draft.path).toBe('Drafts/Opening - Draft 1 (20260420).md');
	});
});

function stripFrontmatterForTest(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
	return match ? match[1] : content;
}
