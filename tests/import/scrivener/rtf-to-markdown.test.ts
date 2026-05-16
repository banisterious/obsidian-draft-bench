import { describe, expect, it } from 'vitest';
import { rtfToMarkdown } from '../../../src/import/scrivener/rtf-to-markdown';

/**
 * Tests for the minimal RTF -> markdown converter. Coverage focuses
 * on the MVP scope from the rtf-to-markdown.ts module docstring:
 * paragraph breaks, inline formatting, character escapes, Unicode
 * escapes, top-level metadata group skipping. Footnotes / images /
 * comments / lists / tables land in follow-up tests as those features
 * are implemented per real-corpus exposure.
 *
 * Test inputs are minimal hand-crafted RTF strings rather than real
 * Scrivener output (corpus arrives via the issue tracker per
 * scrivener-import.md). Synthetic inputs validate the parser shape;
 * corpus exposure validates the parser's reach.
 */

function rtf(...parts: string[]): string {
	return parts.join('');
}

describe('rtfToMarkdown — empty / trivial inputs', () => {
	it('returns empty markdown for an empty document', () => {
		expect(rtfToMarkdown('').markdown).toBe('');
	});

	it('returns empty markdown for an empty group', () => {
		expect(rtfToMarkdown('{}').markdown).toBe('');
	});

	it('returns empty markdown for a header-only document', () => {
		const input = rtf(
			'{\\rtf1\\ansi\\ansicpg1252\\cocoartf2820',
			'{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}',
			'{\\colortbl;\\red255\\green255\\blue255;}',
			'}'
		);
		expect(rtfToMarkdown(input).markdown).toBe('');
	});
});

describe('rtfToMarkdown — plain text', () => {
	it('passes through plain text unchanged', () => {
		const input = '{\\rtf1\\ansi Hello world.}';
		expect(rtfToMarkdown(input).markdown).toBe('Hello world.');
	});

	it('handles paragraph breaks via \\par', () => {
		const input = '{\\rtf1\\ansi First paragraph.\\par Second paragraph.}';
		expect(rtfToMarkdown(input).markdown).toBe(
			'First paragraph.\n\nSecond paragraph.'
		);
	});

	it('collapses multiple consecutive \\par to a single blank line', () => {
		const input = '{\\rtf1\\ansi A.\\par\\par\\par B.}';
		expect(rtfToMarkdown(input).markdown).toBe('A.\n\nB.');
	});

	it('handles \\tab as a tab character', () => {
		const input = '{\\rtf1\\ansi A\\tab B}';
		expect(rtfToMarkdown(input).markdown).toBe('A\tB');
	});
});

describe('rtfToMarkdown — inline formatting', () => {
	it('wraps bold text in **markers**', () => {
		const input = '{\\rtf1\\ansi {\\b bold text}}';
		expect(rtfToMarkdown(input).markdown).toBe('**bold text**');
	});

	it('wraps italic text in *markers*', () => {
		const input = '{\\rtf1\\ansi {\\i italic text}}';
		expect(rtfToMarkdown(input).markdown).toBe('*italic text*');
	});

	it('wraps underline in <u> tags', () => {
		const input = '{\\rtf1\\ansi {\\ul underlined}}';
		expect(rtfToMarkdown(input).markdown).toBe('<u>underlined</u>');
	});

	it('wraps strikethrough in <s> tags', () => {
		const input = '{\\rtf1\\ansi {\\strike struck}}';
		expect(rtfToMarkdown(input).markdown).toBe('<s>struck</s>');
	});

	it('combines bold and italic as ***markers***', () => {
		const input = '{\\rtf1\\ansi {\\b\\i both}}';
		expect(rtfToMarkdown(input).markdown).toBe('***both***');
	});

	it('handles bold turn-off via \\b0', () => {
		const input = '{\\rtf1\\ansi \\b bold\\b0  plain}';
		expect(rtfToMarkdown(input).markdown).toBe('**bold** plain');
	});

	it('confines formatting to its group scope', () => {
		const input = '{\\rtf1\\ansi {\\b bold} plain}';
		expect(rtfToMarkdown(input).markdown).toBe('**bold** plain');
	});

	it('resets formatting via \\plain', () => {
		const input = '{\\rtf1\\ansi \\b\\i mix\\plain  plain}';
		expect(rtfToMarkdown(input).markdown).toBe('***mix*** plain');
	});

	it('handles underline turn-off via \\ulnone', () => {
		const input = '{\\rtf1\\ansi \\ul under\\ulnone  plain}';
		expect(rtfToMarkdown(input).markdown).toBe('<u>under</u> plain');
	});
});

