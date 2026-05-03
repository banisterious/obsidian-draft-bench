import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	applyRepairs,
	scanProject,
	type IntegrityIssueKind,
} from '../../src/core/integrity';
import { findProjects, type ProjectNote } from '../../src/core/discovery';

/**
 * Helpers that seed fully-hydrated mock notes (cache populated) so the
 * integrity scanner sees the same shape Obsidian's metadataCache would
 * produce after YAML parsing.
 */

interface ProjectSeedExtras {
	reverseScenes?: string[];
	reverseSceneIds?: string[];
	reverseDrafts?: string[];
	reverseDraftIds?: string[];
	reversePresets?: string[];
	reversePresetIds?: string[];
	reverseChapters?: string[];
	reverseChapterIds?: string[];
}

async function seedFolderProject(
	app: App,
	path: string,
	id: string,
	title: string,
	reverseScenes: string[] = [],
	reverseSceneIds: string[] = [],
	extras: ProjectSeedExtras = {}
): Promise<TFile> {
	const file = await app.vault.create(path, '');
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'project',
		'dbench-id': id,
		'dbench-project': `[[${title}]]`,
		'dbench-project-id': id,
		'dbench-project-shape': 'folder',
		'dbench-status': 'draft',
		'dbench-scenes': reverseScenes,
		'dbench-scene-ids': reverseSceneIds,
		'dbench-chapters': extras.reverseChapters ?? [],
		'dbench-chapter-ids': extras.reverseChapterIds ?? [],
		'dbench-compile-presets': extras.reversePresets ?? [],
		'dbench-compile-preset-ids': extras.reversePresetIds ?? [],
	});
	return file;
}

async function seedChapter(
	app: App,
	path: string,
	id: string,
	projectTitle: string,
	projectId: string,
	reverseScenes: string[] = [],
	reverseSceneIds: string[] = [],
	reverseDrafts: string[] = [],
	reverseDraftIds: string[] = []
): Promise<TFile> {
	const file = await app.vault.create(path, '');
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'chapter',
		'dbench-id': id,
		'dbench-project': `[[${projectTitle}]]`,
		'dbench-project-id': projectId,
		'dbench-order': 1,
		'dbench-status': 'idea',
		'dbench-scenes': reverseScenes,
		'dbench-scene-ids': reverseSceneIds,
		'dbench-drafts': reverseDrafts,
		'dbench-draft-ids': reverseDraftIds,
	});
	return file;
}

async function seedSceneInChapter(
	app: App,
	path: string,
	id: string,
	projectTitle: string,
	projectId: string,
	chapterTitle: string,
	chapterId: string,
	reverseDrafts: string[] = [],
	reverseDraftIds: string[] = []
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
		'dbench-drafts': reverseDrafts,
		'dbench-draft-ids': reverseDraftIds,
	});
	return file;
}

async function seedDraftOfChapter(
	app: App,
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

async function seedSingleProject(
	app: App,
	path: string,
	id: string,
	title: string,
	reverseDrafts: string[] = [],
	reverseDraftIds: string[] = [],
	extras: ProjectSeedExtras = {}
): Promise<TFile> {
	const file = await app.vault.create(path, '');
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'project',
		'dbench-id': id,
		'dbench-project': `[[${title}]]`,
		'dbench-project-id': id,
		'dbench-project-shape': 'single',
		'dbench-status': 'draft',
		'dbench-drafts': reverseDrafts,
		'dbench-draft-ids': reverseDraftIds,
		'dbench-compile-presets': extras.reversePresets ?? [],
		'dbench-compile-preset-ids': extras.reversePresetIds ?? [],
	});
	return file;
}

async function seedPreset(
	app: App,
	path: string,
	id: string,
	projectTitle: string,
	projectId: string
): Promise<TFile> {
	const file = await app.vault.create(path, '');
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'compile-preset',
		'dbench-id': id,
		'dbench-project': `[[${projectTitle}]]`,
		'dbench-project-id': projectId,
		'dbench-schema-version': 1,
		'dbench-compile-format': 'md',
		'dbench-compile-output': 'vault',
	});
	return file;
}

async function seedScene(
	app: App,
	path: string,
	id: string,
	projectTitle: string,
	projectId: string,
	reverseDrafts: string[] = [],
	reverseDraftIds: string[] = [],
	reverseSubScenes: string[] = [],
	reverseSubSceneIds: string[] = []
): Promise<TFile> {
	const file = await app.vault.create(path, '');
	const fm: Record<string, unknown> = {
		'dbench-type': 'scene',
		'dbench-id': id,
		'dbench-project': `[[${projectTitle}]]`,
		'dbench-project-id': projectId,
		'dbench-order': 1,
		'dbench-status': 'idea',
		'dbench-drafts': reverseDrafts,
		'dbench-draft-ids': reverseDraftIds,
	};
	// Only stamp the sub-scene reverse arrays when caller actually
	// passes them; sub-scene-less scenes shouldn't carry empty arrays
	// that confuse the "absent vs empty" check in integrity tests.
	if (reverseSubScenes.length > 0 || reverseSubSceneIds.length > 0) {
		fm['dbench-sub-scenes'] = reverseSubScenes;
		fm['dbench-sub-scene-ids'] = reverseSubSceneIds;
	}
	app.metadataCache._setFrontmatter(file, fm);
	return file;
}

