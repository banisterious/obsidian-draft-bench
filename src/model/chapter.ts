import type { DbenchId, DbenchStatus } from './types';

/**
 * Frontmatter shape for a Draft Bench chapter note (`dbench-type: chapter`).
 *
 * Chapters are the optional second hierarchy level between projects and
 * scenes. A project has either chapter children or direct scene children,
 * never both ([chapter-type.md § 9](../../docs/planning/chapter-type.md)).
 * Chapter-less projects continue to work as today; chapter-aware
 * projects gain the `project → chapter → scene` shape.
 *
 * All required fields are stamped by `stampChapterEssentials` at note
 * creation (or retrofit). The reverse arrays (`dbench-scenes`,
 * `dbench-scene-ids`, `dbench-drafts`, `dbench-draft-ids`) are
 * maintained by the linker.
 *
 * `dbench-project` may be empty when the chapter is "orphan" (created
 * via retrofit before being attached to a project). `dbench-order` is
 * the chapter position within its parent project.
 *
 * Optional `dbench-target-words` and `dbench-synopsis` are writer-set;
 * not stamped at creation. Both surface in the Manuscript view's chapter
 * card when present.
 */
export interface ChapterFrontmatter {
	'dbench-type': 'chapter';
	'dbench-id': DbenchId;
	'dbench-project': string;
	'dbench-project-id': DbenchId | '';
	'dbench-order': number;
	'dbench-status': DbenchStatus;
	'dbench-scenes': string[];
	'dbench-scene-ids': DbenchId[];
	'dbench-drafts': string[];
	'dbench-draft-ids': DbenchId[];
	/**
	 * Opt-in authoring target for this chapter's word count (sum of the
	 * chapter body's `## Draft` plus all child scenes' `## Draft`
	 * sections). Writers set via the Properties panel; not stamped at
	 * creation. The Manuscript view chapter card surfaces a progress
	 * bar against this value.
	 */
	'dbench-target-words'?: number;
	/**
	 * Optional one-line chapter summary. Surfaces in the Manuscript
	 * view's chapter card as a subline under the chapter title.
	 * Round-trips through Obsidian's Properties panel; queryable in
	 * Bases for chapter-summary views.
	 */
	'dbench-synopsis'?: string;
}

/**
 * Type guard: true iff `value` is an object whose `dbench-type` is
 * `"chapter"` and whose `dbench-id` is a string. Sufficient for
 * filtering vault scans by note type.
 */
export function isChapterFrontmatter(value: unknown): value is ChapterFrontmatter {
	if (typeof value !== 'object' || value === null) return false;
	const fm = value as Record<string, unknown>;
	return fm['dbench-type'] === 'chapter' && typeof fm['dbench-id'] === 'string';
}
