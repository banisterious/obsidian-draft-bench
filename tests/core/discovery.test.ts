import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	findChapters,
	findChaptersInProject,
	findDrafts,
	findDraftsOfChapter,
	findDraftsOfProject,
	findDraftsOfScene,
	findNoteById,
	findProjects,
	findScenes,
	findScenesInChapter,
	findScenesInProject,
	findSubScenes,
	findSubScenesInProject,
	findSubScenesInScene,
} from '../../src/core/discovery';

/**
 * Helper: build a minimal TFile compatible with the mock.
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

/**
 * Helper: seed a file into the mock app's vault with given frontmatter.
 */
function seed(
	app: App,
	path: string,
	frontmatter: Record<string, unknown>
): TFile {
	const file = makeFile(path);
	app.vault._addFile(file);
	app.metadataCache._setFrontmatter(file, frontmatter);
	return file;
}

describe('findProjects', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns empty array on empty vault', () => {
		expect(findProjects(app)).toEqual([]);
	});

	it('returns project notes only', () => {
		const projectFile = seed(app, 'My Novel.md', {
			'dbench-type': 'project',
			'dbench-id': 'proj-001-aaa-001',
		});
		seed(app, 'Scene 1.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-bbb-001',
		});
		seed(app, 'Random Note.md', {});

		const result = findProjects(app);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe(projectFile);
	});

	it('skips notes without dbench-* frontmatter', () => {
		seed(app, 'Daily Note.md', { tags: ['personal'] });
		seed(app, 'Untitled.md', {});
		expect(findProjects(app)).toEqual([]);
	});

	it('skips files without metadata cache entries', () => {
		const file = makeFile('Orphan.md');
		app.vault._addFile(file);
		// Deliberately not seeding metadata.
		expect(findProjects(app)).toEqual([]);
	});

	it('returns multiple projects when present', () => {
		seed(app, 'Project A.md', { 'dbench-type': 'project', 'dbench-id': 'aaa-111-bbb-222' });
		seed(app, 'Project B.md', { 'dbench-type': 'project', 'dbench-id': 'ccc-333-ddd-444' });
		expect(findProjects(app)).toHaveLength(2);
	});
});

describe('findScenes', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns scene notes only', () => {
		seed(app, 'Project.md', { 'dbench-type': 'project', 'dbench-id': 'proj-001-aaa-001' });
		const sceneFile = seed(app, 'Scene 1.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-bbb-001',
		});
		seed(app, 'Draft.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-ccc-001',
		});

		const result = findScenes(app);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe(sceneFile);
	});
});

describe('findDrafts', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns draft notes only', () => {
		seed(app, 'Project.md', { 'dbench-type': 'project', 'dbench-id': 'proj-001-aaa-001' });
		const draftFile = seed(app, 'Scene - Draft 1.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-ccc-001',
		});

		const result = findDrafts(app);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe(draftFile);
	});
});

describe('findScenesInProject', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns only scenes whose dbench-project-id matches', () => {
		seed(app, 'Scene A1.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		seed(app, 'Scene A2.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-002-aaa-002',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		seed(app, 'Scene B1.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-003-bbb-003',
			'dbench-project-id': 'proj-002-bbb-002',
		});

		const result = findScenesInProject(app, 'proj-001-aaa-001');
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.file.path).sort()).toEqual(['Scene A1.md', 'Scene A2.md']);
	});

	it('excludes orphan scenes (empty dbench-project-id)', () => {
		seed(app, 'Orphan.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-aaa-001',
			'dbench-project-id': '',
		});
		expect(findScenesInProject(app, 'proj-001-aaa-001')).toEqual([]);
	});

	it('returns empty array for empty project ID', () => {
		seed(app, 'Scene.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-aaa-001',
			'dbench-project-id': '',
		});
		expect(findScenesInProject(app, '')).toEqual([]);
	});
});