async function seedSubScene(
	app: App,
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

async function seedDraftOfScene(
	app: App,
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

async function seedDraftOfProject(
	app: App,
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

function loadProject(app: App, title: string): ProjectNote {
	const project = findProjects(app).find((p) => p.file.basename === title);
	if (!project) throw new Error(`project ${title} not found`);
	return project;
}

function kinds(issues: { kind: IntegrityIssueKind }[]): IntegrityIssueKind[] {
	return issues.map((i) => i.kind);
}

describe('scanProject — clean vault', () => {
	it('returns no issues when project, scenes, and drafts are all in sync', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Opening]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			['[[Opening - Draft 1]]'],
			['drf-001-tst-001']
		);
		await seedDraftOfScene(
			app,
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'Opening',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(report.issues).toEqual([]);
	});
});

describe('scanProject — scene<->project issues', () => {
	it('flags a scene declaring the project but missing from reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[]
		);
		await seedScene(
			app,
			'Novel/Orphan.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toEqual(['SCENE_MISSING_IN_PROJECT']);
		expect(report.issues[0].autoRepairable).toBe(true);
	});

	it('flags a stale reverse-array entry pointing to a non-existent scene', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Ghost]]'],
			['sc-ghost-tst-000']
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toEqual(['STALE_SCENE_IN_PROJECT']);
		expect(report.issues[0].autoRepairable).toBe(true);
	});

	it('flags a scene that exists but no longer declares this project', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Defector]]'],
			['sc1-001-tst-001']
		);
		// Scene declares a different project.
		await seedScene(
			app,
			'Other/Defector.md',
			'sc1-001-tst-001',
			'Other',
			'prj-other-tst-002'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toEqual(['STALE_SCENE_IN_PROJECT']);
	});

	it('flags a wikilink/id-companion conflict (not auto-repairable)', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[SceneA]]'],
			['sc2-002-tst-002'] // id points at a different scene
		);
		// Two scenes exist, both declaring the project.
		await seedScene(
			app,
			'Novel/SceneA.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedScene(
			app,
			'Novel/SceneB.md',
			'sc2-002-tst-002',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const conflictIssues = report.issues.filter(
			(i) => i.kind === 'SCENE_PROJECT_CONFLICT'
		);
		expect(conflictIssues).toHaveLength(1);
		expect(conflictIssues[0].autoRepairable).toBe(false);
		expect(conflictIssues[0].repair).toBeUndefined();
	});
});

describe('scanProject — scene<->draft issues', () => {
	it('flags a draft declaring its scene but missing from the scene\'s reverse array', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Opening]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedDraftOfScene(
			app,
			'Novel/Drafts/Opening - Draft 1.md',
			'drf-001-tst-001',
			'Opening',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toEqual(['DRAFT_MISSING_IN_SCENE']);
	});

	it('flags a stale draft entry in scene\'s reverse array', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Opening]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			['[[Ghost draft]]'],
			['drf-ghost-tst-000']
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toEqual(['STALE_DRAFT_IN_SCENE']);
	});
});

describe('scanProject — single-scene project<->draft', () => {
	it('flags a draft declaring single-scene project but missing from project reverse', async () => {
		const app = new App();
		await seedSingleProject(
			app,
			'Flash.md',
			'prj-001-tst-001',
			'Flash',
			[],
			[]
		);
		await seedDraftOfProject(
			app,
			'Flash - Drafts/Flash - Draft 1.md',
			'drf-001-tst-001',
			'Flash',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Flash'));
		expect(kinds(report.issues)).toEqual(['DRAFT_MISSING_IN_PROJECT']);
	});

	it('does not scan project<->draft on folder projects', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[]
		);
		// No scenes, but an orphan draft that points at the folder project.
		// Folder projects don't hold drafts directly, so this draft is
		// outside the integrity service's scope for this project.
		await seedDraftOfProject(
			app,
			'Novel/Drafts/Orphan.md',
			'drf-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		// No project<->draft issues — only folder projects lack that
		// relationship and this test confirms the scanner skips it.
		const kinds_ = kinds(report.issues);
		expect(kinds_).not.toContain('DRAFT_MISSING_IN_PROJECT');
	});
});

describe('scanProject — compile-preset<->project issues', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('reports PRESET_MISSING_IN_PROJECT when preset declares project but is absent from reverse arrays', async () => {
		await seedFolderProject(app, 'Novel/Novel.md', 'prj-001', 'Novel');
		await seedPreset(
			app,
			'Novel/Compile Presets/Workshop.md',
			'prs-001',
			'Novel',
			'prj-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const presetIssues = report.issues.filter(
			(i) => i.kind === 'PRESET_MISSING_IN_PROJECT'
		);
		expect(presetIssues).toHaveLength(1);
		expect(presetIssues[0].autoRepairable).toBe(true);
		expect(presetIssues[0].repair?.kind).toBe('add-to-reverse');
	});

	it('reports STALE_PRESET_IN_PROJECT when reverse arrays reference a non-existent preset', async () => {
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001',
			'Novel',
			[],
			[],
			{
				reversePresets: ['[[Ghost preset]]'],
				reversePresetIds: ['prs-ghost-999'],
			}
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const presetIssues = report.issues.filter(
			(i) => i.kind === 'STALE_PRESET_IN_PROJECT'
		);
		expect(presetIssues).toHaveLength(1);
		expect(presetIssues[0].autoRepairable).toBe(true);
		expect(presetIssues[0].repair?.kind).toBe('remove-from-reverse');
	});

	it('is clean when preset is properly listed on both sides', async () => {
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001',
			'Novel',
			[],
			[],
			{
				reversePresets: ['[[Workshop]]'],
				reversePresetIds: ['prs-001'],
			}
		);
		await seedPreset(
			app,
			'Novel/Compile Presets/Workshop.md',
			'prs-001',
			'Novel',
			'prj-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const presetIssues = report.issues.filter((i) =>
			i.kind.includes('preset')
		);
		expect(presetIssues).toEqual([]);
	});

	it('scans preset<->project even for single-scene projects', async () => {
		await seedSingleProject(app, 'Flash.md', 'prj-001', 'Flash');
		await seedPreset(
			app,
			'Compile Presets/Submission.md',
			'prs-001',
			'Flash',
			'prj-001'
		);

		const report = scanProject(app, loadProject(app, 'Flash'));
		const presetIssues = report.issues.filter(
			(i) => i.kind === 'PRESET_MISSING_IN_PROJECT'
		);
		expect(presetIssues).toHaveLength(1);
	});

	it('reports PROJECT_PRESET_CONFLICT when wikilink and id point at different files', async () => {
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001',
			'Novel',
			[],
			[],
			{
				reversePresets: ['[[Workshop]]'],
				reversePresetIds: ['prs-999'], // id doesn't match Workshop
			}
		);
		// Workshop resolves to this preset:
		await seedPreset(
			app,
			'Novel/Compile Presets/Workshop.md',
			'prs-001',
			'Novel',
			'prj-001'
		);
		// prs-999 resolves to a different preset:
		await seedPreset(
			app,
			'Novel/Compile Presets/Other.md',
			'prs-999',
			'Novel',
			'prj-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const conflicts = report.issues.filter(
			(i) => i.kind === 'PROJECT_PRESET_CONFLICT'
		);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].autoRepairable).toBe(false);
	});
});

