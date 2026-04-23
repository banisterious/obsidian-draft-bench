import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { MdBlock, MdRun } from '../md-ast';

/**
 * Builder: compile-markdown AST -> pdfmake document definition.
 *
 * pdfmake's `TDocumentDefinitions` is a JSON AST (content + styles +
 * defaultStyle + fonts). This module is the pure translator from the
 * MD subset shared with the ODT renderer into pdfmake's content
 * array, plus a curated style dictionary tuned for manuscript
 * output.
 *
 * Font + VFS wiring lives in `render-pdf.ts` — this module stays
 * format-agnostic so it can be unit-tested without pdfmake's runtime
 * machinery.
 */

/** Page size options exposed via the preset's `dbench-compile-page-size`. */
export type PdfPageSize = 'LETTER' | 'A4';

export interface BuildDocDefinitionOptions {
	pageSize?: PdfPageSize;
}

/**
 * Convert a block list into a full `TDocumentDefinitions`, including
 * manuscript-friendly defaults for margins, font, line height, and
 * heading scale. Page size defaults to US Letter; the preset's
 * `dbench-compile-page-size` can flip to A4.
 */
export function buildPdfDocDefinition(
	blocks: MdBlock[],
	options: BuildDocDefinitionOptions = {}
): TDocumentDefinitions {
	return {
		pageSize: options.pageSize ?? 'LETTER',
		pageMargins: [72, 72, 72, 72],
		content: blocks.map(renderBlock),
		styles: {
			h1: { fontSize: 28, bold: true, margin: [0, 24, 0, 8] },
			h2: { fontSize: 22, bold: true, margin: [0, 20, 0, 6] },
			h3: { fontSize: 16, bold: true, margin: [0, 16, 0, 4] },
			h4: { fontSize: 14, bold: true, margin: [0, 12, 0, 4] },
			h5: { fontSize: 12, bold: true, margin: [0, 10, 0, 4] },
			h6: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
			body: { fontSize: 11, margin: [0, 0, 0, 6], lineHeight: 1.35 },
			list: { fontSize: 11, margin: [0, 0, 0, 6], lineHeight: 1.35 },
		},
		defaultStyle: { font: 'Roboto', fontSize: 11 },
	};
}

/**
 * Render one markdown block into the pdfmake content format.
 * Exposed for unit tests; most callers use `buildPdfDocDefinition`.
 */
export function renderBlock(block: MdBlock): Content {
	switch (block.kind) {
		case 'heading':
			return {
				text: renderRuns(block.runs),
				style: `h${block.level}`,
			};
		case 'paragraph':
			return {
				text: renderRuns(block.runs),
				style: 'body',
			};
		case 'list': {
			const items = block.items.map((itemRuns) => ({
				text: renderRuns(itemRuns),
			}));
			return block.ordered
				? { ol: items, style: 'list' }
				: { ul: items, style: 'list' };
		}
	}
}

/**
 * Convert an inline run list into pdfmake's inline `text` shape.
 * Single-text runs return a string (pdfmake's tightest form); mixed
 * runs return an array of `{ text, bold?, italics? }` fragments.
 */
export function renderRuns(runs: MdRun[]): string | Array<{
	text: string;
	bold?: boolean;
	italics?: boolean;
}> {
	if (runs.length === 0) return '';
	if (runs.length === 1 && runs[0].kind === 'text') return runs[0].text;

	return runs.map((run) => {
		switch (run.kind) {
			case 'text':
				return { text: run.text };
			case 'bold':
				return { text: run.text, bold: true };
			case 'italic':
				return { text: run.text, italics: true };
		}
	});
}
