import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { CompileService } from '../../src/core/compile-service';
import type { CompilePresetNote } from '../../src/core/discovery';
import type { CompilePresetFrontmatter } from '../../src/model/compile-preset';
import type { SectionBreakStyle } from '../../src/model/scene';
import type { DbenchStatus } from '../../src/model/types';

/**
 * Seed a scene into the mock vault: stores the body content on the
 * file and populates the metadata cache with a fully-hydrated
 * SceneFrontmatter shape. Order and status default to sensible values
 * so individual tests only name what they care about.
 */
async function seedScene(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		order: number;
		body: string;
		status?: DbenchStatus;
		sectionBreakTitle?: string;
		sectionBreakStyle?: SectionBreakStyle;
	}
): Promise<TFile> {
	const file = await app.vault.create(options.path, options.body);
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
	if (options.sectionBreakTitle !== undefined) {
		fm['dbench-section-break-title'] = options.sectionBreakTitle;
	}
	if (options.sectionBreakStyle !== undefined) {
		fm['dbench-section-break-style'] = options.sectionBreakStyle;
	}
	app.metadataCache._setFrontmatter(file, fm);
	return file;
}

/**
 * Seed a chapter into the mock vault. Mirrors `seedScene`: stores an
 * (empty by default) body and populates the metadata cache with the
 * full chapter frontmatter shape. The chapter's body is unused by the
 * walker pre-Step-8-commit-3; bodies become relevant once the chapter
 * heading-scope rule lands.
 */
async function seedChapter(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		order: number;
		body?: string;
	}
): Promise<TFile> {
	const file = await app.vault.create(options.path, options.body ?? '');
	app.metadataCache._setFrontmatter(file, {
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
	});
	return file;
}

/**
 * Seed a scene that lives inside a chapter (chapter-aware project
 * shape). Mirrors `seedScene` plus the chapter linkage fields per
 * [chapter-type.md § 3](../../docs/planning/chapter-type.md).
 */
async function seedSceneInChapter(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		chapterId: string;
		chapterTitle: string;
		order: number;
		body: string;
		status?: DbenchStatus;
		sectionBreakTitle?: string;
		sectionBreakStyle?: SectionBreakStyle;
	}
): Promise<TFile> {
	const file = await app.vault.create(options.path, options.body);
	const fm: Record<string, unknown> = {
		'dbench-type': 'scene',
		'dbench-id': options.id,
		'dbench-project': `[[${options.projectTitle}]]`,
		'dbench-project-id': options.projectId,
		'dbench-chapter': `[[${options.chapterTitle}]]`,
		'dbench-chapter-id': options.chapterId,
		'dbench-order': options.order,
		'dbench-status': options.status ?? 'draft',
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	};
	if (options.sectionBreakTitle !== undefined) {
		fm['dbench-section-break-title'] = options.sectionBreakTitle;
	}
	if (options.sectionBreakStyle !== undefined) {
		fm['dbench-section-break-style'] = options.sectionBreakStyle;
	}
	app.metadataCache._setFrontmatter(file, fm);
	return file;
}

/**
 * Build a preset note with all-defaults frontmatter, letting the
 * caller override specific inclusion fields. The preset file itself
 * isn't written to the mock vault — `CompileService` only reads
 * `preset.frontmatter`, not `preset.file`, so the TFile stub is
 * sufficient.
 */
function makePreset(
	overrides: Partial<CompilePresetFrontmatter> & {
		name?: string;
		projectId: string;
	}
): CompilePresetNote {
	const name = overrides.name ?? 'Workshop';
	const file = new TFile({
		path: `Compile Presets/${name}.md`,
		basename: name,
		extension: 'md',
		stat: { mtime: 0, ctime: 0, size: 0 },
	});
	const frontmatter: CompilePresetFrontmatter = {
		'dbench-type': 'compile-preset',
		'dbench-id': 'prs-001-tst-001',
		'dbench-project': '[[Novel]]',
		'dbench-project-id': overrides.projectId,
		'dbench-schema-version': 1,
		'dbench-compile-title': '',
		'dbench-compile-subtitle': '',
		'dbench-compile-author': '',
		'dbench-compile-date-format': 'iso',
		'dbench-compile-scene-source': 'auto',
		'dbench-compile-scene-statuses': [],
		'dbench-compile-scene-excludes': [],
		'dbench-compile-format': 'md',
		'dbench-compile-output': 'vault',
		'dbench-compile-page-size': 'letter',
		'dbench-compile-include-cover': false,
		'dbench-compile-include-toc': false,
		'dbench-compile-chapter-numbering': 'none',
		'dbench-compile-include-section-breaks': true,
		'dbench-compile-heading-scope': 'draft',
		'dbench-compile-frontmatter': 'strip',
		'dbench-compile-wikilinks': 'display-text',
		'dbench-compile-embeds': 'strip',
		'dbench-compile-dinkuses': 'preserve',
		'dbench-last-compiled-at': '',
		'dbench-last-output-path': '',
		'dbench-last-chapter-hashes': [],
		...overrides,
	};
	return { file, frontmatter };
}