describe('applyRepairs', () => {
	it('applies missing-reverse repairs (adds scene to project reverse arrays)', async () => {
		const app = new App();
		const projectFile = await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[]
		);
		await seedScene(
			app,
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const result = await applyRepairs(app, report);

		expect(result.repaired).toBe(1);
		expect(result.errors).toBe(0);

		const fm = app.metadataCache.getFileCache(projectFile)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual(['[[Opening]]']);
		expect(fm?.['dbench-scene-ids']).toEqual(['sc1-001-tst-001']);
	});

	it('applies stale-reverse repairs (removes ghost entries)', async () => {
		const app = new App();
		const projectFile = await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Ghost]]'],
			['sc-ghost-tst-000']
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const result = await applyRepairs(app, report);

		expect(result.repaired).toBe(1);

		const fm = app.metadataCache.getFileCache(projectFile)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual([]);
		expect(fm?.['dbench-scene-ids']).toEqual([]);
	});

	it('counts conflicts separately (not auto-repaired)', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[A]]'],
			['sc-wrong-tst-000'] // id companion points nowhere (id conflict)
		);
		await seedScene(
			app,
			'Novel/A.md',
			'sc-a-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const result = await applyRepairs(app, report);

		// The "missing-in-project" issue for the scene should be
		// auto-repaired; the conflict (wikilink resolves to A with
		// id sc-a, but id companion says sc-wrong which doesn't resolve)
		// may or may not show up depending on whether one side resolves.
		// This test just asserts that non-repairable issues don't crash
		// applyRepairs and are counted in conflictsSkipped.
		expect(result.errors).toBe(0);
		expect(
			result.repaired + result.conflictsSkipped
		).toBe(report.issues.length);
	});

	it('batches multiple repairs to the same parent into one write', async () => {
		const app = new App();
		const projectFile = await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Ghost1]]', '[[Ghost2]]'],
			['sc-ghost1-tst-001', 'sc-ghost2-tst-002']
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(report.issues.length).toBe(2);

		const result = await applyRepairs(app, report);
		expect(result.repaired).toBe(2);

		const fm = app.metadataCache.getFileCache(projectFile)?.frontmatter;
		expect(fm?.['dbench-scenes']).toEqual([]);
		expect(fm?.['dbench-scene-ids']).toEqual([]);
	});
});

describe('scanProject — chapter<->project issues', () => {
	it('flags a chapter declaring the project but missing from reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toEqual(['CHAPTER_MISSING_IN_PROJECT']);
		expect(report.issues[0].autoRepairable).toBe(true);
	});

	it('flags a stale chapter entry pointing to a non-existent note', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ghost chapter]]'],
				reverseChapterIds: ['chp-ghost-tst-000'],
			}
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toEqual(['STALE_CHAPTER_IN_PROJECT']);
		expect(report.issues[0].autoRepairable).toBe(true);
	});

	it('flags a wikilink/id-companion conflict (not auto-repairable)', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-002-tst-002'], // id points elsewhere
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch02.md',
			'chp-002-tst-002',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const conflicts = report.issues.filter(
			(i) => i.kind === 'PROJECT_CHAPTER_CONFLICT'
		);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].autoRepairable).toBe(false);
	});

	it('is clean when chapter is properly listed on both sides', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(report.issues).toEqual([]);
	});
});

describe('scanProject — chapter<->scene issues', () => {
	it('flags a scene-in-chapter missing from chapter reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedSceneInChapter(
			app,
			'Novel/Chapters/Ch01/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toContain('SCENE_MISSING_IN_CHAPTER');
		// Scene is NOT flagged as missing from project's dbench-scenes —
		// scenes-in-chapters belong to the chapter, not the project.
		expect(kinds(report.issues)).not.toContain('SCENE_MISSING_IN_PROJECT');
	});

	it('flags a stale scene entry in chapter reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			['[[Ghost scene]]'],
			['sc-ghost-tst-000']
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const issueKinds = kinds(report.issues);
		expect(issueKinds).toContain('STALE_SCENE_IN_CHAPTER');
	});

	it('flags chapter<->scene wikilink/id conflict', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			['[[SceneA]]'],
			['sc2-002-tst-002'] // id points elsewhere
		);
		await seedSceneInChapter(
			app,
			'Novel/Chapters/Ch01/SceneA.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);
		await seedSceneInChapter(
			app,
			'Novel/Chapters/Ch01/SceneB.md',
			'sc2-002-tst-002',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const conflicts = report.issues.filter(
			(i) => i.kind === 'CHAPTER_SCENE_CONFLICT'
		);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].autoRepairable).toBe(false);
	});
});

