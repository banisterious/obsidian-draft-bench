import type { App, TFile } from 'obsidian';

/**
 * Frontmatter wikilink handling. Centralizes parsing, canonicalization,
 * and cache-aware lookup for `[[Foo]]`-shaped values that arrive from
 * Obsidian's metadata cache as `unknown`.
 *
 * Two on-disk YAML forms exist for the same logical wikilink and both
 * are handled here:
 *
 * 1. **Quoted-string form** (`dbench-scene: "[[Basename]]"`): value
 *    arrives as the literal string `'[[Basename]]'`.
 * 2. **Flow-notation form** (`dbench-scene: [[Basename]]` unquoted):
 *    YAML parses this as a nested single-element array
 *    (`[[<inner>]]` -> `Array(1) of Array(1) of string`).
 *
 * Aliases (`Foo|Display`), heading refs (`Foo#Heading`), block refs
 * (`Foo^block`), and path prefixes (`Path/To/Foo`) are stripped to the
 * bare basename in all paths.
 *
 * Draft Bench convention: relationship wikilink fields are single-target
 * (one parent per child); array-valued multi-target wikilinks belong on
 * reverse-array fields, not parent-pointer fields. This module does not
 * attempt to handle multi-target inputs.
 */

/**
 * Strip a Markdown linkpath down to the bare basename. Removes any path
 * prefix (`Path/To/Foo`), alias (`Foo|Display`), heading reference
 * (`Foo#Heading`), and block reference (`Foo^block`). Used by both the
 * `frontmatterLinks` resolution path (where Obsidian's cache exposes
 * the link as a string like `Path/Foo#Heading`) and the raw-frontmatter
 * fallback parser.
 */
export function basenameFromLinkpath(linkpath: string): string {
	let target = linkpath;
	const pipeIdx = target.indexOf('|');
	if (pipeIdx >= 0) target = target.slice(0, pipeIdx);
	const hashIdx = target.indexOf('#');
	if (hashIdx >= 0) target = target.slice(0, hashIdx);
	const caretIdx = target.indexOf('^');
	if (caretIdx >= 0) target = target.slice(0, caretIdx);
	const slashIdx = target.lastIndexOf('/');
	if (slashIdx >= 0) target = target.slice(slashIdx + 1);
	return target.trim();
}

/**
 * Parse the target basename from a raw frontmatter wikilink value.
 * Returns `''` when the value isn't a recognizable wikilink shape.
 * Handles both quoted-string and flow-notation forms.
 *
 * Use this when you already have the raw value in hand (typical inside
 * `processFrontMatter` callbacks where the caller passes a snapshot).
 * For "look up from disk fresh" semantics, prefer `readWikilinkBasename`.
 */
export function parseWikilinkBasename(value: unknown): string {
	if (typeof value === 'string') {
		const m = value.match(/^\[\[([^\]]+)\]\]$/);
		if (!m) return '';
		return basenameFromLinkpath(m[1]);
	}
	if (Array.isArray(value) && value.length === 1) {
		// `Array.isArray(value)` narrows to `any[]` rather than `unknown[]`,
		// so annotate explicitly to keep the read safe.
		const inner: unknown = (value as unknown[])[0];
		if (
			Array.isArray(inner) &&
			inner.length === 1 &&
			typeof inner[0] === 'string'
		) {
			return basenameFromLinkpath(inner[0]);
		}
	}
	return '';
}

/**
 * Two-tier resolution of a frontmatter wikilink field on a file:
 *
 * 1. Prefer Obsidian's `frontmatterLinks` cache. When populated, this
 *    is authoritative regardless of YAML encoding.
 * 2. Fall back to raw-value parsing via `parseWikilinkBasename` when
 *    the cache hasn't exposed the link (older Obsidian builds, certain
 *    edge cases).
 *
 * Returns `''` when neither path yields a basename. Use this for fresh
 * lookups against current cache state; callers that hold a frontmatter
 * snapshot can call the two primitives directly to preserve snapshot
 * semantics.
 */
export function readWikilinkBasename(
	app: App,
	file: TFile,
	fieldName: string
): string {
	const cache = app.metadataCache.getFileCache(file);
	const fmLink = cache?.frontmatterLinks?.find((l) => l.key === fieldName);
	if (fmLink?.link) {
		const basename = basenameFromLinkpath(fmLink.link);
		if (basename !== '') return basename;
	}
	return parseWikilinkBasename(cache?.frontmatter?.[fieldName]);
}

/**
 * Normalize a frontmatter wikilink value to the canonical quoted-string
 * form. If the value is already a string, returns it unchanged. If the
 * value is the flow-notation nested-array form, returns the equivalent
 * `"[[Basename]]"` string. Anything else returns unchanged.
 *
 * Idempotent. Applied inside Draft Bench `processFrontMatter` callbacks
 * that touch a relationship wikilink field so subsequent linker writes
 * don't progressively reshape the YAML.
 */
export function canonicalizeWikilinkValue(value: unknown): unknown {
	if (typeof value === 'string') return value;
	if (Array.isArray(value) && value.length === 1) {
		const inner: unknown = (value as unknown[])[0];
		if (
			Array.isArray(inner) &&
			inner.length === 1 &&
			typeof inner[0] === 'string'
		) {
			return `[[${inner[0]}]]`;
		}
	}
	return value;
}