describe('findChapters', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns empty array on empty vault', () => {
		expect(findChapters(app)).toEqual([]);
	});

	it('returns chapter notes only', () => {
		const chapterFile = seed(app, 'Chapter 1.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chap-001-aaa-001',
		});
		seed(app, 'Scene.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-bbb-001',
		});
		seed(app, 'My Novel.md', {
			'dbench-type': 'project',
			'dbench-id': 'proj-001-ccc-001',
		});

		const result = findChapters(app);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe(chapterFile);
	});

	it('returns multiple chapters in iteration order', () => {
		seed(app, 'Chapter 1.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chap-001-aaa-001',
		});
		seed(app, 'Chapter 2.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chap-002-aaa-002',
		});
		expect(findChapters(app)).toHaveLength(2);
	});
});

describe('findChaptersInProject', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns only chapters whose dbench-project-id matches', () => {
		seed(app, 'Chapter A1.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chap-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		seed(app, 'Chapter A2.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chap-002-aaa-002',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		seed(app, 'Chapter B1.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chap-003-bbb-003',
			'dbench-project-id': 'proj-002-bbb-002',
		});

		const result = findChaptersInProject(app, 'proj-001-aaa-001');
		expect(result).toHaveLength(2);
		expect(result.map((c) => c.file.path).sort()).toEqual([
			'Chapter A1.md',
			'Chapter A2.md',
		]);
	});

	it('excludes orphan chapters (empty dbench-project-id)', () => {
		seed(app, 'Orphan Chapter.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chap-001-aaa-001',
			'dbench-project-id': '',
		});
		expect(findChaptersInProject(app, 'proj-001-aaa-001')).toEqual([]);
	});

	it('returns empty array for empty project ID', () => {
		seed(app, 'Chapter.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chap-001-aaa-001',
			'dbench-project-id': '',
		});
		expect(findChaptersInProject(app, '')).toEqual([]);
	});
});

describe('findScenesInChapter', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns only scenes whose dbench-chapter-id matches', () => {
		seed(app, 'Scene A1.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-chapter-id': 'chap-001-aaa-001',
		});
		seed(app, 'Scene A2.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-002-aaa-002',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-chapter-id': 'chap-001-aaa-001',
		});
		seed(app, 'Scene B1.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-003-bbb-003',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-chapter-id': 'chap-002-bbb-002',
		});

		const result = findScenesInChapter(app, 'chap-001-aaa-001');
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.file.path).sort()).toEqual([
			'Scene A1.md',
			'Scene A2.md',
		]);
	});

	it('excludes chapter-less scenes (no dbench-chapter-id at all)', () => {
		seed(app, 'Flat Scene.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		expect(findScenesInChapter(app, 'chap-001-aaa-001')).toEqual([]);
	});

	it('returns empty array for empty chapter ID', () => {
		seed(app, 'Scene.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-aaa-001',
			'dbench-chapter-id': '',
		});
		expect(findScenesInChapter(app, '')).toEqual([]);
	});
});

describe('findSubScenes', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns empty array on empty vault', () => {
		expect(findSubScenes(app)).toEqual([]);
	});

	it('returns sub-scene notes only', () => {
		seed(app, 'Project.md', {
			'dbench-type': 'project',
			'dbench-id': 'proj-001-aaa-001',
		});
		seed(app, 'The auction.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-bbb-001',
		});
		const subSceneFile = seed(app, 'Lot 47.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-ccc-001',
		});
		seed(app, 'Lot 47 - Draft 1.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-ddd-001',
		});

		const result = findSubScenes(app);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe(subSceneFile);
	});

	it('returns multiple sub-scenes in iteration order', () => {
		seed(app, 'Lot 47.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
		});
		seed(app, 'The bidding war.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-002-aaa-002',
		});
		seed(app, 'The walk-out.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-003-aaa-003',
		});
		expect(findSubScenes(app)).toHaveLength(3);
	});
});

