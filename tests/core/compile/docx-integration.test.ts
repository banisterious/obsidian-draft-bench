import { beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { App, TFile } from 'obsidian';
import { CompileService } from '../../../src/core/compile-service';
import { buildDocxBytes } from '../../../src/core/compile/render-docx';
import type { CompilePresetNote } from '../../../src/core/discovery';
import type {
	CompilePresetFrontmatter,
	CompileChapterNumbering,
	CompileHeadingScope,
} from '../../../src/model/compile-preset';
import type { DbenchStatus } from '../../../src/model/types';

/**
 * End-to-end DOCX integration: feed the chapter-aware compile
 * pipeline through the DOCX renderer and assert the resulting
 * word/document.xml. Compensates for the per-unit slicing across
 * doc-definition + render-docx by exercising the real seam:
 *
 *   CompileService.generate(preset)
 *     -> compile markdown
 *     -> buildDocxBytes(markdown, fm)
 *       -> parseMarkdown + buildDocxDocument + Packer.toBuffer
 *     -> DOCX zip bytes
 *     -> JSZip.loadAsync + word/document.xml inspect
 *
 * Reuses the "Salt Road" fixture pattern from chapter-integration.test.ts
 * but locally — duplication is cheap; coupling tests to a shared
 * seeder isn't worth the cost for one extra consumer.
 */

const projectId = 'prj-salt-docx-001';

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
		body: '## Draft\nThe crossing took three days.',
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
		'dbench-compile-format': 'docx',
		'dbench-compile-output': 'disk',
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

/**
 * Run the chapter-aware compile pipeline through the DOCX renderer
 * and return the unpacked word/document.xml. Single helper so each
 * test stays focused on its assertion.
 */
async function compileToDocumentXml(
	app: App,
	preset: CompilePresetNote
): Promise<string> {
	const result = await new CompileService(app).generate(preset);
	const bytes = await buildDocxBytes(result.markdown, preset.frontmatter);
	const zip = await JSZip.loadAsync(bytes);
	const file = zip.file('word/document.xml');
	if (!file) throw new Error('document.xml missing from packed docx');
	return file.async('string');
}

describe('DOCX integration with chapter-aware compile (Step 8 + DOCX renderer)', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('produces chapter headings as Heading1, scenes as body paragraphs, section break as centered title', async () => {
		await seedSaltRoad(app);

		const xml = await compileToDocumentXml(app, makePreset());

		// Chapter headings emit as docx Heading1 style.
		expect(xml).toContain('The Departure');
		expect(xml).toContain('Across the Salt');
		const heading1Count = (xml.match(/w:val="Heading1"/g) ?? []).length;
		expect(heading1Count).toBe(2);

		// Chapter intro + scene drafts emit as plain body paragraphs.
		expect(xml).toContain('The wagons were loaded before dawn.');
		expect(xml).toContain('They set out on the eastern road.');
		expect(xml).toContain('The crossing took three days.');
		expect(xml).toContain('At last the white walls.');

		// Mid-chapter section-break label rendered (centered, larger).
		expect(xml).toContain('Three days later');
		// Footnote marker survives. Note: footnotes degrade to plain
		// paragraphs in V1 per D-06; the [^1] reference + definition
		// are emitted as text rather than as docx footnote elements.
		expect(xml).toContain('[^1]');
	});

	it('renders the same fixture in heading-scope=draft as per-scene Heading1s with no chapter headings', async () => {
		await seedSaltRoad(app);

		const xml = await compileToDocumentXml(
			app,
			makePreset({ 'dbench-compile-heading-scope': 'draft' })
		);

		// Per-scene H1s now (5 scenes -> 5 Heading1 paragraphs).
		const heading1Count = (xml.match(/w:val="Heading1"/g) ?? []).length;
		expect(heading1Count).toBe(5);
		expect(xml).toContain('Setting Out');
		expect(xml).toContain('First Camp');
		expect(xml).toContain('Star Above');
		expect(xml).toContain('The Crossing');
		expect(xml).toContain('Arrival');
		// Chapter headings + intros do not emit in draft mode.
		expect(xml).not.toContain('The wagons were loaded before dawn.');
	});

	it('threads numeric chapter numbering through the DOCX heading text', async () => {
		await seedSaltRoad(app);

		const xml = await compileToDocumentXml(
			app,
			makePreset({ 'dbench-compile-chapter-numbering': 'numeric' })
		);

		expect(xml).toContain('1. The Departure');
		expect(xml).toContain('2. Across the Salt');
	});

	it('threads roman chapter numbering through the DOCX heading text', async () => {
		await seedSaltRoad(app);

		const xml = await compileToDocumentXml(
			app,
			makePreset({ 'dbench-compile-chapter-numbering': 'roman' })
		);

		expect(xml).toContain('I. The Departure');
		expect(xml).toContain('II. Across the Salt');
	});

	it('threads chapter wikilink excludes through to the DOCX output (Chapter 2 dropped)', async () => {
		await seedSaltRoad(app);

		const xml = await compileToDocumentXml(
			app,
			makePreset({
				'dbench-compile-scene-excludes': ['[[Across the Salt]]'],
			})
		);

		expect(xml).toContain('The Departure');
		expect(xml).not.toContain('Across the Salt');
		expect(xml).not.toContain('The crossing took three days.');
		// One Heading1 (Chapter 2 dropped).
		expect((xml.match(/w:val="Heading1"/g) ?? []).length).toBe(1);
	});

	it('respects dbench-compile-page-size: a4 in the section page setup', async () => {
		await seedSaltRoad(app);

		const xml = await compileToDocumentXml(
			app,
			makePreset({ 'dbench-compile-page-size': 'a4' })
		);

		expect(xml).toMatch(/<w:pgSz[^/]*w:w="11906"[^/]*w:h="16838"/);
	});

	it('combines status filter with chapter mode: filtered scenes drop, surviving content emits cleanly', async () => {
		await seedSaltRoad(app);

		const xml = await compileToDocumentXml(
			app,
			makePreset({ 'dbench-compile-scene-statuses': ['final'] })
		);

		// Scene 1.2 (draft status) and 2.2 (draft) drop; 1.1, 1.3, 2.1
		// survive. Both chapter headings remain because each chapter
		// still has at least one surviving scene.
		expect((xml.match(/w:val="Heading1"/g) ?? []).length).toBe(2);
		expect(xml).toContain('They set out on the eastern road.');
		expect(xml).toContain('A single star burned');
		expect(xml).toContain('The crossing took three days.');
		expect(xml).not.toContain('The first camp huddled against the wind.');
		expect(xml).not.toContain('At last the white walls.');
		// Section-break label was tied to scene 1.2; with that scene
		// filtered, the label vanishes.
		expect(xml).not.toContain('Three days later');
	});
});
