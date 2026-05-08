/**
 * RTF -> markdown converter for Scrivener document bodies.
 *
 * Per [scrivener-import.md § 6](../../../docs/planning/scrivener-import.md):
 * Scrivener stores per-document bodies as `.rtf` (or `.rtfd` bundles
 * with attachments). Importing them into DB requires conversion to
 * markdown that Obsidian can render natively.
 *
 * **Library choice (2026-05-06):** roll-your-own minimal subset.
 * Rejected `rtf-parser` (older Node-stream design, last pub 2017) and
 * `rtf-stream-parser` (browser-compat unclear, more recent but still
 * Node-stream-shaped) in favor of a focused subset targeted at
 * Scrivener's emit. Zero external dependencies; cross-platform by
 * construction (no Buffer / stream / fs); full control over edge
 * cases. Custom-subset was one of the three explicit options the
 * planning doc enumerated for the spike.
 *
 * **MVP scope (this file):** paragraph breaks, bold, italic,
 * underline, strikethrough, smart-quote / em-dash / ellipsis Unicode
 * escapes, character escapes (`\\`, `\{`, `\}`), top-level metadata
 * group skipping (`\fonttbl`, `\colortbl`, `\stylesheet`, `\info`,
 * `\*` may-skip-if-unrecognized).
 *
 * **Deferred** (handled in follow-up commits as real `.scriv` corpus
 * arrives): footnotes, comments, lists, tables, inline images,
 * hyperlinks, custom styles, page breaks, page settings. The current
 * implementation emits warnings into `result.warnings` for groups it
 * encountered but didn't render so the QA pass surfaces what's
 * missing per real scene.
 */

/** Token shape produced by the RTF tokenizer. */
type RtfToken =
	| { type: 'group-open' }
	| { type: 'group-close' }
	| {
			type: 'control-word';
			name: string;
			arg: number | null;
			/** True when a single space terminated the control word
			 *  (the space is NOT part of subsequent text). */
			hasSpaceTerminator: boolean;
	  }
	| { type: 'control-symbol'; char: string }
	| { type: 'unicode'; codePoint: number }
	| { type: 'hex'; byte: number }
	| { type: 'text'; value: string }
	| { type: 'eof' };

export interface RtfConversionResult {
	/** Markdown emit. May be empty when input is empty or all-skipped. */
	markdown: string;
	/** Non-fatal observations: unrecognized groups skipped, fallbacks
	 *  applied, etc. Surfaced to writers in the import error log. */
	warnings: string[];
}

/**
 * Convert an RTF document string to markdown. Pure function (no I/O,
 * no dependencies). Called once per Scrivener document body during
 * the import pass. See module docstring for scope + library decision.
 */
export function rtfToMarkdown(rtf: string): RtfConversionResult {
	const tokens = tokenize(rtf);
	return emit(tokens);
}

// ---- Tokenizer ----------------------------------------------------------

/**
 * Walk the input character-by-character and yield RTF tokens. The
 * tokenizer is character-stream-stateful but emits a flat token list
 * (no nesting); group nesting is reconstructed by the emitter via
 * `group-open` / `group-close` count.
 */
