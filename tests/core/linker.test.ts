import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { DraftBenchLinker } from '../../src/core/linker';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';

function makeFile(path: string): TFile {
	const filename = path.split('/').pop() ?? '';
	const dotIdx = filename.lastIndexOf('.');
	return new TFile({
		path,
		basename: dotIdx > 0 ? filename.slice(0, dotIdx) : filename,
		extension: dotIdx > 0 ? filename.slice(dotIdx + 1) : '',
	});
}

describe('DraftBenchLinker — lifecycle', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
	});

	it('registers modify, delete, and rename listeners on start', () => {
		linker.start();
		expect(app.vault._listenerCount('modify')).toBe(1);
		expect(app.vault._listenerCount('delete')).toBe(1);
		expect(app.vault._listenerCount('rename')).toBe(1);
	});

	it('stop() removes all listeners', () => {
		linker.start();
		linker.stop();
		expect(app.vault._listenerCount('modify')).toBe(0);
		expect(app.vault._listenerCount('delete')).toBe(0);
		expect(app.vault._listenerCount('rename')).toBe(0);
	});

	it('start() is idempotent (does not double-register)', () => {
		linker.start();
		linker.start();
		linker.start();
		expect(app.vault._listenerCount('modify')).toBe(1);
		expect(app.vault._listenerCount('delete')).toBe(1);
		expect(app.vault._listenerCount('rename')).toBe(1);
	});

	it('stop() is idempotent (safe to call twice)', () => {
		linker.start();
		linker.stop();
		linker.stop();
		expect(app.vault._listenerCount('modify')).toBe(0);
	});

	it('skips registration entirely when enableBidirectionalSync is off', () => {
		settings.enableBidirectionalSync = false;
		linker.start();
		expect(app.vault._listenerCount('modify')).toBe(0);
		expect(app.vault._listenerCount('delete')).toBe(0);
		expect(app.vault._listenerCount('rename')).toBe(0);
	});

	it('skips modify only when syncOnFileModify is off (delete and rename still register)', () => {
		settings.syncOnFileModify = false;
		linker.start();
		expect(app.vault._listenerCount('modify')).toBe(0);
		expect(app.vault._listenerCount('delete')).toBe(1);
		expect(app.vault._listenerCount('rename')).toBe(1);
	});
});

describe('DraftBenchLinker — suspend/resume', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	it('starts not-suspended', () => {
		expect(linker.isSuspended()).toBe(false);
	});

	it('suspend() then resume() returns to not-suspended', () => {
		linker.suspend();
		expect(linker.isSuspended()).toBe(true);
		linker.resume();
		expect(linker.isSuspended()).toBe(false);
	});

	it('counts nested suspends', () => {
		linker.suspend();
		linker.suspend();
		linker.suspend();
		expect(linker.isSuspended()).toBe(true);

		linker.resume();
		expect(linker.isSuspended()).toBe(true);

		linker.resume();
		expect(linker.isSuspended()).toBe(true);

		linker.resume();
		expect(linker.isSuspended()).toBe(false);
	});

	it('resume() below zero is a no-op', () => {
		linker.resume();
		linker.resume();
		expect(linker.isSuspended()).toBe(false);
		// And subsequent suspend still flips state correctly:
		linker.suspend();
		expect(linker.isSuspended()).toBe(true);
	});

	it('withSuspended runs fn with the linker suspended', async () => {
		expect(linker.isSuspended()).toBe(false);
		await linker.withSuspended(async () => {
			expect(linker.isSuspended()).toBe(true);
		});
		expect(linker.isSuspended()).toBe(false);
	});

	it('withSuspended restores state even if fn throws', async () => {
		await expect(
			linker.withSuspended(async () => {
				throw new Error('oops');
			})
		).rejects.toThrow('oops');
		expect(linker.isSuspended()).toBe(false);
	});

	it('withSuspended returns the value of fn', async () => {
		const result = await linker.withSuspended(async () => 42);
		expect(result).toBe(42);
	});

	it('withSuspended supports nesting', async () => {
		await linker.withSuspended(async () => {
			expect(linker.isSuspended()).toBe(true);
			await linker.withSuspended(async () => {
				expect(linker.isSuspended()).toBe(true);
			});
			expect(linker.isSuspended()).toBe(true);
		});
		expect(linker.isSuspended()).toBe(false);
	});
});

