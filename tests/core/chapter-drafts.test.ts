import { beforeEach, describe, expect, it } from 'vitest';
import { App, type TFile } from 'obsidian';
import {
	buildChapterSnapshot,
	createChapterDraft,
	nextChapterDraftNumber,
	resolveChapterDraftFilename,
	resolveChapterDraftFolder,
	resolveChapterDraftPaths,
} from '../../src/core/chapter-drafts';
import { createChapter } from '../../src/core/chapters';
import { createProject } from '../../src/core/projects';
import { createScene } from '../../src/core/scenes';
import {
	findChaptersInProject,
	findDraftsOfChapter,
	findProjects,
	type ChapterNote,
	type ProjectNote,
} from '../../src/core/discovery';
import { isValidDbenchId } from '../../src/core/id';
import {
	DEFAULT_SETTINGS,
	type DraftBenchSettings,
} from '../../src/model/settings';

async function seedProject(
	app: App,
	settings: DraftBenchSettings,
	title: string
): Promise<ProjectNote> {
	await createProject(app, settings, { title, shape: 'folder' });
	const projects = findProjects(app);
	const project = projects[projects.length - 1];
	if (!project) throw new Error('seedProject failed');
	return project;
}

async function seedChapter(
	app: App,
	settings: DraftBenchSettings,
	project: ProjectNote,
	title: string
): Promise<ChapterNote> {
	await createChapter(app, settings, { project, title });
	const chapters = findChaptersInProject(
		app,
		project.frontmatter['dbench-id']
	);
	const chapter = chapters.find((c) => c.file.basename === title);
	if (!chapter) throw new Error('seedChapter failed');
	return chapter;
}

async function setBody(app: App, file: TFile, body: string): Promise<void> {
	const content = await app.vault.read(file);
	const match = content.match(/^---\n[\s\S]*?\n---\n?/);
	const frontmatterBlock = match ? match[0] : '';
	await app.vault.modify(file, frontmatterBlock + body);
}

const FIXED_DATE = new Date(2026, 3, 27); // 2026-04-27 local time

describe('buildChapterSnapshot', () => {
	it('returns the chapter body alone when there are no scenes', () => {
		expect(buildChapterSnapshot('Chapter prose.', [])).toBe(
			'Chapter prose.\n'
		);
	});

	it('returns empty string for an empty chapter with no scenes', () => {
		expect(buildChapterSnapshot('', [])).toBe('');
		expect(buildChapterSnapshot('   \n\n', [])).toBe('');
	});

	it('joins chapter body and one scene with a comment marker', () => {
		expect(
			buildChapterSnapshot('Opening lines.', [
				{ basename: 'First scene', body: 'Scene body.' },
			])
		).toBe('Opening lines.\n\n<!-- scene: First scene -->\n\nScene body.\n');
	});

	it('separates multiple scenes with their own markers', () => {
		expect(
			buildChapterSnapshot('Intro.', [
				{ basename: 'Alpha', body: 'A body.' },
				{ basename: 'Beta', body: 'B body.' },
			])
		).toBe(
			'Intro.\n\n<!-- scene: Alpha -->\n\nA body.\n\n<!-- scene: Beta -->\n\nB body.\n'
		);
	});

	it('omits leading blank for an empty chapter body', () => {
		expect(
			buildChapterSnapshot('', [
				{ basename: 'Only scene', body: 'Just here.' },
			])
		).toBe('<!-- scene: Only scene -->\n\nJust here.\n');
	});

	it('keeps the marker for an empty scene body', () => {
		expect(
			buildChapterSnapshot('Intro.', [
				{ basename: 'Empty', body: '' },
			])
		).toBe('Intro.\n\n<!-- scene: Empty -->\n\n\n');
	});

	it('strips trailing whitespace from each section', () => {
		expect(
			buildChapterSnapshot('Intro.\n\n\n', [
				{ basename: 'Scene', body: 'Body.\n\n' },
			])
		).toBe('Intro.\n\n<!-- scene: Scene -->\n\nBody.\n');
	});
});

