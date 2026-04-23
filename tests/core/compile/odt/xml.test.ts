import { describe, expect, it } from 'vitest';
import {
	buildContentXml,
	escapeXml,
	ODT_MANIFEST_XML,
	ODT_MIMETYPE,
	ODT_STYLES_XML,
} from '../../../../src/core/compile/odt/xml';
import type { OdtBlock } from '../../../../src/core/compile/odt/parser';

describe('escapeXml', () => {
	it('escapes the five XML-significant characters', () => {
		expect(escapeXml('A & B')).toBe('A &amp; B');
		expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
		expect(escapeXml('"quoted"')).toBe('&quot;quoted&quot;');
		expect(escapeXml("it's")).toBe('it&apos;s');
	});

	it('escapes ampersands before other replacements (order matters)', () => {
		expect(escapeXml('&lt;')).toBe('&amp;lt;');
	});

	it('passes plain text through unchanged', () => {
		expect(escapeXml('hello world')).toBe('hello world');
	});
});

describe('ODT_MIMETYPE', () => {
	it('is the canonical ODT media type', () => {
		expect(ODT_MIMETYPE).toBe('application/vnd.oasis.opendocument.text');
	});
});

describe('ODT_MANIFEST_XML', () => {
	it('declares the mimetype + three expected files', () => {
		expect(ODT_MANIFEST_XML).toContain('manifest:full-path="/"');
		expect(ODT_MANIFEST_XML).toContain(
			`manifest:media-type="${ODT_MIMETYPE}"`
		);
		expect(ODT_MANIFEST_XML).toContain('manifest:full-path="content.xml"');
		expect(ODT_MANIFEST_XML).toContain('manifest:full-path="styles.xml"');
		expect(ODT_MANIFEST_XML).toContain(
			'manifest:full-path="META-INF/manifest.xml"'
		);
	});
});

describe('ODT_STYLES_XML', () => {
	it('defines Heading 1 through Heading 6 styles', () => {
		for (let i = 1; i <= 6; i++) {
			expect(ODT_STYLES_XML).toContain(`style:name="Heading_20_${i}"`);
		}
	});

	it('defines Bold and Italic text styles', () => {
		expect(ODT_STYLES_XML).toContain('style:name="Bold"');
		expect(ODT_STYLES_XML).toContain('style:name="Italic"');
	});

	it('defines the Text_20_body paragraph style', () => {
		expect(ODT_STYLES_XML).toContain('style:name="Text_20_body"');
	});
});

describe('buildContentXml', () => {
	it('starts with the XML declaration and office:document-content root', () => {
		const xml = buildContentXml([]);
		expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
		expect(xml).toContain('<office:document-content');
		expect(xml).toContain('</office:document-content>');
	});

	it('wraps content in office:body > office:text', () => {
		const xml = buildContentXml([]);
		expect(xml).toContain('<office:body>');
		expect(xml).toContain('<office:text>');
		expect(xml).toContain('</office:text>');
		expect(xml).toContain('</office:body>');
	});

	it('renders a heading with the correct outline-level and style name', () => {
		const blocks: OdtBlock[] = [
			{ kind: 'heading', level: 2, runs: [{ kind: 'text', text: 'Chapter' }] },
		];
		const xml = buildContentXml(blocks);
		expect(xml).toContain(
			'<text:h text:style-name="Heading_20_2" text:outline-level="2">Chapter</text:h>'
		);
	});

	it('renders paragraph text with the Text_20_body style', () => {
		const blocks: OdtBlock[] = [
			{ kind: 'paragraph', runs: [{ kind: 'text', text: 'prose' }] },
		];
		const xml = buildContentXml(blocks);
		expect(xml).toContain(
			'<text:p text:style-name="Text_20_body">prose</text:p>'
		);
	});

	it('wraps bold + italic runs in text:span elements', () => {
		const blocks: OdtBlock[] = [
			{
				kind: 'paragraph',
				runs: [
					{ kind: 'text', text: 'plain ' },
					{ kind: 'bold', text: 'bold' },
					{ kind: 'text', text: ' and ' },
					{ kind: 'italic', text: 'italic' },
				],
			},
		];
		const xml = buildContentXml(blocks);
		expect(xml).toContain(
			'plain <text:span text:style-name="Bold">bold</text:span> and <text:span text:style-name="Italic">italic</text:span>'
		);
	});

	it('renders bullet and numbered lists with the expected style names', () => {
		const blocks: OdtBlock[] = [
			{
				kind: 'list',
				ordered: false,
				items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]],
			},
			{
				kind: 'list',
				ordered: true,
				items: [[{ kind: 'text', text: 'one' }]],
			},
		];
		const xml = buildContentXml(blocks);
		expect(xml).toContain('<text:list text:style-name="BulletList">');
		expect(xml).toContain('<text:list text:style-name="OrderedList">');
		expect(xml).toContain('<text:list-item>');
	});

	it('escapes XML-significant characters in text runs', () => {
		const blocks: OdtBlock[] = [
			{
				kind: 'paragraph',
				runs: [{ kind: 'text', text: 'A & B <tag> "quote"' }],
			},
		];
		const xml = buildContentXml(blocks);
		expect(xml).toContain('A &amp; B &lt;tag&gt; &quot;quote&quot;');
	});

	it('declares the bullet + ordered list automatic styles', () => {
		const xml = buildContentXml([]);
		expect(xml).toContain('<text:list-style style:name="BulletList">');
		expect(xml).toContain('<text:list-style style:name="OrderedList">');
	});
});