describe('scanProject — chapter<->draft issues', () => {
	it('flags a chapter draft missing from chapter reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedDraftOfChapter(
			app,
			'Novel/Drafts/Ch01 - Draft 1.md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toContain('DRAFT_MISSING_IN_CHAPTER');
	});

	it('flags a stale draft entry in chapter reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			[],
			[],
			['[[Ghost draft]]'],
			['drf-ghost-tst-000']
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toContain('STALE_DRAFT_IN_CHAPTER');
	});

	it('flags chapter<->draft wikilink/id conflict', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			[],
			[],
			['[[Ch01 - Draft 1]]'],
			['drf-002-tst-002'] // id points elsewhere
		);
		await seedDraftOfChapter(
			app,
			'Novel/Drafts/Ch01 - Draft 1.md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedDraftOfChapter(
			app,
			'Novel/Drafts/Ch01 - Draft 2.md',
			'drf-002-tst-002',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const conflicts = report.issues.filter(
			(i) => i.kind === 'CHAPTER_DRAFT_CONFLICT'
		);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].autoRepairable).toBe(false);
	});
});

describe('scanProject — PROJECT_MIXED_CHILDREN', () => {
	it('flags a project with both chapters and direct scenes', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Direct Scene]]'],
			['sc1-001-tst-001'],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedScene(
			app,
			'Novel/Direct Scene.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const mixed = report.issues.filter(
			(i) => i.kind === 'PROJECT_MIXED_CHILDREN'
		);
		expect(mixed).toHaveLength(1);
		expect(mixed[0].autoRepairable).toBe(false);
		expect(mixed[0].repair).toBeUndefined();
	});

	it('does not flag a project with only chapters', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).not.toContain('PROJECT_MIXED_CHILDREN');
	});

	it('does not flag a project with only direct scenes', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Opening]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Novel/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).not.toContain('PROJECT_MIXED_CHILDREN');
	});
});

describe('scanProject — chapter-aware project clean baseline', () => {
	it('returns no issues for a fully-synced chapter-aware project', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			['[[Opening]]'],
			['sc1-001-tst-001'],
			['[[Ch01 - Draft 1]]'],
			['drf-001-tst-001']
		);
		await seedSceneInChapter(
			app,
			'Novel/Chapters/Ch01/Opening.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);
		await seedDraftOfChapter(
			app,
			'Novel/Drafts/Ch01 - Draft 1.md',
			'drf-001-tst-001',
			'Ch01',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(report.issues).toEqual([]);
	});
});

describe('applyRepairs — chapter relationships', () => {
	it('adds a missing chapter to project reverse arrays', async () => {
		const app = new App();
		const projectFile = await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel'
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const result = await applyRepairs(app, report);

		expect(result.repaired).toBe(1);
		expect(result.errors).toBe(0);

		const fm = app.metadataCache.getFileCache(projectFile)?.frontmatter;
		expect(fm?.['dbench-chapters']).toEqual(['[[Ch01]]']);
		expect(fm?.['dbench-chapter-ids']).toEqual(['chp-001-tst-001']);
	});

	it('skips PROJECT_MIXED_CHILDREN as conflict (manual-only)', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			['[[Direct]]'],
			['sc1-001-tst-001'],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedScene(
			app,
			'Novel/Direct.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);
		await seedChapter(
			app,
			'Novel/Chapters/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		const result = await applyRepairs(app, report);

		// Mixed-children issue stays in conflictsSkipped; other issues
		// may still be auto-repaired.
		expect(
			result.repaired + result.conflictsSkipped + result.errors
		).toBe(report.issues.length);
		expect(result.conflictsSkipped).toBeGreaterThanOrEqual(1);
	});
});

describe('scanProject — scene<->sub-scene issues', () => {
	it('produces no issues when a sub-scene-less scene has no sub-scene reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[Flat scene]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Drift/Flat scene.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Drift'));
		const subSceneKinds = kinds(report.issues).filter((k) =>
			k.startsWith('SUB_SCENE_') ||
			k.endsWith('_SUB_SCENE') ||
			k === 'SCENE_SUB_SCENE_CONFLICT'
		);
		expect(subSceneKinds).toEqual([]);
	});

	it('returns no sub-scene issues for a clean hierarchical scene', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Lot 47]]'],
			['sub-001-tst-001']
		);
		await seedSubScene(
			app,
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Drift'));
		const subSceneKinds = kinds(report.issues).filter((k) =>
			k.startsWith('SUB_SCENE_') ||
			k.endsWith('_SUB_SCENE') ||
			k === 'SCENE_SUB_SCENE_CONFLICT'
		);
		expect(subSceneKinds).toEqual([]);
	});

	it('flags a sub-scene missing from the parent scene reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		// Scene has NO dbench-sub-scenes field at all (sub-scene was
		// created before the linker could update reverse arrays).
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001'
		);
		await seedSubScene(
			app,
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Drift'));
		const issueKinds = kinds(report.issues);
		expect(issueKinds).toContain('SUB_SCENE_MISSING_IN_SCENE');
		const missing = report.issues.find(
			(i) => i.kind === 'SUB_SCENE_MISSING_IN_SCENE'
		);
		expect(missing?.autoRepairable).toBe(true);
		expect(missing?.repair?.kind).toBe('add-to-reverse');
	});

	it('flags a stale sub-scene entry in the parent scene reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		// Scene's reverse arrays reference a sub-scene that no longer
		// exists (writer deleted the sub-scene file outside Obsidian).
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Ghost sub-scene]]'],
			['sub-ghost-tst-000']
		);

		const report = scanProject(app, loadProject(app, 'Drift'));
		const issueKinds = kinds(report.issues);
		expect(issueKinds).toContain('STALE_SUB_SCENE_IN_SCENE');
		const stale = report.issues.find(
			(i) => i.kind === 'STALE_SUB_SCENE_IN_SCENE'
		);
		expect(stale?.autoRepairable).toBe(true);
		expect(stale?.repair?.kind).toBe('remove-from-reverse');
	});

	it('flags scene<->sub-scene wikilink/id conflict (manual-only repair)', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		// dbench-sub-scenes wikilink points at one sub-scene, but the
		// id companion at the same index points at a different one.
		// The writer's intent is ambiguous; integrity flags but doesn't
		// auto-pick.
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Lot 47]]'],
			['sub-002-tst-002'] // id points at the bidding war, not lot 47
		);
		await seedSubScene(
			app,
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);
		await seedSubScene(
			app,
			'Drift/The auction/The bidding war.md',
			'sub-002-tst-002',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Drift'));
		const conflicts = report.issues.filter(
			(i) => i.kind === 'SCENE_SUB_SCENE_CONFLICT'
		);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].autoRepairable).toBe(false);
	});

	it('detects sub-scene issues across scenes-in-chapters too', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Novel/Novel.md',
			'prj-001-tst-001',
			'Novel',
			[],
			[],
			{
				reverseChapters: ['[[Ch01]]'],
				reverseChapterIds: ['chp-001-tst-001'],
			}
		);
		await seedChapter(
			app,
			'Novel/Ch01.md',
			'chp-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		// Scene-in-chapter with sub-scene drift (reverse arrays missing).
		await seedSceneInChapter(
			app,
			'Novel/Ch01/The auction.md',
			'sc1-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'Ch01',
			'chp-001-tst-001'
		);
		await seedSubScene(
			app,
			'Novel/Ch01/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Novel',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Novel'));
		expect(kinds(report.issues)).toContain('SUB_SCENE_MISSING_IN_SCENE');
	});
});