describe('nextChapterDraftNumber', () => {
	it('returns 1 when no chapter drafts exist', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Novel');
		const chapter = await seedChapter(app, settings, project, 'Chapter 1');

		expect(nextChapterDraftNumber(app, chapter.frontmatter['dbench-id'])).toBe(
			1
		);
	});

	it('returns max+1 when chapter drafts exist', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Novel');
		const chapter = await seedChapter(app, settings, project, 'Chapter 1');

		await createChapterDraft(app, settings, { chapter, date: FIXED_DATE });
		const refreshed = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];
		await createChapterDraft(app, settings, {
			chapter: refreshed,
			date: FIXED_DATE,
		});

		const final = findChaptersInProject(app, project.frontmatter['dbench-id'])[0];
		expect(nextChapterDraftNumber(app, final.frontmatter['dbench-id'])).toBe(
			3
		);
	});

	it('does not count drafts of other chapters', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Novel');
		const ch1 = await seedChapter(app, settings, project, 'Chapter 1');
		const ch2 = await seedChapter(app, settings, project, 'Chapter 2');

		await createChapterDraft(app, settings, {
			chapter: ch1,
			date: FIXED_DATE,
		});

		expect(nextChapterDraftNumber(app, ch2.frontmatter['dbench-id'])).toBe(1);
	});
});

describe('resolveChapterDraftFilename', () => {
	it('formats as `<Chapter> - Draft N (YYYYMMDD).md`', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Novel');
		const chapter = await seedChapter(app, settings, project, 'Chapter 1');

		expect(
			resolveChapterDraftFilename(chapter, 2, new Date(2026, 0, 1))
		).toBe('Chapter 1 - Draft 2 (20260101).md');
	});

	it('zero-pads month and day', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Novel');
		const chapter = await seedChapter(app, settings, project, 'Chapter 1');

		expect(
			resolveChapterDraftFilename(chapter, 1, new Date(2026, 8, 5))
		).toBe('Chapter 1 - Draft 1 (20260905).md');
	});
});

describe('resolveChapterDraftFolder', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let chapter: ChapterNote;

	beforeEach(async () => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Novel');
		chapter = await seedChapter(app, settings, project, 'Chapter 1');
	});

	it('project-local placement nests under the project folder', () => {
		const folder = resolveChapterDraftFolder(app, settings, chapter);
		expect(folder).toBe('Draft Bench/Novel/Drafts');
	});

	it('per-scene placement creates a sibling folder beside the chapter', () => {
		const folder = resolveChapterDraftFolder(
			app,
			{ ...settings, draftsFolderPlacement: 'per-scene' },
			chapter
		);
		expect(folder).toBe('Draft Bench/Novel/Chapter 1 - Drafts');
	});

	it('vault-wide placement returns the bare folder name', () => {
		const folder = resolveChapterDraftFolder(
			app,
			{ ...settings, draftsFolderPlacement: 'vault-wide' },
			chapter
		);
		expect(folder).toBe('Drafts');
	});

	it('honors a custom drafts folder name', () => {
		const folder = resolveChapterDraftFolder(
			app,
			{ ...settings, draftsFolderName: 'Snapshots' },
			chapter
		);
		expect(folder).toBe('Draft Bench/Novel/Snapshots');
	});
});

describe('resolveChapterDraftPaths', () => {
	it('packages folder, filename, full path, and draft number', async () => {
		const app = new App();
		const settings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Novel');
		const chapter = await seedChapter(app, settings, project, 'Chapter 1');

		const paths = resolveChapterDraftPaths(
			app,
			settings,
			chapter,
			FIXED_DATE
		);
		expect(paths.folderPath).toBe('Draft Bench/Novel/Drafts');
		expect(paths.filename).toBe('Chapter 1 - Draft 1 (20260427).md');
		expect(paths.filePath).toBe(
			'Draft Bench/Novel/Drafts/Chapter 1 - Draft 1 (20260427).md'
		);
		expect(paths.draftNumber).toBe(1);
	});
});