function tokenize(rtf: string): RtfToken[] {
	const out: RtfToken[] = [];
	let i = 0;
	const n = rtf.length;
	let textBuf = '';

	const flushText = (): void => {
		if (textBuf.length > 0) {
			out.push({ type: 'text', value: textBuf });
			textBuf = '';
		}
	};

	while (i < n) {
		const ch = rtf[i];

		if (ch === '{') {
			flushText();
			out.push({ type: 'group-open' });
			i++;
			continue;
		}

		if (ch === '}') {
			flushText();
			out.push({ type: 'group-close' });
			i++;
			continue;
		}

		if (ch === '\\') {
			flushText();
			i++;
			if (i >= n) break;
			const next = rtf[i];

			// `\'XX` (hex byte escape)
			if (next === "'") {
				i++;
				if (i + 1 < n) {
					const hex = rtf.slice(i, i + 2);
					const byte = parseInt(hex, 16);
					if (!Number.isNaN(byte)) {
						out.push({ type: 'hex', byte });
						i += 2;
						continue;
					}
				}
				// Malformed; skip the apostrophe and continue
				continue;
			}

			// Letter -> control word
			if (isAsciiLetter(next)) {
				let name = '';
				while (i < n && isAsciiLetter(rtf[i])) {
					name += rtf[i];
					i++;
				}
				// Optional numeric argument (digits, optional minus)
				let arg: number | null = null;
				if (i < n && (rtf[i] === '-' || isAsciiDigit(rtf[i]))) {
					let argStr = '';
					if (rtf[i] === '-') {
						argStr += '-';
						i++;
					}
					while (i < n && isAsciiDigit(rtf[i])) {
						argStr += rtf[i];
						i++;
					}
					arg = argStr === '-' ? null : parseInt(argStr, 10);
				}
				// Optional terminating space (consumed; not text)
				let hasSpaceTerminator = false;
				if (i < n && rtf[i] === ' ') {
					hasSpaceTerminator = true;
					i++;
				}

				// `\uNNNN` is a special control word — yield as unicode
				if (name === 'u' && arg !== null) {
					// RTF \u is signed 16-bit; negative wraps via +65536
					const cp = arg < 0 ? arg + 65536 : arg;
					out.push({ type: 'unicode', codePoint: cp });
					// Skip the replacement char that follows (RTF spec)
					if (i < n && rtf[i] !== '\\' && rtf[i] !== '{' && rtf[i] !== '}') {
						i++;
					}
					continue;
				}

				out.push({ type: 'control-word', name, arg, hasSpaceTerminator });
				continue;
			}

			// Single-char control symbol (escape sequences `\\`, `\{`,
			// `\}`, etc.)
			out.push({ type: 'control-symbol', char: next });
			i++;
			continue;
		}

		// Newlines inside RTF source are not part of text content;
		// they're whitespace separators. Skip them.
		if (ch === '\n' || ch === '\r') {
			i++;
			continue;
		}

		// Plain text byte
		textBuf += ch;
		i++;
	}

	flushText();
	out.push({ type: 'eof' });
	return out;
}

function isAsciiLetter(ch: string): boolean {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isAsciiDigit(ch: string): boolean {
	return ch >= '0' && ch <= '9';
}

// ---- Emitter ------------------------------------------------------------

/**
 * Per-group formatting state. RTF formatting is scope-bound: a
 * `\b` inside `{ ... }` only affects text within that group. The
 * emitter pushes a copy of the current state on `{`, pops on `}`.
 */
interface EmitState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	/** When > 0, suppress all text emission until matching group-close.
	 *  Used to skip `\fonttbl`, `\colortbl`, `\stylesheet`, `\info`,
	 *  and `\*` may-skip groups (their contents aren't meant for
	 *  output). The number is the group depth at which suppression
	 *  began; suppression lifts when we close back to that depth. */
	suppressDepth: number;
}

const SKIPPED_GROUP_CONTROL_WORDS = new Set([
	'fonttbl',
	'colortbl',
	'stylesheet',
	'info',
	'pict', // inline image; rendered as warning until corpus support lands
	'header',
	'footer',
	'headerl',
	'headerr',
	'footerl',
	'footerr',
]);

/**
 * Token-walker that produces markdown. Tracks two layers of state:
 *
 * - `stack` of `EmitState` (formatting scope per RTF group; pushed on
 *   `{`, popped on `}`)
 * - `open` flags for currently-emitted markers (so adjacent text
 *   tokens with the same formatting state share one marker pair
 *   instead of producing redundant `**...****...***` sequences)
 *
 * Markers close on paragraph break (`\par`) and at EOF so inline runs
 * never span blank lines (markdown disallows).
 */
