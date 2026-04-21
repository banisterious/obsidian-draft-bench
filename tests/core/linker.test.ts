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
