import type {
	CompileDinkusRule,
	CompileEmbedRule,
	CompileFrontmatterRule,
	CompileHeadingScope,
	CompilePresetFrontmatter,
	CompileWikilinkRule,
} from '../../model/compile-preset';
import { sliceToDraft, stripFrontmatter } from '../word-count';
import { classifyEmbedPath, type StripAccumulator } from './strip-accumulator';

/**
 * Per-scene context threaded into `applyContentRules`. Kept narrow so
 * the rule engine doesn't depend on Obsidian runtime types; callers in
 * the compile service build this from the scene's discovery record.
 */
export interface RuleContext {
	preset: CompilePresetFrontmatter;
	/** Scene note basename — becomes the chapter H1 title. */
	sceneTitle: string;
	/**
	 * 1-based position of this scene in the compile set (post-filter).
	 * Used for chapter numbering (numeric / roman prefixes).
	 */
	compileIndex: number;
	/**
	 * Optional accumulator for strip-with-notice events (P3.F). The
	 * compile service passes one shared accumulator across all scenes
	 * so the final summary reflects the whole compile run. When
	 * omitted (rule-level unit tests), strips still happen but go
	 * unrecorded.
	 */
	stripAccumulator?: StripAccumulator;
}

/**
 * Run the V1 content-handling pipeline on one scene's raw file content
 * (frontmatter fence included). Returns the transformed markdown
 * fragment the compile service concatenates into the final document.
 *
 * Implements the content-handling rule table from
 * [D-06 § Content-handling rules](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md).
 * Eleven rules are applied here; footnote renumbering (rule 6),
 * section-break insertion (separate scene-scoped property), and djb2
 * hashing ship in their own modules alongside this one.
 *
 * Pipeline order matters:
 *
 * 1. **Rule 3 frontmatter** — strip the leading YAML fence (or preserve).
 * 2. **Rule 1 body scope** — slice to below `^## Draft` (or keep full).
 * 3. **Rule 2 headings** — shift in-body H1s to H2, then prepend the
 *    scene-title H1 (with optional numeric / roman numbering prefix).
 * 4. **Rules 10 / 11 line-level** — drop callout marker lines; strip
 *    task checkbox syntax.
 * 5. **Rules 8a/b/c, 9, 12, 14, 15, 5 inline** — applied only to
 *    non-fenced regions so code blocks (rule 13) stay verbatim.
 *
 * No-op rules in this module: 4 (horizontal rules — preserve), 7 (HTML
 * — renderers handle), 13 (math / code — protected from transforms),
 * 16 (tables — renderers handle).
 */
export function applyContentRules(rawContent: string, ctx: RuleContext): string {
	// Rule 3 + rule 1: get the working body.
	let body = applyFrontmatterRule(
		rawContent,
		ctx.preset['dbench-compile-frontmatter']
	);
	body = applyBodyScopeRule(body, ctx.preset['dbench-compile-heading-scope']);
	body = body.trim();

	// Rule 2: shift in-body H1s down, then prepend the scene-title H1.
	body = shiftH1sInBody(body);
	const heading = buildSceneHeading(
		ctx.sceneTitle,
		ctx.compileIndex,
		ctx.preset
	);
	body = body.length > 0 ? `${heading}\n\n${body}` : heading;

	// Rules 10 + 11: line-level strip-by-filter / strip-by-regex.
	body = stripCalloutMarkers(body);
	body = stripTaskCheckboxes(body);

	// Rules 8a/b/c, 9, 12, 14, 15, 5: inline transforms protected from
	// code fences.
	body = transformOutsideCode(body, (text) => {
		let t = text;
		// Embeds first so wikilink regex only sees non-embed [[...]].
		// The media + note embed handlers share one regex pass via
		// stripEmbeds so each embed is categorized exactly once.
		t = stripEmbeds(t, ctx.preset['dbench-compile-embeds'], ctx.stripAccumulator);
		t = applyWikilinkRule(t, ctx.preset['dbench-compile-wikilinks']);
		t = stripTags(t);
		t = stripComments(t);
		t = stripHighlights(t);
		t = applyDinkusRule(t, ctx.preset['dbench-compile-dinkuses']);
		// Final whitespace cleanup: inline rules strip content but
		// leave the spaces / blank lines that flanked it. Collapse
		// mid-line double-spaces, whitespace-only lines, and triple+
		// newline runs so the output reads cleanly.
		t = normalizeWhitespaceArtifacts(t);
		return t;
	});

	// Trim trailing whitespace the inline rules may have left at
	// end-of-scene (e.g., stripTags leaves a trailing space when a
	// tag ended the body). Without this, the scene-concat in
	// `compile-service` ends up with `...\n\n \n\n#heading` between
	// scenes, which renders as an extra blank paragraph.
	body = body.trimEnd();

	return body;
}

