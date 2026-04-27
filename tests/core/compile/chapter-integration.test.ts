import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { CompileService } from '../../../src/core/compile-service';
import type { CompilePresetNote } from '../../../src/core/discovery';
import type {
	CompilePresetFrontmatter,
	CompileChapterNumbering,
	CompileHeadingScope,
} from '../../../src/model/compile-preset';
import type { DbenchStatus } from '../../../src/model/types';

/**
 * Step 8 of chapter-type — full-pipeline integration tests.
 *
 * These exercise the whole compile path against a single richer
 * fixture (2 chapters, 5 scenes, intros, footnotes, a section-break
 * decoration). Per-unit behavior is covered in `compile-service.test.ts`
 * and `chapter-rules.test.ts`; this file's job is to catch
 * interactions the unit tests can't see by varying preset config
 * against the same vault state and asserting full markdown output.
 *
 * Fixture: "The Salt Road"
 *
 *   Chapter 1 — "The Departure" (order 1, intro present)
 *     Scene 1.1 "Setting Out"   (final)
 *     Scene 1.2 "First Camp"    (draft, section-break-title)
 *     Scene 1.3 "Star Above"    (final, has footnote [^a])
 *   Chapter 2 — "Across the Salt" (order 2, intro empty)
 *     Scene 2.1 "The Crossing"  (final, has footnote [^b])
 *     Scene 2.2 "Arrival"       (draft)
 */

const projectId = 'prj-salt-road-001';

interface FixtureFiles {
	chapter1: TFile;
	chapter2: TFile;
	scene11: TFile;
	scene12: TFile;
	scene13: TFile;
	scene21: TFile;
	scene22: TFile;
}

async function seedSaltRoad(app: App): Promise<FixtureFiles> {
	const chapter1 = await seedChapter(app, {
		path: 'Salt Road/The Departure.md',
		id: 'ch1-departure',
		order: 1,
		body:
			'# Beat outline\nplanning notes\n## Draft\nThe wagons were loaded before dawn.',
	});
	const chapter2 = await seedChapter(app, {
		path: 'Salt Road/Across the Salt.md',
		id: 'ch2-across',
		order: 2,
		body: '## Draft\n',
	});
	const scene11 = await seedScene(app, {
		path: 'Salt Road/The Departure/Setting Out.md',
		id: 'sc-11',
		chapterId: 'ch1-departure',
		chapterTitle: 'The Departure',
		order: 1,
		status: 'final',
		body: '## Draft\nThey set out on the eastern road.',
	});
	const scene12 = await seedScene(app, {
		path: 'Salt Road/The Departure/First Camp.md',
		id: 'sc-12',
		chapterId: 'ch1-departure',
		chapterTitle: 'The Departure',
		order: 2,
		status: 'draft',
		body: '## Draft\nThe first camp huddled against the wind.',
		// `dbench-section-break-title` is a label rendered between
		// dinkuses ("* * *\n\n**Title**\n\n* * *"), not the break
		// glyph. Realistic writer usage is a time/place marker.
		sectionBreakTitle: 'Three days later',
	});
	const scene13 = await seedScene(app, {
		path: 'Salt Road/The Departure/Star Above.md',
		id: 'sc-13',
		chapterId: 'ch1-departure',
		chapterTitle: 'The Departure',
		order: 3,
		status: 'final',
		body: '## Draft\nA single star burned[^a].\n\n[^a]: A scout\'s sign.',
	});
	const scene21 = await seedScene(app, {
		path: 'Salt Road/Across the Salt/The Crossing.md',
		id: 'sc-21',
		chapterId: 'ch2-across',
		chapterTitle: 'Across the Salt',
		order: 1,
		status: 'final',
		body: '## Draft\nThe crossing took three days[^b].\n\n[^b]: Per the journal.',
	});
	const scene22 = await seedScene(app, {
		path: 'Salt Road/Across the Salt/Arrival.md',
		id: 'sc-22',
		chapterId: 'ch2-across',
		chapterTitle: 'Across the Salt',
		order: 2,
		status: 'draft',
		body: '## Draft\nAt last the white walls.',
	});

	return { chapter1, chapter2, scene11, scene12, scene13, scene21, scene22 };
}

async function seedChapter(
	app: App,
	options: { path: string; id: string; order: number; body: string }
): Promise<TFile> {
	const file = await app.vault.create(options.path, options.body);
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'chapter',
		'dbench-id': options.id,
		'dbench-project': '[[Salt Road]]',
		'dbench-project-id': projectId,
		'dbench-order': options.order,
		'dbench-status': 'draft',
		'dbench-scenes': [],
		'dbench-scene-ids': [],
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	});
	return file;
}

