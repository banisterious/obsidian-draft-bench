import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App, Menu, Platform, TFile, TFolder } from 'obsidian';
import { populateMenuSurface, type MenuItemSpec } from '../../src/context-menu/shared';
import { buildFileMenuItems } from '../../src/context-menu/file-menu';
import { buildFilesMenuItems } from '../../src/context-menu/files-menu';
import { buildEditorMenuItems } from '../../src/context-menu/editor-menu';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';
import { DraftBenchLinker } from '../../src/core/linker';
import { ProjectSelection } from '../../src/core/selection';

/**
 * Tests for the Draft Bench submenu refactor (#5). Covers:
 *
 * - `populateMenuSurface` dispatcher: empty-specs no-op, desktop submenu
 *   shape, mobile flat-prefix shape, click-handler propagation.
 * - `buildFileMenuItems` smart visibility under the submenu shape:
 *   untyped, project, compile-preset, fully-stamped.
 * - `buildFilesMenuItems` multi-select smart visibility.
 * - `buildEditorMenuItems` reuses the single-file spec list.
 *
 * The mock `Menu` captures items + separators in insertion order. Test
 * helpers (`_items`, `_findItem`, `_findSubmenu`) inspect what was added.
 */

function makeFile(path: string): TFile {
	const filename = path.split('/').pop() ?? '';
	const dotIdx = filename.lastIndexOf('.');
	return new TFile({
		path,
		basename: dotIdx > 0 ? filename.slice(0, dotIdx) : filename,
		extension: dotIdx > 0 ? filename.slice(dotIdx + 1) : '',
	});
}

describe('populateMenuSurface — dispatcher', () => {
	beforeEach(() => {
		Platform.isDesktop = true;
		Platform.isMobile = false;
	});

	afterEach(() => {
		Platform.isDesktop = true;
		Platform.isMobile = false;
	});

	it('no-ops on empty specs (no separator, no item)', () => {
		const menu = new Menu();
		populateMenuSurface(menu, []);
		expect(menu._entries()).toHaveLength(0);
	});

	it('desktop: wraps specs in a Draft Bench submenu with the scroll-text icon', () => {
		const menu = new Menu();
		const specs: MenuItemSpec[] = [
			{ title: 'Set as project', icon: 'folder', onClick: () => {} },
			{ title: 'Set as scene', icon: 'align-left', onClick: () => {} },
		];
		populateMenuSurface(menu, specs);

		const entries = menu._entries();
		expect(entries).toHaveLength(2);
		expect(entries[0]).toEqual({ separator: true });

		const dbItem = menu._findItem('Draft Bench');
		expect(dbItem).not.toBeNull();
		expect(dbItem?.icon).toBe('scroll-text');
		expect(dbItem?.section).toBe('action');
		expect(dbItem?.submenu).not.toBeNull();

		const submenu = menu._findSubmenu('Draft Bench');
		const subItems = submenu?._items() ?? [];
		expect(subItems.map((i) => i.title)).toEqual([
			'Set as project',
			'Set as scene',
		]);
		expect(subItems.map((i) => i.icon)).toEqual(['folder', 'align-left']);
	});

	it('mobile: emits flat top-level items prefixed with "Draft Bench: "', () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;

		const menu = new Menu();
		const specs: MenuItemSpec[] = [
			{ title: 'Set as project', icon: 'folder', onClick: () => {} },
			{ title: 'Set as scene', icon: 'align-left', onClick: () => {} },
		];
		populateMenuSurface(menu, specs);

		const entries = menu._entries();
		expect(entries[0]).toEqual({ separator: true });

		const items = menu._items();
		expect(items.map((i) => i.title)).toEqual([
			'Draft Bench: Set as project',
			'Draft Bench: Set as scene',
		]);
		expect(items.every((i) => i.section === 'action')).toBe(true);

		// No submenu wrapper on mobile.
		expect(menu._findSubmenu('Draft Bench')).toBeNull();
	});

	it('desktop: invokes the spec onClick when the submenu item fires', () => {
		const menu = new Menu();
		let fired = 0;
		populateMenuSurface(menu, [
			{ title: 'Run', icon: 'play', onClick: () => { fired++; } },
		]);
		const submenu = menu._findSubmenu('Draft Bench');
		const item = submenu?._findItem('Run');
		item?.clickHandler?.();
		expect(fired).toBe(1);
	});

	it('mobile: invokes the spec onClick when the prefixed item fires', () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;

		const menu = new Menu();
		let fired = 0;
		populateMenuSurface(menu, [
			{ title: 'Run', icon: 'play', onClick: () => { fired++; } },
		]);
		const item = menu._findItem('Draft Bench: Run');
		item?.clickHandler?.();
		expect(fired).toBe(1);
	});
});

