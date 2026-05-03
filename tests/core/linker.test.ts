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
		expect(app.metadataCache._listenerCount('changed')).toBe(1);
		expect(app.vault._listenerCount('delete')).toBe(1);
		expect(app.vault._listenerCount('rename')).toBe(1);
	});

	it('stop() removes all listeners', () => {
		linker.start();
		linker.stop();
		expect(app.metadataCache._listenerCount('changed')).toBe(0);
		expect(app.vault._listenerCount('delete')).toBe(0);
		expect(app.vault._listenerCount('rename')).toBe(0);
	});

	it('start() is idempotent (does not double-register)', () => {
		linker.start();
		linker.start();
		linker.start();
		expect(app.metadataCache._listenerCount('changed')).toBe(1);
		expect(app.vault._listenerCount('delete')).toBe(1);
		expect(app.vault._listenerCount('rename')).toBe(1);
	});

	it('stop() is idempotent (safe to call twice)', () => {
		linker.start();
		linker.stop();
		linker.stop();
		expect(app.metadataCache._listenerCount('changed')).toBe(0);
	});

	it('skips registration entirely when enableBidirectionalSync is off', () => {
		settings.enableBidirectionalSync = false;
		linker.start();
		expect(app.metadataCache._listenerCount('changed')).toBe(0);
		expect(app.vault._listenerCount('delete')).toBe(0);
		expect(app.vault._listenerCount('rename')).toBe(0);
	});

	it('skips modify only when syncOnFileModify is off (delete and rename still register)', () => {
		settings.syncOnFileModify = false;
		linker.start();
		expect(app.metadataCache._listenerCount('changed')).toBe(0);
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
		expect(() => app.metadataCache._fire('changed', file)).not.toThrow();
		expect(() => app.vault._fire('delete', file)).not.toThrow();
		expect(() => app.vault._fire('rename', file, 'OldPath.md')).not.toThrow();
	});

	it('handlers do not run while suspended', async () => {
		const file = makeFile('Test.md');
		await linker.withSuspended(async () => {
			expect(() => app.metadataCache._fire('changed', file)).not.toThrow();
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

		app.metadataCache._fire('changed', scene);
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

		app.metadataCache._fire('changed', scene);
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

		app.metadataCache._fire('changed', scene);
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
			app.metadataCache._fire('changed', scene);
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

		app.metadataCache._fire('changed', draft);
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

		app.metadataCache._fire('changed', draft);
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

		app.metadataCache._fire('changed', draft);
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

		app.metadataCache._fire('changed', draft);
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

		app.metadataCache._fire('changed', preset);
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
		app.metadataCache._fire('changed', preset);
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
		app.metadataCache._fire('changed', preset);
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

		app.metadataCache._fire('changed', preset);
		await flush();
		app.metadataCache._fire('changed', preset);
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

		app.metadataCache._fire('changed', preset);
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

		app.metadataCache._fire('changed', preset);
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

		app.metadataCache._fire('changed', preset);
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

		app.metadataCache._fire('changed', chapter);
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

		app.metadataCache._fire('changed', chapter);
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

		app.metadataCache._fire('changed', chapter);
		await flush();
		app.metadataCache._fire('changed', chapter);
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
			app.metadataCache._fire('changed', chapter);
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

		app.metadataCache._fire('changed', scene);
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

		app.metadataCache._fire('changed', scene);
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

		app.metadataCache._fire('changed', scene);
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

		app.metadataCache._fire('changed', scene);
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

		app.metadataCache._fire('changed', draft);
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

		app.metadataCache._fire('changed', draft);
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

		app.metadataCache._fire('changed', draft);
		await flush();
		app.metadataCache._fire('changed', draft);
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

		app.metadataCache._fire('changed', draft);
		await flush();

		// Chapter holds the draft; scene's draft arrays remain empty.
		const chFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		const scFm = app.metadataCache.getFileCache(sceneFile)?.frontmatter;
		expect(chFm?.['dbench-drafts']).toEqual(['[[Ch01 - Draft 1]]']);
		expect(scFm?.['dbench-drafts']).toEqual([]);
		expect(scFm?.['dbench-draft-ids']).toEqual([]);
	});
});

/**
 * Wikilink-only retrofit backfill (issue #4).
 *
 * Covers the scenario where a writer manually sets a relationship wikilink
 * in the Properties panel — e.g., `dbench-scene: [[Some Scene]]` on a
 * retrofitted draft — without also copying the parent's id into the
 * companion field (`dbench-scene-id`). Pre-fix, the linker silently did
 * nothing because reconciliation keys off the id companion. The fix
 * resolves the wikilink against the candidate-parent pool, backfills the
 * companion via processFrontMatter, then proceeds with normal reverse-
 * array reconciliation.
 */