describe('CompileService.generate', () => {
	let app: App;
	let service: CompileService;
	const projectId = 'prj-001-tst-001';

	beforeEach(() => {
		app = new App();
		service = new CompileService(app);
	});

	it('concatenates scene bodies in dbench-order with a blank line between them', async () => {
		await seedScene(app, {
			path: 'Novel/Opening.md',
			id: 'sc1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Opening prose.',
		});
		await seedScene(app, {
			path: 'Novel/Middle.md',
			id: 'sc2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Middle prose.',
		});
		await seedScene(app, {
			path: 'Novel/Closing.md',
			id: 'sc3-003-tst-003',
			projectId,
			projectTitle: 'Novel',
			order: 3,
			body: 'Closing prose.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Opening\n\nOpening prose.\n\n' +
				'# Middle\n\nMiddle prose.\n\n' +
				'# Closing\n\nClosing prose.'
		);
		expect(result.scenesCompiled).toBe(3);
		expect(result.scenesSkipped).toBe(0);
		expect(result.warnings).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('orders by dbench-order regardless of creation order', async () => {
		await seedScene(app, {
			path: 'Novel/C.md',
			id: 'sc-c-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 3,
			body: 'Third.',
		});
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'First.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-003',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Second.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# A\n\nFirst.\n\n# B\n\nSecond.\n\n# C\n\nThird.'
		);
	});

	it('strips YAML frontmatter from scene bodies before concatenation', async () => {
		await seedScene(app, {
			path: 'Novel/Opening.md',
			id: 'sc1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: '---\ndbench-type: scene\ndbench-order: 1\n---\n\nProse after the fence.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# Opening\n\nProse after the fence.');
		expect(result.scenesCompiled).toBe(1);
	});

	it('warns and returns empty markdown when the preset has no project link', async () => {
		const preset = makePreset({ projectId: '' });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('');
		expect(result.scenesCompiled).toBe(0);
		expect(result.scenesSkipped).toBe(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/no project link/);
	});

	it('warns and returns empty markdown when the project has no scenes', async () => {
		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('');
		expect(result.scenesCompiled).toBe(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/no scenes/);
	});

	it('applies a non-empty status filter, keeping only matching scenes', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Final A.',
			status: 'final',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Draft B.',
			status: 'draft',
		});
		await seedScene(app, {
			path: 'Novel/C.md',
			id: 'sc-c-tst-003',
			projectId,
			projectTitle: 'Novel',
			order: 3,
			body: 'Final C.',
			status: 'final',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-statuses': ['final'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nFinal A.\n\n# C\n\nFinal C.');
		expect(result.scenesCompiled).toBe(2);
		expect(result.scenesSkipped).toBe(1);
	});

	it('excludes scenes with missing or empty status when the filter is active (strict match)', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Final A.',
			status: 'final',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'No status B.',
			status: '',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-statuses': ['final'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nFinal A.');
		expect(result.scenesCompiled).toBe(1);
		expect(result.scenesSkipped).toBe(1);
	});

	it('drops scenes named in the exclude list (wikilink form)', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'B.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-excludes': ['[[B]]'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nA.');
		expect(result.scenesSkipped).toBe(1);
	});

	it('drops scenes named in the exclude list (bare basename form)', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'B.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-excludes': ['B'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nA.');
		expect(result.scenesSkipped).toBe(1);
	});

	it('warns when filters eliminate every scene', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
			status: 'draft',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-statuses': ['final'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('');
		expect(result.scenesCompiled).toBe(0);
		expect(result.scenesSkipped).toBe(1);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/filtered out all/);
	});

	it('only includes scenes from the preset\'s project, ignoring other projects', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Novel scene.',
		});
		await seedScene(app, {
			path: 'Other/X.md',
			id: 'sc-x-tst-002',
			projectId: 'prj-other-tst-999',
			projectTitle: 'Other',
			order: 1,
			body: 'Other-project scene.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nNovel scene.');
		expect(result.scenesCompiled).toBe(1);
	});

	it('renumbers footnotes continuously across scenes', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Scene A[^1] mentions[^2].\n\n[^1]: First.\n[^2]: Second.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Scene B[^1] stands alone.\n\n[^1]: B-only.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		// A's [^1] / [^2] -> [^1] / [^2]; B's [^1] -> [^3] (continues
		// from A's offset).
		expect(result.markdown).toContain('Scene A[^1] mentions[^2].');
		expect(result.markdown).toContain('[^1]: First.');
		expect(result.markdown).toContain('[^2]: Second.');
		expect(result.markdown).toContain('Scene B[^3] stands alone.');
		expect(result.markdown).toContain('[^3]: B-only.');
	});

	it('injects a section break before a scene that declares one', async () => {
		await seedScene(app, {
			path: 'Novel/Opening.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Opening prose.',
		});
		await seedScene(app, {
			path: 'Novel/Afternoon.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Afternoon prose.',
			sectionBreakTitle: 'Part II',
			sectionBreakStyle: 'visual',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Opening\n\nOpening prose.\n\n' +
				'* * *\n\n**Part II**\n\n* * *\n\n' +
				'# Afternoon\n\nAfternoon prose.'
		);
	});

	it('suppresses all section breaks when the preset toggles them off', async () => {
		await seedScene(app, {
			path: 'Novel/Opening.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Opening prose.',
			sectionBreakTitle: 'Part I',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-include-section-breaks': false,
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# Opening\n\nOpening prose.');
	});

	it('populates chapterHashes for every successfully-read scene', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'First.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Second.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.chapterHashes).toHaveLength(2);
		expect(result.chapterHashes[0]).toMatch(
			/^sc-a-tst-001:[0-9a-f]{8}$/
		);
		expect(result.chapterHashes[1]).toMatch(
			/^sc-b-tst-002:[0-9a-f]{8}$/
		);
		// Hashes differ because bodies differ.
		expect(result.chapterHashes[0]).not.toBe(result.chapterHashes[1]);
	});

	it('aggregates stripSummary counts across all scenes (P3.F)', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Prose ![[pic.png]] and ![[photo.jpg]] and ![[clip.mp3]].',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'More ![[diagram.svg]] and ![[view.base]] and ![[Some Note]].',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		// A: 2 images + 1 audio; B: 1 image + 1 base + 1 note. Totals: 3 img, 1 audio, 1 base, 1 note.
		expect(result.stripSummary.counts.image).toBe(3);
		expect(result.stripSummary.counts.audio).toBe(1);
		expect(result.stripSummary.counts.base).toBe(1);
		expect(result.stripSummary.counts.note).toBe(1);
		expect(result.stripSummary.counts.video).toBe(0);
		expect(result.stripSummary.counts.pdf).toBe(0);
		expect(result.stripSummary.total).toBe(6);
	});

	it('returns a zero stripSummary when no embeds were encountered', async () => {
		await seedScene(app, {
			path: 'Novel/Clean.md',
			id: 'sc-clean',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Pure prose with no embeds.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.stripSummary.total).toBe(0);
	});

	it('slices scene bodies to the draft section by default (rule 1 integration)', async () => {
		await seedScene(app, {
			path: 'Novel/Opening.md',
			id: 'sc1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body:
				'# Source passages\nplanning notes\n' +
				'# Beat outline\nmore planning\n' +
				'## Draft\nThe actual prose.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# Opening\n\nThe actual prose.');
	});
});

describe('CompileService.generate — chapter-aware dispatch (Step 8)', () => {
	let app: App;
	let service: CompileService;
	const projectId = 'prj-001-tst-001';

	beforeEach(() => {
		app = new App();
		service = new CompileService(app);
	});

	it('walks chapter -> scene order when the project has any chapters', async () => {
		await seedChapter(app, {
			path: 'Novel/Chapter 1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedChapter(app, {
			path: 'Novel/Chapter 2.md',
			id: 'ch2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 1/Scene A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Chapter 1',
			order: 1,
			body: 'Chapter 1 scene A.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 2/Scene B.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Chapter 2',
			order: 1,
			body: 'Chapter 2 scene B.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		// Per-scene H1 emission unchanged in commit 2; chapter heading
		// emission lands in commit 3.
		expect(result.markdown).toBe(
			'# Scene A\n\nChapter 1 scene A.\n\n' +
				'# Scene B\n\nChapter 2 scene B.'
		);
		expect(result.scenesCompiled).toBe(2);
		expect(result.scenesSkipped).toBe(0);
	});

	it('respects chapter dbench-order across creation order', async () => {
		// Seed chapter 2 first to prove ordering is by dbench-order, not
		// insertion order.
		await seedChapter(app, {
			path: 'Novel/Two.md',
			id: 'ch2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
		});
		await seedChapter(app, {
			path: 'Novel/One.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Two/Second scene.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Two',
			order: 1,
			body: 'Second.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/One/First scene.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'One',
			order: 1,
			body: 'First.',
		});

		const result = await service.generate(makePreset({ projectId }));

		expect(result.markdown).toBe(
			'# First scene\n\nFirst.\n\n# Second scene\n\nSecond.'
		);
	});

	it('orders scenes within a chapter by dbench-order', async () => {
		await seedChapter(app, {
			path: 'Novel/Only.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Only/Third.md',
			id: 'scc-003-tst-003',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Only',
			order: 3,
			body: 'Third.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Only/First.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Only',
			order: 1,
			body: 'First.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Only/Second.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Only',
			order: 2,
			body: 'Second.',
		});

		const result = await service.generate(makePreset({ projectId }));

		expect(result.markdown).toBe(
			'# First\n\nFirst.\n\n# Second\n\nSecond.\n\n# Third\n\nThird.'
		);
	});

	it('counts scenesSkipped across all chapters when the status filter drops some', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedChapter(app, {
			path: 'Novel/Ch2.md',
			id: 'ch2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/Kept1.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: 'Kept one.',
			status: 'final',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/Skipped.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 2,
			body: 'Skipped.',
			status: 'idea',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch2/Kept2.md',
			id: 'scc-003-tst-003',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Ch2',
			order: 1,
			body: 'Kept two.',
			status: 'final',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-statuses': ['final'],
		});
		const result = await service.generate(preset);

		expect(result.scenesCompiled).toBe(2);
		expect(result.scenesSkipped).toBe(1);
		expect(result.markdown).toBe(
			'# Kept1\n\nKept one.\n\n# Kept2\n\nKept two.'
		);
	});

	it('warns and returns empty when chapters exist but contain no scenes', async () => {
		await seedChapter(app, {
			path: 'Novel/Empty.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});

		const result = await service.generate(makePreset({ projectId }));

		expect(result.markdown).toBe('');
		expect(result.scenesCompiled).toBe(0);
		expect(result.scenesSkipped).toBe(0);
		expect(result.warnings).toEqual([
			'Project has no scenes; preset "Workshop" compiles to an empty document.',
		]);
	});

	it('warns when filters eliminate every scene across all chapters', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: 'A.',
			status: 'idea',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/B.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 2,
			body: 'B.',
			status: 'idea',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-statuses': ['final'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('');
		expect(result.scenesSkipped).toBe(2);
		expect(result.warnings).toEqual([
			'Preset "Workshop" filtered out all 2 scenes; nothing to compile.',
		]);
	});

	it('renumbers footnotes continuously across chapters', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedChapter(app, {
			path: 'Novel/Ch2.md',
			id: 'ch2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: 'First scene[^a].\n\n[^a]: A note.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch2/B.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Ch2',
			order: 1,
			body: 'Second scene[^b].\n\n[^b]: B note.',
		});

		const result = await service.generate(makePreset({ projectId }));

		// Footnotes should renumber to [^1] in chapter 1's scene and
		// [^2] in chapter 2's scene — proving the offset spans chapters.
		expect(result.markdown).toContain('First scene[^1].');
		expect(result.markdown).toContain('[^1]: A note.');
		expect(result.markdown).toContain('Second scene[^2].');
		expect(result.markdown).toContain('[^2]: B note.');
	});

	it('emits an error marker for an unreadable scene in a chapter without halting the rest', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		const goodFile = await seedSceneInChapter(app, {
			path: 'Novel/Ch1/Good.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: 'Good prose.',
		});
		const badFile = await seedSceneInChapter(app, {
			path: 'Novel/Ch1/Broken.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 2,
			body: '',
		});
		// Force a read error on the second scene.
		const originalRead = app.vault.read.bind(app.vault);
		app.vault.read = async (file: TFile): Promise<string> => {
			if (file.path === badFile.path) {
				throw new Error('Disk fault');
			}
			return originalRead(file);
		};

		const result = await service.generate(makePreset({ projectId }));

		expect(result.scenesCompiled).toBe(1);
		expect(result.errors).toEqual([
			{ scenePath: badFile.path, message: 'Disk fault' },
		]);
		expect(result.markdown).toContain('# Good\n\nGood prose.');
		expect(result.markdown).toContain(
			'<!-- Draft Bench: failed to read "Broken": Disk fault -->'
		);
		// The good file still got read; ensure we didn't short-circuit
		// the whole chapter.
		expect(goodFile.path).toBe('Novel/Ch1/Good.md');
	});

	it('silently skips scenes orphaned at the project level (no dbench-chapter-id) in chapter-aware mode', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/Inside.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: 'Inside chapter.',
		});
		// Direct project scene (no chapter linkage). Per § 9 mixed-children
		// rule this shouldn't exist; the integrity service catches it via
		// PROJECT_MIXED_CHILDREN. The compile walker silently ignores it
		// rather than guessing a fallback emission point.
		await seedScene(app, {
			path: 'Novel/Orphan.md',
			id: 'scz-999-tst-999',
			projectId,
			projectTitle: 'Novel',
			order: 99,
			body: 'Orphan should not appear.',
		});

		const result = await service.generate(makePreset({ projectId }));

		expect(result.markdown).toBe('# Inside\n\nInside chapter.');
		expect(result.markdown).not.toContain('Orphan');
		expect(result.scenesCompiled).toBe(1);
	});
});

