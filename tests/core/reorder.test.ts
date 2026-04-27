import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { createProject } from '../../src/core/projects';
import { createScene } from '../../src/core/scenes';
import { createChapter } from '../../src/core/chapters';
import { reorderChapters, reorderScenes } from '../../src/core/reorder';
import {
	findChaptersInProject,
	findProjects,
	findScenesInProject,
	type ChapterNote,
	type SceneNote,
} from '../../src/core/discovery';
import {
	DEFAULT_SETTINGS,
	type DraftBenchSettings,
} from '../../src/model/settings';

async function seedProjectWithScenes(
	app: App,
	settings: DraftBenchSettings,
	projectTitle: string,
	sceneTitles: string[]
): Promise<SceneNote[]> {
	await createProject(app, settings, { title: projectTitle, shape: 'folder' });
	const project = findProjects(app).find(
		(p) => p.file.basename === projectTitle
	);
	if (!project) throw new Error('seed failed');
	for (const title of sceneTitles) {
		await createScene(app, settings, { project, title });
	}
	return findScenesInProject(app, project.frontmatter['dbench-id']).sort(
		(a, b) => a.frontmatter['dbench-order'] - b.frontmatter['dbench-order']
	);
}

function readOrder(app: App, scene: SceneNote): number {
	return Number(
		app.metadataCache.getFileCache(scene.file)?.frontmatter?.['dbench-order']
	);
}

describe('reorderScenes', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('assigns sequential orders (1..N) to the provided array', async () => {
		const scenes = await seedProjectWithScenes(app, settings, 'Novel', [
			'A',
			'B',
			'C',
		]);
		// Reverse and reorder: C, B, A should become 1, 2, 3.
		const reversed = [...scenes].reverse();
		const changed = await reorderScenes(app, reversed);
		expect(changed).toBe(2); // A (was 1) stays at position 3; B already at 2; C moves from 3 to 1; A from 1 to 3. So 2 writes.

		expect(readOrder(app, reversed[0])).toBe(1); // C
		expect(readOrder(app, reversed[1])).toBe(2); // B
		expect(readOrder(app, reversed[2])).toBe(3); // A
	});

	it('skips scenes already at the correct order (idempotent)', async () => {
		const scenes = await seedProjectWithScenes(app, settings, 'Novel', [
			'A',
			'B',
			'C',
		]);
		// Same order: no writes needed.
		const changed = await reorderScenes(app, scenes);
		expect(changed).toBe(0);

		expect(readOrder(app, scenes[0])).toBe(1);
		expect(readOrder(app, scenes[1])).toBe(2);
		expect(readOrder(app, scenes[2])).toBe(3);
	});

	it('handles a single-scene list (no-op if already at 1)', async () => {
		const scenes = await seedProjectWithScenes(app, settings, 'Novel', ['Solo']);
		expect(readOrder(app, scenes[0])).toBe(1);

		const changed = await reorderScenes(app, scenes);
		expect(changed).toBe(0);
	});

	it('handles an empty list', async () => {
		const changed = await reorderScenes(app, []);
		expect(changed).toBe(0);
	});

	it('handles a swap of two adjacent scenes', async () => {
		const scenes = await seedProjectWithScenes(app, settings, 'Novel', [
			'A',
			'B',
			'C',
		]);
		const swapped = [scenes[0], scenes[2], scenes[1]]; // A, C, B
		const changed = await reorderScenes(app, swapped);
		expect(changed).toBe(2);

		expect(readOrder(app, scenes[0])).toBe(1); // A stays
		expect(readOrder(app, scenes[1])).toBe(3); // B moves to 3
		expect(readOrder(app, scenes[2])).toBe(2); // C moves to 2
	});
});

async function seedProjectWithChapters(
	app: App,
	settings: DraftBenchSettings,
	projectTitle: string,
	chapterTitles: string[]
): Promise<ChapterNote[]> {
	await createProject(app, settings, { title: projectTitle, shape: 'folder' });
	const project = findProjects(app).find(
		(p) => p.file.basename === projectTitle
	);
	if (!project) throw new Error('seed failed');
	for (const title of chapterTitles) {
		await createChapter(app, settings, { project, title });
	}
	return findChaptersInProject(app, project.frontmatter['dbench-id']).sort(
		(a, b) =>
			(a.frontmatter['dbench-order'] ?? 0) -
			(b.frontmatter['dbench-order'] ?? 0)
	);
}

function readChapterOrder(app: App, chapter: ChapterNote): number {
	return Number(
		app.metadataCache.getFileCache(chapter.file)?.frontmatter?.['dbench-order']
	);
}

describe('reorderChapters', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('assigns sequential orders (1..N) to the provided chapter array', async () => {
		const chapters = await seedProjectWithChapters(app, settings, 'Novel', [
			'Departure',
			'Crossing',
			'Arrival',
		]);
		// Reverse: Arrival, Crossing, Departure should become 1, 2, 3.
		const reversed = [...chapters].reverse();
		const changed = await reorderChapters(app, reversed);
		// Crossing was already at 2, stays at 2 — only 2 writes.
		expect(changed).toBe(2);

		expect(readChapterOrder(app, reversed[0])).toBe(1);
		expect(readChapterOrder(app, reversed[1])).toBe(2);
		expect(readChapterOrder(app, reversed[2])).toBe(3);
	});

	it('skips chapters already at the correct order (idempotent)', async () => {
		const chapters = await seedProjectWithChapters(app, settings, 'Novel', [
			'A',
			'B',
			'C',
		]);
		const changed = await reorderChapters(app, chapters);
		expect(changed).toBe(0);

		expect(readChapterOrder(app, chapters[0])).toBe(1);
		expect(readChapterOrder(app, chapters[1])).toBe(2);
		expect(readChapterOrder(app, chapters[2])).toBe(3);
	});

	it('handles a single-chapter list', async () => {
		const chapters = await seedProjectWithChapters(app, settings, 'Novel', [
			'Solo',
		]);
		expect(readChapterOrder(app, chapters[0])).toBe(1);

		const changed = await reorderChapters(app, chapters);
		expect(changed).toBe(0);
	});

	it('handles an empty chapter list', async () => {
		const changed = await reorderChapters(app, []);
		expect(changed).toBe(0);
	});

	it('swaps two adjacent chapters with a single write per moved row', async () => {
		const chapters = await seedProjectWithChapters(app, settings, 'Novel', [
			'A',
			'B',
			'C',
		]);
		const swapped = [chapters[0], chapters[2], chapters[1]]; // A, C, B
		const changed = await reorderChapters(app, swapped);
		expect(changed).toBe(2);

		expect(readChapterOrder(app, chapters[0])).toBe(1);
		expect(readChapterOrder(app, chapters[1])).toBe(3);
		expect(readChapterOrder(app, chapters[2])).toBe(2);
	});
});