describe('DraftBenchLinker — wikilink-only retrofit backfill', () => {
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
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
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

	/**
	 * Seed a draft with the project ref (auto-inferred during retrofit)
	 * and a writer-typed `dbench-scene` wikilink, but with the
	 * `dbench-scene-id` companion left empty. This is the exact post-
	 * Set-as-draft + manual-Properties-edit state that triggered #4.
	 */
	async function seedRetrofitDraft(
		path: string,
		id: string,
		sceneWikilink: string,
		projectTitle: string,
		projectId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'draft',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-scene': sceneWikilink,
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		return file;
	}

	it('backfills dbench-scene-id when only dbench-scene wikilink is set on a draft', async () => {
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
		const draft = await seedRetrofitDraft(
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'[[Opening]]',
			'Novel',
			'prj-001-tst-001'
		);

		expect(
			app.metadataCache.getFileCache(draft)?.frontmatter?.['dbench-scene-id']
		).toBe('');

		app.metadataCache._fire('changed', draft);
		await flush();

		// Companion was backfilled on the draft.
		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');

		// Reverse arrays were updated on the scene.
		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual(['[[Opening - Draft 1]]']);
		expect(sceneFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);

		// Project's reverse arrays untouched (folder-shape projects don't
		// hold drafts in their reverse arrays; only scenes do).
		const projectFm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual([]);
	});

	it('skips backfill when both wikilink and companion are empty', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedRetrofitDraft(
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'',
			'Novel',
			'prj-001-tst-001'
		);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('');
		expect(draftFm?.['dbench-scene']).toBe('');
	});

	it('skips backfill when wikilink does not resolve to any candidate parent', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedRetrofitDraft(
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'[[NonexistentScene]]',
			'Novel',
			'prj-001-tst-001'
		);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('');
	});

	it('skips backfill when resolved candidate has empty dbench-id', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		// Seed a scene with empty dbench-id (corrupt or partially-typed).
		const orphanScene = await app.vault.create('Novel/Orphan.md', '');
		app.metadataCache._setFrontmatter(orphanScene, {
			'dbench-type': 'scene',
			'dbench-id': '',
			'dbench-project': `[[Novel]]`,
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		const draft = await seedRetrofitDraft(
			'Novel/Drafts/Orphan - Draft 1.md',
			'drf-001-tst-001',
			'[[Orphan]]',
			'Novel',
			'prj-001-tst-001'
		);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('');
	});

	it('handles [[Path/Basename]] path-prefixed wikilink format', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Scenes/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedRetrofitDraft(
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'[[Novel/Scenes/Opening]]',
			'Novel',
			'prj-001-tst-001'
		);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual(['[[Opening - Draft 1]]']);
	});

	it('handles [[Basename|Display]] aliased wikilink format', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedRetrofitDraft(
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'[[Opening|The First Scene]]',
			'Novel',
			'prj-001-tst-001'
		);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual(['[[Opening - Draft 1]]']);
	});

	it('handles [[Basename#Heading]] heading-reference wikilink format', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		const draft = await seedRetrofitDraft(
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'[[Opening#First Section]]',
			'Novel',
			'prj-001-tst-001'
		);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
	});

	it('backfills scene to project (folder shape) wikilink', async () => {
		const project = await seedFolderProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		// Seed a scene with project wikilink set but project-id companion empty.
		const scene = await app.vault.create('Novel/Opening.md', '');
		app.metadataCache._setFrontmatter(scene, {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': '',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		app.metadataCache._fire('changed', scene);
		await flush();

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-project-id']).toBe('prj-001-tst-001');

		const projectFm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual(['[[Opening]]']);
		expect(projectFm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('skips scene to project backfill when scene is in a chapter (appliesToChild=false)', async () => {
		const project = await seedFolderProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await app.vault.create('Novel/Ch01.md', '');
		app.metadataCache._setFrontmatter(chapter, {
			'dbench-type': 'chapter',
			'dbench-id': 'chp-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		// Scene-in-chapter: project wikilink set but companion empty,
		// AND chapter-id is also set (the appliesToChild gate fires).
		const scene = await app.vault.create('Novel/Opening.md', '');
		app.metadataCache._setFrontmatter(scene, {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': '',
			'dbench-chapter': '[[Ch01]]',
			'dbench-chapter-id': 'chp-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		app.metadataCache._fire('changed', scene);
		await flush();

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		// scene→project backfill skipped: appliesToChild gates it out.
		expect(sceneFm?.['dbench-project-id']).toBe('');
		// Project's reverse arrays stay empty (scene-in-chapter doesn't
		// belong in the project's direct scenes).
		const projectFm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual([]);
		// Chapter's reverse arrays correctly hold the scene.
		const chapterFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chapterFm?.['dbench-scenes']).toEqual(['[[Opening]]']);
		expect(chapterFm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('backfills chapter to project wikilink', async () => {
		const project = await seedFolderProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		const chapter = await app.vault.create('Novel/Ch01.md', '');
		app.metadataCache._setFrontmatter(chapter, {
			'dbench-type': 'chapter',
			'dbench-id': 'chp-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': '',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		app.metadataCache._fire('changed', chapter);
		await flush();

		const chapterFm = app.metadataCache.getFileCache(chapter)?.frontmatter;
		expect(chapterFm?.['dbench-project-id']).toBe('prj-001-tst-001');

		const projectFm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(projectFm?.['dbench-chapters']).toEqual(['[[Ch01]]']);
		expect(projectFm?.['dbench-chapter-ids']).toEqual(['chp-001-tst-001']);
	});

	it('does not interfere when companion is already set (no double-write)', async () => {
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
		// Pre-stamp the project's reverse arrays so they're already in sync.
		app.metadataCache._setFrontmatter(project, {
			...(app.metadataCache.getFileCache(project)?.frontmatter ?? {}),
			'dbench-scenes': ['[[Opening]]'],
			'dbench-scene-ids': ['sc1-001-tst-001'],
		});

		// Seed a draft with BOTH wikilink AND companion correctly set
		// (created via createDraft, not via wikilink-only retrofit).
		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': `[[Novel]]`,
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': '[[Opening]]',
			'dbench-scene-id': 'sc1-001-tst-001',
			'dbench-draft-number': 1,
		});
		app.metadataCache._setFrontmatter(scene, {
			...(app.metadataCache.getFileCache(scene)?.frontmatter ?? {}),
			'dbench-drafts': ['[[Opening - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		app.metadataCache._fire('changed', draft);
		await flush();

		// Companion stays the same (never overwritten by backfill).
		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
	});
});

/**
 * Wikilink-only retrofit: frontmatterLinks resolution + nested-array
 * fallback (issue #6).
 *
 * The original #4 fix parsed `frontmatter[key]` directly, which works
 * when YAML stores the wikilink as a quoted string but misses the more
 * common Properties-panel-edited form `dbench-scene: [[Foo]]` (no
 * quotes). YAML parses that as a nested array. Obsidian still resolves
 * the wikilink via its `frontmatterLinks` cache, so the linker prefers
 * that cache as the authoritative resolver. The raw-value fallback now
 * also handles the nested-array form for cases where `frontmatterLinks`
 * isn't populated.
 */
describe('DraftBenchLinker — wikilink-only retrofit (frontmatterLinks + nested-array, #6)', () => {
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

	it('backfills via frontmatterLinks when YAML stores the wikilink as a nested array', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		// YAML flow-notation form (`dbench-scene: [[Opening]]` without
		// quotes) parses as a nested single-element array — the exact
		// shape the Properties panel produces and the bug from #6.
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': [['Opening']],
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		// Obsidian's resolver populates `frontmatterLinks` regardless of
		// YAML encoding; seed it the way the live cache would have.
		app.metadataCache._setFrontmatterLinks(draft, [
			{
				key: 'dbench-scene',
				link: 'Opening',
				original: '[[Opening]]',
			},
		]);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual(['[[Opening - Draft 1]]']);
		expect(sceneFm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);
	});

	it('falls back to nested-array parsing when frontmatterLinks is missing', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		// Nested-array form WITHOUT seeding frontmatterLinks: simulates
		// older Obsidian or edge cases where the link cache isn't
		// populated. The fallback parser should still resolve it.
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': [['Opening']],
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual(['[[Opening - Draft 1]]']);
	});

	it('frontmatterLinks resolution wins when both cache and raw value are present (handles aliases)', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		// Raw value is unparseable (free-form string Obsidian would
		// reject), but frontmatterLinks has the resolved link. The
		// linker should still backfill via the cache.
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': 'Opening|Display Alias',
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		app.metadataCache._setFrontmatterLinks(draft, [
			{
				key: 'dbench-scene',
				link: 'Opening',
				original: '[[Opening|Display Alias]]',
				displayText: 'Display Alias',
			},
		]);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');

		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual(['[[Opening - Draft 1]]']);
	});

	it('handles frontmatterLinks with path-prefixed link target', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Scenes/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': '',
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		app.metadataCache._setFrontmatterLinks(draft, [
			{
				key: 'dbench-scene',
				link: 'Novel/Scenes/Opening',
				original: '[[Novel/Scenes/Opening]]',
			},
		]);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
		const sceneFm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(sceneFm?.['dbench-drafts']).toEqual(['[[Opening - Draft 1]]']);
	});

	it('handles frontmatterLinks with subpath (heading reference)', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		const scene = await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': '',
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		app.metadataCache._setFrontmatterLinks(draft, [
			{
				key: 'dbench-scene',
				link: 'Opening#First Section',
				original: '[[Opening#First Section]]',
			},
		]);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
	});

	it('skips backfill when frontmatterLinks targets a non-candidate (wrong type)', async () => {
		// Project + scene + a chapter the user mistyped into dbench-scene.
		const project = await seedFolderProject(
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': '',
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		// frontmatterLinks points at the project (wrong type for a
		// dbench-scene field). The linker resolves the basename but
		// finds no matching candidate in the scene-parent pool, so it
		// skips the backfill.
		app.metadataCache._setFrontmatterLinks(draft, [
			{
				key: 'dbench-scene',
				link: 'Novel',
				original: '[[Novel]]',
			},
		]);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene-id']).toBe('');

		const projectFm = app.metadataCache.getFileCache(project)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual([]);
	});
});

/**
 * Wikilink-field canonicalization on backfill (issue #7).
 *
 * Obsidian's `processFrontMatter` round-trips frontmatter through its
 * link-aware parser + serializer, which reshapes wikilink-shaped strings
 * into nested-array block-list YAML (`dbench-scene:\n  - - Redheaded`)
 * even when the callback never touched the field. The linker now
 * defensively re-canonicalizes the wikilink field to a clean quoted
 * string in the same callback that backfills the ID companion.
 */
describe('DraftBenchLinker — wikilink canonicalization on backfill (#7)', () => {
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

	it('canonicalizes nested-array dbench-scene to a clean wikilink string', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		// Nested-array form (the post-Obsidian-Properties-panel-edit
		// shape that triggered #7).
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': [['Opening']],
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		app.metadataCache._setFrontmatterLinks(draft, [
			{
				key: 'dbench-scene',
				link: 'Opening',
				original: '[[Opening]]',
			},
		]);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		// Companion was backfilled.
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
		// Wikilink was canonicalized to a clean string form.
		expect(draftFm?.['dbench-scene']).toBe('[[Opening]]');
	});

	it('preserves alias / subpath content when canonicalizing nested-array form', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		// Nested array carrying an alias-bearing inner string. The
		// canonicalizer should preserve it verbatim, not strip the alias.
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': [['Opening|First Scene']],
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});
		app.metadataCache._setFrontmatterLinks(draft, [
			{
				key: 'dbench-scene',
				link: 'Opening',
				original: '[[Opening|First Scene]]',
				displayText: 'First Scene',
			},
		]);

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene']).toBe('[[Opening|First Scene]]');
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
	});

	it('leaves an already-canonical string unchanged (idempotent)', async () => {
		await seedFolderProject('Novel/Novel.md', 'prj-001-tst-001', 'Novel');
		await seedScene(
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const draft = await app.vault.create(
			'Novel/Drafts/Opening - Draft 1.md',
			''
		);
		// Already-clean string. Canonicalizer should leave it alone.
		app.metadataCache._setFrontmatter(draft, {
			'dbench-type': 'draft',
			'dbench-id': 'drf-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': '[[Opening]]',
			'dbench-scene-id': '',
			'dbench-draft-number': 1,
		});

		app.metadataCache._fire('changed', draft);
		await flush();

		const draftFm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(draftFm?.['dbench-scene']).toBe('[[Opening]]');
		expect(draftFm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
	});
});

describe('DraftBenchLinker — scene<->sub-scene sync', () => {
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

	async function seedScene(
		path: string,
		id: string,
		projectId: string,
		title: string,
		projectTitle: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'scene',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		// Suppress unused-name lint by referencing title in path equivalence.
		void title;
		return file;
	}

	async function seedSubScene(
		path: string,
		id: string,
		projectTitle: string,
		projectId: string,
		sceneTitle: string,
		sceneId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'sub-scene',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-scene': `[[${sceneTitle}]]`,
			'dbench-scene-id': sceneId,
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

	it('modify: adds sub-scene to parent scene reverse arrays', async () => {
		const scene = await seedScene(
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'The auction',
			'Drift'
		);
		const subScene = await seedSubScene(
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);

		// Starting state: scene has no sub-scene reverse arrays.
		expect(
			app.metadataCache.getFileCache(scene)?.frontmatter?.['dbench-sub-scenes']
		).toBeUndefined();

		app.metadataCache._fire('changed', subScene);
		await flush();

		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-sub-scenes']).toEqual(['[[Lot 47]]']);
		expect(fm?.['dbench-sub-scene-ids']).toEqual(['sub-001-tst-001']);
	});

	it('modify: moves sub-scene between parent scenes (removes from old, adds to new)', async () => {
		const oldScene = await seedScene(
			'Drift/Old scene.md',
			'sc1-old-tst-001',
			'prj-001-tst-001',
			'Old scene',
			'Drift'
		);
		const newScene = await seedScene(
			'Drift/New scene.md',
			'sc1-new-tst-002',
			'prj-001-tst-001',
			'New scene',
			'Drift'
		);
		const subScene = await seedSubScene(
			'Drift/Old scene/Sub.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Old scene',
			'sc1-old-tst-001'
		);

		patchCache(oldScene, {
			'dbench-sub-scenes': ['[[Sub]]'],
			'dbench-sub-scene-ids': ['sub-001-tst-001'],
		});

		patchCache(subScene, {
			'dbench-scene': '[[New scene]]',
			'dbench-scene-id': 'sc1-new-tst-002',
		});

		app.metadataCache._fire('changed', subScene);
		await flush();

		const oldFm = app.metadataCache.getFileCache(oldScene)?.frontmatter;
		const newFm = app.metadataCache.getFileCache(newScene)?.frontmatter;
		expect(oldFm?.['dbench-sub-scenes']).toEqual([]);
		expect(oldFm?.['dbench-sub-scene-ids']).toEqual([]);
		expect(newFm?.['dbench-sub-scenes']).toEqual(['[[Sub]]']);
		expect(newFm?.['dbench-sub-scene-ids']).toEqual(['sub-001-tst-001']);
	});

	it('modify: idempotent — no writes when already in sync', async () => {
		const scene = await seedScene(
			'Drift/Scene.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Scene',
			'Drift'
		);
		const subScene = await seedSubScene(
			'Drift/Scene/Sub.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Scene',
			'sc1-001-tst-001'
		);

		patchCache(scene, {
			'dbench-sub-scenes': ['[[Sub]]'],
			'dbench-sub-scene-ids': ['sub-001-tst-001'],
		});

		app.metadataCache._fire('changed', subScene);
		await flush();

		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-sub-scenes']).toEqual(['[[Sub]]']);
		expect(fm?.['dbench-sub-scene-ids']).toEqual(['sub-001-tst-001']);
	});

	it('modify: skipped when suspended', async () => {
		const scene = await seedScene(
			'Drift/Scene.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Scene',
			'Drift'
		);
		const subScene = await seedSubScene(
			'Drift/Scene/Sub.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Scene',
			'sc1-001-tst-001'
		);

		await linker.withSuspended(async () => {
			app.metadataCache._fire('changed', subScene);
			await flush();
		});

		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-sub-scenes']).toBeUndefined();
	});

	it('delete: removes sub-scene from parent scene reverse arrays', async () => {
		const scene = await seedScene(
			'Drift/Scene.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Scene',
			'Drift'
		);
		const subScene = await seedSubScene(
			'Drift/Scene/Sub.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Scene',
			'sc1-001-tst-001'
		);

		patchCache(scene, {
			'dbench-sub-scenes': ['[[Sub]]'],
			'dbench-sub-scene-ids': ['sub-001-tst-001'],
		});

		app.vault._fire('delete', subScene);
		await flush();

		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-sub-scenes']).toEqual([]);
		expect(fm?.['dbench-sub-scene-ids']).toEqual([]);
	});

	it('rename: updates sub-scene wikilink in parent scene reverse array', async () => {
		const scene = await seedScene(
			'Drift/Scene.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Scene',
			'Drift'
		);
		const subScene = await seedSubScene(
			'Drift/Scene/Old name.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Scene',
			'sc1-001-tst-001'
		);

		patchCache(scene, {
			'dbench-sub-scenes': ['[[Old name]]'],
			'dbench-sub-scene-ids': ['sub-001-tst-001'],
		});

		const oldPath = app.vault._rename(subScene, 'Drift/Scene/New name.md');
		app.vault._fire('rename', subScene, oldPath);
		await flush();

		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-sub-scenes']).toEqual(['[[New name]]']);
	});
});

describe('DraftBenchLinker — sub-scene<->draft sync', () => {
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

	async function seedSubScene(
		path: string,
		id: string,
		projectTitle: string,
		projectId: string,
		sceneTitle: string,
		sceneId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'sub-scene',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-scene': `[[${sceneTitle}]]`,
			'dbench-scene-id': sceneId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	async function seedSubSceneDraft(
		path: string,
		id: string,
		subSceneTitle: string,
		subSceneId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'draft',
			'dbench-id': id,
			'dbench-sub-scene': `[[${subSceneTitle}]]`,
			'dbench-sub-scene-id': subSceneId,
			'dbench-draft-number': 1,
		});
		return file;
	}

	it('modify: adds sub-scene draft to sub-scene reverse arrays', async () => {
		const subScene = await seedSubScene(
			'Drift/Scene/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Scene',
			'sc1-001-tst-001'
		);
		const draft = await seedSubSceneDraft(
			'Drift/Drafts/Scene - Lot 47 - Draft 1 (20260502).md',
			'drf-001-tst-001',
			'Lot 47',
			'sub-001-tst-001'
		);

		expect(
			app.metadataCache.getFileCache(subScene)?.frontmatter?.['dbench-drafts']
		).toEqual([]);

		app.metadataCache._fire('changed', draft);
		await flush();

		const fm = app.metadataCache.getFileCache(subScene)?.frontmatter;
		expect(fm?.['dbench-drafts']).toEqual([
			'[[Scene - Lot 47 - Draft 1 (20260502)]]',
		]);
		expect(fm?.['dbench-draft-ids']).toEqual(['drf-001-tst-001']);
	});

	it('delete: removes sub-scene draft from sub-scene reverse arrays', async () => {
		const subScene = await seedSubScene(
			'Drift/Scene/Sub.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Scene',
			'sc1-001-tst-001'
		);
		const draft = await seedSubSceneDraft(
			'Drift/Drafts/Sub - Draft 1.md',
			'drf-001-tst-001',
			'Sub',
			'sub-001-tst-001'
		);

		const current = app.metadataCache.getFileCache(subScene)?.frontmatter ?? {};
		app.metadataCache._setFrontmatter(subScene, {
			...current,
			'dbench-drafts': ['[[Sub - Draft 1]]'],
			'dbench-draft-ids': ['drf-001-tst-001'],
		});

		app.vault._fire('delete', draft);
		await flush();

		const fm = app.metadataCache.getFileCache(subScene)?.frontmatter;
		expect(fm?.['dbench-drafts']).toEqual([]);
		expect(fm?.['dbench-draft-ids']).toEqual([]);
	});
});

describe('DraftBenchLinker — sub-scene-folder auto-rename on parent-scene rename', () => {
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

	async function seedFolder(path: string): Promise<void> {
		await app.vault.createFolder(path);
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
		projectId: string,
		title: string,
		projectTitle: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'scene',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		void title;
		return file;
	}

	async function seedSubScene(
		path: string,
		id: string,
		projectId: string,
		sceneId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'sub-scene',
			'dbench-id': id,
			'dbench-project-id': projectId,
			'dbench-scene-id': sceneId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	it('renames the sub-scene folder when its parent scene is renamed', async () => {
		await seedProject(
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift'
		);
		const scene = await seedScene(
			'Drift/Old name.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Old name',
			'Drift'
		);
		await seedFolder('Drift/Old name');
		await seedSubScene(
			'Drift/Old name/Sub.md',
			'sub-001-tst-001',
			'prj-001-tst-001',
			'sc1-001-tst-001'
		);

		const oldPath = app.vault._rename(scene, 'Drift/New name.md');
		app.vault._fire('rename', scene, oldPath);
		await flush();

		expect(app.vault.getAbstractFileByPath('Drift/Old name')).toBeNull();
		const renamed = app.vault.getAbstractFileByPath('Drift/New name');
		expect(renamed).not.toBeNull();
		// Sub-scene file moved with the folder.
		expect(app.vault.getAbstractFileByPath('Drift/New name/Sub.md')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Drift/Old name/Sub.md')).toBeNull();
	});

	it("skips when subScenesFolder doesn't include {scene}", async () => {
		settings.subScenesFolder = '';
		await seedProject(
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift'
		);
		const scene = await seedScene(
			'Drift/Old name.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Old name',
			'Drift'
		);
		// A folder happens to exist with the old basename, but the
		// configured template doesn't use {scene}, so the auto-rename
		// must not fire.
		await seedFolder('Drift/Old name');

		const oldPath = app.vault._rename(scene, 'Drift/New name.md');
		app.vault._fire('rename', scene, oldPath);
		await flush();

		// Folder untouched.
		expect(app.vault.getAbstractFileByPath('Drift/Old name')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Drift/New name')).toBeNull();
	});

	it('skips when no sub-scene in the folder references the renamed scene', async () => {
		await seedProject(
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift'
		);
		const scene = await seedScene(
			'Drift/Old name.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Old name',
			'Drift'
		);
		// Folder with old basename exists but contains no matching
		// sub-scenes (writer-managed folder coincidentally named after
		// the scene). Auto-rename must NOT touch it.
		await seedFolder('Drift/Old name');
		const unrelatedFile = await app.vault.create(
			'Drift/Old name/notes.md',
			''
		);
		app.metadataCache._setFrontmatter(unrelatedFile, {
			tags: ['notes'],
		});

		const oldPath = app.vault._rename(scene, 'Drift/New name.md');
		app.vault._fire('rename', scene, oldPath);
		await flush();

		expect(app.vault.getAbstractFileByPath('Drift/Old name')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Drift/New name')).toBeNull();
	});

	it('skips when the new folder path is already occupied', async () => {
		await seedProject(
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift'
		);
		const scene = await seedScene(
			'Drift/Old name.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Old name',
			'Drift'
		);
		await seedFolder('Drift/Old name');
		await seedSubScene(
			'Drift/Old name/Sub.md',
			'sub-001-tst-001',
			'prj-001-tst-001',
			'sc1-001-tst-001'
		);
		// Conflicting destination already exists.
		await seedFolder('Drift/New name');

		const oldPath = app.vault._rename(scene, 'Drift/New name.md');
		app.vault._fire('rename', scene, oldPath);
		await flush();

		// Old folder untouched (skip rather than overwrite).
		expect(app.vault.getAbstractFileByPath('Drift/Old name')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Drift/Old name/Sub.md')).not.toBeNull();
	});

	it('skips when suspended', async () => {
		await seedProject(
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift'
		);
		const scene = await seedScene(
			'Drift/Old name.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'Old name',
			'Drift'
		);
		await seedFolder('Drift/Old name');
		await seedSubScene(
			'Drift/Old name/Sub.md',
			'sub-001-tst-001',
			'prj-001-tst-001',
			'sc1-001-tst-001'
		);

		await linker.withSuspended(async () => {
			const oldPath = app.vault._rename(scene, 'Drift/New name.md');
			app.vault._fire('rename', scene, oldPath);
			await flush();
		});

		// Suspended: folder not auto-renamed.
		expect(app.vault.getAbstractFileByPath('Drift/Old name')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Drift/New name')).toBeNull();
	});

	it('renames the chapter-nested sub-scene folder when its parent scene is renamed (#12)', async () => {
		// Per #12, sub-scene folders are joined to the scene's parent
		// folder. For a scene-in-chapter at `Drift/Ch01/Old name.md`, the
		// sub-scene folder lives at `Drift/Ch01/Old name/` — under the
		// chapter, not at the project root. Rename of the scene should
		// rename the chapter-nested sub-scene folder too.
		await seedProject('Drift/Drift.md', 'prj-001-tst-001', 'Drift');
		await seedFolder('Drift/Ch01');
		const sceneFile = await app.vault.create('Drift/Ch01/Old name.md', '');
		app.metadataCache._setFrontmatter(sceneFile, {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-chapter-id': 'chp-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		await seedFolder('Drift/Ch01/Old name');
		await seedSubScene(
			'Drift/Ch01/Old name/Sub.md',
			'sub-001-tst-001',
			'prj-001-tst-001',
			'sc1-001-tst-001'
		);

		const oldPath = app.vault._rename(sceneFile, 'Drift/Ch01/New name.md');
		app.vault._fire('rename', sceneFile, oldPath);
		await flush();

		expect(
			app.vault.getAbstractFileByPath('Drift/Ch01/Old name')
		).toBeNull();
		expect(
			app.vault.getAbstractFileByPath('Drift/Ch01/New name')
		).not.toBeNull();
		expect(
			app.vault.getAbstractFileByPath('Drift/Ch01/New name/Sub.md')
		).not.toBeNull();
	});
});

describe('DraftBenchLinker — chapter-scenes-folder auto-rename on parent-chapter rename (#11)', () => {
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

	async function seedFolder(path: string): Promise<void> {
		await app.vault.createFolder(path);
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
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
		});
		return file;
	}

	async function seedChapter(
		path: string,
		id: string,
		projectId: string,
		projectTitle: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'chapter',
			'dbench-id': id,
			'dbench-project': `[[${projectTitle}]]`,
			'dbench-project-id': projectId,
			'dbench-order': 1,
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		return file;
	}

	async function seedSceneInChapter(
		path: string,
		id: string,
		projectId: string,
		chapterId: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'scene',
			'dbench-id': id,
			'dbench-project-id': projectId,
			'dbench-chapter-id': chapterId,
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	it('renames the chapter scenes folder when its parent chapter is renamed', async () => {
		await seedProject('Drift/Drift.md', 'prj-001-tst-001', 'Drift');
		const chapter = await seedChapter(
			'Drift/Old chapter.md',
			'chp-001-tst-001',
			'prj-001-tst-001',
			'Drift'
		);
		await seedFolder('Drift/Old chapter');
		await seedSceneInChapter(
			'Drift/Old chapter/Scene 1.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'chp-001-tst-001'
		);

		const oldPath = app.vault._rename(chapter, 'Drift/New chapter.md');
		app.vault._fire('rename', chapter, oldPath);
		await flush();

		expect(app.vault.getAbstractFileByPath('Drift/Old chapter')).toBeNull();
		expect(
			app.vault.getAbstractFileByPath('Drift/New chapter')
		).not.toBeNull();
		// Scene file moved with the folder.
		expect(
			app.vault.getAbstractFileByPath('Drift/New chapter/Scene 1.md')
		).not.toBeNull();
		expect(
			app.vault.getAbstractFileByPath('Drift/Old chapter/Scene 1.md')
		).toBeNull();
	});

	it("skips when scenesFolder doesn't include {chapter}", async () => {
		settings.scenesFolder = '';
		await seedProject('Drift/Drift.md', 'prj-001-tst-001', 'Drift');
		const chapter = await seedChapter(
			'Drift/Old chapter.md',
			'chp-001-tst-001',
			'prj-001-tst-001',
			'Drift'
		);
		// A folder happens to exist with the old basename, but the
		// configured template doesn't use {chapter}, so the auto-rename
		// must not fire.
		await seedFolder('Drift/Old chapter');

		const oldPath = app.vault._rename(chapter, 'Drift/New chapter.md');
		app.vault._fire('rename', chapter, oldPath);
		await flush();

		expect(app.vault.getAbstractFileByPath('Drift/Old chapter')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Drift/New chapter')).toBeNull();
	});

	it('skips when no scene in the folder references the renamed chapter', async () => {
		await seedProject('Drift/Drift.md', 'prj-001-tst-001', 'Drift');
		const chapter = await seedChapter(
			'Drift/Old chapter.md',
			'chp-001-tst-001',
			'prj-001-tst-001',
			'Drift'
		);
		// Folder with old basename exists but contains no matching
		// scenes (writer-managed folder coincidentally named after the
		// chapter). Auto-rename must NOT touch it.
		await seedFolder('Drift/Old chapter');
		const unrelatedFile = await app.vault.create(
			'Drift/Old chapter/notes.md',
			''
		);
		app.metadataCache._setFrontmatter(unrelatedFile, {
			tags: ['notes'],
		});

		const oldPath = app.vault._rename(chapter, 'Drift/New chapter.md');
		app.vault._fire('rename', chapter, oldPath);
		await flush();

		expect(app.vault.getAbstractFileByPath('Drift/Old chapter')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Drift/New chapter')).toBeNull();
	});

	it('skips when the new folder path is already occupied', async () => {
		await seedProject('Drift/Drift.md', 'prj-001-tst-001', 'Drift');
		const chapter = await seedChapter(
			'Drift/Old chapter.md',
			'chp-001-tst-001',
			'prj-001-tst-001',
			'Drift'
		);
		await seedFolder('Drift/Old chapter');
		await seedSceneInChapter(
			'Drift/Old chapter/Scene 1.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'chp-001-tst-001'
		);
		// Conflicting destination already exists.
		await seedFolder('Drift/New chapter');

		const oldPath = app.vault._rename(chapter, 'Drift/New chapter.md');
		app.vault._fire('rename', chapter, oldPath);
		await flush();

		// Old folder untouched (skip rather than overwrite).
		expect(app.vault.getAbstractFileByPath('Drift/Old chapter')).not.toBeNull();
		expect(
			app.vault.getAbstractFileByPath('Drift/Old chapter/Scene 1.md')
		).not.toBeNull();
	});

	it('skips when suspended', async () => {
		await seedProject('Drift/Drift.md', 'prj-001-tst-001', 'Drift');
		const chapter = await seedChapter(
			'Drift/Old chapter.md',
			'chp-001-tst-001',
			'prj-001-tst-001',
			'Drift'
		);
		await seedFolder('Drift/Old chapter');
		await seedSceneInChapter(
			'Drift/Old chapter/Scene 1.md',
			'sc1-001-tst-001',
			'prj-001-tst-001',
			'chp-001-tst-001'
		);

		await linker.withSuspended(async () => {
			const oldPath = app.vault._rename(chapter, 'Drift/New chapter.md');
			app.vault._fire('rename', chapter, oldPath);
			await flush();
		});

		// Suspended: folder not auto-renamed.
		expect(app.vault.getAbstractFileByPath('Drift/Old chapter')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Drift/New chapter')).toBeNull();
	});
});