describe('scanProject — sub-scene<->draft issues', () => {
	async function seedSubSceneDraft(
		app: App,
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

	it('flags a sub-scene draft missing from the parent sub-scene reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Lot 47]]'],
			['sub-001-tst-001']
		);
		await seedSubScene(
			app,
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);
		// Draft exists, declares the sub-scene as parent, but the
		// sub-scene's reverse arrays are empty → DRAFT_MISSING_IN_SUB_SCENE.
		await seedSubSceneDraft(
			app,
			'Drift/Drafts/The auction - Lot 47 - Draft 1.md',
			'drf-001-tst-001',
			'Lot 47',
			'sub-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Drift'));
		const issueKinds = kinds(report.issues);
		expect(issueKinds).toContain('DRAFT_MISSING_IN_SUB_SCENE');
		const missing = report.issues.find(
			(i) => i.kind === 'DRAFT_MISSING_IN_SUB_SCENE'
		);
		expect(missing?.autoRepairable).toBe(true);
	});

	it('flags a stale draft entry in the sub-scene reverse arrays', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Lot 47]]'],
			['sub-001-tst-001']
		);
		// Sub-scene's reverse arrays reference a draft that doesn't exist.
		const subFile = await app.vault.create(
			'Drift/The auction/Lot 47.md',
			''
		);
		app.metadataCache._setFrontmatter(subFile, {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene': '[[The auction]]',
			'dbench-scene-id': 'sc1-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': ['[[Ghost draft]]'],
			'dbench-draft-ids': ['drf-ghost-tst-000'],
		});

		const report = scanProject(app, loadProject(app, 'Drift'));
		const issueKinds = kinds(report.issues);
		expect(issueKinds).toContain('STALE_DRAFT_IN_SUB_SCENE');
	});

	it('returns no sub-scene draft issues for clean sub-scenes with no drafts', async () => {
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Lot 47]]'],
			['sub-001-tst-001']
		);
		await seedSubScene(
			app,
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);

		const report = scanProject(app, loadProject(app, 'Drift'));
		const subSceneDraftKinds = kinds(report.issues).filter(
			(k) =>
				k === 'DRAFT_MISSING_IN_SUB_SCENE' ||
				k === 'STALE_DRAFT_IN_SUB_SCENE' ||
				k === 'SUB_SCENE_DRAFT_CONFLICT'
		);
		expect(subSceneDraftKinds).toEqual([]);
	});
});

