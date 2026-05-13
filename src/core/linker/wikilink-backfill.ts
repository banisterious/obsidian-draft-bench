import { type App, type TFile } from 'obsidian';
import { adaptProcessFrontMatter, readString } from '../frontmatter-access';
import {
	basenameFromLinkpath,
	canonicalizeWikilinkValue,
	parseWikilinkBasename,
} from '../frontmatter-wikilinks';
import type { RelationshipConfig } from './reconciliation';

/**
 * Retrofit-time wikilink-only companion-id backfill for the linker
 * (issues #4 and #6).
 *
 * When a writer manually sets a relationship wikilink in the
 * Properties panel (e.g., `dbench-scene: [[Some Scene]]`) without
 * copying the parent's id into the companion (`dbench-scene-id`),
 * `backfillCompanionId`:
 *
 * 1. Resolves the wikilink against the candidate-parent pool (using
 *    Obsidian's `frontmatterLinks` cache when populated, raw-value
 *    parsing as fallback).
 * 2. Writes the matched parent's id into the child's companion field
 *    via `processFrontMatter`, also re-canonicalizing the wikilink
 *    field to clean quoted-string form (#7).
 * 3. Returns the (now-populated) parent id so reconciliation in the
 *    same event proceeds without a second pass.
 *
 * Returns the existing declared parent id (or `''` when the backfill
 * doesn't apply or doesn't find a match). Cleanup-only configs
 * (`applies` false) skip the backfill entirely and always return `''`.
 */
export async function backfillCompanionId(
	app: App,
	childFile: TFile,
	childFm: Record<string, unknown>,
	config: RelationshipConfig,
	applies: boolean
): Promise<string> {
	const declaredParentId = applies
		? readString(childFm[config.childParentIdField])
		: '';
	if (!applies || declaredParentId !== '') return declaredParentId;

	const wikilinkBasename = resolveParentBasename(
		app,
		childFile,
		childFm,
		config.childParentWikilinkField
	);
	if (wikilinkBasename === '') return '';

	const matched = config
		.candidateParents(app)
		.find((c) => c.file.basename === wikilinkBasename);
	if (!matched) return '';

	const matchedId = readString(matched.frontmatter['dbench-id']);
	if (matchedId === '') return '';

	await app.fileManager.processFrontMatter(childFile, (rawFm) => {
		const fm = adaptProcessFrontMatter(rawFm);
		fm[config.childParentIdField] = matchedId;
		// Re-canonicalize the wikilink field so the serializer writes
		// a clean quoted string, not block-style nested-array YAML (#7).
		fm[config.childParentWikilinkField] = canonicalizeWikilinkValue(
			fm[config.childParentWikilinkField]
		);
	});
	return matchedId;
}

/**
 * Resolve the basename of the wikilink target stored at the given
 * frontmatter field on `childFile`. Two-tier:
 *
 * 1. **`frontmatterLinks` cache** (authoritative). Obsidian populates
 *    this for every resolved wikilink reference in a file's frontmatter,
 *    regardless of YAML encoding (string, flow-notation, alias). The
 *    entry's `link` field is the link target, possibly with subpath;
 *    basename it.
 * 2. **Raw frontmatter value** (fallback). Direct parse via
 *    `parseWikilinkBasename`. Useful when `frontmatterLinks` isn't
 *    populated (older Obsidian builds, certain edge cases).
 *
 * Returns `''` when neither path yields a basename.
 */
function resolveParentBasename(
	app: App,
	childFile: TFile,
	childFm: Record<string, unknown>,
	fieldName: string
): string {
	const cache = app.metadataCache.getFileCache(childFile);
	const fmLink = cache?.frontmatterLinks?.find((l) => l.key === fieldName);
	if (fmLink?.link) {
		const basename = basenameFromLinkpath(fmLink.link);
		if (basename !== '') return basename;
	}
	return parseWikilinkBasename(childFm[fieldName]);
}