describe('CompileService.generate — chapter wikilink excludes (Step 8)', () => {
	let app: App;
	let service: CompileService;
	const projectId = 'prj-001-tst-001';

	beforeEach(() => {
		app = new App();
		service = new CompileService(app);
	});

	async function seedTwoChapterProject(): Promise<void> {
		await seedChapter(app, {
			path: 'Novel/Chapter 1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: '## Draft\nChapter 1 intro.',
		});
		await seedChapter(app, {
			path: 'Novel/Chapter 2.md',
			id: 'ch2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: '## Draft\nChapter 2 intro.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 1/A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Chapter 1',
			order: 1,
			body: '## Draft\nA prose.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 1/B.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Chapter 1',
			order: 2,
			body: '## Draft\nB prose.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 2/C.md',
			id: 'scc-003-tst-003',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Chapter 2',
			order: 1,
			body: '## Draft\nC prose.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 2/D.md',
			id: 'scd-004-tst-004',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Chapter 2',
			order: 2,
			body: '## Draft\nD prose.',
		});
	}

	it('drops a chapter heading + intro + all child scenes when its wikilink is in excludes', async () => {
		await seedTwoChapterProject();

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
			'dbench-compile-scene-excludes': ['[[Chapter 1]]'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Chapter 2\n\nChapter 2 intro.\n\nC prose.\n\nD prose.'
		);
		expect(result.markdown).not.toContain('Chapter 1');
		expect(result.markdown).not.toContain('A prose.');
		expect(result.markdown).not.toContain('B prose.');
	});

	it('accepts a bare chapter basename (no wikilink brackets) as an exclude entry', async () => {
		await seedTwoChapterProject();

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
			'dbench-compile-scene-excludes': ['Chapter 1'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Chapter 2\n\nChapter 2 intro.\n\nC prose.\n\nD prose.'
		);
	});

	it('counts an excluded chapter\'s scenes toward scenesSkipped', async () => {
		await seedTwoChapterProject();

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
			'dbench-compile-scene-excludes': ['[[Chapter 1]]'],
		});
		const result = await service.generate(preset);

		// Chapter 1 had 2 scenes (A, B); both are skipped via the
		// chapter exclude. Chapter 2 has 2 surviving scenes (C, D).
		expect(result.scenesCompiled).toBe(2);
		expect(result.scenesSkipped).toBe(2);
	});

	it('mixes chapter and scene excludes in the same list', async () => {
		await seedTwoChapterProject();

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
			// Drop chapter 1 entirely AND scene C inside chapter 2.
			// Chapter 2 still has D, so it survives.
			'dbench-compile-scene-excludes': ['[[Chapter 1]]', '[[C]]'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# Chapter 2\n\nChapter 2 intro.\n\nD prose.');
		expect(result.scenesCompiled).toBe(1);
		// 2 from chapter 1 + scene C = 3 skipped; 4 total scenes.
		expect(result.scenesSkipped).toBe(3);
	});

	it('warns when every chapter is excluded', async () => {
		await seedTwoChapterProject();

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
			'dbench-compile-scene-excludes': ['[[Chapter 1]]', '[[Chapter 2]]'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('');
		expect(result.scenesSkipped).toBe(4);
		expect(result.warnings).toEqual([
			'Preset "Workshop" filtered out all 4 scenes; nothing to compile.',
		]);
	});

	it('honors chapter excludes in heading-scope=draft on a chapter-aware project too (not just chapter mode)', async () => {
		await seedTwoChapterProject();

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'draft',
			'dbench-compile-scene-excludes': ['[[Chapter 1]]'],
		});
		const result = await service.generate(preset);

		// Chapter 1 dropped; chapter 2's two scenes emit with scene
		// H1s (heading-scope=draft suppresses chapter heading emission).
		expect(result.markdown).toBe('# C\n\nC prose.\n\n# D\n\nD prose.');
		expect(result.markdown).not.toContain('# Chapter');
	});

	it('treats a chapter wikilink as a no-op on chapter-less projects (nothing matches)', async () => {
		// Flat project with two scenes; an exclude entry pointing to a
		// chapter that doesn't exist should be inert. Pre-Step-8
		// behavior preserved.
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'B.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-excludes': ['[[Chapter 1]]'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nA.\n\n# B\n\nB.');
		expect(result.scenesCompiled).toBe(2);
		expect(result.scenesSkipped).toBe(0);
	});

	it('still excludes scenes by basename in chapter-aware mode (existing scene-exclude semantic preserved)', async () => {
		await seedTwoChapterProject();

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
			'dbench-compile-scene-excludes': ['[[B]]'],
		});
		const result = await service.generate(preset);

		// Chapter 1 keeps its heading + intro + scene A (not B).
		// Chapter 2 keeps its heading + intro + C + D.
		expect(result.markdown).toBe(
			'# Chapter 1\n\nChapter 1 intro.\n\nA prose.\n\n' +
				'# Chapter 2\n\nChapter 2 intro.\n\nC prose.\n\nD prose.'
		);
		expect(result.scenesCompiled).toBe(3);
		expect(result.scenesSkipped).toBe(1);
	});

	it('skips a chapter whose only scene was filtered out (no dangling chapter heading)', async () => {
		// Chapter 1 has 1 scene that gets filtered by the status filter;
		// Chapter 2 has 1 scene that survives. Chapter 1 should not
		// emit a heading since it has no surviving prose under it.
		await seedChapter(app, {
			path: 'Novel/Empty Chapter.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: '## Draft\nWould-be intro.',
		});
		await seedChapter(app, {
			path: 'Novel/Surviving Chapter.md',
			id: 'ch2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: '## Draft\nKept intro.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Empty Chapter/Drafty.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Empty Chapter',
			order: 1,
			body: '## Draft\nDrafty prose.',
			status: 'idea',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Surviving Chapter/Final.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Surviving Chapter',
			order: 1,
			body: '## Draft\nFinal prose.',
			status: 'final',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
			'dbench-compile-scene-statuses': ['final'],
			'dbench-compile-chapter-numbering': 'numeric',
		});
		const result = await service.generate(preset);

		// "Empty Chapter" doesn't emit at all; numbering reflects only
		// the chapters that actually emit (Surviving = #1).
		expect(result.markdown).toBe(
			'# 1. Surviving Chapter\n\nKept intro.\n\nFinal prose.'
		);
		expect(result.markdown).not.toContain('Empty Chapter');
		expect(result.markdown).not.toContain('Would-be intro');
		expect(result.scenesCompiled).toBe(1);
		expect(result.scenesSkipped).toBe(1);
	});
});