describe('rtfToMarkdown — Unicode and hex escapes', () => {
	it('renders \\u8217 (right single quote) as the smart quote character', () => {
		const input = "{\\rtf1\\ansi don\\u8217?t}";
		expect(rtfToMarkdown(input).markdown).toBe('don’t');
	});

	it('renders \\u8212 (em-dash) as the em-dash character', () => {
		const input = '{\\rtf1\\ansi A\\u8212?B}';
		expect(rtfToMarkdown(input).markdown).toBe('A—B');
	});

	it('renders \\u8230 (ellipsis) as a single ellipsis character', () => {
		const input = '{\\rtf1\\ansi A\\u8230?}';
		expect(rtfToMarkdown(input).markdown).toBe('A…');
	});

	it("handles negative \\u arguments via 16-bit wrap (RTF spec)", () => {
		// \u-3913? is 0xFB5B (Arabic ligature), wrapped from -3913 + 65536.
		// Synthesizing this: just verify a negative arg wraps.
		const input = '{\\rtf1\\ansi {\\u-32768?}}';
		// -32768 + 65536 = 32768 → U+8000 (CJK character)
		expect(rtfToMarkdown(input).markdown).toBe('耀');
	});

	it("handles \\'XX hex escapes as Latin-1 bytes", () => {
		// \'a9 is 0xA9 = ©
		const input = "{\\rtf1\\ansi Copyright \\'a9 2026.}";
		expect(rtfToMarkdown(input).markdown).toBe('Copyright © 2026.');
	});
});

describe('rtfToMarkdown — character escapes', () => {
	it("escapes literal backslash, brace via \\\\, \\{, \\}", () => {
		const input = '{\\rtf1\\ansi A \\\\ B \\{ C \\} D}';
		expect(rtfToMarkdown(input).markdown).toBe('A \\ B { C } D');
	});

	it('treats \\~ as a non-breaking space (U+00A0)', () => {
		const input = '{\\rtf1\\ansi A\\~B}';
		expect(rtfToMarkdown(input).markdown).toBe('A B');
	});

	it('drops optional hyphens (\\-)', () => {
		const input = '{\\rtf1\\ansi A\\-B}';
		expect(rtfToMarkdown(input).markdown).toBe('AB');
	});
});