async function seedScene(
	app: App,
	options: {
		path: string;
		id: string;
		chapterId: string;
		chapterTitle: string;
		order: number;
		status: DbenchStatus;
		body: string;
		sectionBreakTitle?: string;
	}
): Promise<TFile> {
	const file = await app.vault.create(options.path, options.body);
	const fm: Record<string, unknown> = {
		'dbench-type': 'scene',
		'dbench-id': options.id,
		'dbench-project': '[[Salt Road]]',
		'dbench-project-id': projectId,
		'dbench-chapter': `[[${options.chapterTitle}]]`,
		'dbench-chapter-id': options.chapterId,
		'dbench-order': options.order,
		'dbench-status': options.status,
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	};
	if (options.sectionBreakTitle !== undefined) {
		fm['dbench-section-break-title'] = options.sectionBreakTitle;
	}
	app.metadataCache._setFrontmatter(file, fm);
	return file;
}

function makePreset(
	overrides: Partial<CompilePresetFrontmatter> = {}
): CompilePresetNote {
	const file = new TFile({
		path: 'Salt Road/Compile Presets/Workshop.md',
		basename: 'Workshop',
		extension: 'md',
		stat: { mtime: 0, ctime: 0, size: 0 },
	});
	const frontmatter: CompilePresetFrontmatter = {
		'dbench-type': 'compile-preset',
		'dbench-id': 'prs-workshop',
		'dbench-project': '[[Salt Road]]',
		'dbench-project-id': projectId,
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
		'dbench-compile-chapter-numbering': 'none' as CompileChapterNumbering,
		'dbench-compile-include-section-breaks': true,
		'dbench-compile-heading-scope': 'chapter' as CompileHeadingScope,
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

describe('CompileService chapter-aware integration (Step 8)', () => {
	let app: App;
	let service: CompileService;

	beforeEach(() => {
		app = new App();
		service = new CompileService(app);
	});

	it('produces the full novelist-shape output: chapter heading + intro + scenes with mid-chapter section break, footnotes renumbered across chapters', async () => {
		await seedSaltRoad(app);

		const result = await service.generate(makePreset());

		expect(result.markdown).toBe(
			'# The Departure\n\n' +
				'The wagons were loaded before dawn.\n\n' +
				'They set out on the eastern road.\n\n' +
				'* * *\n\n**Three days later**\n\n* * *\n\n' +
				'The first camp huddled against the wind.\n\n' +
				'A single star burned[^1].\n\n[^1]: A scout\'s sign.\n\n' +
				'# Across the Salt\n\n' +
				'The crossing took three days[^2].\n\n[^2]: Per the journal.\n\n' +
				'At last the white walls.'
		);
		expect(result.scenesCompiled).toBe(5);
		expect(result.scenesSkipped).toBe(0);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it('applies numeric chapter numbering to chapter headings only', async () => {
		await seedSaltRoad(app);

		const result = await service.generate(
			makePreset({ 'dbench-compile-chapter-numbering': 'numeric' })
		);

		expect(result.markdown).toContain('# 1. The Departure');
		expect(result.markdown).toContain('# 2. Across the Salt');
		// Scene H1s remain suppressed in chapter mode regardless of
		// numbering, so no per-scene "# 3. ..." surfaces.
		expect(result.markdown).not.toContain('# 3.');
		expect(result.markdown).not.toContain('# Setting Out');
	});

	it('applies roman chapter numbering to chapter headings', async () => {
		await seedSaltRoad(app);

		const result = await service.generate(
			makePreset({ 'dbench-compile-chapter-numbering': 'roman' })
		);

		expect(result.markdown).toContain('# I. The Departure');
		expect(result.markdown).toContain('# II. Across the Salt');
	});

	it('combines status filter with chapter intro: filtered scenes drop, intro stays, section-break on filtered scene vanishes', async () => {
		await seedSaltRoad(app);

		// Keep only 'final' scenes. Drops scene 1.2 (the one with the
		// section-break decoration) and scene 2.2.
		const result = await service.generate(
			makePreset({ 'dbench-compile-scene-statuses': ['final'] })
		);

		expect(result.markdown).toBe(
			'# The Departure\n\n' +
				'The wagons were loaded before dawn.\n\n' +
				'They set out on the eastern road.\n\n' +
				'A single star burned[^1].\n\n[^1]: A scout\'s sign.\n\n' +
				'# Across the Salt\n\n' +
				'The crossing took three days[^2].\n\n[^2]: Per the journal.'
		);
		// The "* * *" was tied to scene 1.2; with that scene filtered,
		// no section break should appear in the output at all.
		expect(result.markdown).not.toContain('* * *');
		expect(result.scenesCompiled).toBe(3);
		expect(result.scenesSkipped).toBe(2);
	});

	it('combines chapter wikilink exclude with footnote renumbering: excluded chapter does not consume footnote offsets', async () => {
		await seedSaltRoad(app);

		const result = await service.generate(
			makePreset({
				'dbench-compile-scene-excludes': ['[[Across the Salt]]'],
			})
		);

		// Chapter 2 dropped entirely. Chapter 1's footnote is now [^1]
		// (not [^2] — chapter 2's footnote never gets a number because
		// its scene never runs through the renumberer).
		expect(result.markdown).toBe(
			'# The Departure\n\n' +
				'The wagons were loaded before dawn.\n\n' +
				'They set out on the eastern road.\n\n' +
				'* * *\n\n**Three days later**\n\n* * *\n\n' +
				'The first camp huddled against the wind.\n\n' +
				'A single star burned[^1].\n\n[^1]: A scout\'s sign.'
		);
		expect(result.markdown).not.toContain('Across the Salt');
		expect(result.markdown).not.toContain('The crossing took three days');
		expect(result.scenesCompiled).toBe(3);
		expect(result.scenesSkipped).toBe(2);
	});

	it("heading-scope=draft on the same fixture: per-scene H1s, no chapter headings, ordering preserved", async () => {
		await seedSaltRoad(app);

		const result = await service.generate(
			makePreset({ 'dbench-compile-heading-scope': 'draft' })
		);

		// Walker still dispatches via chapters (correct ordering), but
		// chapter headings + intros do not emit. Scene H1s emerge per
		// the 'draft' rule. Section break tied to scene 1.2 still
		// appears (no chapter heading to substitute for it).
		expect(result.markdown).toBe(
			'# Setting Out\n\nThey set out on the eastern road.\n\n' +
				'* * *\n\n**Three days later**\n\n* * *\n\n' +
				'# First Camp\n\nThe first camp huddled against the wind.\n\n' +
				'# Star Above\n\nA single star burned[^1].\n\n[^1]: A scout\'s sign.\n\n' +
				'# The Crossing\n\nThe crossing took three days[^2].\n\n[^2]: Per the journal.\n\n' +
				'# Arrival\n\nAt last the white walls.'
		);
		expect(result.markdown).not.toContain('# The Departure');
		expect(result.markdown).not.toContain('# Across the Salt');
		expect(result.markdown).not.toContain('The wagons were loaded'); // chapter 1 intro suppressed
	});

	it('emits an error marker for an unreadable scene mid-chapter without halting later scenes or the next chapter', async () => {
		const files = await seedSaltRoad(app);

		const originalRead = app.vault.read.bind(app.vault);
		app.vault.read = async (file: TFile): Promise<string> => {
			if (file.path === files.scene12.path) {
				throw new Error('Disk fault on First Camp');
			}
			return originalRead(file);
		};

		const result = await service.generate(makePreset());

		// First Camp's section break decoration was suppressed because
		// the scene never reached the section-break push (the throw
		// happens before push). The error marker takes its slot.
		expect(result.errors).toEqual([
			{
				scenePath: files.scene12.path,
				message: 'Disk fault on First Camp',
			},
		]);
		expect(result.markdown).toContain(
			'<!-- Draft Bench: failed to read "First Camp": Disk fault on First Camp -->'
		);
		// Surrounding scenes + chapter 2 still emit normally.
		expect(result.markdown).toContain('They set out on the eastern road.');
		expect(result.markdown).toContain('A single star burned');
		expect(result.markdown).toContain('# Across the Salt');
		expect(result.markdown).toContain('The crossing took three days');
		expect(result.scenesCompiled).toBe(4);
	});

	it('chapter-aware ordering survives non-monotonic creation order (chapter 2 created before chapter 1)', async () => {
		// Re-seed with reversed insertion order; assert dbench-order
		// drives output, not creation order. Smaller fixture inline.
		await seedChapter(app, {
			path: 'Reverse/Two.md',
			id: 'ch-two',
			order: 2,
			body: '## Draft\n',
		});
		await seedChapter(app, {
			path: 'Reverse/One.md',
			id: 'ch-one',
			order: 1,
			body: '## Draft\n',
		});
		await seedScene(app, {
			path: 'Reverse/Two/B.md',
			id: 'sc-b',
			chapterId: 'ch-two',
			chapterTitle: 'Two',
			order: 1,
			status: 'final',
			body: '## Draft\nB.',
		});
		await seedScene(app, {
			path: 'Reverse/One/A.md',
			id: 'sc-a',
			chapterId: 'ch-one',
			chapterTitle: 'One',
			order: 1,
			status: 'final',
			body: '## Draft\nA.',
		});

		const result = await service.generate(makePreset());

		expect(result.markdown).toBe('# One\n\nA.\n\n# Two\n\nB.');
	});
});