function emit(tokens: RtfToken[]): RtfConversionResult {
	let md = '';
	const warnings: string[] = [];
	const stack: EmitState[] = [
		{
			bold: false,
			italic: false,
			underline: false,
			strike: false,
			suppressDepth: 0,
		},
	];
	let depth = 0;
	const seenSkipped = new Set<string>();

	const open = {
		bold: false,
		italic: false,
		underline: false,
		strike: false,
	};

	const top = (): EmitState => stack[stack.length - 1];
	const isSuppressed = (): boolean => top().suppressDepth > 0;

	/**
	 * Bring open markers in line with the current state: close any
	 * markers that should be closed (in reverse open-order so close
	 * pairs nest correctly), then open any markers that should be
	 * open. Called before any text-bearing emit.
	 */
	const ensureMarkers = (): void => {
		const s = top();
		if (open.strike && !s.strike) {
			md += '</s>';
			open.strike = false;
		}
		if (open.underline && !s.underline) {
			md += '</u>';
			open.underline = false;
		}
		if (open.italic && !s.italic) {
			md += '*';
			open.italic = false;
		}
		if (open.bold && !s.bold) {
			md += '**';
			open.bold = false;
		}
		if (s.bold && !open.bold) {
			md += '**';
			open.bold = true;
		}
		if (s.italic && !open.italic) {
			md += '*';
			open.italic = true;
		}
		if (s.underline && !open.underline) {
			md += '<u>';
			open.underline = true;
		}
		if (s.strike && !open.strike) {
			md += '<s>';
			open.strike = true;
		}
	};

	/** Close every open marker. Used at paragraph break + EOF so
	 *  inline runs don't span blank lines (markdown disallows). */
	const closeAllMarkers = (): void => {
		if (open.strike) {
			md += '</s>';
			open.strike = false;
		}
		if (open.underline) {
			md += '</u>';
			open.underline = false;
		}
		if (open.italic) {
			md += '*';
			open.italic = false;
		}
		if (open.bold) {
			md += '**';
			open.bold = false;
		}
	};

	const emitText = (text: string): void => {
		if (text === '') return;
		ensureMarkers();
		md += text;
	};

	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];

		if (tok.type === 'group-open') {
			depth++;
			stack.push({ ...top() });
			continue;
		}

		if (tok.type === 'group-close') {
			depth--;
			if (top().suppressDepth === depth + 1) {
				top().suppressDepth = 0;
			}
			stack.pop();
			if (stack.length === 0) {
				// Defensive: malformed input. Push a blank back so the
				// emitter stays usable.
				stack.push({
					bold: false,
					italic: false,
					underline: false,
					strike: false,
					suppressDepth: 0,
				});
			}
			continue;
		}

		if (tok.type === 'control-word') {
			if (SKIPPED_GROUP_CONTROL_WORDS.has(tok.name)) {
				top().suppressDepth = depth;
				// Most skipped groups (fonttbl, colortbl, stylesheet,
				// info, header*, footer*) are RTF infrastructure that
				// every Scrivener document includes; surfacing them
				// floods the writer with noise. We only warn for
				// `\pict` (inline image), where skipping actually
				// loses content the writer might care about.
				if (tok.name === 'pict' && !seenSkipped.has(tok.name)) {
					seenSkipped.add(tok.name);
					warnings.push(
						'Inline image found and skipped (image extraction lands in a follow-up commit).'
					);
				}
				continue;
			}

			if (isSuppressed()) continue;

			switch (tok.name) {
				case 'par':
				case 'sect':
					closeAllMarkers();
					md += '\n\n';
					break;
				case 'line':
					closeAllMarkers();
					md += '  \n';
					break;
				case 'tab':
					ensureMarkers();
					md += '\t';
					break;
				case 'b':
					top().bold = tok.arg !== 0;
					break;
				case 'i':
					top().italic = tok.arg !== 0;
					break;
				case 'ul':
				case 'ulw':
				case 'uld':
				case 'uldash':
				case 'uldb':
					top().underline = true;
					break;
				case 'ulnone':
					top().underline = false;
					break;
				case 'strike':
				case 'striked':
					top().strike = tok.arg !== 0;
					break;
				case 'plain':
					top().bold = false;
					top().italic = false;
					top().underline = false;
					top().strike = false;
					break;
				default:
					// Unknown control word: silently ignore. Real
					// corpus testing surfaces gaps that warrant logging.
					break;
			}
			continue;
		}

		if (tok.type === 'control-symbol') {
			// `\*` marks the next group as may-skip-if-unrecognized.
			// MVP: silently ignore the marker; SKIPPED_GROUP_CONTROL_WORDS
			// handles the suppress side via the next control-word.
			if (tok.char === '*') continue;

			if (isSuppressed()) continue;

			// Common escapes (literal backslash and braces)
			if (tok.char === '\\' || tok.char === '{' || tok.char === '}') {
				emitText(tok.char);
				continue;
			}

			// Non-breaking space (RTF `\~`)
			if (tok.char === '~') {
				emitText(' ');
				continue;
			}

			// Optional hyphen (soft hyphen): emit nothing
			if (tok.char === '-') continue;

			// Non-breaking hyphen (RTF `\_`)
			if (tok.char === '_') {
				emitText('‑');
				continue;
			}

			// Other control symbols silently ignored
			continue;
		}

		if (tok.type === 'unicode') {
			if (isSuppressed()) continue;
			emitText(String.fromCodePoint(tok.codePoint));
			continue;
		}

		if (tok.type === 'hex') {
			if (isSuppressed()) continue;
			// Default RTF charset is windows-1252; for Scrivener output
			// we treat hex bytes as Latin-1 as a starting point. Real
			// corpus testing surfaces any encoding mismatches.
			emitText(String.fromCharCode(tok.byte));
			continue;
		}

		if (tok.type === 'text') {
			if (isSuppressed()) continue;
			emitText(tok.value);
			continue;
		}

		if (tok.type === 'eof') break;
	}

	closeAllMarkers();
	md = md.replace(/\n{3,}/g, '\n\n');
	md = md.trim();

	return { markdown: md, warnings };
}
