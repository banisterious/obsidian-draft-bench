import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { moveSceneToChapter } from '../../src/core/move-to-chapter';
import type { ChapterNote, SceneNote } from '../../src/core/discovery';
import type { DbenchStatus } from '../../src/model/types';

async function seedScene(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		order: number;
		status?: DbenchStatus;
		chapterId?: string;
		chapterTitle?: string;
	}
): Promise<SceneNote> {
	const file = await app.vault.create(options.path, '');
	const fm: Record<string, unknown> = {
		'dbench-type': 'scene',
		'dbench-id': options.id,
		'dbench-project': `[[${options.projectTitle}]]`,
		'dbench-project-id': options.projectId,
		'dbench-order': options.order,
		'dbench-status': options.status ?? 'draft',
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	};
	if (options.chapterId !== undefined) {
		fm['dbench-chapter'] = `[[${options.chapterTitle}]]`;
		fm['dbench-chapter-id'] = options.chapterId;
	}
	app.metadataCache._setFrontmatter(file, fm);
	return {
		file,
		frontmatter: fm as unknown as SceneNote['frontmatter'],
	};
}

async function seedChapter(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		order: number;
	}
): Promise<ChapterNote> {
	const file = await app.vault.create(options.path, '');
	const fm: Record<string, unknown> = {
		'dbench-type': 'chapter',
		'dbench-id': options.id,
		'dbench-project': `[[${options.projectTitle}]]`,
		'dbench-project-id': options.projectId,
		'dbench-order': options.order,
		'dbench-status': 'draft',
		'dbench-scenes': [],
		'dbench-scene-ids': [],
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	};
	app.metadataCache._setFrontmatter(file, fm);
	return {
		file,
		frontmatter: fm as unknown as ChapterNote['frontmatter'],
	};
}

function readFm(app: App, file: TFile): Record<string, unknown> {
	return (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<
		string,
		unknown
	>;
}

describe('moveSceneToChapter', () => {
	let app: App;
	const projectId = 'prj-001';

	beforeEach(() => {
		app = new App();
	});

	it('writes dbench-chapter (wikilink) and dbench-chapter-id onto the scene', async () => {
		const scene = await seedScene(app, {
			path: 'Novel/Setting Out.md',
			id: 'sc-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		const target = await seedChapter(app, {
			path: 'Novel/The Departure.md',
			id: 'ch-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});

		await moveSceneToChapter(app, scene, target);

		const fm = readFm(app, scene.file);
		expect(fm['dbench-chapter']).toBe('[[The Departure]]');
		expect(fm['dbench-chapter-id']).toBe('ch-001');
	});

	it('overwrites the scene\'s previous chapter assignment when moving between chapters', async () => {
		const scene = await seedScene(app, {
			path: 'Novel/Setting Out.md',
			id: 'sc-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			chapterId: 'ch-001',
			chapterTitle: 'The Departure',
		});
		const newTarget = await seedChapter(app, {
			path: 'Novel/Across the Salt.md',
			id: 'ch-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
		});

		await moveSceneToChapter(app, scene, newTarget);

		const fm = readFm(app, scene.file);
		expect(fm['dbench-chapter']).toBe('[[Across the Salt]]');
		expect(fm['dbench-chapter-id']).toBe('ch-002');
	});

	it('preserves other scene frontmatter fields (dbench-order, dbench-status, etc.)', async () => {
		const scene = await seedScene(app, {
			path: 'Novel/Setting Out.md',
			id: 'sc-001',
			projectId,
			projectTitle: 'Novel',
			order: 5,
			status: 'final',
		});
		const target = await seedChapter(app, {
			path: 'Novel/Chapter A.md',
			id: 'ch-A',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});

		await moveSceneToChapter(app, scene, target);

		const fm = readFm(app, scene.file);
		expect(fm['dbench-order']).toBe(5);
		expect(fm['dbench-status']).toBe('final');
		expect(fm['dbench-id']).toBe('sc-001');
		expect(fm['dbench-project-id']).toBe(projectId);
	});

	it('is idempotent — re-applying the same move produces the same frontmatter', async () => {
		const scene = await seedScene(app, {
			path: 'Novel/Setting Out.md',
			id: 'sc-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		const target = await seedChapter(app, {
			path: 'Novel/Chapter A.md',
			id: 'ch-A',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});

		await moveSceneToChapter(app, scene, target);
		const fmFirst = JSON.stringify(readFm(app, scene.file));
		await moveSceneToChapter(app, scene, target);
		const fmSecond = JSON.stringify(readFm(app, scene.file));

		expect(fmSecond).toBe(fmFirst);
	});
});