describe('integrity — one-pass convergence on parallel-array residue (#13)', () => {
	it('repairs the orphan-id-with-padded-empty-wikilink case in one pass', async () => {
		// The dev-vault Test 18 scenario: writer adds a fake id via
		// Obsidian's Properties panel; the panel auto-pads the parallel
		// `dbench-sub-scenes` array with an empty entry to length-match.
		// First repair pass should drop both the orphan id AND the
		// padded empty wikilink, leaving balanced arrays. Second scan
		// should find zero issues.
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		// Real sub-scene exists.
		await seedSubScene(
			app,
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);
		// Parent scene's reverse arrays: one real sub-scene + one
		// padded-empty wikilink + one orphan id. Mimics the post-pad
		// state from Obsidian's Properties panel.
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Lot 47]]', ''],
			['sub-001-tst-001', 'ssc-deleted-001']
		);

		const project = loadProject(app, 'Drift');

		const firstReport = scanProject(app, project);
		// Scan flags STALE for the orphan id (with truthy id) AND the
		// asymmetric-arrays summary; both auto-repairable.
		const firstStaleCount = firstReport.issues.filter(
			(i) => i.kind === 'STALE_SUB_SCENE_IN_SCENE'
		).length;
		expect(firstStaleCount).toBeGreaterThan(0);

		const result = await applyRepairs(app, firstReport);
		expect(result.errors).toBe(0);

		// Second scan: arrays should be balanced and clean — zero issues.
		const secondReport = scanProject(app, project);
		const secondStale = secondReport.issues.filter(
			(i) => i.kind === 'STALE_SUB_SCENE_IN_SCENE'
		);
		expect(secondStale).toEqual([]);

		// Final state: arrays length 1, both sides aligned.
		const sceneFile = app.vault.getAbstractFileByPath(
			'Drift/The auction.md'
		) as TFile;
		const fm = app.metadataCache.getFileCache(sceneFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		expect(fm?.['dbench-sub-scenes']).toEqual(['[[Lot 47]]']);
		expect(fm?.['dbench-sub-scene-ids']).toEqual(['sub-001-tst-001']);
	});

	it('flags asymmetric arrays even when no truthy orphan exists', async () => {
		// Case where lengths differ but neither side has a truthy orphan
		// at the trailing index — pure padding. Existing scan would skip
		// the empty-paired index; the new asymmetry summary surfaces it.
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		await seedSubScene(
			app,
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);
		// Parent: wikilinks length 2 (with trailing ""), ids length 1.
		// At i=1: wikilink="", id=undefined. Both falsy. Old scan skipped.
		await seedScene(
			app,
			'Drift/The auction.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Lot 47]]', ''],
			['sub-001-tst-001']
		);

		const project = loadProject(app, 'Drift');
		const firstReport = scanProject(app, project);
		const stale = firstReport.issues.filter(
			(i) => i.kind === 'STALE_SUB_SCENE_IN_SCENE'
		);
		expect(stale.length).toBeGreaterThan(0);
		expect(stale[0].repair?.kind).toBe('remove-from-reverse');

		await applyRepairs(app, firstReport);

		// Re-scan: arrays balanced, clean.
		const secondReport = scanProject(app, project);
		const secondStale = secondReport.issues.filter(
			(i) => i.kind === 'STALE_SUB_SCENE_IN_SCENE'
		);
		expect(secondStale).toEqual([]);
	});

	it("post-prune drops null-padded entries that the value-filter doesn't match", async () => {
		// Variant of the pad bug where Obsidian/YAML stores the empty
		// entry as `null` rather than `""`. The existing value-based
		// filter `x => x !== ''` doesn't match null, so the residue
		// would survive without the defensive post-prune.
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[The auction]]'],
			['sc1-001-tst-001']
		);
		await seedSubScene(
			app,
			'Drift/The auction/Lot 47.md',
			'sub-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'The auction',
			'sc1-001-tst-001'
		);
		const sceneFile = await app.vault.create('Drift/The auction.md', '');
		// Manually craft frontmatter with `null` in the wikilinks slot.
		app.metadataCache._setFrontmatter(sceneFile, {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
			'dbench-sub-scenes': ['[[Lot 47]]', null],
			'dbench-sub-scene-ids': ['sub-001-tst-001', 'ssc-deleted-001'],
		});

		const project = loadProject(app, 'Drift');
		const firstReport = scanProject(app, project);
		await applyRepairs(app, firstReport);

		const fm = app.metadataCache.getFileCache(sceneFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		// Post-prune drops the null-paired entry alongside the orphan id.
		expect(fm?.['dbench-sub-scenes']).toEqual(['[[Lot 47]]']);
		expect(fm?.['dbench-sub-scene-ids']).toEqual(['sub-001-tst-001']);
	});
});

