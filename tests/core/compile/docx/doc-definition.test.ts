import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Document, Packer } from 'docx';
import { buildDocxDocument } from '../../../../src/core/compile/docx/doc-definition';
import type { MdBlock } from '../../../../src/core/compile/md-ast';

/**
 * Roundtrip helper: pack the docx Document, unzip the OOXML archive,
 * and return the body of `word/document.xml`. The translator's effects
 * are observable as XML string substrings — more robust than poking
 * at docx's internal class shapes (which version-drift) and faster
 * than every test re-implementing the unzip dance.
 */
async function extractDocumentXml(doc: Document): Promise<string> {
	const buffer = await Packer.toBuffer(doc);
	const zip = await JSZip.loadAsync(buffer);
	const file = zip.file('word/document.xml');
	if (!file) throw new Error('document.xml missing from packed docx');
	return file.async('string');
}

async function extractNumberingXml(doc: Document): Promise<string | null> {
	const buffer = await Packer.toBuffer(doc);
	const zip = await JSZip.loadAsync(buffer);
	const file = zip.file('word/numbering.xml');
	return file ? file.async('string') : null;
}

describe('buildDocxDocument', () => {
	it('packs to a non-empty docx archive containing word/document.xml', async () => {
		const doc = buildDocxDocument(
			[{ kind: 'paragraph', runs: [{ kind: 'text', text: 'hello' }] }],
			{ pageSize: 'LETTER' }
		);
		const xml = await extractDocumentXml(doc);
		expect(xml.length).toBeGreaterThan(0);
		expect(xml).toContain('hello');
	});

	it('translates a heading into a Heading paragraph style', async () => {
		const blocks: MdBlock[] = [
			{
				kind: 'heading',
				level: 1,
				runs: [{ kind: 'text', text: 'Chapter One' }],
			},
		];
		const xml = await extractDocumentXml(
			buildDocxDocument(blocks, { pageSize: 'LETTER' })
		);
		expect(xml).toContain('Chapter One');
		// docx encodes heading style references as `w:val="Heading1"`.
		expect(xml).toMatch(/w:val="Heading1"/);
	});

	it('maps each markdown heading level to the matching docx Heading style', async () => {
		const blocks: MdBlock[] = [
			{ kind: 'heading', level: 1, runs: [{ kind: 'text', text: 'H1' }] },
			{ kind: 'heading', level: 2, runs: [{ kind: 'text', text: 'H2' }] },
			{ kind: 'heading', level: 3, runs: [{ kind: 'text', text: 'H3' }] },
		];
		const xml = await extractDocumentXml(
			buildDocxDocument(blocks, { pageSize: 'LETTER' })
		);
		expect(xml).toMatch(/w:val="Heading1"/);
		expect(xml).toMatch(/w:val="Heading2"/);
		expect(xml).toMatch(/w:val="Heading3"/);
	});

	it('translates a plain paragraph as a body paragraph (no heading style)', async () => {
		const xml = await extractDocumentXml(
			buildDocxDocument(
				[{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Just prose.' }] }],
				{ pageSize: 'LETTER' }
			)
		);
		expect(xml).toContain('Just prose.');
		// No Heading style on a plain paragraph.
		expect(xml).not.toMatch(/w:val="Heading\d"/);
	});

	it('marks bold runs with w:b and italic runs with w:i', async () => {
		const xml = await extractDocumentXml(
			buildDocxDocument(
				[
					{
						kind: 'paragraph',
						runs: [
							{ kind: 'text', text: 'plain ' },
							{ kind: 'bold', text: 'BOLD' },
							{ kind: 'text', text: ' and ' },
							{ kind: 'italic', text: 'ITAL' },
						],
					},
				],
				{ pageSize: 'LETTER' }
			)
		);
		expect(xml).toContain('plain ');
		expect(xml).toContain('BOLD');
		expect(xml).toContain('ITAL');
		// docx emits `<w:b />` / `<w:i />` (self-closing) for bold/italic.
		expect(xml).toMatch(/<w:b\b/);
		expect(xml).toMatch(/<w:i\b/);
	});

	it('emits one paragraph per item for a bullet list, with bullet numbering reference', async () => {
		const xml = await extractDocumentXml(
			buildDocxDocument(
				[
					{
						kind: 'list',
						ordered: false,
						items: [
							[{ kind: 'text', text: 'first' }],
							[{ kind: 'text', text: 'second' }],
							[{ kind: 'text', text: 'third' }],
						],
					},
				],
				{ pageSize: 'LETTER' }
			)
		);
		expect(xml).toContain('first');
		expect(xml).toContain('second');
		expect(xml).toContain('third');
		// docx attaches bullet lists via the numbering reference too;
		// the `numPr` element appears on each list-item paragraph.
		const numPrCount = (xml.match(/<w:numPr>/g) ?? []).length;
		expect(numPrCount).toBe(3);
	});

	it('emits one paragraph per item for a numbered list and registers the document-level numbering ref', async () => {
		const doc = buildDocxDocument(
			[
				{
					kind: 'list',
					ordered: true,
					items: [
						[{ kind: 'text', text: 'one' }],
						[{ kind: 'text', text: 'two' }],
					],
				},
			],
			{ pageSize: 'LETTER' }
		);
		const docXml = await extractDocumentXml(doc);
		const numberingXml = await extractNumberingXml(doc);

		expect(docXml).toContain('one');
		expect(docXml).toContain('two');
		expect((docXml.match(/<w:numPr>/g) ?? []).length).toBe(2);
		// The numbering.xml should exist and define the dbench-numbered
		// reference (docx may rename it internally; check that the file
		// exists and has decimal-format content).
		expect(numberingXml).not.toBeNull();
		expect(numberingXml).toMatch(/decimal/);
	});

	it('renders a thematic-break as a centered "* * *" paragraph', async () => {
		const xml = await extractDocumentXml(
			buildDocxDocument(
				[
					{ kind: 'paragraph', runs: [{ kind: 'text', text: 'before' }] },
					{ kind: 'thematic-break' },
					{ kind: 'paragraph', runs: [{ kind: 'text', text: 'after' }] },
				],
				{ pageSize: 'LETTER' }
			)
		);
		expect(xml).toContain('* * *');
		// Centered alignment shows up as <w:jc w:val="center"/>.
		expect(xml).toMatch(/<w:jc w:val="center"\s*\/>/);
	});

	it('renders a section-break-title as a centered, bold, larger paragraph', async () => {
		const xml = await extractDocumentXml(
			buildDocxDocument(
				[{ kind: 'section-break-title', title: 'Three days later' }],
				{ pageSize: 'LETTER' }
			)
		);
		expect(xml).toContain('Three days later');
		expect(xml).toMatch(/<w:jc w:val="center"\s*\/>/);
		expect(xml).toMatch(/<w:b\b/);
		// 14pt -> 28 half-points -> sz val="28".
		expect(xml).toMatch(/<w:sz w:val="28"/);
	});

	it('sets the page size to Letter (12240 x 15840 twips)', async () => {
		const xml = await extractDocumentXml(
			buildDocxDocument(
				[{ kind: 'paragraph', runs: [{ kind: 'text', text: 'p' }] }],
				{ pageSize: 'LETTER' }
			)
		);
		// docx encodes page size as <w:pgSz w:w="..." w:h="..." />.
		expect(xml).toMatch(/<w:pgSz[^/]*w:w="12240"[^/]*w:h="15840"/);
	});

	it('sets the page size to A4 (11906 x 16838 twips)', async () => {
		const xml = await extractDocumentXml(
			buildDocxDocument(
				[{ kind: 'paragraph', runs: [{ kind: 'text', text: 'p' }] }],
				{ pageSize: 'A4' }
			)
		);
		expect(xml).toMatch(/<w:pgSz[^/]*w:w="11906"[^/]*w:h="16838"/);
	});

	it('packs an empty block list to a valid (but empty-bodied) document', async () => {
		// The compile pipeline shouldn't normally hand the renderer an
		// empty list — runCompile short-circuits when scenesCompiled
		// is 0 — but the translator should not throw when it does.
		const doc = buildDocxDocument([], { pageSize: 'LETTER' });
		const xml = await extractDocumentXml(doc);
		// Document body element is still present, even with no content
		// paragraphs of our own.
		expect(xml).toMatch(/<w:body/);
	});

	it('preserves the heading -> paragraph -> list ordering of the input', async () => {
		const xml = await extractDocumentXml(
			buildDocxDocument(
				[
					{
						kind: 'heading',
						level: 1,
						runs: [{ kind: 'text', text: 'TitleX' }],
					},
					{
						kind: 'paragraph',
						runs: [{ kind: 'text', text: 'BodyY' }],
					},
					{
						kind: 'list',
						ordered: false,
						items: [
							[{ kind: 'text', text: 'ItemA' }],
							[{ kind: 'text', text: 'ItemB' }],
						],
					},
				],
				{ pageSize: 'LETTER' }
			)
		);
		const titleIdx = xml.indexOf('TitleX');
		const bodyIdx = xml.indexOf('BodyY');
		const itemAIdx = xml.indexOf('ItemA');
		const itemBIdx = xml.indexOf('ItemB');
		expect(titleIdx).toBeGreaterThan(-1);
		expect(bodyIdx).toBeGreaterThan(titleIdx);
		expect(itemAIdx).toBeGreaterThan(bodyIdx);
		expect(itemBIdx).toBeGreaterThan(itemAIdx);
	});
});
