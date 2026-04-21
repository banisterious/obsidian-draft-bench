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

async function seedFolderProject(
	app: App,
	path: string,
	id: string,
	title: string,
	reverseScenes: string[] = [],
	reverseSceneIds: string[] = []
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
	});
	return file;
}

async function seedSingleProject(
	app: App,
	path: string,
	id: string,
	title: string,
	reverseDrafts: string[] = [],
	reverseDraftIds: string[] = []
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
	reverseDraftIds: string[] = []
): Promise<TFile> {
	const file = await app.vault.create(path, '');
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'scene',
		'dbench-id': id,
		'dbench-project': `[[${projectTitle}]]`,
		'dbench-project-id': projectId,
		'dbench-order': 1,
		'dbench-status': 'idea',
		'dbench-drafts': reverseDrafts,
		'dbench-draft-ids': reverseDraftIds,
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
		expect(kinds(report.issues)).toEqual(['scene-missing-in-project']);
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
		expect(kinds(report.issues)).toEqual(['stale-scene-in-project']);
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
		expect(kinds(report.issues)).toEqual(['stale-scene-in-project']);
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
			(i) => i.kind === 'scene-project-conflict'
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
		expect(kinds(report.issues)).toEqual(['draft-missing-in-scene']);
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
		expect(kinds(report.issues)).toEqual(['stale-draft-in-scene']);
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
		expect(kinds(report.issues)).toEqual(['draft-missing-in-project']);
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
		expect(kinds_).not.toContain('draft-missing-in-project');
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