describe("CompileService.generate — chapter heading-scope ('chapter' mode, Step 8)", () => {
	let app: App;
	let service: CompileService;
	const projectId = 'prj-001-tst-001';

	beforeEach(() => {
		app = new App();
		service = new CompileService(app);
	});

	it('emits one H1 per chapter and concatenates scene drafts beneath, with no scene H1s', async () => {
		await seedChapter(app, {
			path: 'Novel/Chapter 1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 1/Scene A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Chapter 1',
			order: 1,
			body: '## Draft\nScene A prose.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 1/Scene B.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Chapter 1',
			order: 2,
			body: '## Draft\nScene B prose.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Chapter 1\n\nScene A prose.\n\nScene B prose.'
		);
		expect(result.markdown).not.toContain('# Scene A');
		expect(result.markdown).not.toContain('# Scene B');
	});

	it('emits the chapter intro between heading and first scene when the chapter draft is non-empty', async () => {
		await seedChapter(app, {
			path: 'Novel/Chapter 1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body:
				'# Source passages\nresearch\n## Draft\nA framing epigraph.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 1/Scene A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Chapter 1',
			order: 1,
			body: '## Draft\nScene A prose.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Chapter 1\n\nA framing epigraph.\n\nScene A prose.'
		);
	});

	it('omits the chapter intro entirely when the chapter draft slice is empty', async () => {
		await seedChapter(app, {
			path: 'Novel/Chapter 1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			// No `## Draft` heading -> sliceToDraft returns the whole
			// body, but the body is just planning sections; in the
			// common case writers leave `## Draft` blank.
			body: '## Draft\n',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Chapter 1/Scene A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Chapter 1',
			order: 1,
			body: '## Draft\nScene A prose.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# Chapter 1\n\nScene A prose.');
	});

	it('suppresses section breaks before the first scene of each chapter (chapter heading is the break)', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedChapter(app, {
			path: 'Novel/Ch2.md',
			id: 'ch2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
		});
		// Both first scenes have a section-break-title declared.
		// Without suppression, output would awkwardly contain a
		// section break right after each chapter heading.
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: '## Draft\nA.',
			sectionBreakTitle: 'Wrong place',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/B.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 2,
			body: '## Draft\nB.',
			sectionBreakTitle: 'Mid chapter',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch2/C.md',
			id: 'scc-003-tst-003',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Ch2',
			order: 1,
			body: '## Draft\nC.',
			sectionBreakTitle: 'Also wrong',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
		});
		const result = await service.generate(preset);

		// Chapter 1: heading -> A (no break) -> mid-chapter break -> B
		// Chapter 2: heading -> C (no break)
		expect(result.markdown).not.toContain('Wrong place');
		expect(result.markdown).not.toContain('Also wrong');
		expect(result.markdown).toContain('Mid chapter');
	});

	it('applies numeric chapter numbering to the chapter heading', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedChapter(app, {
			path: 'Novel/Ch2.md',
			id: 'ch2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: '## Draft\nA.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch2/B.md',
			id: 'scb-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch2-002-tst-002',
			chapterTitle: 'Ch2',
			order: 1,
			body: '## Draft\nB.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
			'dbench-compile-chapter-numbering': 'numeric',
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# 1. Ch1\n\nA.\n\n# 2. Ch2\n\nB.'
		);
	});

	it('keeps walking chapter -> scene order when heading-scope=draft on a chapter-aware project (no chapter headings, scene H1s present)', async () => {
		// Dispatch is independent of heading-scope: chapters get walked
		// because the project has chapters, but with heading-scope=draft
		// the chapter walker emits scene H1s and no chapter headings —
		// equivalent to the writer overriding chapter mode.
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: 'A.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'draft',
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nA.');
		expect(result.markdown).not.toContain('# Ch1');
	});

	it('emits an error marker for an unreadable chapter file without halting the chapter or compile', async () => {
		const ch = await seedChapter(app, {
			path: 'Novel/Broken Chapter.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Broken Chapter/Scene A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Broken Chapter',
			order: 1,
			body: '## Draft\nScene survives.',
		});
		const originalRead = app.vault.read.bind(app.vault);
		app.vault.read = async (file: TFile): Promise<string> => {
			if (file.path === ch.path) throw new Error('Disk fault');
			return originalRead(file);
		};

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
		});
		const result = await service.generate(preset);

		expect(result.errors).toContainEqual({
			scenePath: ch.path,
			message: 'Disk fault',
		});
		expect(result.markdown).toContain(
			'<!-- Draft Bench: failed to read chapter "Broken Chapter": Disk fault -->'
		);
		// Scene still compiles even though chapter intro failed.
		expect(result.scenesCompiled).toBe(1);
		expect(result.markdown).toContain('Scene survives.');
		// Heading still emitted.
		expect(result.markdown).toContain('# Broken Chapter');
	});

	it('renumbers footnotes continuously across chapter intros and scene drafts', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: '## Draft\nIntro[^a].\n\n[^a]: Intro note.',
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/A.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: '## Draft\nScene[^b].\n\n[^b]: Scene note.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
		});
		const result = await service.generate(preset);

		// Intro consumes footnote 1; scene consumes footnote 2.
		expect(result.markdown).toContain('Intro[^1].');
		expect(result.markdown).toContain('[^1]: Intro note.');
		expect(result.markdown).toContain('Scene[^2].');
		expect(result.markdown).toContain('[^2]: Scene note.');
	});
});

