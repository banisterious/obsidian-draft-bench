/**
 * Scene word counter. Pure functions only — no Obsidian runtime
 * dependency — so the pipeline can be exercised by unit tests in
 * isolation from vault state.
 *
 * Pipeline for `countScene`:
 *   1. Strip YAML frontmatter.
 *   2. Slice to the first `## Draft` heading (if present); whole-body
 *      if absent. Matches the V1 scene template's "## Draft" section
 *      so planning sections above it don't inflate the count.
 *   3. Strip fenced code blocks, inline code, Obsidian `%%` comments,
 *      HTML `<!-- -->` comments. Unwrap wikilinks and markdown links
 *      to their display text.
 *   4. Split on whitespace, discard empty tokens, return the length.
 *
 * Stripping patterns adapted from Custom Selected Word Count
 * (`S:\Projects\obsidian-plugins\word-count`). The strictness of the
 * "## Draft" heading match is intentional: the V1 scene template
 * produces exactly that heading. Writers who rename it drop back to
 * whole-body counting — acceptable for V1; a configurable heading is
 * a post-V1 consideration if writers ask.
 */

/**
 * Regex anchor for the Draft section: level-2 heading, exact text,
 * optional trailing spaces / tabs (but not newlines — `\s` would
 * greedily consume the line terminator).
 */
const DRAFT_HEADING_PATTERN = /^## Draft[ \t]*$/m;

/**
 * Top-level entry point: given the raw markdown body of a scene file
 * (with or without frontmatter), return the number of words in the
 * "countable" portion.
 */
export function countScene(markdown: string): number {
	const body = stripFrontmatter(markdown);
	const scoped = sliceToDraft(body);
	const cleaned = stripMarkup(scoped);
	return countWords(cleaned);
}

/**
 * Remove a leading YAML frontmatter block (`---\n...\n---`). Returns
 * the original text unchanged if the input doesn't start with `---`.
 * If a `---` opens but no closer is found, treats the whole input as
 * frontmatter and returns ''.
 */
export function stripFrontmatter(text: string): string {
	if (!text.startsWith('---')) return text;
	const lines = text.split('\n');
	let closer = -1;
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line === '---' || line === '...') {
			closer = i;
			break;
		}
	}
	if (closer === -1) return '';
	return lines.slice(closer + 1).join('\n');
}

/**
 * Return everything after the first `## Draft` heading. The heading
 * line itself is excluded. If no matching heading is found, return
 * the input unchanged so non-template scenes still get a word count.
 */
export function sliceToDraft(body: string): string {
	const match = DRAFT_HEADING_PATTERN.exec(body);
	if (!match) return body;
	const afterHeading = match.index + match[0].length;
	// Skip a single trailing newline so the returned body doesn't start
	// with an awkward blank line artifact of the heading line.
	const nextChar = body.charAt(afterHeading);
	return body.slice(afterHeading + (nextChar === '\n' ? 1 : 0));
}

/**
 * Apply all content-stripping rules in a fixed order: fenced code,
 * inline code, Obsidian `%%` comments, HTML `<!-- -->` comments,
 * wikilinks, markdown links. Order matters: strip fences before
 * single backticks, comments before links.
 */
export function stripMarkup(text: string): string {
	let out = text;
	out = out.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
	out = out.replace(/`(?:[^`\\]|\\.)*`/g, '');
	out = out.replace(/%%[\s\S]*?%%/g, '');
	out = out.replace(/<!--[\s\S]*?-->/g, '');
	out = out.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2');
	out = out.replace(/\[\[([^\]]+)\]\]/g, '$1');
	out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
	return out;
}

/**
 * Count whitespace-separated tokens. Matches the convention used by
 * Longform, Scrivener, and most prose tools: "don't" = 1,
 * "state-of-the-art" = 1, "404" = 1.
 */
export function countWords(text: string): number {
	const tokens = text.trim().split(/\s+/);
	if (tokens.length === 1 && tokens[0] === '') return 0;
	return tokens.length;
}
