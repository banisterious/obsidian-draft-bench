import { describe, expect, it } from 'vitest';
import {
	buildPdfDocDefinition,
	renderBlock,
	renderRuns,
} from '../../../../src/core/compile/pdf/doc-definition';
import type { MdBlock } from '../../../../src/core/compile/md-ast';

describe('renderRuns', () => {
	it('returns a plain string for a single-text run', () => {
		expect(renderRuns([{ kind: 'text', text: 'hello' }])).toBe('hello');
	});

	it('returns an empty string for an empty run list', () => {
		expect(renderRuns([])).toBe('');
	});

	it('returns tagged fragments for mixed runs', () => {
		const out = renderRuns([
			{ kind: 'text', text: 'plain ' },
			{ kind: 'bold', text: 'bold' },
			{ kind: 'text', text: ' and ' },
			{ kind: 'italic', text: 'italic' },
		]);
		expect(out).toEqual([
			{ text: 'plain ' },
			{ text: 'bold', bold: true },
			{ text: ' and ' },
			{ text: 'italic', italics: true },
		]);
	});
});

describe('renderBlock', () => {
	it('maps each heading level to the expected style', () => {
		for (let level = 1; level <= 6; level++) {
			const block: MdBlock = {
				kind: 'heading',
				level: level as 1 | 2 | 3 | 4 | 5 | 6,
				runs: [{ kind: 'text', text: 'X' }],
			};
			const rendered = renderBlock(block);
			expect(rendered).toEqual({ text: 'X', style: `h${level}` });
		}
	});

	it('emits paragraphs with the body style', () => {
		const block: MdBlock = {
			kind: 'paragraph',
			runs: [{ kind: 'text', text: 'prose' }],
		};
		expect(renderBlock(block)).toEqual({ text: 'prose', style: 'body' });
	});

	it('emits bullet lists with `ul`', () => {
		const block: MdBlock = {
			kind: 'list',
			ordered: false,
			items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]],
		};
		expect(renderBlock(block)).toEqual({
			ul: [{ text: 'a' }, { text: 'b' }],
			style: 'list',
		});
	});

	it('emits ordered lists with `ol`', () => {
		const block: MdBlock = {
			kind: 'list',
			ordered: true,
			items: [[{ kind: 'text', text: 'one' }]],
		};
		expect(renderBlock(block)).toEqual({
			ol: [{ text: 'one' }],
			style: 'list',
		});
	});
});

describe('buildPdfDocDefinition', () => {
	it('defaults to LETTER page size', () => {
		const def = buildPdfDocDefinition([]);
		expect(def.pageSize).toBe('LETTER');
	});

	it('honors A4 page-size override', () => {
		const def = buildPdfDocDefinition([], { pageSize: 'A4' });
		expect(def.pageSize).toBe('A4');
	});

	it('sets manuscript-friendly margins and Roboto as the default font', () => {
		const def = buildPdfDocDefinition([]);
		expect(def.pageMargins).toEqual([72, 72, 72, 72]);
		expect(def.defaultStyle).toMatchObject({ font: 'Roboto' });
	});

	it('declares all six heading styles plus body and list', () => {
		const def = buildPdfDocDefinition([]);
		const styles = def.styles ?? {};
		for (let level = 1; level <= 6; level++) {
			expect(styles[`h${level}`]).toBeDefined();
		}
		expect(styles.body).toBeDefined();
		expect(styles.list).toBeDefined();
	});

	it('walks the block list in order into content', () => {
		const blocks: MdBlock[] = [
			{ kind: 'heading', level: 1, runs: [{ kind: 'text', text: 'Title' }] },
			{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Body.' }] },
			{
				kind: 'list',
				ordered: false,
				items: [[{ kind: 'text', text: 'item' }]],
			},
		];
		const def = buildPdfDocDefinition(blocks);
		expect(def.content).toHaveLength(3);
	});
});