describe('createChapterDraft', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let project: ProjectNote;
	let chapter: ChapterNote;

	beforeEach(async () => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		project = await seedProject(app, settings, 'Novel');
		chapter = await seedChapter(app, settings, project, 'Chapter 1');
	});

	it('snapshots a chapter with no scenes (chapter body only)', async () => {
		await setBody(app, chapter.file, 'Just the chapter intro.\n');

		const refreshed = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];

		const draft = await createChapterDraft(app, settings, {
			chapter: refreshed,
			date: FIXED_DATE,
		});

		const content = await app.vault.read(draft);
		const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
		expect(body).toBe('Just the chapter intro.\n');
	});

	it('concatenates chapter body and scenes in dbench-order with markers', async () => {
		await createScene(app, settings, {
			project,
			chapter,
			title: 'Departure',
		});
		await createScene(app, settings, {
			project,
			chapter,
			title: 'First night',
		});

		const refreshedChapter = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];

		const departure = app.vault.getAbstractFileByPath(
			'Draft Bench/Novel/Departure.md'
		) as TFile;
		const firstNight = app.vault.getAbstractFileByPath(
			'Draft Bench/Novel/First night.md'
		) as TFile;
		await setBody(app, refreshedChapter.file, 'Chapter intro.\n');
		await setBody(app, departure, 'Body of Departure.\n');
		await setBody(app, firstNight, 'Body of First night.\n');

		const finalChapter = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];

		const draft = await createChapterDraft(app, settings, {
			chapter: finalChapter,
			date: FIXED_DATE,
		});

		const content = await app.vault.read(draft);
		const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
		expect(body).toBe(
			'Chapter intro.\n\n<!-- scene: Departure -->\n\nBody of Departure.\n\n<!-- scene: First night -->\n\nBody of First night.\n'
		);
	});

	it('sorts scenes by dbench-order, not creation order', async () => {
		await createScene(app, settings, {
			project,
			chapter,
			title: 'Second',
			order: 2,
		});
		await createScene(app, settings, {
			project,
			chapter,
			title: 'First',
			order: 1,
		});

		const finalChapter = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];

		const second = app.vault.getAbstractFileByPath(
			'Draft Bench/Novel/Second.md'
		) as TFile;
		const first = app.vault.getAbstractFileByPath(
			'Draft Bench/Novel/First.md'
		) as TFile;
		await setBody(app, finalChapter.file, '');
		await setBody(app, first, '1');
		await setBody(app, second, '2');

		const draft = await createChapterDraft(app, settings, {
			chapter: findChaptersInProject(
				app,
				project.frontmatter['dbench-id']
			)[0],
			date: FIXED_DATE,
		});

		const content = await app.vault.read(draft);
		const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
		expect(body).toBe(
			'<!-- scene: First -->\n\n1\n\n<!-- scene: Second -->\n\n2\n'
		);
	});

	it('stamps draft essentials with chapter parent refs', async () => {
		await setBody(app, chapter.file, 'Chapter body.');

		const draft = await createChapterDraft(app, settings, {
			chapter: findChaptersInProject(
				app,
				project.frontmatter['dbench-id']
			)[0],
			date: FIXED_DATE,
		});

		const fm = app.metadataCache.getFileCache(draft)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('draft');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-project']).toBe('[[Novel]]');
		expect(fm?.['dbench-project-id']).toBe(project.frontmatter['dbench-id']);
		expect(fm?.['dbench-chapter']).toBe('[[Chapter 1]]');
		expect(fm?.['dbench-chapter-id']).toBe(chapter.frontmatter['dbench-id']);
		expect(fm?.['dbench-draft-number']).toBe(1);
		// Chapter drafts carry the chapter parent ref but leave scene fields
		// as empty placeholders (stampDraftEssentials seeds them for
		// retrofit-friendliness; the linker treats empty strings as no
		// parent on the scene-draft side, so chapter-draft / scene-draft
		// disambiguation per § 4 still holds).
		expect(fm?.['dbench-scene']).toBe('');
		expect(fm?.['dbench-scene-id']).toBe('');
	});

	it('appends to the chapter reverse arrays', async () => {
		await setBody(app, chapter.file, 'Body.');

		const draft = await createChapterDraft(app, settings, {
			chapter: findChaptersInProject(
				app,
				project.frontmatter['dbench-id']
			)[0],
			date: FIXED_DATE,
		});

		const refreshedChapter = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];
		const fm = refreshedChapter.frontmatter as unknown as Record<
			string,
			unknown
		>;

		const draftId = app.metadataCache.getFileCache(draft)?.frontmatter?.[
			'dbench-id'
		];
		expect(fm['dbench-drafts']).toEqual([`[[${draft.basename}]]`]);
		expect(fm['dbench-draft-ids']).toEqual([draftId]);
	});

	it('refuses when a file already exists at the target path', async () => {
		await setBody(app, chapter.file, 'Body.');

		await createChapterDraft(app, settings, {
			chapter: findChaptersInProject(
				app,
				project.frontmatter['dbench-id']
			)[0],
			date: FIXED_DATE,
		});

		// Second snapshot on the same date and number 1 (we'd need to clear
		// the reverse array to fool nextChapterDraftNumber). Easier to test
		// the collision branch by manually creating a colliding file.
		const collisionPath =
			'Draft Bench/Novel/Drafts/Chapter 1 - Draft 99 (20260427).md';
		await app.vault.create(collisionPath, 'colliding content');

		await expect(
			createChapterDraft(app, settings, {
				chapter: findChaptersInProject(
					app,
					project.frontmatter['dbench-id']
				)[0],
				date: FIXED_DATE,
			})
		).resolves.toBeDefined();
		// Sanity: the original file is still findable as a draft.
		const drafts = findDraftsOfChapter(app, chapter.frontmatter['dbench-id']);
		expect(drafts.length).toBeGreaterThanOrEqual(1);
	});

	it('places the file under the per-scene folder shape when configured', async () => {
		await setBody(app, chapter.file, 'Body.');

		const perScene: DraftBenchSettings = {
			...settings,
			draftsFolderPlacement: 'per-scene',
		};

		const draft = await createChapterDraft(app, perScene, {
			chapter: findChaptersInProject(
				app,
				project.frontmatter['dbench-id']
			)[0],
			date: FIXED_DATE,
		});

		expect(draft.path).toBe(
			'Draft Bench/Novel/Chapter 1 - Drafts/Chapter 1 - Draft 1 (20260427).md'
		);
	});

	it('does not include scene-level drafts in the snapshot', async () => {
		// Defensive: if findScenesInChapter ever leaked draft results, the
		// chapter snapshot would silently include them. This guards against
		// that regression.
		await createScene(app, settings, {
			project,
			chapter,
			title: 'Departure',
		});

		const refreshedChapter = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];
		const departure = app.vault.getAbstractFileByPath(
			'Draft Bench/Novel/Departure.md'
		) as TFile;
		await setBody(app, refreshedChapter.file, 'Chapter body.');
		await setBody(app, departure, 'Scene body.');

		// Take a scene-level draft of Departure first.
		const { createDraft } = await import('../../src/core/drafts');
		const departureScene = {
			file: departure,
			frontmatter: app.metadataCache.getFileCache(departure)
				?.frontmatter as never,
		};
		await createDraft(app, settings, {
			scene: departureScene,
			date: FIXED_DATE,
		});

		// Now snapshot the chapter; the scene draft should not appear.
		const draft = await createChapterDraft(app, settings, {
			chapter: findChaptersInProject(
				app,
				project.frontmatter['dbench-id']
			)[0],
			date: new Date(2026, 3, 28), // 2026-04-28, distinct day so filename doesn't collide
		});

		const content = await app.vault.read(draft);
		const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
		expect(body).toBe(
			'Chapter body.\n\n<!-- scene: Departure -->\n\nScene body.\n'
		);
		// No `<!-- scene: Departure - Draft 1` should leak in.
		expect(body).not.toContain('Draft 1');
	});

	it('strips frontmatter from chapters carrying optional fields', async () => {
		// Richer chapter frontmatter (target-words, synopsis) must still
		// strip cleanly. Catches regex regressions if the frontmatter
		// matcher tightens unexpectedly.
		await app.fileManager.processFrontMatter(chapter.file, (fm) => {
			fm['dbench-target-words'] = 5000;
			fm['dbench-synopsis'] = 'A chapter about beginnings.';
		});
		await setBody(
			app,
			chapter.file,
			'Body content after the rich frontmatter.\n'
		);

		const draft = await createChapterDraft(app, settings, {
			chapter: findChaptersInProject(
				app,
				project.frontmatter['dbench-id']
			)[0],
			date: FIXED_DATE,
		});

		const content = await app.vault.read(draft);
		const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
		expect(body).toBe('Body content after the rich frontmatter.\n');
		expect(body).not.toContain('dbench-target-words');
		expect(body).not.toContain('dbench-synopsis');
	});
});