describe('buildFileMenuItems — single file smart visibility', () => {
	let app: App;
	let plugin: TestPlugin;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		Platform.isDesktop = true;
		Platform.isMobile = false;
		app = new App();
		plugin = makeTestPlugin(app);
		linker = new DraftBenchLinker(app, () => plugin.settings);
	});

	it('shows retrofit specs (Set as project/chapter/scene/draft) for an untyped markdown note', async () => {
		const file = await app.vault.create('Untyped.md', '');
		// No frontmatter at all; readDbenchType returns null.
		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, file);

		const submenu = menu._findSubmenu('Draft Bench');
		expect(submenu).not.toBeNull();
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).toEqual([
			'Set as project',
			'Set as chapter',
			'Set as scene',
			'Set as sub-scene',
			'Set as draft',
		]);
	});

	it('shows project actions for a project note', async () => {
		const file = await app.vault.create('Novel/Novel.md', '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, file);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).toContain('Show manuscript view');
		expect(titles).toContain('Build manuscript');
		expect(titles).toContain('Repair project links');
		expect(titles).toContain('Create compile preset');
		// No retrofit items on a fully-stamped project.
		expect(titles.some((t) => t.startsWith('Set as'))).toBe(false);
	});

	it('emits no items (and no submenu) for a non-markdown file', async () => {
		const file = makeFile('image.png');
		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, file);
		expect(menu._entries()).toHaveLength(0);
	});

	it('shows "New draft of this scene" on a typed scene note (#9)', async () => {
		// Project required so the inferred-project lookup in
		// `addMoveToChapterMenuItem` doesn't blow up when traversing.
		const project = await app.vault.create('Novel/Novel.md', '');
		app.metadataCache._setFrontmatter(project, {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
		});
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

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, scene);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).toContain('New draft of this scene');
	});

	it('hides "New draft of this scene" on non-scene file types (#9)', async () => {
		const project = await app.vault.create('Novel/Novel.md', '');
		app.metadataCache._setFrontmatter(project, {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, project);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).not.toContain('New draft of this scene');
	});

	it('emits no items for an empty folder (no markdown children)', async () => {
		const folder = new TFolder({
			path: 'Empty',
			name: 'Empty',
			children: [],
		});
		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, folder);
		expect(menu._entries()).toHaveLength(0);
	});

	it('mobile: project actions appear flat-prefixed on Platform.isMobile=true', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;

		const file = await app.vault.create('Novel/Novel.md', '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, file);

		// Submenu absent; flat prefixed items present.
		expect(menu._findSubmenu('Draft Bench')).toBeNull();
		const titles = menu._items().map((i) => i.title);
		expect(titles).toContain('Draft Bench: Show manuscript view');
		expect(titles).toContain('Draft Bench: Build manuscript');
	});
});

describe('buildFilesMenuItems — multi-select', () => {
	let app: App;
	let plugin: TestPlugin;

	beforeEach(() => {
		Platform.isDesktop = true;
		Platform.isMobile = false;
		app = new App();
		plugin = makeTestPlugin(app);
	});

	it('emits no items when the selection is all non-markdown', () => {
		const menu = new Menu();
		buildFilesMenuItems(plugin, menu, [makeFile('image.png')]);
		expect(menu._entries()).toHaveLength(0);
	});

	it('shows Set-as-X specs when at least one selected file is untyped', async () => {
		const a = await app.vault.create('A.md', '');
		const b = await app.vault.create('B.md', '');
		const menu = new Menu();
		buildFilesMenuItems(plugin, menu, [a, b]);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).toContain('Set as project');
		expect(titles).toContain('Set as chapter');
		expect(titles).toContain('Set as scene');
		expect(titles).toContain('Set as draft');
	});

	it('emits no items when all selected files are fully stamped', async () => {
		const a = await app.vault.create('A.md', '');
		app.metadataCache._setFrontmatter(a, {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		const menu = new Menu();
		buildFilesMenuItems(plugin, menu, [a]);
		expect(menu._entries()).toHaveLength(0);
	});
});

describe('buildEditorMenuItems — editor surface', () => {
	let app: App;
	let plugin: TestPlugin;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		Platform.isDesktop = true;
		Platform.isMobile = false;
		app = new App();
		plugin = makeTestPlugin(app);
		linker = new DraftBenchLinker(app, () => plugin.settings);
	});

	it('emits no items when the active info has a null file', () => {
		const menu = new Menu();
		// Cast: editor isn't read by the handler, so a stub object suffices.
		buildEditorMenuItems(
			plugin,
			linker,
			menu,
			null as unknown as Parameters<typeof buildEditorMenuItems>[3],
			{ app, file: null } as unknown as Parameters<typeof buildEditorMenuItems>[4]
		);
		expect(menu._entries()).toHaveLength(0);
	});

	it('emits the same single-file specs when right-clicking an open project note', async () => {
		const file = await app.vault.create('Novel/Novel.md', '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});

		const menu = new Menu();
		buildEditorMenuItems(
			plugin,
			linker,
			menu,
			null as unknown as Parameters<typeof buildEditorMenuItems>[3],
			{ app, file } as unknown as Parameters<typeof buildEditorMenuItems>[4]
		);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).toContain('Show manuscript view');
		expect(titles).toContain('Build manuscript');
		expect(titles).toContain('Repair project links');
	});

	it('emits no items when the active file is non-markdown', () => {
		const file = makeFile('image.png');
		const menu = new Menu();
		buildEditorMenuItems(
			plugin,
			linker,
			menu,
			null as unknown as Parameters<typeof buildEditorMenuItems>[3],
			{ app, file } as unknown as Parameters<typeof buildEditorMenuItems>[4]
		);
		expect(menu._entries()).toHaveLength(0);
	});
});

