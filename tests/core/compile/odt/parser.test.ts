import { describe, expect, it } from 'vitest';
import {
	parseInline,
	parseMarkdownForOdt,
} from '../../../../src/core/compile/odt/parser';

describe('parseInline', () => {
	it('returns a single text run for plain text', () => {
		expect(parseInline('just text')).toEqual([
			{ kind: 'text', text: 'just text' },
		]);
	});

	it('splits bold markers out as bold runs', () => {
		expect(parseInline('plain **bold** plain')).toEqual([
			{ kind: 'text', text: 'plain ' },
			{ kind: 'bold', text: 'bold' },
			{ kind: 'text', text: ' plain' },
		]);
	});

	it('splits italic markers out as italic runs', () => {
		expect(parseInline('plain *italic* plain')).toEqual([
			{ kind: 'text', text: 'plain ' },
			{ kind: 'italic', text: 'italic' },
			{ kind: 'text', text: ' plain' },
		]);
	});

	it('handles consecutive emphasis runs', () => {
		expect(parseInline('**a** and *b*')).toEqual([
			{ kind: 'bold', text: 'a' },
			{ kind: 'text', text: ' and ' },
			{ kind: 'italic', text: 'b' },
		]);
	});

	it('returns empty array for empty input', () => {
		expect(parseInline('')).toEqual([]);
	});
});

describe('parseMarkdownForOdt', () => {
	it('parses H1 through H6', () => {
		const md = '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six';
		const blocks = parseMarkdownForOdt(md);
		expect(blocks).toHaveLength(6);
		for (let i = 0; i < 6; i++) {
			expect(blocks[i].kind).toBe('heading');
			if (blocks[i].kind === 'heading') {
				expect((blocks[i] as { level: number }).level).toBe(i + 1);
			}
		}
	});

	it('parses headings with inline emphasis', () => {
		const blocks = parseMarkdownForOdt('# **Part I**');
		expect(blocks).toEqual([
			{
				kind: 'heading',
				level: 1,
				runs: [{ kind: 'bold', text: 'Part I' }],
			},
		]);
	});

	it('joins consecutive prose lines into one paragraph', () => {
		const md = 'First line.\nSecond line.\nThird line.';
		const blocks = parseMarkdownForOdt(md);
		expect(blocks).toEqual([
			{
				kind: 'paragraph',
				runs: [{ kind: 'text', text: 'First line. Second line. Third line.' }],
			},
		]);
	});

	it('separates paragraphs by blank lines', () => {
		const md = 'First para.\n\nSecond para.';
		const blocks = parseMarkdownForOdt(md);
		expect(blocks).toHaveLength(2);
		expect(blocks[0].kind).toBe('paragraph');
		expect(blocks[1].kind).toBe('paragraph');
	});

	it('parses bullet lists', () => {
		const md = '- one\n- two\n- three';
		const blocks = parseMarkdownForOdt(md);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false });
		if (blocks[0].kind === 'list') {
			expect(blocks[0].items).toHaveLength(3);
		}
	});

	it('parses numbered lists', () => {
		const md = '1. first\n2. second\n3. third';
		const blocks = parseMarkdownForOdt(md);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({ kind: 'list', ordered: true });
		if (blocks[0].kind === 'list') {
			expect(blocks[0].items).toHaveLength(3);
		}
	});

	it('treats `*` and `+` bullet markers the same as `-`', () => {
		const md = '- a\n* b\n+ c';
		const blocks = parseMarkdownForOdt(md);
		// Each bullet variant accumulates into one contiguous list since
		// the pattern matches any of [-*+].
		expect(blocks).toHaveLength(1);
		if (blocks[0].kind === 'list') {
			expect(blocks[0].items).toHaveLength(3);
		}
	});

	it('handles a mix of block types in order', () => {
		const md = '# Heading\n\nprose paragraph\n\n- item 1\n- item 2\n\nfinal prose';
		const blocks = parseMarkdownForOdt(md);
		expect(blocks.map((b) => b.kind)).toEqual([
			'heading',
			'paragraph',
			'list',
			'paragraph',
		]);
	});

	it('skips blank lines without producing empty paragraphs', () => {
		const md = '\n\nfirst\n\n\n\nsecond\n\n\n';
		const blocks = parseMarkdownForOdt(md);
		expect(blocks).toHaveLength(2);
	});

	it('returns an empty array for empty markdown', () => {
		expect(parseMarkdownForOdt('')).toEqual([]);
		expect(parseMarkdownForOdt('\n\n\n')).toEqual([]);
	});

	it('recognizes `* * *` as a thematic break (not a bullet list)', () => {
		// Without explicit thematic-break detection, the leading `*`
		// matches the unordered-list pattern and the dinkus renders as
		// bullets. This input doesn't match the section-break-title
		// fusing pattern (no bold-only paragraph between dinkuses), so
		// the thematic-break stays as its own block.
		const blocks = parseMarkdownForOdt('before\n\n* * *\n\nafter');
		expect(blocks.map((b) => b.kind)).toEqual([
			'paragraph',
			'thematic-break',
			'paragraph',
		]);
	});

	it('recognizes other CommonMark thematic-break variants', () => {
		expect(parseMarkdownForOdt('***').map((b) => b.kind)).toEqual([
			'thematic-break',
		]);
		expect(parseMarkdownForOdt('---').map((b) => b.kind)).toEqual([
			'thematic-break',
		]);
		expect(parseMarkdownForOdt('___').map((b) => b.kind)).toEqual([
			'thematic-break',
		]);
		expect(parseMarkdownForOdt('* * * * *').map((b) => b.kind)).toEqual([
			'thematic-break',
		]);
	});

	it('still recognizes single-asterisk bullet items as lists', () => {
		// Defends against an over-eager thematic-break regex that would
		// swallow legitimate `* item` lines.
		const blocks = parseMarkdownForOdt('* first item\n* second item');
		expect(blocks.map((b) => b.kind)).toEqual(['list']);
	});

	it('fuses the section-break-title pattern emitted by buildSectionBreak', () => {
		const blocks = parseMarkdownForOdt(
			'before\n\n* * *\n\n**Part II**\n\n* * *\n\nafter'
		);
		expect(blocks).toHaveLength(3);
		expect(blocks[0].kind).toBe('paragraph');
		expect(blocks[1]).toEqual({
			kind: 'section-break-title',
			title: 'Part II',
		});
		expect(blocks[2].kind).toBe('paragraph');
	});

	it('does not fuse when the middle paragraph has more than one inline run', () => {
		const blocks = parseMarkdownForOdt(
			'* * *\n\n**bold** then plain text\n\n* * *'
		);
		expect(blocks.map((b) => b.kind)).toEqual([
			'thematic-break',
			'paragraph',
			'thematic-break',
		]);
	});

	it('does not fuse when the middle paragraph is plain (not bold)', () => {
		const blocks = parseMarkdownForOdt('* * *\n\nplain text\n\n* * *');
		expect(blocks.map((b) => b.kind)).toEqual([
			'thematic-break',
			'paragraph',
			'thematic-break',
		]);
	});
});
