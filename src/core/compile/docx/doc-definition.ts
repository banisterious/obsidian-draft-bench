import {
	AlignmentType,
	Document,
	HeadingLevel,
	LevelFormat,
	Paragraph,
	TextRun,
} from 'docx';
import type {
	MdBlock,
	MdHeading,
	MdList,
	MdParagraph,
	MdRun,
} from '../md-ast';

/**
 * Pure MdBlock[] -> docx.Document translator for the DOCX renderer.
 *
 * The compile-service emits a markdown intermediate; the shared parser
 * (`md-ast.ts`) lifts it into a small block AST. This module turns
 * that AST into a `docx.Document` ready for `Packer.toBuffer`. No
 * filesystem, no host-process APIs — everything's pure so unit tests
 * can roundtrip without standing up the docx runtime quirks.
 *
 * V1 scope mirrors the ODT and PDF renderers (per
 * [D-06 § Output format](../../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md)):
 * headings, paragraphs, bullet + numbered lists, bold + italic. The
 * shared parser already degrades blockquotes, code blocks, tables,
 * and footnotes to plain paragraphs upstream; this module inherits
 * that V1 capping without re-implementing it.
 *
 * Numbered-list nuance: docx requires a document-level numbering
 * config that ordered-list paragraphs reference. V1 defines a single
 * `'dbench-numbered'` reference and reuses it for every numbered
 * list, which means consecutive numbered lists continue counting
 * (list 2 starts where list 1 left off). Per-list restart would
 * require generating a fresh reference per list — deferred unless
 * writers complain.
 */

const TWIPS_PER_INCH = 1440;

/**
 * Page sizes in twentieths of a point (the unit docx wants for
 * IPageSizeAttributes). LETTER = 8.5" x 11"; A4 = 210mm x 297mm.
 */
const PAGE_SIZE_TWIPS = {
	LETTER: { width: 8.5 * TWIPS_PER_INCH, height: 11 * TWIPS_PER_INCH },
	A4: { width: 11906, height: 16838 },
} as const;

/** Numbering reference shared by every ordered list in the document. */
const NUMBERED_LIST_REF = 'dbench-numbered';

export type DocxPageSize = 'LETTER' | 'A4';

export interface BuildDocxContext {
	pageSize: DocxPageSize;
}

/**
 * Translate a parsed markdown block list into a `docx.Document`.
 *
 * The returned document has a single section with the requested page
 * size and the block list rendered as paragraphs. A numbering config
 * is attached at the document level even when no ordered list exists
 * — it's small overhead and keeps the output deterministic regardless
 * of input shape.
 */
export function buildDocxDocument(
	blocks: readonly MdBlock[],
	ctx: BuildDocxContext
): Document {
	const paragraphs: Paragraph[] = [];
	for (const block of blocks) {
		paragraphs.push(...buildBlockParagraphs(block));
	}

	return new Document({
		numbering: {
			config: [
				{
					reference: NUMBERED_LIST_REF,
					levels: [
						{
							level: 0,
							format: LevelFormat.DECIMAL,
							text: '%1.',
							alignment: AlignmentType.START,
						},
					],
				},
			],
		},
		sections: [
			{
				properties: {
					page: {
						size: PAGE_SIZE_TWIPS[ctx.pageSize],
					},
				},
				children: paragraphs,
			},
		],
	});
}

/**
 * Convert one MdBlock into the paragraph(s) it represents. Most
 * blocks become a single paragraph; lists fan out into one paragraph
 * per item.
 */
function buildBlockParagraphs(block: MdBlock): Paragraph[] {
	switch (block.kind) {
		case 'heading':
			return [buildHeading(block)];
		case 'paragraph':
			return [buildParagraph(block)];
		case 'list':
			return buildListParagraphs(block);
		case 'thematic-break':
			// docx has no native thematic-break primitive. Emit a
			// centered "* * *" paragraph — visually mirrors the
			// markdown-intermediate dinkus and is what the PDF + ODT
			// renderers already produce.
			return [
				new Paragraph({
					alignment: AlignmentType.CENTER,
					children: [new TextRun({ text: '* * *' })],
				}),
			];
		case 'section-break-title':
			// Match the PDF/ODT convention: centered, bold, larger
			// size. `size` is in half-points (28 = 14pt).
			return [
				new Paragraph({
					alignment: AlignmentType.CENTER,
					children: [
						new TextRun({ text: block.title, bold: true, size: 28 }),
					],
				}),
			];
	}
}

function buildHeading(block: MdHeading): Paragraph {
	return new Paragraph({
		heading: HEADING_LEVELS[block.level],
		children: runsToTextRuns(block.runs),
	});
}

function buildParagraph(block: MdParagraph): Paragraph {
	return new Paragraph({
		children: runsToTextRuns(block.runs),
	});
}

function buildListParagraphs(block: MdList): Paragraph[] {
	return block.items.map((item) =>
		new Paragraph({
			children: runsToTextRuns(item),
			...(block.ordered
				? { numbering: { reference: NUMBERED_LIST_REF, level: 0 } }
				: { bullet: { level: 0 } }),
		})
	);
}

function runsToTextRuns(runs: readonly MdRun[]): TextRun[] {
	return runs.map((run) => {
		if (run.kind === 'bold') {
			return new TextRun({ text: run.text, bold: true });
		}
		if (run.kind === 'italic') {
			return new TextRun({ text: run.text, italics: true });
		}
		return new TextRun({ text: run.text });
	});
}

const HEADING_LEVELS = {
	1: HeadingLevel.HEADING_1,
	2: HeadingLevel.HEADING_2,
	3: HeadingLevel.HEADING_3,
	4: HeadingLevel.HEADING_4,
	5: HeadingLevel.HEADING_5,
	6: HeadingLevel.HEADING_6,
} as const;