/**
 * Tidy the whitespace the inline strip rules leave behind.
 *
 * Two artifacts:
 *
 * 1. `Hello ![[pic.png]] world` -> `Hello  world` — the embed strip
 *    leaves a double space where the embed was flanked by spaces.
 * 2. `para\n\n%% comment %%\n\npara` -> `para\n\n\n\npara` — the
 *    comment strip leaves the surrounding blank lines, producing a
 *    triple+ newline run that renders as an extra blank paragraph.
 *
 * Rules:
 *
 * - `(\S)[ \t]{2,}(\S)` -> `$1 $2` collapses runs of 2+ horizontal
 *   whitespace between non-space characters. Leading indentation is
 *   preserved (the lookaround requires a non-space before) and blank
 *   lines are preserved (runs of whitespace across newlines aren't
 *   matched by `[ \t]`).
 * - `\n{3,}` -> `\n\n` collapses 3+ consecutive newlines to a single
 *   blank line.
 *
 * Runs inside `transformOutsideCode`, so code fences are skipped and
 * fenced content keeps its authored whitespace.
 *
 * Tradeoff: writers who intentionally type two spaces after a period
 * (old-school typography) lose that. Markdown renderers collapse
 * such spaces to one anyway, so the effect isn't visible in the
 * rendered output; and the per-rule alternative (strip N adjacent
 * spaces in each inline rule) is fragile. Acceptable V1 behavior.
 */
export function normalizeWhitespaceArtifacts(text: string): string {
	return text
		.replace(/(\S)[ \t]{2,}(\S)/g, '$1 $2')
		// Whitespace-only lines (e.g., a line containing just the
		// space stripTags leaves behind) become true blanks so the
		// next pass can collapse adjacent runs.
		.replace(/\n[ \t]+\n/g, '\n\n')
		.replace(/\n{3,}/g, '\n\n');
}

// ---- Rule 3: frontmatter --------------------------------------------

export function applyFrontmatterRule(
	raw: string,
	mode: CompileFrontmatterRule
): string {
	return mode === 'preserve' ? raw : stripFrontmatter(raw);
}

// ---- Rule 1: body scope ---------------------------------------------

export function applyBodyScopeRule(
	body: string,
	mode: CompileHeadingScope
): string {
	return mode === 'full' ? body : sliceToDraft(body);
}

// ---- Rule 2: headings -----------------------------------------------

/**
 * Shift every in-body `# ` heading to `## `, skipping lines inside
 * fenced code blocks. Leaves H2+ headings alone.
 */
export function shiftH1sInBody(body: string): string {
	const lines = body.split('\n');
	let inFence = false;
	return lines
		.map((line) => {
			if (isFenceLine(line)) {
				inFence = !inFence;
				return line;
			}
			if (!inFence && /^# /.test(line)) {
				return '#' + line;
			}
			return line;
		})
		.join('\n');
}

export function buildSceneHeading(
	title: string,
	index: number,
	preset: CompilePresetFrontmatter
): string {
	const numbering = preset['dbench-compile-chapter-numbering'];
	if (numbering === 'numeric') return `# ${index}. ${title}`;
	if (numbering === 'roman') return `# ${toRoman(index)}. ${title}`;
	return `# ${title}`;
}

/**
 * Convert a positive integer (1..3999) to a Roman numeral. Returns
 * the input as a decimal string outside that range — a sensible
 * fallback for unexpected compile-set sizes rather than throwing.
 */
export function toRoman(n: number): string {
	if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
	const table: Array<[string, number]> = [
		['M', 1000],
		['CM', 900],
		['D', 500],
		['CD', 400],
		['C', 100],
		['XC', 90],
		['L', 50],
		['XL', 40],
		['X', 10],
		['IX', 9],
		['V', 5],
		['IV', 4],
		['I', 1],
	];
	let out = '';
	let remaining = n;
	for (const [glyph, value] of table) {
		while (remaining >= value) {
			out += glyph;
			remaining -= value;
		}
	}
	return out;
}

// ---- Rule 10: callouts ----------------------------------------------

/**
 * Drop lines that declare an Obsidian callout marker (`> [!note]`,
 * `> [!warning]-` collapsed, etc.). Subsequent blockquote-body lines
 * remain — the callout becomes a plain blockquote in the output.
 */
/**
 * Strip Obsidian callout blocks entirely (rule 10).
 *
 * A callout starts with `> [!type] Title` (with optional `+` / `-`
 * fold marker) and continues across subsequent `>`-prefixed lines
 * until a non-`>` line (blank or otherwise) ends the block.
 *
 * Earlier behavior dropped only the header line, leaving the
 * continuation `>` lines in place. They then rendered as a regular
 * blockquote in the PDF / ODT output, surfacing the writer's
 * research-note text in the compiled manuscript. The whole block
 * has to go.
 *
 * Regular blockquotes (no `[!type]` marker) are not in scope of
 * rule 10 and pass through unchanged.
 */
export function stripCalloutMarkers(body: string): string {
	const lines = body.split('\n');
	const out: string[] = [];
	let inCallout = false;
	for (const line of lines) {
		if (/^\s*>\s*\[![\w-]+\][+-]?/.test(line)) {
			inCallout = true;
			continue;
		}
		if (inCallout) {
			if (/^\s*>/.test(line)) continue;
			inCallout = false;
		}
		out.push(line);
	}
	return out.join('\n');
}

// ---- Rule 11: tasks -------------------------------------------------