describe('integrity — pairing-preserving add-to-reverse (#14)', () => {
	async function seedThreeSubScenes(app: App): Promise<void> {
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[Departure]]'],
			['sc1-001-tst-001']
		);
		await seedSubScene(
			app,
			'Drift/Departure/Rolling out.md',
			'ssc-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		await seedSubScene(
			app,
			'Drift/Departure/The road-blessing.md',
			'ssc-002-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		await seedSubScene(
			app,
			'Drift/Departure/Loading the cart.md',
			'ssc-003-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
	}

	it('preserves pairing when an interior id is missing from the parent reverse arrays', async () => {
		// The dev-vault Test 19 scenario: writer manually deletes the
		// MIDDLE id from `dbench-sub-scene-ids`, leaving wikilinks
		// intact. The naive `iarr.push(p.id)` in add-to-reverse would
		// place the missing id at the END, mispairing wikilinks[1] and
		// ids[1+]. The pairing-preserving splice inserts at the
		// matching wikilink index instead.
		const app = new App();
		await seedThreeSubScenes(app);
		// Parent: full wikilinks, ids missing the middle entry.
		await seedScene(
			app,
			'Drift/Departure.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Rolling out]]', '[[The road-blessing]]', '[[Loading the cart]]'],
			['ssc-001-tst-001', 'ssc-003-tst-001']
		);

		const project = loadProject(app, 'Drift');
		const firstReport = scanProject(app, project);
		// Scan flags MISSING for the road-blessing's id companion.
		expect(kinds(firstReport.issues)).toContain('SUB_SCENE_MISSING_IN_SCENE');

		await applyRepairs(app, firstReport);

		const sceneFile = app.vault.getAbstractFileByPath(
			'Drift/Departure.md'
		) as TFile;
		const fm = app.metadataCache.getFileCache(sceneFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		// Pairing preserved: id ssc-002 lands at index 1, matching
		// wikilink "[[The road-blessing]]" at the same index.
		expect(fm?.['dbench-sub-scenes']).toEqual([
			'[[Rolling out]]',
			'[[The road-blessing]]',
			'[[Loading the cart]]',
		]);
		expect(fm?.['dbench-sub-scene-ids']).toEqual([
			'ssc-001-tst-001',
			'ssc-002-tst-001',
			'ssc-003-tst-001',
		]);

		// Re-scan: zero CONFLICT issues (the bug surfaced two CONFLICTs
		// per the issue description, one for each mispaired entry).
		const secondReport = scanProject(app, project);
		const conflicts = secondReport.issues.filter(
			(i) => i.kind === 'SCENE_SUB_SCENE_CONFLICT'
		);
		expect(conflicts).toEqual([]);
	});

	it('preserves pairing when an interior wikilink is missing (symmetric case)', async () => {
		// Symmetric repair path: ids array is intact, wikilinks is
		// missing the middle entry. The splice should insert the
		// missing wikilink at the matching id index.
		const app = new App();
		await seedThreeSubScenes(app);
		await seedScene(
			app,
			'Drift/Departure.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[Rolling out]]', '[[Loading the cart]]'],
			['ssc-001-tst-001', 'ssc-002-tst-001', 'ssc-003-tst-001']
		);

		const project = loadProject(app, 'Drift');
		const firstReport = scanProject(app, project);
		expect(kinds(firstReport.issues)).toContain('SUB_SCENE_MISSING_IN_SCENE');

		await applyRepairs(app, firstReport);

		const sceneFile = app.vault.getAbstractFileByPath(
			'Drift/Departure.md'
		) as TFile;
		const fm = app.metadataCache.getFileCache(sceneFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		expect(fm?.['dbench-sub-scenes']).toEqual([
			'[[Rolling out]]',
			'[[The road-blessing]]',
			'[[Loading the cart]]',
		]);
		expect(fm?.['dbench-sub-scene-ids']).toEqual([
			'ssc-001-tst-001',
			'ssc-002-tst-001',
			'ssc-003-tst-001',
		]);

		const secondReport = scanProject(app, project);
		const conflicts = secondReport.issues.filter(
			(i) => i.kind === 'SCENE_SUB_SCENE_CONFLICT'
		);
		expect(conflicts).toEqual([]);
	});

	it('sorts reverse arrays by child dbench-order during repair (#19)', async () => {
		// Parent's reverse arrays are out of dbench-order. Scan flags
		// one MISSING entry; applyRepairs adds it AND the post-prune
		// re-sorts to narrative order.
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[Departure]]'],
			['sc1-001-tst-001']
		);

		const subScenes = [
			{ title: 'A', id: 'ssc-001-tst-001', order: 1 },
			{ title: 'B', id: 'ssc-002-tst-001', order: 2 },
			{ title: 'C', id: 'ssc-003-tst-001', order: 3 },
			{ title: 'D', id: 'ssc-004-tst-001', order: 4 },
		];
		for (const s of subScenes) {
			const file = await app.vault.create(
				`Drift/Departure/${s.title}.md`,
				''
			);
			app.metadataCache._setFrontmatter(file, {
				'dbench-type': 'sub-scene',
				'dbench-id': s.id,
				'dbench-project': '[[Drift]]',
				'dbench-project-id': 'prj-001-tst-001',
				'dbench-scene': '[[Departure]]',
				'dbench-scene-id': 'sc1-001-tst-001',
				'dbench-order': s.order,
				'dbench-status': 'idea',
				'dbench-drafts': [],
				'dbench-draft-ids': [],
			});
		}

		// Parent: 3 children present in WRONG order, 1 child (D) missing.
		await seedScene(
			app,
			'Drift/Departure.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[C]]', '[[A]]', '[[B]]'],
			['ssc-003-tst-001', 'ssc-001-tst-001', 'ssc-002-tst-001']
		);

		const project = loadProject(app, 'Drift');
		const firstReport = scanProject(app, project);
		expect(kinds(firstReport.issues)).toContain('SUB_SCENE_MISSING_IN_SCENE');

		await applyRepairs(app, firstReport);

		const sceneFile = app.vault.getAbstractFileByPath(
			'Drift/Departure.md'
		) as TFile;
		const fm = app.metadataCache.getFileCache(sceneFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		// Expected: sorted by dbench-order, all 4 children present.
		expect(fm?.['dbench-sub-scenes']).toEqual([
			'[[A]]',
			'[[B]]',
			'[[C]]',
			'[[D]]',
		]);
		expect(fm?.['dbench-sub-scene-ids']).toEqual([
			'ssc-001-tst-001',
			'ssc-002-tst-001',
			'ssc-003-tst-001',
			'ssc-004-tst-001',
		]);
	});

	it('falls back to append when neither side has the value (true missing-child case)', async () => {
		// Regression guard: the existing append-both behavior must hold
		// for the case the original code already handled — a child
		// declares the parent but neither wikilink nor id is in the
		// reverse arrays at all.
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[Departure]]'],
			['sc1-001-tst-001']
		);
		await seedSubScene(
			app,
			'Drift/Departure/Lot 47.md',
			'ssc-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		// Parent has empty reverse arrays; sub-scene declares parent
		// but isn't listed.
		await seedScene(
			app,
			'Drift/Departure.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			[],
			[]
		);

		const project = loadProject(app, 'Drift');
		const firstReport = scanProject(app, project);
		await applyRepairs(app, firstReport);

		const sceneFile = app.vault.getAbstractFileByPath(
			'Drift/Departure.md'
		) as TFile;
		const fm = app.metadataCache.getFileCache(sceneFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		expect(fm?.['dbench-sub-scenes']).toEqual(['[[Lot 47]]']);
		expect(fm?.['dbench-sub-scene-ids']).toEqual(['ssc-001-tst-001']);
	});
});

