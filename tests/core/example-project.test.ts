import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	EXAMPLE_COMPILE_PRESET_NAME,
	EXAMPLE_COMPILE_TITLE,
	EXAMPLE_PROJECT_BASENAME,
	EXAMPLE_PROJECT_TARGET_WORDS,
	createExampleProject,
	findExampleProject,
} from '../../src/core/example-project';
import { DraftBenchLinker } from '../../src/core/linker';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';
import {
	findCompilePresetsOfProject,
	findDraftsOfScene,
	findScenesInProject,
} from '../../src/core/discovery';

describe('createExampleProject', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
	});

	it('creates the project, three scenes, one prior draft, and one preset', async () => {
		const result = await createExampleProject(app, settings, linker);

		expect(result.outcome).toBe('created');
		expect(result.file.basename).toBe(EXAMPLE_PROJECT_BASENAME);

		const projectFm = app.metadataCache.getFileCache(result.file)?.frontmatter;
		expect(projectFm?.['dbench-type']).toBe('project');
		expect(projectFm?.['dbench-project-shape']).toBe('folder');
		expect(projectFm?.['dbench-target-words']).toBe(EXAMPLE_PROJECT_TARGET_WORDS);

		const projectId = projectFm?.['dbench-id'];
		expect(typeof projectId).toBe('string');

		const scenes = findScenesInProject(app, projectId).sort(
			(a, b) => a.frontmatter['dbench-order'] - b.frontmatter['dbench-order']
		);
		expect(scenes.map((s) => s.file.basename)).toEqual([
			'Arrival',
			'The Long Watch',
			'Last Light',
		]);
		expect(scenes.map((s) => s.frontmatter['dbench-status'])).toEqual([
			'final',
			'revision',
			'idea',
		]);

		const drafts = findDraftsOfScene(app, scenes[0].frontmatter['dbench-id']);
		expect(drafts).toHaveLength(1);

		const presets = findCompilePresetsOfProject(app, projectId);
		expect(presets).toHaveLength(1);
		expect(presets[0].file.basename).toBe(EXAMPLE_COMPILE_PRESET_NAME);
		expect(presets[0].frontmatter['dbench-compile-format']).toBe('md');
		expect(presets[0].frontmatter['dbench-compile-output']).toBe('vault');
		expect(presets[0].frontmatter['dbench-compile-title']).toBe(
			EXAMPLE_COMPILE_TITLE
		);
	});

	it('snapshots the earlier scene-1 wording into the prior draft', async () => {
		await createExampleProject(app, settings, linker);

		const projectFile = findExampleProject(app)!.file;
		const projectId = app.metadataCache.getFileCache(projectFile)?.frontmatter?.[
			'dbench-id'
		];
		const scene1 = findScenesInProject(app, projectId).find(
			(s) => s.frontmatter['dbench-order'] === 1
		)!;
		const drafts = findDraftsOfScene(app, scene1.frontmatter['dbench-id']);

		const sceneBody = await app.vault.read(scene1.file);
		const draftBody = await app.vault.read(drafts[0].file);

		// Final scene 1 contains polished imagery; the prior draft has the
		// rougher pre-revision wording.
		expect(sceneBody).toContain('thin white needle against the slate');
		expect(draftBody).toContain('white tower against the gray sky');
		expect(draftBody).not.toContain('thin white needle against the slate');
	});

	it('returns already-exists on a second run without rewriting anything', async () => {
		const first = await createExampleProject(app, settings, linker);
		const second = await createExampleProject(app, settings, linker);

		expect(second.outcome).toBe('already-exists');
		expect(second.file.path).toBe(first.file.path);

		// Scene count is unchanged: the second call must not have created
		// new scenes.
		const projectId = app.metadataCache.getFileCache(first.file)?.frontmatter?.[
			'dbench-id'
		];
		expect(findScenesInProject(app, projectId)).toHaveLength(3);
	});

	it('respects the writer\'s defaultProjectFolder setting', async () => {
		settings.projectsFolder = 'Writing/Examples/{project}/';
		const result = await createExampleProject(app, settings, linker);

		expect(result.file.path).toBe(
			`Writing/Examples/${EXAMPLE_PROJECT_BASENAME}/${EXAMPLE_PROJECT_BASENAME}.md`
		);
	});

	it('keeps the linker suspended for the duration of the orchestration', async () => {
		// Spy via a counter on the linker's internal suspend state. If the
		// orchestration short-circuits on already-exists, suspend is never
		// touched; on a fresh create, suspend is entered and exited
		// exactly once.
		let observedDuringWork = false;
		const originalSuspend = linker.suspend.bind(linker);
		linker.suspend = () => {
			originalSuspend();
			observedDuringWork = linker.isSuspended();
		};

		await createExampleProject(app, settings, linker);

		expect(observedDuringWork).toBe(true);
		expect(linker.isSuspended()).toBe(false);
	});
});

describe('findExampleProject', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
	});

	it('returns null on an empty vault', () => {
		expect(findExampleProject(app)).toBeNull();
	});

	it('returns the project after createExampleProject runs', async () => {
		await createExampleProject(app, settings, linker);
		const found = findExampleProject(app);
		expect(found).not.toBeNull();
		expect(found?.file.basename).toBe(EXAMPLE_PROJECT_BASENAME);
	});
});
