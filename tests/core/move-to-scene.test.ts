import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { moveSubSceneToScene } from '../../src/core/move-to-scene';
import type { SceneNote, SubSceneNote } from '../../src/core/discovery';

async function seedScene(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		order: number;
	}
): Promise<SceneNote> {
	const file = await app.vault.create(options.path, '');
	const fm: Record<string, unknown> = {
		'dbench-type': 'scene',
		'dbench-id': options.id,
		'dbench-project': `[[${options.projectTitle}]]`,
		'dbench-project-id': options.projectId,
		'dbench-order': options.order,
		'dbench-status': 'draft',
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	};
	app.metadataCache._setFrontmatter(file, fm);
	return {
		file,
		frontmatter: fm as unknown as SceneNote['frontmatter'],
	};
}

async function seedSubScene(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		sceneId: string;
		sceneTitle: string;
		order: number;
	}
): Promise<SubSceneNote> {
	const file = await app.vault.create(options.path, '');
	const fm: Record<string, unknown> = {
		'dbench-type': 'sub-scene',
		'dbench-id': options.id,
		'dbench-project': `[[${options.projectTitle}]]`,
		'dbench-project-id': options.projectId,
		'dbench-scene': `[[${options.sceneTitle}]]`,
		'dbench-scene-id': options.sceneId,
		'dbench-order': options.order,
		'dbench-status': 'draft',
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	};
	app.metadataCache._setFrontmatter(file, fm);
	return {
		file,
		frontmatter: fm as unknown as SubSceneNote['frontmatter'],
	};
}

function readFm(app: App, file: TFile): Record<string, unknown> {
	return (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<
		string,
		unknown
	>;
}

describe('moveSubSceneToScene', () => {
	let app: App;
	const projectId = 'prj-001-tst-001';

	beforeEach(() => {
		app = new App();
	});

	it('writes dbench-scene (wikilink) and dbench-scene-id onto the sub-scene', async () => {
		const subScene = await seedSubScene(app, {
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			sceneId: 'sc1-old-tst-001',
			sceneTitle: 'The auction',
			order: 1,
		});
		const targetScene = await seedScene(app, {
			path: 'Drift/Reception.md',
			id: 'sc1-new-tst-002',
			projectId,
			projectTitle: 'Drift',
			order: 2,
		});

		await moveSubSceneToScene(app, subScene, targetScene);

		const fm = readFm(app, subScene.file);
		expect(fm['dbench-scene']).toBe('[[Reception]]');
		expect(fm['dbench-scene-id']).toBe('sc1-new-tst-002');
	});

	it('preserves other sub-scene frontmatter (project ref, order, status)', async () => {
		const subScene = await seedSubScene(app, {
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			sceneId: 'sc1-old-tst-001',
			sceneTitle: 'The auction',
			order: 3,
		});
		const targetScene = await seedScene(app, {
			path: 'Drift/Reception.md',
			id: 'sc1-new-tst-002',
			projectId,
			projectTitle: 'Drift',
			order: 2,
		});

		await moveSubSceneToScene(app, subScene, targetScene);

		const fm = readFm(app, subScene.file);
		expect(fm['dbench-project']).toBe('[[Drift]]');
		expect(fm['dbench-project-id']).toBe(projectId);
		expect(fm['dbench-order']).toBe(3);
		expect(fm['dbench-status']).toBe('draft');
		expect(fm['dbench-id']).toBe('sub-001-tst-001');
	});

	it('idempotent: moving to the current parent scene produces the same frontmatter', async () => {
		const targetScene = await seedScene(app, {
			path: 'Drift/The auction.md',
			id: 'sc1-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			order: 1,
		});
		const subScene = await seedSubScene(app, {
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			sceneId: 'sc1-001-tst-001',
			sceneTitle: 'The auction',
			order: 1,
		});

		const before = readFm(app, subScene.file);
		await moveSubSceneToScene(app, subScene, targetScene);
		const after = readFm(app, subScene.file);

		expect(after['dbench-scene']).toBe(before['dbench-scene']);
		expect(after['dbench-scene-id']).toBe(before['dbench-scene-id']);
	});
});