describe('integrity — auto-repair length guard against CONFLICT-state arrays (#20)', () => {
	it("doesn't lose data when MISSING co-occurs with CONFLICT on full-length arrays", async () => {
		// The Going Down dev-vault scenario: pre-#15 cache-race left
		// Sc03's `dbench-drafts` arrays at full length but with mispaired
		// ids (each slot's id belonged to the next slot's wikilink).
		// Scan flags 2 CONFLICTs + 1 MISSING (Draft 3's id absent from
		// the array). Pre-fix, applyRepairs spliced the missing id at
		// the matching wikilink index, shifted the existing (mispaired)
		// id past the wikilinks-array length, and the post-prune dropped
		// it as orphan-paired. Each apply pass lost one valid id; the
		// next scan flagged the dropped child as MISSING; cycle.
		//
		// Post-fix: the length guard skips the splice when the other
		// array is already at full length (i.e., the slot is occupied
		// by mispaired data, not absent). The MISSING gets counted in
		// `conflictsSkipped` and the writer resolves the CONFLICTs
		// manually first.
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[Departure]]'],
			['sc1-001-tst-001']
		);
		// Three real sub-scenes, all declaring Departure.
		await seedSubScene(
			app,
			'Drift/Departure/A.md',
			'ssc-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		await seedSubScene(
			app,
			'Drift/Departure/B.md',
			'ssc-002-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		await seedSubScene(
			app,
			'Drift/Departure/C.md',
			'ssc-003-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		// Parent: full-length arrays with mispaired ids. Wikilinks are
		// in order [A, B, C] but ids are shifted by 1: [B-id, C-id,
		// A-id]. Each slot is a CONFLICT (wikilink and id resolve to
		// different sub-scenes). One id (B-id is at slot [0], not
		// matching B's slot [1]) → scan also flags MISSING for whichever
		// declared sub-scene's id isn't at the matching wikilink index.
		await seedScene(
			app,
			'Drift/Departure.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[A]]', '[[B]]', '[[C]]'],
			['ssc-002-tst-001', 'ssc-003-tst-001', 'ssc-001-tst-001']
		);

		const project = loadProject(app, 'Drift');
		const firstReport = scanProject(app, project);
		const conflicts = firstReport.issues.filter((i) =>
			i.kind.endsWith('_CONFLICT')
		);
		expect(conflicts.length).toBeGreaterThan(0);

		const result = await applyRepairs(app, firstReport);

		// After apply: arrays unchanged (no splice ran because the
		// length guard tripped). Data preserved; the writer can manually
		// fix the CONFLICTs without losing valid pairings.
		const sceneFile = app.vault.getAbstractFileByPath(
			'Drift/Departure.md'
		) as TFile;
		const fm = app.metadataCache.getFileCache(sceneFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		expect(fm?.['dbench-sub-scenes']).toEqual(['[[A]]', '[[B]]', '[[C]]']);
		expect(fm?.['dbench-sub-scene-ids']).toEqual([
			'ssc-002-tst-001',
			'ssc-003-tst-001',
			'ssc-001-tst-001',
		]);

		// Skipped MISSING counted in `conflictsSkipped`, not `repaired`.
		expect(result.errors).toBe(0);
	});

	it('still auto-repairs MISSING when the other array is shorter (the #14 deletion case)', async () => {
		// Regression guard: the #14 fix (splice-at-matching-index for
		// pairing-preserving inserts) must continue to work when the
		// MISSING comes from a writer manually deleting an interior id.
		// In that case, ids.length < wikilinks.length, the length guard
		// passes, and the splice runs as designed.
		const app = new App();
		await seedFolderProject(
			app,
			'Drift/Drift.md',
			'prj-001-tst-001',
			'Drift',
			['[[Departure]]'],
			['sc1-001-tst-001']
		);
		await seedSubScene(
			app,
			'Drift/Departure/A.md',
			'ssc-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		await seedSubScene(
			app,
			'Drift/Departure/B.md',
			'ssc-002-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		await seedSubScene(
			app,
			'Drift/Departure/C.md',
			'ssc-003-tst-001',
			'Drift',
			'prj-001-tst-001',
			'Departure',
			'sc1-001-tst-001'
		);
		// Wikilinks length 3, ids length 2 (writer deleted middle id).
		await seedScene(
			app,
			'Drift/Departure.md',
			'sc1-001-tst-001',
			'Drift',
			'prj-001-tst-001',
			[],
			[],
			['[[A]]', '[[B]]', '[[C]]'],
			['ssc-001-tst-001', 'ssc-003-tst-001']
		);

		const project = loadProject(app, 'Drift');
		const firstReport = scanProject(app, project);
		await applyRepairs(app, firstReport);

		const sceneFile = app.vault.getAbstractFileByPath(
			'Drift/Departure.md'
		) as TFile;
		const fm = app.metadataCache.getFileCache(sceneFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		// Repair restored the missing id at the right position.
		expect(fm?.['dbench-sub-scenes']).toEqual(['[[A]]', '[[B]]', '[[C]]']);
		expect(fm?.['dbench-sub-scene-ids']).toEqual([
			'ssc-001-tst-001',
			'ssc-002-tst-001',
			'ssc-003-tst-001',
		]);
	});
});