describe('buildFileMenuItems — folder-scope smart Set as project (#3)', () => {
	let app: App;
	let plugin: TestPlugin;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		Platform.isDesktop = true;
		Platform.isMobile = false;
		app = new App();
		plugin = makeTestPlugin(app);
		linker = new DraftBenchLinker(app, () => plugin.settings);
	});

	it('shows Set as project targeting the folder-note only (case-insensitive match)', async () => {
		const folderNote = await app.vault.create('Novel/Novel.md', '');
		const scene1 = await app.vault.create('Novel/Scene 1.md', '');
		const scene2 = await app.vault.create('Novel/Scene 2.md', '');
		const folder = new TFolder({
			path: 'Novel',
			name: 'Novel',
			children: [folderNote, scene1, scene2],
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, folder);

		const submenu = menu._findSubmenu('Draft Bench');
		expect(submenu).not.toBeNull();
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).toContain('Set as project');

		// Click Set as project; only the folder-note should get retrofitted.
		const setProjectItem = submenu?._findItem('Set as project');
		await setProjectItem?.clickHandler?.();

		const folderNoteFm = app.metadataCache.getFileCache(folderNote)?.frontmatter;
		const scene1Fm = app.metadataCache.getFileCache(scene1)?.frontmatter;
		const scene2Fm = app.metadataCache.getFileCache(scene2)?.frontmatter;

		expect(folderNoteFm?.['dbench-type']).toBe('project');
		expect(scene1Fm?.['dbench-type']).toBeUndefined();
		expect(scene2Fm?.['dbench-type']).toBeUndefined();
	});

	it('matches folder-note case-insensitively', async () => {
		const folderNote = await app.vault.create('NOVEL/novel.md', '');
		const folder = new TFolder({
			path: 'NOVEL',
			name: 'NOVEL',
			children: [folderNote],
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, folder);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).toContain('Set as project');
	});

	it('hides Set as project when no folder-note exists', async () => {
		const scene1 = await app.vault.create('Novel/Scene 1.md', '');
		const scene2 = await app.vault.create('Novel/Scene 2.md', '');
		const folder = new TFolder({
			path: 'Novel',
			name: 'Novel',
			children: [scene1, scene2],
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, folder);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).not.toContain('Set as project');
		// Other folder-scope retrofits still appear.
		expect(titles).toContain('Set as scene');
		expect(titles).toContain('Set as draft');
	});

	it('hides Set as project when the folder-note is already typed', async () => {
		const folderNote = await app.vault.create('Novel/Novel.md', '');
		app.metadataCache._setFrontmatter(folderNote, {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		const folder = new TFolder({
			path: 'Novel',
			name: 'Novel',
			children: [folderNote],
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, folder);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).not.toContain('Set as project');
	});

	it('does not match a same-named file in a subfolder (Novel/Drafts/Novel.md)', async () => {
		const draftsNovel = await app.vault.create('Novel/Drafts/Novel.md', '');
		const draftsFolder = new TFolder({
			path: 'Novel/Drafts',
			name: 'Drafts',
			children: [draftsNovel],
		});
		const scene1 = await app.vault.create('Novel/Scene 1.md', '');
		const folder = new TFolder({
			path: 'Novel',
			name: 'Novel',
			children: [scene1, draftsFolder], // No direct-child Novel.md.
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, folder);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		// folder-note check examines direct children only; Drafts/Novel.md
		// must not satisfy the match for `Novel/`.
		expect(titles).not.toContain('Set as project');
	});

	it('keeps batch behavior for Set as scene / draft / etc.', async () => {
		const folderNote = await app.vault.create('Novel/Novel.md', '');
		const scene1 = await app.vault.create('Novel/Scene 1.md', '');
		const folder = new TFolder({
			path: 'Novel',
			name: 'Novel',
			children: [folderNote, scene1],
		});

		const menu = new Menu();
		buildFileMenuItems(plugin, linker, menu, folder);

		const submenu = menu._findSubmenu('Draft Bench');
		const titles = submenu?._items().map((i) => i.title) ?? [];
		expect(titles).toEqual([
			'Set as project',
			'Set as chapter',
			'Set as scene',
			'Set as sub-scene',
			'Set as draft',
			'Complete essential properties',
			'Add identifier',
		]);
	});
});

// ---------- helpers ----------

interface TestPlugin {
	app: App;
	settings: DraftBenchSettings;
	selection: ProjectSelection;
}

function makeTestPlugin(app: App): TestPlugin {
	return {
		app,
		settings: { ...DEFAULT_SETTINGS },
		selection: new ProjectSelection(),
	};
}
