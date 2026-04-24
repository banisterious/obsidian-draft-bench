/**
 * Minimal markdown -> AST parser for the ODT renderer.
 *
 * V1 handles the subset of constructs the compile pipeline emits
 * (headings, paragraphs, bullet / numbered lists, bold + italic
 * inline runs). Blockquotes, code blocks, tables, and footnotes
 * degrade to plain paragraphs — acceptable tradeoff for V1
 * documented in D-06's rule table. Writers who need those constructs
 * can compile to MD and paste into the downstream word processor.
 *
 * This parser is deliberately line-oriented and naive. A more robust
 * treatment lives in external libs like markdown-it, but pulling one
 * in for a capped feature set isn't worth the dep weight. Upgrade
 * when the renderer's scope expands.
 */

/** Inline text run with optional emphasis. */
export type OdtRun =
	| { kind: 'text'; text: string }
	| { kind: 'bold'; text: string }
	| { kind: 'italic'; text: string };

export interface OdtHeading {
	kind: 'heading';
	level: 1 | 2 | 3 | 4 | 5 | 6;
	runs: OdtRun[];
}

export interface OdtParagraph {
	kind: 'paragraph';
	runs: OdtRun[];
}

export interface OdtList {
	kind: 'list';
	ordered: boolean;
	items: OdtRun[][];
}

export interface OdtThematicBreak {
	kind: 'thematic-break';
}

/**
 * Fused section-break-title block. The compile-service emits section
 * breaks as `* * *\n\n**Title**\n\n* * *` in the markdown intermediate.
 * The post-pass below collapses this exact shape into a single block
 * so renderers can style the title as a centered, larger paragraph
 * (rather than a body-text-sized bold paragraph between two dinkuses,
 * which reads as too quiet for a "Part II" divider in PDF / ODT
 * output).
 *
 * Vault-MD output is unaffected; only the AST that PDF / ODT renderers
 * consume gets the fused block.
 */
export interface OdtSectionBreakTitle {
	kind: 'section-break-title';
	title: string;
}

export type OdtBlock =
	| OdtHeading
	| OdtParagraph
	| OdtList
	| OdtThematicBreak
	| OdtSectionBreakTitle;

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM_PATTERN = /^\s*[-*+]\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\s*\d+\.\s+(.*)$/;
/**
 * CommonMark thematic break: 3+ matching `-`, `*`, or `_` characters
 * on a line, optionally separated by spaces / tabs. `* * *` (the
 * compile dinkus emitted by section-break injection) is the case
 * that motivated this — without explicit detection, the leading `*`
 * matches the unordered-list pattern and the dinkus renders as a
 * bullet list of asterisks.
 */
const THEMATIC_BREAK_PATTERN = /^\s*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * Parse `markdown` into a flat block list. Blank lines are
 * separators; consecutive non-blank lines of the same kind merge
 * into one block (paragraph lines join with spaces; list items
 * accumulate until the run ends).
 */
export function parseMarkdownForOdt(markdown: string): OdtBlock[] {
	const lines = markdown.split('\n');
	const blocks: OdtBlock[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.trim() === '') {
			i++;
			continue;
		}

		const headingMatch = HEADING_PATTERN.exec(line);
		if (headingMatch) {
			const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
			blocks.push({
				kind: 'heading',
				level,
				runs: parseInline(headingMatch[2]),
			});
			i++;
			continue;
		}

		// Thematic break must come before the list-item check —
		// `* * *` matches the unordered-item regex too, and we want
		// HR semantics, not bullets.
		if (THEMATIC_BREAK_PATTERN.test(line)) {
			blocks.push({ kind: 'thematic-break' });
			i++;
			continue;
		}

		const unorderedMatch = UNORDERED_ITEM_PATTERN.exec(line);
		if (unorderedMatch) {
			const items: OdtRun[][] = [];
			while (i < lines.length) {
				const m = UNORDERED_ITEM_PATTERN.exec(lines[i]);
				if (!m) break;
				items.push(parseInline(m[1]));
				i++;
			}
			blocks.push({ kind: 'list', ordered: false, items });
			continue;
		}

		const orderedMatch = ORDERED_ITEM_PATTERN.exec(line);
		if (orderedMatch) {
			const items: OdtRun[][] = [];
			while (i < lines.length) {
				const m = ORDERED_ITEM_PATTERN.exec(lines[i]);
				if (!m) break;
				items.push(parseInline(m[1]));
				i++;
			}
			blocks.push({ kind: 'list', ordered: true, items });
			continue;
		}

		// Accumulate a paragraph from consecutive non-blank, non-block-start
		// lines.
		const paraLines: string[] = [];
		while (i < lines.length) {
			const curr = lines[i];
			if (curr.trim() === '') break;
			if (
				HEADING_PATTERN.test(curr) ||
				THEMATIC_BREAK_PATTERN.test(curr) ||
				UNORDERED_ITEM_PATTERN.test(curr) ||
				ORDERED_ITEM_PATTERN.test(curr)
			)
				break;
			paraLines.push(curr);
			i++;
		}
		const paraText = paraLines.join(' ');
		if (paraText.trim().length > 0) {
			blocks.push({ kind: 'paragraph', runs: parseInline(paraText) });
		}
	}

	return fuseSectionBreakTitles(blocks);
}

/**
 * Post-parse pass: collapse the [thematic-break, paragraph-of-only-
 * bold, thematic-break] sequence emitted by `buildSectionBreak` into
 * a single `section-break-title` block. Anything that doesn't match
 * the exact shape passes through unchanged, so authored markdown
 * that incidentally contains a bold-only paragraph between two HRs
 * isn't accidentally fused.
 */
function fuseSectionBreakTitles(blocks: OdtBlock[]): OdtBlock[] {
	const out: OdtBlock[] = [];
	let i = 0;
	while (i < blocks.length) {
		const a = blocks[i];
		const b = blocks[i + 1];
		const c = blocks[i + 2];
		if (
			a?.kind === 'thematic-break' &&
			b?.kind === 'paragraph' &&
			c?.kind === 'thematic-break' &&
			isBoldOnlyParagraph(b)
		) {
			const para = b;
			const firstRun = para.runs[0];
			const title = firstRun.kind === 'bold' ? firstRun.text : '';
			out.push({ kind: 'section-break-title', title });
			i += 3;
			continue;
		}
		out.push(a);
		i++;
	}
	return out;
}

function isBoldOnlyParagraph(b: OdtParagraph): boolean {
	return b.runs.length === 1 && b.runs[0].kind === 'bold';
}

/**
 * Parse inline markup into a flat run list. Recognizes `**bold**`
 * and `*italic*` markers at a single level of nesting — nested
 * combinations (e.g., `**bold *and italic* inside**`) collapse to
 * whichever outer marker won the regex race. Acceptable V1 behavior
 * given how rare deeply-nested emphasis is in prose drafts.
 *
 * Exported for unit tests; most callers use `parseMarkdownForOdt`.
 */
export function parseInline(text: string): OdtRun[] {
	const runs: OdtRun[] = [];
	const pattern = /(\*\*([^*]+?)\*\*|\*([^*]+?)\*)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text)) !== null) {
		if (match.index > lastIndex) {
			runs.push({
				kind: 'text',
				text: text.slice(lastIndex, match.index),
			});
		}
		if (match[2] !== undefined) {
			runs.push({ kind: 'bold', text: match[2] });
		} else if (match[3] !== undefined) {
			runs.push({ kind: 'italic', text: match[3] });
		}
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		runs.push({ kind: 'text', text: text.slice(lastIndex) });
	}

	return runs;
}
