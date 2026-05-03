import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { WordCountCache } from '../../src/core/word-count-cache';
import { createProject } from '../../src/core/projects';
import { createChapter } from '../../src/core/chapters';
import { createScene } from '../../src/core/scenes';
import { createSubScene } from '../../src/core/sub-scenes';
import {
	findChaptersInProject,
	findProjects,
	findScenesInProject,
	findSubScenesInScene,
	type ChapterNote,
	type ProjectNote,
	type SceneNote,
	type SubSceneNote,
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

async function seedChapter(
	app: App,
	settings: DraftBenchSettings,
	project: ProjectNote,
	title: string,
	bodyBelowDraft = 'Chapter body four words.'
): Promise<ChapterNote> {
	const file = await createChapter(app, settings, { project, title });
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const fmBlock =
		'---\n' +
		Object.entries(fm)
			.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
			.join('\n') +
		'\n---\n';
	await app.vault.modify(file, `${fmBlock}## Draft\n\n${bodyBelowDraft}\n`);
	file.stat.mtime = Date.now();
	const chapter = findChaptersInProject(
		app,
		project.frontmatter['dbench-id']
	).find((c) => c.file.basename === title);
	if (!chapter) throw new Error(`seeded chapter ${title} not discoverable`);
	return chapter;
}

async function seedSubScene(
	app: App,
	settings: DraftBenchSettings,
	project: ProjectNote,
	scene: SceneNote,
	title: string,
	bodyBelowDraft = 'Sub-scene body has six words.'
): Promise<SubSceneNote> {
	const file = await createSubScene(app, settings, { project, scene, title });
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const fmBlock =
		'---\n' +
		Object.entries(fm)
			.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
			.join('\n') +
		'\n---\n';
	await app.vault.modify(file, `${fmBlock}## Draft\n\n${bodyBelowDraft}\n`);
	file.stat.mtime = Date.now();
	const subScene = findSubScenesInScene(app, scene.frontmatter['dbench-id']).find(
		(s) => s.file.basename === title
	);
	if (!subScene) throw new Error(`seeded sub-scene ${title} not discoverable`);
	return subScene;
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

	describe('countForSceneWithSubScenes', () => {
		it('returns scene body count alone when no sub-scenes are passed', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(
				app,
				settings,
				project,
				'Lonely',
				'one two three'
			); // 3
			expect(await cache.countForSceneWithSubScenes(scene, [])).toBe(3);
		});

		it('sums scene body + sub-scene bodies', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(
				app,
				settings,
				project,
				'The auction',
				'intro words one two three four'
			); // 6
			const sub1 = await seedSubScene(
				app,
				settings,
				project,
				scene,
				'Lot 47',
				'lot prose one two three'
			); // 5
			const sub2 = await seedSubScene(
				app,
				settings,
				project,
				scene,
				'Bidding war',
				'bidding war four words here'
			); // 5

			expect(
				await cache.countForSceneWithSubScenes(scene, [sub1, sub2])
			).toBe(6 + 5 + 5);
		});

		it('memoizes across sub-scenes within one rollup', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(app, settings, project, 'S', 'a b');
			const sub = await seedSubScene(app, settings, project, scene, 'Sub', 'x y z');

			await cache.countForSceneWithSubScenes(scene, [sub]);
			// Two file reads: scene + sub.
			expect(cache.size).toBe(2);
		});
	});

	describe('countForProject', () => {
		it('returns empty buckets for a project with no scenes', async () => {
			const project = await seedProject(app, settings, 'Empty');

			const counts = await cache.countForProject(project);
			expect(counts.total).toBe(0);
			expect(counts.wordsByStatus).toEqual({});
			expect(counts.scenesByStatus).toEqual({});
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
			expect(counts.wordsByStatus.draft).toBeUndefined();
			expect(counts.scenesByStatus.idea).toBe(1);
			expect(counts.scenesByStatus.revision).toBe(1);
			expect(counts.scenesByStatus.final).toBe(1);
			expect(counts.scenesByStatus.draft).toBeUndefined();
			// Silence unused-var warnings for the seeded scenes.
			void s1;
		});

		it('creates buckets lazily for statuses outside the default vocabulary', async () => {
			const project = await seedProject(app, settings, 'P');
			const scene = await seedScene(app, settings, project, 'One', 'a b c');
			await app.fileManager.processFrontMatter(scene.file, (fm) => {
				fm['dbench-status'] = 'brainstorm';
			});

			const counts = await cache.countForProject(project);
			expect(counts.total).toBe(3);
			expect(counts.wordsByStatus.brainstorm).toBe(3);
			expect(counts.scenesByStatus.brainstorm).toBe(1);
			expect(counts.wordsByStatus.idea).toBeUndefined();
		});

		it('defaults target fields to null/0 when no targets are set', async () => {
			const project = await seedProject(app, settings, 'No targets');
			await seedScene(app, settings, project, 'Plain');

			const counts = await cache.countForProject(project);
			expect(counts.projectTarget).toBeNull();
			expect(counts.sceneTargetSum).toBe(0);
			expect(counts.scenesWithTargets).toBe(0);
		});

		it('reads projectTarget from the project frontmatter', async () => {
			const project = await seedProject(app, settings, 'Targeted');
			await app.fileManager.processFrontMatter(project.file, (fm) => {
				fm['dbench-target-words'] = 10000;
			});

			// Re-read project from discovery so frontmatter is current.
			const refreshed = findProjects(app).find(
				(p) => p.file.path === project.file.path
			)!;
			const counts = await cache.countForProject(refreshed);
			expect(counts.projectTarget).toBe(10000);
		});

		it('aggregates scene targets into sceneTargetSum and scenesWithTargets', async () => {
			const project = await seedProject(app, settings, 'Split');
			const s1 = await seedScene(app, settings, project, 'A');
			const s2 = await seedScene(app, settings, project, 'B');
			await seedScene(app, settings, project, 'C'); // no target

			await app.fileManager.processFrontMatter(s1.file, (fm) => {
				fm['dbench-target-words'] = 1500;
			});
			await app.fileManager.processFrontMatter(s2.file, (fm) => {
				fm['dbench-target-words'] = 800;
			});

			const refreshed = findProjects(app).find(
				(p) => p.file.path === project.file.path
			)!;
			const counts = await cache.countForProject(refreshed);
			expect(counts.sceneTargetSum).toBe(2300);
			expect(counts.scenesWithTargets).toBe(2);
		});

		it('skips invalid scene targets (zero, negative, non-integer)', async () => {
			const project = await seedProject(app, settings, 'Junk');
			const s1 = await seedScene(app, settings, project, 'Zero');
			const s2 = await seedScene(app, settings, project, 'Neg');
			const s3 = await seedScene(app, settings, project, 'Float');
			const s4 = await seedScene(app, settings, project, 'Good');

			await app.fileManager.processFrontMatter(s1.file, (fm) => {
				fm['dbench-target-words'] = 0;
			});
			await app.fileManager.processFrontMatter(s2.file, (fm) => {
				fm['dbench-target-words'] = -500;
			});
			await app.fileManager.processFrontMatter(s3.file, (fm) => {
				fm['dbench-target-words'] = 1234.5;
			});
			await app.fileManager.processFrontMatter(s4.file, (fm) => {
				fm['dbench-target-words'] = 2000;
			});

			const refreshed = findProjects(app).find(
				(p) => p.file.path === project.file.path
			)!;
			const counts = await cache.countForProject(refreshed);
			expect(counts.scenesWithTargets).toBe(1);
			expect(counts.sceneTargetSum).toBe(2000);
		});

		it('chaptersByStatus stays empty for chapter-less projects', async () => {
			const project = await seedProject(app, settings, 'Flat');
			await seedScene(app, settings, project, 'A', 'one two three');

			const counts = await cache.countForProject(project);
			expect(counts.chaptersByStatus).toEqual({});
		});

		it('chapter-only project: totals come from chapter bodies', async () => {
			const project = await seedProject(app, settings, 'AllChapters');
			await seedChapter(app, settings, project, 'Ch01', 'four words right here'); // 4
			await seedChapter(app, settings, project, 'Ch02', 'two words'); // 2

			const refreshed = findProjects(app).find(
				(p) => p.file.path === project.file.path
			)!;
			const counts = await cache.countForProject(refreshed);
			expect(counts.total).toBe(6);
			expect(counts.wordsByStatus.idea).toBe(6);
			expect(counts.chaptersByStatus.idea).toBe(2);
			expect(counts.scenesByStatus).toEqual({});
		});

		it('chapter-aware project with scenes-in-chapter: chapter bodies augment total + status', async () => {
			const project = await seedProject(app, settings, 'Mixed');
			const chapter = await seedChapter(
				app,
				settings,
				project,
				'Ch01',
				'three chapter words'
			); // 3
			// Flip chapter status to 'revision' so its body lands in a
			// distinct bucket from the scenes' default 'idea'.
			await app.fileManager.processFrontMatter(chapter.file, (fm) => {
				fm['dbench-status'] = 'revision';
			});
			const refreshedProject = findProjects(app).find(
				(p) => p.file.path === project.file.path
			)!;
			const refreshedChapter = findChaptersInProject(
				app,
				refreshedProject.frontmatter['dbench-id']
			).find((c) => c.file.basename === 'Ch01')!;

			await createScene(app, settings, {
				project: refreshedProject,
				chapter: refreshedChapter,
				title: 'A',
			});
			await createScene(app, settings, {
				project: refreshedProject,
				chapter: refreshedChapter,
				title: 'B',
			});
			// Overwrite scene bodies for predictable counts.
			const sceneA = findScenesInProject(
				app,
				refreshedProject.frontmatter['dbench-id']
			).find((s) => s.file.basename === 'A')!;
			const sceneB = findScenesInProject(
				app,
				refreshedProject.frontmatter['dbench-id']
			).find((s) => s.file.basename === 'B')!;
			const fmBlock = (file: typeof sceneA.file): string => {
				const fm =
					app.metadataCache.getFileCache(file)?.frontmatter ?? {};
				return (
					'---\n' +
					Object.entries(fm)
						.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
						.join('\n') +
					'\n---\n'
				);
			};
			await app.vault.modify(
				sceneA.file,
				`${fmBlock(sceneA.file)}## Draft\n\nfive small scene words here\n`
			); // 5
			sceneA.file.stat.mtime = Date.now();
			await app.vault.modify(
				sceneB.file,
				`${fmBlock(sceneB.file)}## Draft\n\ntwo words\n`
			); // 2
			sceneB.file.stat.mtime = Date.now() + 1;

			const counts = await cache.countForProject(refreshedProject);
			// Scenes (idea, 5+2=7) + chapter (revision, 3) = 10.
			expect(counts.total).toBe(10);
			expect(counts.wordsByStatus.idea).toBe(7);
			expect(counts.wordsByStatus.revision).toBe(3);
			expect(counts.scenesByStatus.idea).toBe(2);
			expect(counts.scenesByStatus.revision).toBeUndefined();
			expect(counts.chaptersByStatus.revision).toBe(1);
			expect(counts.chaptersByStatus.idea).toBeUndefined();
		});

		it('subScenesByStatus stays empty for projects without sub-scenes', async () => {
			const project = await seedProject(app, settings, 'Flat');
			await seedScene(app, settings, project, 'A', 'one two three');

			const counts = await cache.countForProject(project);
			expect(counts.subScenesByStatus).toEqual({});
		});

		it('hierarchical scene: project total includes sub-scene bodies', async () => {
			const project = await seedProject(app, settings, 'Drift');
			const scene = await seedScene(
				app,
				settings,
				project,
				'The auction',
				'intro words two three four five' // 6
			);
			await seedSubScene(
				app,
				settings,
				project,
				scene,
				'Lot 47',
				'lot one two three' // 4
			);
			await seedSubScene(
				app,
				settings,
				project,
				scene,
				'Bidding war',
				'bid one two three four' // 5
			);

			const refreshedProject = findProjects(app).find(
				(p) => p.file.path === project.file.path
			)!;
			const counts = await cache.countForProject(refreshedProject);
			// Scene body (6) + sub-scenes (4 + 5) = 15
			expect(counts.total).toBe(15);
		});

		it('sub-scenes bucket by their own status, not the parent scene status', async () => {
			const project = await seedProject(app, settings, 'Drift');
			const scene = await seedScene(
				app,
				settings,
				project,
				'The auction',
				'intro three four five' // 4
			);
			const sub1 = await seedSubScene(
				app,
				settings,
				project,
				scene,
				'Lot 47',
				'lot four five six' // 4
			);
			const sub2 = await seedSubScene(
				app,
				settings,
				project,
				scene,
				'Bidding war',
				'bid one two' // 3
			);

			// Flip sub-scene statuses so they bucket distinctly from the
			// parent scene's default 'idea'.
			await app.fileManager.processFrontMatter(sub1.file, (fm) => {
				fm['dbench-status'] = 'final';
			});
			await app.fileManager.processFrontMatter(sub2.file, (fm) => {
				fm['dbench-status'] = 'revision';
			});

			const refreshedProject = findProjects(app).find(
				(p) => p.file.path === project.file.path
			)!;
			const counts = await cache.countForProject(refreshedProject);

			// Words: scene (idea, 4) + sub1 (final, 4) + sub2 (revision, 3) = 11
			expect(counts.total).toBe(11);
			expect(counts.wordsByStatus.idea).toBe(4);
			expect(counts.wordsByStatus.final).toBe(4);
			expect(counts.wordsByStatus.revision).toBe(3);
			// scenesByStatus tracks the parent scene only.
			expect(counts.scenesByStatus.idea).toBe(1);
			expect(counts.scenesByStatus.final).toBeUndefined();
			// subScenesByStatus tracks sub-scenes by their own status.
			expect(counts.subScenesByStatus.final).toBe(1);
			expect(counts.subScenesByStatus.revision).toBe(1);
			expect(counts.subScenesByStatus.idea).toBeUndefined();
		});

		it('mixed project: chapters + scenes + sub-scenes all roll up correctly', async () => {
			const project = await seedProject(app, settings, 'Mixed');
			const chapter = await seedChapter(
				app,
				settings,
				project,
				'Ch01',
				'chapter intro three' // 3
			);
			const refreshedProject = findProjects(app).find(
				(p) => p.file.path === project.file.path
			)!;
			const refreshedChapter = findChaptersInProject(
				app,
				refreshedProject.frontmatter['dbench-id']
			).find((c) => c.file.basename === 'Ch01')!;

			// Scene-in-chapter, no sub-scenes.
			await createScene(app, settings, {
				project: refreshedProject,
				chapter: refreshedChapter,
				title: 'Flat',
			});
			const flat = findScenesInProject(
				app,
				refreshedProject.frontmatter['dbench-id']
			).find((s) => s.file.basename === 'Flat')!;
			const fmBlock = (file: typeof flat.file): string => {
				const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
				return (
					'---\n' +
					Object.entries(fm)
						.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
						.join('\n') +
					'\n---\n'
				);
			};
			await app.vault.modify(
				flat.file,
				`${fmBlock(flat.file)}## Draft\n\nflat scene words two three\n` // 5
			);
			flat.file.stat.mtime = Date.now();

			// Hierarchical scene-in-chapter, with one sub-scene.
			await createScene(app, settings, {
				project: refreshedProject,
				chapter: refreshedChapter,
				title: 'Tall',
			});
			const tall = findScenesInProject(
				app,
				refreshedProject.frontmatter['dbench-id']
			).find((s) => s.file.basename === 'Tall')!;
			await app.vault.modify(
				tall.file,
				`${fmBlock(tall.file)}## Draft\n\ntall intro words\n` // 3
			);
			tall.file.stat.mtime = Date.now() + 1;
			await seedSubScene(
				app,
				settings,
				refreshedProject,
				tall,
				'Beat one',
				'sub one two three four' // 5
			);

			const counts = await cache.countForProject(refreshedProject);
			// Total: chapter (3) + flat scene (5) + tall scene (3) + sub-scene (5) = 16
			expect(counts.total).toBe(16);
			expect(counts.chaptersByStatus.idea).toBe(1);
			expect(counts.scenesByStatus.idea).toBe(2);
			expect(counts.subScenesByStatus.idea).toBe(1);
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
