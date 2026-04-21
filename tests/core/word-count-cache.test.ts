import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { WordCountCache } from '../../src/core/word-count-cache';
import { createProject } from '../../src/core/projects';
import { createScene } from '../../src/core/scenes';
import {
	findProjects,
	findScenesInProject,
	type ProjectNote,
	type SceneNote,
} from '../../src/core/discovery';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';

async function seedProject(
	app: App,
	settings: DraftBenchSettings,
	title: string
): Promise<ProjectNote> {
	await createProject(app, settings, { title, shape: 'folder' });
	const projects = findProjects(app);
	return projects[projects.length - 1];
}

async function seedScene(
	app: App,
	settings: DraftBenchSettings,
	project: ProjectNote,
	title: string,
	bodyBelowDraft = 'Prose body with five tokens total.'
): Promise<SceneNote> {
	const file = await createScene(app, settings, { project, title });
	// Overwrite the scene file with a predictable body so tests can
	// assert exact counts independently of template text.
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const fmBlock =
		'---\n' +
		Object.entries(fm)
			.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
			.join('\n') +
		'\n---\n';
	await app.vault.modify(file, `${fmBlock}## Draft\n\n${bodyBelowDraft}\n`);
	// Advance the mtime explicitly (mock vault.modify already does, but
	// we want to make the intent visible).
	file.stat.mtime = Date.now();
	const scene = findScenesInProject(app, project.frontmatter['dbench-id']).find(
		(s) => s.file.basename === title
	);
	if (!scene) throw new Error(`seeded scene ${title} not discoverable`);
	return scene;
}

describe('WordCountCache', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let cache: WordCountCache;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		cache = new WordCountCache(app);
	});

	describe('countForScene', () => {
		it('counts words from the scene body', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(app, settings, project, 'S1'); // default body = 6 words
			expect(await cache.countForScene(scene)).toBe(6);
		});

		it('memoizes the result on subsequent calls', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(app, settings, project, 'S1');

			await cache.countForScene(scene);
			expect(cache.size).toBe(1);

			// A second call returns the cached value; we can verify by
			// reading twice and making sure size stays at 1.
			await cache.countForScene(scene);
			expect(cache.size).toBe(1);
		});

		it('reruns the count when mtime moves forward', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(
				app,
				settings,
				project,
				'S1',
				'one two three.'
			);
			expect(await cache.countForScene(scene)).toBe(3);

			// Rewrite the scene body and bump mtime.
			const fm = app.metadataCache.getFileCache(scene.file)?.frontmatter ?? {};
			const fmBlock =
				'---\n' +
				Object.entries(fm)
					.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
					.join('\n') +
				'\n---\n';
			await app.vault.modify(
				scene.file,
				`${fmBlock}## Draft\n\nalpha beta gamma delta.\n`
			);
			scene.file.stat.mtime += 1000;

			expect(await cache.countForScene(scene)).toBe(4);
		});

		it('does not rerun when mtime is unchanged between calls', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(app, settings, project, 'S1', 'one two.');
			expect(await cache.countForScene(scene)).toBe(2);

			// Modify the file content WITHOUT advancing mtime, then expect
			// the cache to return the stale value — this is the contract.
			const fm = app.metadataCache.getFileCache(scene.file)?.frontmatter ?? {};
			const fmBlock =
				'---\n' +
				Object.entries(fm)
					.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
					.join('\n') +
				'\n---\n';
			await app.vault.modify(
				scene.file,
				`${fmBlock}## Draft\n\nlots of new words added here.\n`
			);
			// leave scene.file.stat.mtime as-is

			expect(await cache.countForScene(scene)).toBe(2);
		});
	});

	describe('countForProject', () => {
		it('returns zeros for a project with no scenes', async () => {
			const project = await seedProject(app, settings, 'Empty');

			const counts = await cache.countForProject(project);
			expect(counts.total).toBe(0);
			expect(counts.wordsByStatus).toEqual({
				idea: 0,
				draft: 0,
				revision: 0,
				final: 0,
			});
			expect(counts.scenesByStatus).toEqual({
				idea: 0,
				draft: 0,
				revision: 0,
				final: 0,
			});
		});

		it('sums word counts across scenes and buckets by status', async () => {
			const project = await seedProject(app, settings, 'P');
			const s1 = await seedScene(app, settings, project, 'One', 'one two three'); // idea, 3 words
			const s2 = await seedScene(app, settings, project, 'Two', 'alpha beta'); // idea, 2 words
			const s3 = await seedScene(
				app,
				settings,
				project,
				'Three',
				'four words go here.'
			); // idea, 4 words

			// Flip s2 to 'revision' and s3 to 'final' via processFrontMatter.
			await app.fileManager.processFrontMatter(s2.file, (fm) => {
				fm['dbench-status'] = 'revision';
			});
			await app.fileManager.processFrontMatter(s3.file, (fm) => {
				fm['dbench-status'] = 'final';
			});

			// Re-read the scenes from discovery so frontmatter is current.
			const fresh = findScenesInProject(
				app,
				project.frontmatter['dbench-id']
			);
			expect(fresh).toHaveLength(3);

			const counts = await cache.countForProject(project);
			expect(counts.total).toBe(3 + 2 + 4);
			expect(counts.wordsByStatus.idea).toBe(3);
			expect(counts.wordsByStatus.revision).toBe(2);
			expect(counts.wordsByStatus.final).toBe(4);
			expect(counts.wordsByStatus.draft).toBe(0);
			expect(counts.scenesByStatus.idea).toBe(1);
			expect(counts.scenesByStatus.revision).toBe(1);
			expect(counts.scenesByStatus.final).toBe(1);
			// Silence unused-var warnings for the seeded scenes.
			void s1;
		});
	});

	describe('invalidate', () => {
		it('drops a specific entry', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(app, settings, project, 'S');
			await cache.countForScene(scene);
			expect(cache.size).toBe(1);

			cache.invalidate(scene.file.path);
			expect(cache.size).toBe(0);
		});

		it('is a no-op for an unknown path', () => {
			cache.invalidate('does/not/exist.md');
			expect(cache.size).toBe(0);
		});
	});

	describe('clear', () => {
		it('drops every entry', async () => {
			const project = await seedProject(app, settings, 'P');
			const s1 = await seedScene(app, settings, project, 'A');
			const s2 = await seedScene(app, settings, project, 'B');
			await cache.countForScene(s1);
			await cache.countForScene(s2);
			expect(cache.size).toBe(2);

			cache.clear();
			expect(cache.size).toBe(0);
		});
	});
});