/**
 * Strip Obsidian Tasks / GitHub-style checkbox markers from list
 * items, keeping the bullet + text. Matches `[ ]`, `[x]`, `[X]`, `[/]`
 * and anything else single-character; other task emojis / metadata
 * after the checkbox pass through unchanged.
 */
export function stripTaskCheckboxes(body: string): string {
	return body.replace(/^(\s*[-*+]\s+)\[[^\]]\]\s?/gm, '$1');
}

// ---- Rules 8a / 8b / 8c: embeds -------------------------------------

/**
 * Unified embed stripper (rules 8a / 8b / 8c combined).
 *
 * All `![[...]]` embeds are dropped in V1 regardless of category:
 * media types (image / audio / video / pdf / base) have no
 * resolution path, and the per-preset `resolve` mode for note
 * embeds is reserved for post-V1. Every embed is classified (by
 * extension for media, default to `note`) and recorded in the
 * accumulator so the compile dispatcher can surface a batched
 * summary Notice at completion.
 *
 * One regex pass ensures each embed is counted exactly once; the
 * earlier per-category helpers were prone to double-counting if
 * chained out of order.
 */
export function stripEmbeds(
	text: string,
	_mode: CompileEmbedRule,
	acc?: StripAccumulator
): string {
	return text.replace(/!\[\[([^\]]+?)\]\]/g, (_match, inner: string) => {
		const path = inner.split('#')[0].split('|')[0];
		const category = classifyEmbedPath(path) ?? 'note';
		acc?.record(category);
		return '';
	});
}

// ---- Rule 9: wikilinks ----------------------------------------------

export function applyWikilinkRule(
	text: string,
	mode: CompileWikilinkRule
): string {
	if (mode === 'preserve-syntax') return text;
	return text.replace(/\[\[([^\]]+?)\]\]/g, (_match, inner: string) => {
		if (mode === 'strip') return '';
		// display-text
		const pipe = inner.indexOf('|');
		if (pipe >= 0) return inner.slice(pipe + 1);
		return inner.split('#')[0];
	});
}

// ---- Rule 12: tags --------------------------------------------------

/**
 * Remove inline Obsidian tags (`#foo/bar`). Skips heading lines
 * (`^#+ `) because the tag regex would mangle heading text. Leaves
 * tags inside code fences untouched via `transformOutsideCode`.
 */
export function stripTags(text: string): string {
	return text
		.split('\n')
		.map((line) => {
			if (/^#{1,6}\s/.test(line)) return line;
			return line.replace(/(^|\s)#[\w\-/]+/g, '$1');
		})
		.join('\n');
}

// ---- Rule 14: comments ----------------------------------------------

export function stripComments(text: string): string {
	return text.replace(/%%[\s\S]*?%%/g, '');
}

// ---- Rule 15: highlights --------------------------------------------

export function stripHighlights(text: string): string {
	return text.replace(/==([^=]+?)==/g, '$1');
}

// ---- Rule 5: dinkuses -----------------------------------------------

/**
 * Normalize recognized scene-break glyphs to `* * *`. Recognized
 * variants per D-06:
 *
 * - 3+ asterisks interspersed with whitespace (`* * *`, `***`, `****`,
 *   `* * * *`)
 * - Unicode asterism (`⁂`)
 * - Fullwidth asterisks (`＊＊＊`)
 *
 * In `preserve` mode the body is returned unchanged.
 */
export function applyDinkusRule(text: string, mode: CompileDinkusRule): string {
	if (mode === 'preserve') return text;
	return text
		.split('\n')
		.map((line) => {
			const trimmed = line.trim();
			if (trimmed === '⁂') return '* * *';
			if (/^＊{3,}$/.test(trimmed)) return '* * *';
			const nonWs = trimmed.replace(/\s/g, '');
			if (nonWs.length >= 3 && /^\*+$/.test(nonWs)) return '* * *';
			return line;
		})
		.join('\n');
}

// ---- Code-fence protection ------------------------------------------

/**
 * Apply `fn` only to text outside fenced code blocks. Fence markers
 * (`` ``` ``, `~~~`) and the lines between them are emitted verbatim
 * so rule 13 (math / code preserved) holds without every individual
 * inline rule needing to learn about fences.
 *
 * Inline code backticks are *not* protected; acceptable for V1 and
 * documented in D-06. If writers complain we can revisit with a more
 * careful tokenizer.
 */
export function transformOutsideCode(
	body: string,
	fn: (text: string) => string
): string {
	const lines = body.split('\n');
	const output: string[] = [];
	let buffer: string[] = [];
	let inFence = false;

	const flush = () => {
		if (buffer.length === 0) return;
		output.push(fn(buffer.join('\n')));
		buffer = [];
	};

	for (const line of lines) {
		if (isFenceLine(line)) {
			if (!inFence) {
				flush();
				inFence = true;
			} else {
				inFence = false;
			}
			output.push(line);
			continue;
		}
		if (inFence) {
			output.push(line);
		} else {
			buffer.push(line);
		}
	}
	flush();
	return output.join('\n');
}

function isFenceLine(line: string): boolean {
	return /^\s*(```|~~~)/.test(line);
}