describe('CompileService.generate — sub-scene descent (Step 8 / sub-scene-type § 7)', () => {
	let app: App;
	let service: CompileService;
	const projectId = 'prj-001-tst-001';

	beforeEach(() => {
		app = new App();
		service = new CompileService(app);
	});

	async function seedSubScene(
		options: {
			path: string;
			id: string;
			projectTitle: string;
			projectId: string;
			sceneId: string;
			sceneTitle: string;
			order: number;
			body: string;
			status?: DbenchStatus;
		}
	): Promise<TFile> {
		const file = await app.vault.create(options.path, options.body);
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'sub-scene',
			'dbench-id': options.id,
			'dbench-project': `[[${options.projectTitle}]]`,
			'dbench-project-id': options.projectId,
			'dbench-scene': `[[${options.sceneTitle}]]`,
			'dbench-scene-id': options.sceneId,
			'dbench-order': options.order,
			'dbench-status': options.status ?? 'draft',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		return file;
	}

	it('flat (draft) mode: hierarchical scene emits H1 + intro + sub-scene H2s', async () => {
		await seedScene(app, {
			path: 'Drift/The auction.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			order: 1,
			body: '## Draft\nIntro paragraph.',
		});
		await seedSubScene({
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 1,
			body: '## Draft\nLot 47 prose.',
		});
		await seedSubScene({
			path: 'Drift/The auction/Bidding war.md',
			id: 'sub-002-tst-002',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 2,
			body: '## Draft\nBidding war prose.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# The auction\n\nIntro paragraph.\n\n## Lot 47\n\nLot 47 prose.\n\n## Bidding war\n\nBidding war prose.'
		);
	});

	it('flat (draft) mode: hierarchical scene with empty intro emits scene H1 then sub-scenes directly', async () => {
		await seedScene(app, {
			path: 'Drift/The auction.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			order: 1,
			body: '## Draft\n', // empty intro
		});
		await seedSubScene({
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 1,
			body: '## Draft\nLot 47 prose.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# The auction\n\n## Lot 47\n\nLot 47 prose.'
		);
	});

	it('flat mode: sub-scene-less scenes still render with H1 + body (mixed shape)', async () => {
		// Hierarchical scene first
		await seedScene(app, {
			path: 'Drift/The auction.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			order: 1,
			body: '## Draft\n',
		});
		await seedSubScene({
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 1,
			body: '## Draft\nLot 47.',
		});
		// Flat scene second
		await seedScene(app, {
			path: 'Drift/Reception.md',
			id: 'sca-002-tst-002',
			projectId,
			projectTitle: 'Drift',
			order: 2,
			body: '## Draft\nReception prose.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# The auction\n\n## Lot 47\n\nLot 47.\n\n# Reception\n\nReception prose.'
		);
	});

	it('chapter mode: hierarchical scene emits H2 + intro + sub-scene H3s under chapter H1', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/The auction.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: '## Draft\nScene intro paragraph.',
		});
		await seedSubScene({
			path: 'Novel/Ch1/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectTitle: 'Novel',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 1,
			body: '## Draft\nLot 47 prose.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Ch1\n\n## The auction\n\nScene intro paragraph.\n\n### Lot 47\n\nLot 47 prose.'
		);
	});

	it('chapter mode: sub-scene-less scenes in chapter still suppress scene heading', async () => {
		await seedChapter(app, {
			path: 'Novel/Ch1.md',
			id: 'ch1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
		});
		// Hierarchical scene
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/Tall.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 1,
			body: '## Draft\n',
		});
		await seedSubScene({
			path: 'Novel/Ch1/Tall/Beat.md',
			id: 'sub-001-tst-001',
			projectTitle: 'Novel',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'Tall',
			order: 1,
			body: '## Draft\nBeat prose.',
		});
		// Flat scene
		await seedSceneInChapter(app, {
			path: 'Novel/Ch1/Flat.md',
			id: 'sca-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			chapterId: 'ch1-001-tst-001',
			chapterTitle: 'Ch1',
			order: 2,
			body: '## Draft\nFlat scene prose.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-heading-scope': 'chapter',
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Ch1\n\n## Tall\n\n### Beat\n\nBeat prose.\n\nFlat scene prose.'
		);
		// Flat scene must NOT get its own heading.
		expect(result.markdown).not.toContain('## Flat');
		expect(result.markdown).not.toContain('# Flat');
	});

	it('sub-scenes in dbench-compile-scene-excludes are filtered out (basename match)', async () => {
		await seedScene(app, {
			path: 'Drift/The auction.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			order: 1,
			body: '## Draft\n',
		});
		await seedSubScene({
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 1,
			body: '## Draft\nLot 47.',
		});
		await seedSubScene({
			path: 'Drift/The auction/Bidding war.md',
			id: 'sub-002-tst-002',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 2,
			body: '## Draft\nBidding war.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-excludes': ['[[Lot 47]]'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toContain('## Bidding war');
		expect(result.markdown).not.toContain('## Lot 47');
		expect(result.markdown).not.toContain('Lot 47.');
	});

	it('sub-scene reads contribute hashes to chapterHashes (change detection)', async () => {
		await seedScene(app, {
			path: 'Drift/The auction.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			order: 1,
			body: '## Draft\n',
		});
		await seedSubScene({
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 1,
			body: '## Draft\nLot 47.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		// Sub-scene id appears in chapterHashes (the per-unit hash array
		// the compile state writes back to dbench-last-chapter-hashes).
		expect(result.chapterHashes.some((h) => h.startsWith('sub-001-tst-001:'))).toBe(true);
	});

	it('scenesCompiled counts sub-scenes (each as one unit)', async () => {
		await seedScene(app, {
			path: 'Drift/The auction.md',
			id: 'sca-001-tst-001',
			projectId,
			projectTitle: 'Drift',
			order: 1,
			body: '## Draft\n',
		});
		await seedSubScene({
			path: 'Drift/The auction/Lot 47.md',
			id: 'sub-001-tst-001',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 1,
			body: '## Draft\nA.',
		});
		await seedSubScene({
			path: 'Drift/The auction/Bidding war.md',
			id: 'sub-002-tst-002',
			projectTitle: 'Drift',
			projectId,
			sceneId: 'sca-001-tst-001',
			sceneTitle: 'The auction',
			order: 2,
			body: '## Draft\nB.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		// Two sub-scenes processed as units; the parent scene's intro
		// (empty) doesn't increment the counter (mirrors processChapterIntro).
		expect(result.scenesCompiled).toBe(2);
	});
});
