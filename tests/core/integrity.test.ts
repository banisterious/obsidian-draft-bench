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
