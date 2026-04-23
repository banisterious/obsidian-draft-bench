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

export type OdtBlock = OdtHeading | OdtParagraph | OdtList;

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM_PATTERN = /^\s*[-*+]\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\s*\d+\.\s+(.*)$/;

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

	return blocks;
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