describe('findSubScenesInProject', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns only sub-scenes whose dbench-project-id matches', () => {
		seed(app, 'Lot 47.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': 'scen-001-aaa-001',
		});
		seed(app, 'The bidding war.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-002-aaa-002',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': 'scen-001-aaa-001',
		});
		seed(app, 'Other sub-scene.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-003-bbb-003',
			'dbench-project-id': 'proj-002-bbb-002',
			'dbench-scene-id': 'scen-002-bbb-002',
		});

		const result = findSubScenesInProject(app, 'proj-001-aaa-001');
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.file.path).sort()).toEqual([
			'Lot 47.md',
			'The bidding war.md',
		]);
	});

	it('flattens across multiple parent scenes within the same project', () => {
		// Sub-scenes belonging to two different parent scenes in the same
		// project should both be returned by findSubScenesInProject.
		seed(app, 'Lot 47.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': 'scen-auction-001',
		});
		seed(app, 'Hotel arrival.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-002-aaa-002',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': 'scen-reception-002',
		});

		const result = findSubScenesInProject(app, 'proj-001-aaa-001');
		expect(result).toHaveLength(2);
	});

	it('excludes orphan sub-scenes (empty dbench-project-id)', () => {
		seed(app, 'Orphan.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
			'dbench-project-id': '',
			'dbench-scene-id': '',
		});
		expect(findSubScenesInProject(app, 'proj-001-aaa-001')).toEqual([]);
	});

	it('returns empty array for empty project ID', () => {
		seed(app, 'Sub.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
			'dbench-project-id': '',
		});
		expect(findSubScenesInProject(app, '')).toEqual([]);
	});
});

describe('findSubScenesInScene', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns only sub-scenes whose dbench-scene-id matches', () => {
		seed(app, 'Lot 47.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': 'scen-auction-001',
		});
		seed(app, 'The bidding war.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-002-aaa-002',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': 'scen-auction-001',
		});
		seed(app, 'Hotel arrival.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-003-bbb-003',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': 'scen-reception-002',
		});

		const result = findSubScenesInScene(app, 'scen-auction-001');
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.file.path).sort()).toEqual([
			'Lot 47.md',
			'The bidding war.md',
		]);
	});

	it('excludes orphan sub-scenes (empty dbench-scene-id)', () => {
		seed(app, 'Orphan.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': '',
		});
		expect(findSubScenesInScene(app, 'scen-001-aaa-001')).toEqual([]);
	});

	it('returns empty array for empty scene ID', () => {
		seed(app, 'Sub.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
			'dbench-scene-id': '',
		});
		expect(findSubScenesInScene(app, '')).toEqual([]);
	});

	it('does not match scenes (only sub-scenes)', () => {
		// A scene with the same dbench-scene-id as a sub-scene's parent ref
		// should NOT be returned — sub-scenes only.
		seed(app, 'A scene.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-auction-001',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		seed(app, 'Lot 47.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
			'dbench-scene-id': 'scen-auction-001',
		});

		const result = findSubScenesInScene(app, 'scen-auction-001');
		expect(result).toHaveLength(1);
		expect(result[0].file.path).toBe('Lot 47.md');
	});
});

describe('findDraftsOfScene', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns drafts whose dbench-scene-id matches', () => {
		seed(app, 'Draft 1.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-ccc-001',
			'dbench-scene-id': 'scen-001-bbb-001',
		});
		seed(app, 'Draft 2.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-002-ccc-002',
			'dbench-scene-id': 'scen-001-bbb-001',
		});
		seed(app, 'Draft Other.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-003-ccc-003',
			'dbench-scene-id': 'scen-002-bbb-002',
		});

		const result = findDraftsOfScene(app, 'scen-001-bbb-001');
		expect(result).toHaveLength(2);
	});

	it('excludes drafts of single-scene projects (empty scene ID)', () => {
		seed(app, 'Draft.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-ccc-001',
			'dbench-scene-id': '',
		});
		expect(findDraftsOfScene(app, 'scen-001-bbb-001')).toEqual([]);
	});
});