describe('rtfToMarkdown — metadata group skipping', () => {
	it('skips the font table group entirely without surfacing a warning', () => {
		const input = rtf(
			'{\\rtf1\\ansi',
			'{\\fonttbl\\f0\\fswiss Helvetica;\\f1\\froman Times;}',
			'Body text.}'
		);
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe('Body text.');
		// fonttbl is RTF infrastructure that every Scrivener document
		// includes; surfacing its skip would flood the writer with
		// noise. We strip silently.
		expect(result.warnings.some((w) => w.includes('fonttbl'))).toBe(false);
	});

	it('skips the color table group entirely without surfacing a warning', () => {
		const input = rtf(
			'{\\rtf1\\ansi',
			'{\\colortbl;\\red255\\green0\\blue0;}',
			'Body text.}'
		);
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe('Body text.');
		expect(result.warnings.some((w) => w.includes('colortbl'))).toBe(false);
	});

	it('skips the stylesheet group entirely without surfacing a warning', () => {
		const input = rtf(
			'{\\rtf1\\ansi',
			'{\\stylesheet{\\s0 Normal;}{\\s1\\b Heading;}}',
			'Body text.}'
		);
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe('Body text.');
		expect(result.warnings.some((w) => w.includes('stylesheet'))).toBe(false);
	});

	it('skips the info group entirely without surfacing a warning', () => {
		const input = rtf(
			'{\\rtf1\\ansi',
			'{\\info{\\title My Doc}{\\author Jane}}',
			'Body text.}'
		);
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe('Body text.');
		expect(result.warnings.some((w) => w.includes('info'))).toBe(false);
	});

	it('skips inline image (\\pict) groups with a warning', () => {
		// `\pict` is the one routine-skip that DOES surface a warning,
		// because it represents content (an inline image) that's
		// actually being lost from the markdown output.
		const input =
			'{\\rtf1\\ansi Before. {\\pict\\pngblip\\picw100\\pich100 deadbeef} After.}';
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe('Before.  After.');
		expect(result.warnings.some((w) => w.toLowerCase().includes('image'))).toBe(
			true
		);
	});

	it('emits the \\pict warning at most once per document', () => {
		const input =
			'{\\rtf1\\ansi A. {\\pict deadbeef} B. {\\pict cafebabe} C.}';
		const result = rtfToMarkdown(input);
		const imageWarnings = result.warnings.filter((w) =>
			w.toLowerCase().includes('image')
		);
		expect(imageWarnings).toHaveLength(1);
	});
});

describe('rtfToMarkdown — field-instruction skipping (#37)', () => {
	it('drops Scrivener comment field instructions (scrivcmt://) while keeping the visible text', () => {
		// Scrivener wraps inline comments as RTF fields:
		// {\field{\*\fldinst{HYPERLINK "scrivcmt://UUID"}}{\fldrslt {visible}}}
		// The instruction text (HYPERLINK + URI) must be suppressed; the
		// \fldrslt content emits normally.
		const input =
			'{\\rtf1\\ansi Before {\\field{\\*\\fldinst{HYPERLINK "scrivcmt://C22DA3B1-5EA9-4FFD-84D8-DDB36384E416"}}{\\fldrslt {commented}}} after.}';
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe('Before commented after.');
	});

	it('drops http(s) hyperlink field instructions while keeping the visible link text', () => {
		// Real hyperlinks share the same RTF \field structure. The visible
		// link text emits as plain markdown; URL preservation is deferred
		// to a future hyperlink-rendering feature.
		const input =
			'{\\rtf1\\ansi See {\\field{\\*\\fldinst{HYPERLINK "https://example.com"}}{\\fldrslt {the docs}}}.}';
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe('See the docs.');
	});
});

describe('rtfToMarkdown — realistic compositions', () => {
	it('handles a small Scrivener-shaped scene fragment', () => {
		const input =
			'{\\rtf1\\ansi\\ansicpg1252\\cocoartf2820' +
			'{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}' +
			'{\\colortbl;\\red255\\green255\\blue255;}' +
			'\\f0\\fs24 The day broke {\\b cold} and {\\i clear}.\\par ' +
			"She didn\\u8217?t expect company.}";
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe(
			'The day broke **cold** and *clear*.\n\nShe didn’t expect company.'
		);
	});

	it('handles bold-italic mixed inline transitions', () => {
		// Adjacent text fragments with overlapping formatting state
		// share marker pairs (close-on-state-change emission); the
		// emitter doesn't add redundant ** / * across boundaries.
		const input =
			'{\\rtf1\\ansi {\\b Bold}{\\i\\b  bolditalic}{\\i  italic} plain.}';
		const result = rtfToMarkdown(input);
		expect(result.markdown).toBe('**Bold* bolditalic** italic* plain.');
	});

	it('confines formatting changes inside groups (does not leak)', () => {
		const input = '{\\rtf1\\ansi A {\\b B} C {\\i D} E.}';
		expect(rtfToMarkdown(input).markdown).toBe('A **B** C *D* E.');
	});
});