describe('DraftBenchLinker — event dispatch', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	it('handler stubs do not throw when invoked via vault events', async () => {
		const file = makeFile('Test.md');
		expect(() => app.vault._fire('modify', file)).not.toThrow();
		expect(() => app.vault._fire('delete', file)).not.toThrow();
		expect(() => app.vault._fire('rename', file, 'OldPath.md')).not.toThrow();
	});

	it('handlers do not run while suspended', async () => {
		const file = makeFile('Test.md');
		await linker.withSuspended(async () => {
			expect(() => app.vault._fire('modify', file)).not.toThrow();
			expect(() => app.vault._fire('delete', file)).not.toThrow();
			expect(() => app.vault._fire('rename', file, 'OldPath.md')).not.toThrow();
		});
	});
});

describe('DraftBenchLinker — scene<->project sync', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	/**
	 * Flush fire-and-forget async work launched by the event handlers.
	 * `setTimeout(0)` is enough to let any pending microtasks / promises
	 * from inside `onModify` etc. resolve.
	 */
	async function flush(): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async function seedProject(
		path: string,
		id: string,
		title: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${title}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		return file;
	}

	async function seedScene(
		path: string,
		id: string,
		parentTitle: string,
		parentId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'scene',
			'dbench-id': id,
			'dbench-project': `[[${parentTitle}]]`,
			'dbench-project-id': parentId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	function patchCache(file: TFile, updates: Record<string, unknown>): void {
		const current = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(file, { ...current, ...updates });
	}

	it('modify: adds scene to declared parent project reverse arrays', async () => {
		const project = await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		// Starting state: project has empty reverse arrays (desynced).
		expect(
			app.metadataCache.getFileCache(project)?.frontmatter?.['dbench-scenes']
		).toEqual([]);

		app.vault._fire('modify', scene);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual(['[[Opening]]']);
		expect(fm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('modify: moves scene between projects (removes from old, adds to new)', async () => {
		const oldProject = await seedProject(
			'Old/Old.md',
			'prj-old-tst-001',
			'Old'
		);
		const newProject = await seedProject(
			'New/New.md',
			'prj-new-tst-002',
			'New'
		);
		const scene = await seedScene(
			'Old/Scene.md',
			'sc1-001-tst-001',
			'Old',
			'prj-old-tst-001'
		);

		// Old project already references the scene.
		patchCache(oldProject, {
			'dbench-scenes': ['[[Scene]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		// Writer reassigns the scene's parent pointer.
		patchCache(scene, {
			'dbench-project': '[[New]]',
			'dbench-project-id': 'prj-new-tst-002',
		});

		app.vault._fire('modify', scene);
		await flush();

		const oldFm = app.metadataCache.getFileCache(oldProject)?.frontmatter;
		const newFm = app.metadataCache.getFileCache(newProject)?.frontmatter;
		expect(oldFm?.['dbench-scenes']).toEqual([]);
		expect(oldFm?.['dbench-scene-ids']).toEqual([]);
		expect(newFm?.['dbench-scenes']).toEqual(['[[Scene]]']);
		expect(newFm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('modify: idempotent — no writes when already in sync', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const scene = await seedScene(
			'Novel/Scene.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(project, {
			'dbench-scenes': ['[[Scene]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		app.vault._fire('modify', scene);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual(['[[Scene]]']);
		expect(fm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('modify: skipped when suspended', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const scene = await seedScene(
			'Novel/Scene.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		await linker.withSuspended(async () => {
			app.vault._fire('modify', scene);
			await flush();
		});

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		// Reverse arrays remain empty because the handler was gated.
		expect(fm?.['dbench-scenes']).toEqual([]);
	});

	it('delete: removes scene from project reverse arrays', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const scene = await seedScene(
			'Novel/Scene.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(project, {
			'dbench-scenes': ['[[Scene]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		app.vault._fire('delete', scene);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual([]);
		expect(fm?.['dbench-scene-ids']).toEqual([]);
	});

	it('delete: only removes matching entry (leaves siblings)', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const sceneA = await seedScene(
			'Novel/A.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedScene(
			'Novel/B.md',
			'sc2-002-tst-002',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(project, {
			'dbench-scenes': ['[[A]]', '[[B]]'],
			'dbench-scene-ids': ['sc1-001-tst-001', 'sc2-002-tst-002'],
		});

		app.vault._fire('delete', sceneA);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual(['[[B]]']);
		expect(fm?.['dbench-scene-ids']).toEqual(['sc2-002-tst-002']);
	});

	it('rename: updates wikilink entry in parent reverse array', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const scene = await seedScene(
			'Novel/OldName.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(project, {
			'dbench-scenes': ['[[OldName]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		// Simulate Obsidian's rename: vault entries + cache key both move.
		const oldPath = app.vault._rename(scene, 'Novel/NewName.md');

		app.vault._fire('rename', scene, oldPath);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual(['[[NewName]]']);
		// Id companion is stable — should be unchanged.
		expect(fm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('rename: does nothing for a non-scene file', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);

		// A rename on the project note itself should not touch reverse arrays
		// (they reference scenes, not the project itself).
		patchCache(project, {
			'dbench-scenes': ['[[Scene]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		const oldPath = app.vault._rename(project, 'Novel/NewNovel.md');

		app.vault._fire('rename', project, oldPath);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual(['[[Scene]]']);
	});
});

describe('DraftBenchLinker — scene<->draft sync', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	async function flush(): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async function seedFolderProject(
		path: string,
		id: string,
		title: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${title}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		return file;
	}

	async function seedScene(
		path: string,
		id: string,
		parentTitle: string,
		parentId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'scene',
			'dbench-id': id,
			'dbench-project': `[[${parentTitle}]]`,
			'dbench-project-id': parentId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	async function seedDraftOfScene(
		path: string,
		id: string,
		sceneTitle: string,
		sceneId: string,
		projectTitle: string,
		projectId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'draft',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-scene': `[[${sceneTitle}]]`,
			'dbench-scene-id': sceneId,
			'dbench-draft-number': 1,
		});
		return file;
	}

	function patchCache(file: TFile, updates: Record<string, unknown>): void {
		const current = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(file, { ...current, ...updates });
	}

	it('modify: adds draft to declared parent scene reverse arrays', async () => {
		const project = await seedFolderProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfScene(
			'Novel/Drafts/Opening - Draft 1 (20260420).md',
			'drf-001-tst-001',
			'Opening',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		expect(
			app.metadataCache.getFileCache(scene)?.frontmatter?.['dbench-drafts']
		).toEqual([]);

		app.vault._fire('modify', draft);
		await flush();

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual([
			'[[Opening - Draft 1 (20260420)]]',
		]);
		expect(sceneFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);

		// Project's draft arrays remain empty — folder projects don't hold drafts.
		const projectFm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(projectFm?.['dbench-drafts']).toBeUndefined();
	});

	it('modify: moves draft between scenes', async () => {
		const project = await seedFolderProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const oldScene = await seedScene(
			'Novel/Old.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const newScene = await seedScene(
			'Novel/New.md',
			'sc2-002-tst-002',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfScene(
			'Novel/Drafts/Old - Draft 1.md',
			'drf-001-tst-001',
			'Old',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		// Old scene already references the draft.
		patchCache(oldScene, {
			'dbench-drafts': ['[[Old - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		// Writer re-parents the draft to the new scene.
		patchCache(draft, {
			'dbench-scene': '[[New]]',
			'dbench-scene-id': 'sc2-002-tst-002',
		});

		app.vault._fire('modify', draft);
		await flush();

		const oldFm = app.metadataCache.getFileCache(oldScene)?.frontmatter;
		const newFm = app.metadataCache.getFileCache(newScene)?.frontmatter;
		expect(oldFm?.['dbench-drafts']).toEqual([]);
		expect(newFm?.['dbench-drafts']).toEqual(['[[Old - Draft 1]]']);
		expect(newFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);

		// Parameter for unused `project` — quiet the linter.
		void project;
	});

	it('delete: removes draft from scene reverse arrays', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfScene(
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'Opening',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(scene, {
			'dbench-drafts': ['[[Opening - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		app.vault._fire('delete', draft);
		await flush();

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual([]);
		expect(sceneFm?.['dbench-draft-ids']).toEqual([]);
	});

	it('rename: updates wikilink entry in parent scene reverse array', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfScene(
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'Opening',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(scene, {
			'dbench-drafts': ['[[Opening - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		const oldPath = app.vault._rename(
			draft,
			'Novel/Drafts/Opening - Draft 1 (renamed).md'
		);

		app.vault._fire('rename', draft, oldPath);
		await flush();

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual([
			'[[Opening - Draft 1 (renamed)]]',
		]);
		expect(sceneFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);
	});
});

describe('DraftBenchLinker — single-scene-project<->draft sync', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	async function flush(): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async function seedSingleProject(
		path: string,
		id: string,
		title: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${title}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'single',
			'dbench-status': 'draft',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	async function seedFolderProject(
		path: string,
		id: string,
		title: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${title}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		return file;
	}

	async function seedDraftOfProject(
		path: string,
		id: string,
		projectTitle: string,
		projectId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'draft',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-scene': '',
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		return file;
	}

	it('modify: adds draft to single-scene project reverse arrays', async () => {
		const project = await seedSingleProject(
			'Flash.md',
			'prj-001-tst-001',
			'Flash'
		);
		const draft = await seedDraftOfProject(
			'Flash - Drafts/Flash - Draft 1.md',
			'drf-001-tst-001',
			'Flash',
			'prj-001-tst-001'
		);

		expect(
			app.metadataCache.getFileCache(project)?.frontmatter?.['dbench-drafts']
		).toEqual([]);

		app.vault._fire('modify', draft);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-drafts']).toEqual(['[[Flash - Draft 1]]']);
		expect(fm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);
	});

	it('modify: does NOT add draft to folder projects (shape filter)', async () => {
		const folderProject = await seedFolderProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		// Orphan draft whose project-id happens to match a folder project.
		// Folder projects don't hold drafts directly — draft should not appear
		// in the folder project's frontmatter.
		const draft = await seedDraftOfProject(
			'Novel/Drafts/Orphan.md',
			'drf-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', draft);
		await flush();

		// The folder project doesn't have dbench-drafts field at all.
		const fm = app.metadataCache.getFileCache(folderProject)?.frontmatter;
		expect(fm?.['dbench-drafts']).toBeUndefined();
	});

	it('delete: removes draft from single-scene project reverse arrays', async () => {
		const project = await seedSingleProject(
			'Flash.md',
			'prj-001-tst-001',
			'Flash'
		);
		const draft = await seedDraftOfProject(
			'Flash - Drafts/Flash - Draft 1.md',
			'drf-001-tst-001',
			'Flash',
			'prj-001-tst-001'
		);

		const current =
			app.metadataCache.getFileCache(project)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(project, {
			...current,
			'dbench-drafts': ['[[Flash - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		app.vault._fire('delete', draft);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-drafts']).toEqual([]);
		expect(fm?.['dbench-draft-ids']).toEqual([]);
	});

	it('rename: updates wikilink entry in single-scene project reverse array', async () => {
		const project = await seedSingleProject(
			'Flash.md',
			'prj-001-tst-001',
			'Flash'
		);
		const draft = await seedDraftOfProject(
			'Flash - Drafts/Flash - Draft 1.md',
			'drf-001-tst-001',
			'Flash',
			'prj-001-tst-001'
		);

		const current =
			app.metadataCache.getFileCache(project)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(project, {
			...current,
			'dbench-drafts': ['[[Flash - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		const oldPath = app.vault._rename(
			draft,
			'Flash - Drafts/Flash - Draft 1 (v2).md'
		);

		app.vault._fire('rename', draft, oldPath);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-drafts']).toEqual(['[[Flash - Draft 1 (v2)]]']);
		expect(fm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);
	});
});

describe('DraftBenchLinker — compile-preset<->project sync', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	async function flush(): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async function seedProject(
		path: string,
		id: string,
		title: string,
		shape: 'folder' | 'single' = 'folder'
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${title}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': shape,
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-compile-presets': [],
			'dbench-compile-preset-ids': [],
		});
		return file;
	}

	async function seedPreset(
		path: string,
		id: string,
		parentTitle: string,
		parentId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'compile-preset',
			'dbench-id': id,
			'dbench-project': `[[${parentTitle}]]`,
			'dbench-project-id': parentId,
			'dbench-schema-version': 1,
			'dbench-compile-format': 'md',
			'dbench-compile-output': 'vault',
		});
		return file;
	}

	it('modify: adds preset to declared parent project reverse arrays', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const preset = await seedPreset(
			'Novel/Compile Presets/Workshop.md',
			'prs-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', preset);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-compile-presets']).toEqual(['[[Workshop]]']);
		expect(fm?.['dbench-compile-preset-ids']).toEqual(['prs-001-tst-001']);
	});

	it('modify: moves preset between projects (removes from old, adds to new)', async () => {
		const oldProject = await seedProject(
			'Old/Old.md',
			'prj-old-tst-001',
			'Old'
		);
		const newProject = await seedProject(
			'New/New.md',
			'prj-new-tst-002',
			'New'
		);
		const preset = await seedPreset(
			'Old/Compile Presets/Workshop.md',
			'prs-001-tst-001',
			'Old',
			'prj-old-tst-001'
		);

		// First sync: preset lands in Old project's reverse arrays.
		app.vault._fire('modify', preset);
		await flush();

		expect(
			app.metadataCache.getFileCache(oldProject)?.frontmatter?.[
				'dbench-compile-presets'
			]
		).toEqual(['[[Workshop]]']);

		// Writer re-points the preset at New project.
		const currentFm =
			app.metadataCache.getFileCache(preset)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(preset, {
			...currentFm,
			'dbench-project': '[[New]]',
			'dbench-project-id': 'prj-new-tst-002',
		});
		app.vault._fire('modify', preset);
		await flush();

		expect(
			app.metadataCache.getFileCache(oldProject)?.frontmatter?.[
				'dbench-compile-presets'
			]
		).toEqual([]);
		expect(
			app.metadataCache.getFileCache(newProject)?.frontmatter?.[
				'dbench-compile-presets'
			]
		).toEqual(['[[Workshop]]']);
	});

	it('modify: idempotent — no additional entries on repeated syncs', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const preset = await seedPreset(
			'Novel/Compile Presets/Workshop.md',
			'prs-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', preset);
		await flush();
		app.vault._fire('modify', preset);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-compile-presets']).toEqual(['[[Workshop]]']);
		expect(fm?.['dbench-compile-preset-ids']).toEqual(['prs-001-tst-001']);
	});

	it('delete: removes preset from project reverse arrays', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const preset = await seedPreset(
			'Novel/Compile Presets/Workshop.md',
			'prs-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', preset);
		await flush();
		expect(
			app.metadataCache.getFileCache(project)?.frontmatter?.[
				'dbench-compile-presets'
			]
		).toEqual(['[[Workshop]]']);

		app.vault._fire('delete', preset);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-compile-presets']).toEqual([]);
		expect(fm?.['dbench-compile-preset-ids']).toEqual([]);
	});

	it('rename: updates wikilink entry in project reverse array', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const preset = await seedPreset(
			'Novel/Compile Presets/Workshop.md',
			'prs-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', preset);
		await flush();

		const oldPath = app.vault._rename(
			preset,
			'Novel/Compile Presets/Final manuscript.md'
		);
		app.vault._fire('rename', preset, oldPath);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-compile-presets']).toEqual(['[[Final manuscript]]']);
		expect(fm?.['dbench-compile-preset-ids']).toEqual(['prs-001-tst-001']);
	});

	it('modify: syncs against single-scene projects too (no shape filter)', async () => {
		const project = await seedProject(
			'Flash.md',
			'prj-001-tst-001',
			'Flash',
			'single'
		);
		const preset = await seedPreset(
			'Compile Presets/Workshop.md',
			'prs-001-tst-001',
			'Flash',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', preset);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-compile-presets']).toEqual(['[[Workshop]]']);
	});
});

describe('DraftBenchLinker — chapter<->project sync', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	async function flush(): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async function seedProject(
		path: string,
		id: string,
		title: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${title}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
		});
		return file;
	}

	async function seedChapter(
		path: string,
		id: string,
		parentTitle: string,
		parentId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'chapter',
			'dbench-id': id,
			'dbench-project': `[[${parentTitle}]]`,
			'dbench-project-id': parentId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	function patchCache(file: TFile, updates: Record<string, unknown>): void {
		const current = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(file, { ...current, ...updates });
	}

	it('modify: adds chapter to declared parent project reverse arrays', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		expect(
			app.metadataCache.getFileCache(project)?.frontmatter?.['dbench-chapters']
		).toEqual([]);

		app.vault._fire('modify', chapter);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-chapters']).toEqual(['[[Ch01]]']);
		expect(fm?.['dbench-chapter-ids']).toEqual(['chp-001-tst-001']);
	});

	it('modify: moves chapter between projects (removes from old, adds to new)', async () => {
		const oldProject = await seedProject(
			'Old/Old.md',
			'prj-old-tst-001',
			'Old'
		);
		const newProject = await seedProject(
			'New/New.md',
			'prj-new-tst-002',
			'New'
		);
		const chapter = await seedChapter(
			'Old/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Old',
			'prj-old-tst-001'
		);

		patchCache(oldProject, {
			'dbench-chapters': ['[[Ch01]]'],
			'dbench-chapter-ids': ['chp-001-tst-001'],
		});

		patchCache(chapter, {
			'dbench-project': '[[New]]',
			'dbench-project-id': 'prj-new-tst-002',
		});

		app.vault._fire('modify', chapter);
		await flush();

		const oldFm = app.metadataCache.getFileCache(oldProject)?.frontmatter;
		const newFm = app.metadataCache.getFileCache(newProject)?.frontmatter;
		expect(oldFm?.['dbench-chapters']).toEqual([]);
		expect(oldFm?.['dbench-chapter-ids']).toEqual([]);
		expect(newFm?.['dbench-chapters']).toEqual(['[[Ch01]]']);
		expect(newFm?.['dbench-chapter-ids']).toEqual(['chp-001-tst-001']);
	});

	it('modify: idempotent — no additional entries on repeated syncs', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', chapter);
		await flush();
		app.vault._fire('modify', chapter);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-chapters']).toEqual(['[[Ch01]]']);
		expect(fm?.['dbench-chapter-ids']).toEqual(['chp-001-tst-001']);
	});

	it('modify: skipped when suspended', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		await linker.withSuspended(async () => {
			app.vault._fire('modify', chapter);
			await flush();
		});

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-chapters']).toEqual([]);
	});

	it('delete: removes chapter from project reverse arrays', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(project, {
			'dbench-chapters': ['[[Ch01]]'],
			'dbench-chapter-ids': ['chp-001-tst-001'],
		});

		app.vault._fire('delete', chapter);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-chapters']).toEqual([]);
		expect(fm?.['dbench-chapter-ids']).toEqual([]);
	});

	it('rename: updates wikilink entry in parent project reverse array', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await seedChapter(
			'Novel/Chapters/OldName.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(project, {
			'dbench-chapters': ['[[OldName]]'],
			'dbench-chapter-ids': ['chp-001-tst-001'],
		});

		const oldPath = app.vault._rename(chapter, 'Novel/Chapters/NewName.md');

		app.vault._fire('rename', chapter, oldPath);
		await flush();

		const fm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(fm?.['dbench-chapters']).toEqual(['[[NewName]]']);
		expect(fm?.['dbench-chapter-ids']).toEqual(['chp-001-tst-001']);
	});
});

describe('DraftBenchLinker — chapter<->scene sync (scenes-in-chapters)', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	async function flush(): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async function seedProject(
		path: string,
		id: string,
		title: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${title}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
		});
		return file;
	}

	async function seedChapter(
		path: string,
		id: string,
		parentTitle: string,
		parentId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'chapter',
			'dbench-id': id,
			'dbench-project': `[[${parentTitle}]]`,
			'dbench-project-id': parentId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	async function seedSceneInChapter(
		path: string,
		id: string,
		projectTitle: string,
		projectId: string,
		chapterTitle: string,
		chapterId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'scene',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-chapter': `[[${chapterTitle}]]`,
			'dbench-chapter-id': chapterId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	function patchCache(file: TFile, updates: Record<string, unknown>): void {
		const current = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(file, { ...current, ...updates });
	}

	it('modify: adds scene-in-chapter to chapter reverse arrays', async () => {
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const scene = await seedSceneInChapter(
			'Novel/Chapters/Ch01/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);

		expect(
			app.metadataCache.getFileCache(chapter)?.frontmatter?.['dbench-scenes']
		).toEqual([]);

		app.vault._fire('modify', scene);
		await flush();

		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chFm?.['dbench-scenes']).toEqual(['[[Opening]]']);
		expect(chFm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('modify: scene-in-chapter does NOT appear in project reverse arrays', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const scene = await seedSceneInChapter(
			'Novel/Chapters/Ch01/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);

		app.vault._fire('modify', scene);
		await flush();

		// Project's `dbench-scenes` lists direct children only (per § 9);
		// scenes-in-chapters belong to the chapter, not the project.
		const prjFm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(prjFm?.['dbench-scenes']).toEqual([]);
		expect(prjFm?.['dbench-scene-ids']).toEqual([]);
	});

	it('modify: converting chapter-less scene into scene-in-chapter cleans project array', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		// Existing chapter-less scene already in project's reverse arrays.
		const scene = await app.vault.create('Novel/Opening.md', '');
		app.metadataCache._setFrontmatter(scene, {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		patchCache(project, {
			'dbench-scenes': ['[[Opening]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		// Writer attaches the scene to a chapter.
		patchCache(scene, {
			'dbench-chapter': '[[Ch01]]',
			'dbench-chapter-id': 'chp-001-tst-001',
		});

		app.vault._fire('modify', scene);
		await flush();

		// Project's reverse arrays should be cleaned (scene-in-chapter
		// no longer belongs as a direct child); chapter's reverse arrays
		// should now hold the scene.
		const prjFm = app.metadataCache.getFileCache(project)?.frontmatter;
		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(prjFm?.['dbench-scenes']).toEqual([]);
		expect(prjFm?.['dbench-scene-ids']).toEqual([]);
		expect(chFm?.['dbench-scenes']).toEqual(['[[Opening]]']);
		expect(chFm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('modify: moves scene between chapters (removes from old, adds to new)', async () => {
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const oldChapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const newChapter = await seedChapter(
			'Novel/Chapters/Ch02.md',
			'chp-002-tst-002',
			'Novel',
			'prj-001-tst-001'
		);
		const scene = await seedSceneInChapter(
			'Novel/Chapters/Ch01/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);

		patchCache(oldChapter, {
			'dbench-scenes': ['[[Opening]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		patchCache(scene, {
			'dbench-chapter': '[[Ch02]]',
			'dbench-chapter-id': 'chp-002-tst-002',
		});

		app.vault._fire('modify', scene);
		await flush();

		const oldFm = app.metadataCache.getFileCache(oldChapter)?.frontmatter;
		const newFm = app.metadataCache.getFileCache(newChapter)?.frontmatter;
		expect(oldFm?.['dbench-scenes']).toEqual([]);
		expect(oldFm?.['dbench-scene-ids']).toEqual([]);
		expect(newFm?.['dbench-scenes']).toEqual(['[[Opening]]']);
		expect(newFm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('delete: removes scene-in-chapter from chapter reverse arrays', async () => {
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const scene = await seedSceneInChapter(
			'Novel/Chapters/Ch01/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);

		patchCache(chapter, {
			'dbench-scenes': ['[[Opening]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		app.vault._fire('delete', scene);
		await flush();

		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chFm?.['dbench-scenes']).toEqual([]);
		expect(chFm?.['dbench-scene-ids']).toEqual([]);
	});

	it('rename: updates wikilink entry in parent chapter reverse array', async () => {
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const scene = await seedSceneInChapter(
			'Novel/Chapters/Ch01/OldName.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);

		patchCache(chapter, {
			'dbench-scenes': ['[[OldName]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		const oldPath = app.vault._rename(scene, 'Novel/Chapters/Ch01/NewName.md');

		app.vault._fire('rename', scene, oldPath);
		await flush();

		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chFm?.['dbench-scenes']).toEqual(['[[NewName]]']);
		expect(chFm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});
});

describe('DraftBenchLinker — chapter<->draft sync', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	async function flush(): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async function seedProject(
		path: string,
		id: string,
		title: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${title}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
		});
		return file;
	}

	async function seedChapter(
		path: string,
		id: string,
		parentTitle: string,
		parentId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'chapter',
			'dbench-id': id,
			'dbench-project': `[[${parentTitle}]]`,
			'dbench-project-id': parentId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	async function seedDraftOfChapter(
		path: string,
		id: string,
		chapterTitle: string,
		chapterId: string,
		projectTitle: string,
		projectId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'draft',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-scene': '',
			'dbench-scene-id': '',
			'dbench-chapter': `[[${chapterTitle}]]`,
			'dbench-chapter-id': chapterId,
			'dbench-draft-number': 1,
		});
		return file;
	}

	function patchCache(file: TFile, updates: Record<string, unknown>): void {
		const current = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(file, { ...current, ...updates });
	}

	it('modify: adds chapter draft to chapter reverse arrays', async () => {
		const project = await seedProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfChapter(
			'Novel/Drafts/Ch01 - Draft 1 (20260420).md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		expect(
			app.metadataCache.getFileCache(chapter)?.frontmatter?.['dbench-drafts']
		).toEqual([]);

		app.vault._fire('modify', draft);
		await flush();

		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chFm?.['dbench-drafts']).toEqual([
			'[[Ch01 - Draft 1 (20260420)]]',
		]);
		expect(chFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);

		// Folder project doesn't hold drafts directly.
		const prjFm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(prjFm?.['dbench-drafts']).toBeUndefined();
	});

	it('modify: moves chapter draft between chapters', async () => {
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const oldChapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const newChapter = await seedChapter(
			'Novel/Chapters/Ch02.md',
			'chp-002-tst-002',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfChapter(
			'Novel/Drafts/Ch01 - Draft 1.md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(oldChapter, {
			'dbench-drafts': ['[[Ch01 - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		patchCache(draft, {
			'dbench-chapter': '[[Ch02]]',
			'dbench-chapter-id': 'chp-002-tst-002',
		});

		app.vault._fire('modify', draft);
		await flush();

		const oldFm = app.metadataCache.getFileCache(oldChapter)?.frontmatter;
		const newFm = app.metadataCache.getFileCache(newChapter)?.frontmatter;
		expect(oldFm?.['dbench-drafts']).toEqual([]);
		expect(newFm?.['dbench-drafts']).toEqual(['[[Ch01 - Draft 1]]']);
		expect(newFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);
	});

	it('modify: idempotent — no additional entries on repeated syncs', async () => {
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfChapter(
			'Novel/Drafts/Ch01 - Draft 1.md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', draft);
		await flush();
		app.vault._fire('modify', draft);
		await flush();

		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chFm?.['dbench-drafts']).toEqual(['[[Ch01 - Draft 1]]']);
		expect(chFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);
	});

	it('delete: removes chapter draft from chapter reverse arrays', async () => {
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfChapter(
			'Novel/Drafts/Ch01 - Draft 1.md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(chapter, {
			'dbench-drafts': ['[[Ch01 - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		app.vault._fire('delete', draft);
		await flush();

		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chFm?.['dbench-drafts']).toEqual([]);
		expect(chFm?.['dbench-draft-ids']).toEqual([]);
	});

	it('rename: updates wikilink entry in parent chapter reverse array', async () => {
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedDraftOfChapter(
			'Novel/Drafts/Ch01 - Draft 1.md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		patchCache(chapter, {
			'dbench-drafts': ['[[Ch01 - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		const oldPath = app.vault._rename(
			draft,
			'Novel/Drafts/Ch01 - Draft 1 (renamed).md'
		);

		app.vault._fire('rename', draft, oldPath);
		await flush();

		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chFm?.['dbench-drafts']).toEqual([
			'[[Ch01 - Draft 1 (renamed)]]',
		]);
		expect(chFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);
	});

	it('chapter-level draft does not pollute scene reverse arrays', async () => {
		// A scene exists in the same project; the chapter draft has no
		// `dbench-scene-id` so the scene-parent config should leave the
		// scene's draft arrays alone.
		await seedProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const chapter = await seedChapter(
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const sceneFile = await app.vault.create(
			'Novel/Chapters/Ch01/Opening.md',
			''
		);
		app.metadataCache._setFrontmatter(sceneFile, {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-chapter': '[[Ch01]]',
			'dbench-chapter-id': 'chp-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		const draft = await seedDraftOfChapter(
			'Novel/Drafts/Ch01 - Draft 1.md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		app.vault._fire('modify', draft);
		await flush();

		// Chapter holds the draft; scene's draft arrays remain empty.
		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		const scFm = app.metadataCache.getFileCache(sceneFile)?.frontmatter;
		expect(chFm?.['dbench-drafts']).toEqual(['[[Ch01 - Draft 1]]']);
		expect(scFm?.['dbench-drafts']).toEqual([]);
		expect(scFm?.['dbench-draft-ids']).toEqual([]);
	});
});