describe('findDraftsOfChapter', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns only chapter drafts whose dbench-chapter-id matches', () => {
		seed(app, 'Chapter 1 - Draft 1.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-aaa-001',
			'dbench-chapter-id': 'chap-001-aaa-001',
			'dbench-draft-number': 1,
		});
		seed(app, 'Chapter 1 - Draft 2.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-002-aaa-002',
			'dbench-chapter-id': 'chap-001-aaa-001',
			'dbench-draft-number': 2,
		});
		seed(app, 'Chapter 2 - Draft 1.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-003-bbb-003',
			'dbench-chapter-id': 'chap-002-bbb-002',
			'dbench-draft-number': 1,
		});

		const result = findDraftsOfChapter(app, 'chap-001-aaa-001');
		expect(result).toHaveLength(2);
		expect(result.map((d) => d.file.path).sort()).toEqual([
			'Chapter 1 - Draft 1.md',
			'Chapter 1 - Draft 2.md',
		]);
	});

	it('excludes scene drafts (drafts with dbench-scene-id, no dbench-chapter-id)', () => {
		seed(app, 'Scene Draft.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-aaa-001',
			'dbench-scene-id': 'scen-001-aaa-001',
		});
		expect(findDraftsOfChapter(app, 'chap-001-aaa-001')).toEqual([]);
	});

	it('returns empty array for empty chapter ID', () => {
		seed(app, 'Chapter Draft.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-aaa-001',
			'dbench-chapter-id': '',
		});
		expect(findDraftsOfChapter(app, '')).toEqual([]);
	});
});

describe('findDraftsOfProject', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns drafts attached to the given project id (via dbench-project-id)', () => {
		seed(app, 'Single Draft 1.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-001-ccc-001',
			'dbench-project-id': 'proj-fla-001-001',
			'dbench-scene-id': '',
		});
		seed(app, 'Other Draft.md', {
			'dbench-type': 'draft',
			'dbench-id': 'draf-002-ccc-002',
			'dbench-project-id': 'proj-otr-002-002',
			'dbench-scene-id': '',
		});

		const result = findDraftsOfProject(app, 'proj-fla-001-001');
		expect(result).toHaveLength(1);
	});
});

describe('findNoteById', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns the matching note by dbench-id', () => {
		const target = seed(app, 'Match.md', {
			'dbench-type': 'project',
			'dbench-id': 'find-001-this-001',
		});
		seed(app, 'Other.md', {
			'dbench-type': 'project',
			'dbench-id': 'skip-002-this-002',
		});

		const result = findNoteById(app, 'find-001-this-001');
		expect(result).not.toBeNull();
		expect(result?.file).toBe(target);
		expect(result?.frontmatter['dbench-id']).toBe('find-001-this-001');
	});

	it('matches across all dbench-types', () => {
		const draft = seed(app, 'Draft.md', {
			'dbench-type': 'draft',
			'dbench-id': 'find-001-draft-001',
		});
		const result = findNoteById(app, 'find-001-draft-001');
		expect(result?.file).toBe(draft);
	});

	it('returns null when no note matches', () => {
		seed(app, 'Note.md', {
			'dbench-type': 'project',
			'dbench-id': 'real-001-aaa-001',
		});
		expect(findNoteById(app, 'fake-999-zzz-999')).toBeNull();
	});

	it('returns null for empty id', () => {
		seed(app, 'Note.md', {
			'dbench-type': 'project',
			'dbench-id': '',
		});
		expect(findNoteById(app, '')).toBeNull();
	});
});

describe('mixed-vault scenarios', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('coexists with non-Draft Bench notes', () => {
		seed(app, 'Daily 2026-04-20.md', { tags: ['daily'], created: '2026-04-20' });
		seed(app, 'Project.md', {
			'dbench-type': 'project',
			'dbench-id': 'proj-001-aaa-001',
		});
		seed(app, 'Scene.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-bbb-001',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		seed(app, 'Reading List.md', { tags: ['references'] });

		expect(findProjects(app)).toHaveLength(1);
		expect(findScenes(app)).toHaveLength(1);
		expect(findDrafts(app)).toHaveLength(0);
		expect(findScenesInProject(app, 'proj-001-aaa-001')).toHaveLength(1);
	});

	it('finds notes regardless of folder location (D-04 invariant)', () => {
		// Scenes scattered across different folders all belong to the same project
		// based on dbench-project-id, not folder path.
		seed(app, 'Writing/Drafted/Scene 1.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-001-aaa-001',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		seed(app, 'Writing/Revising/Scene 2.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-002-aaa-002',
			'dbench-project-id': 'proj-001-aaa-001',
		});
		seed(app, 'Archive/2025/Scene 3.md', {
			'dbench-type': 'scene',
			'dbench-id': 'scen-003-aaa-003',
			'dbench-project-id': 'proj-001-aaa-001',
		});

		expect(findScenesInProject(app, 'proj-001-aaa-001')).toHaveLength(3);
	});
});
