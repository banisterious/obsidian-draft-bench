import type { DbenchId, DbenchStatus } from './types';

/**
 * Frontmatter shape for a Draft Bench scene note (`dbench-type: scene`).
 *
 * All fields are stamped by `stampSceneEssentials` at note creation
 * (or retrofit). The reverse arrays (`dbench-drafts`, `dbench-draft-ids`)
 * are maintained by the linker.
 *
 * `dbench-project` may be empty when the scene is "orphan" (created
 * via retrofit before being attached to a project). `dbench-order` is
 * the sole source of story-order truth (see D-02).
 */
export interface SceneFrontmatter {
	'dbench-type': 'scene';
	'dbench-id': DbenchId;
	'dbench-project': string;
	'dbench-project-id': DbenchId | '';
	/**
	 * Optional chapter parent (chapter-aware projects only). Per
	 * [chapter-type.md § 3](../../docs/planning/chapter-type.md),
	 * scenes-in-chapters carry both project + chapter refs. Absent on
	 * scenes in chapter-less projects.
	 */
	'dbench-chapter'?: string;
	'dbench-chapter-id'?: DbenchId;
	/**
	 * Position within the immediate parent. For scenes-in-chapters this
	 * is position within the chapter (each chapter resets to 1, 2, 3...);
	 * for chapter-less scenes this is position within the project (today's
	 * behavior unchanged).
	 */
	'dbench-order': number;
	'dbench-status': DbenchStatus;
	'dbench-drafts': string[];
	'dbench-draft-ids': DbenchId[];
	/**
	 * Opt-in authoring target for this scene's word count. Writers set
	 * this via the Properties panel or in a template's frontmatter; not
	 * stamped at creation. The Manuscript-tab per-scene progress bar
	 * reads from this value when set.
	 */
	'dbench-target-words'?: number;
	/**
	 * Optional one-line subtitle, surfaced under the scene title in the
	 * Manuscript view's scene row. Useful for POV markers, time stamps,
	 * setting cues, or short descriptors that disambiguate similarly-
	 * titled scenes. Writer-set via the Properties panel; not stamped
	 * at creation.
	 */
	'dbench-subtitle'?: string;
	/**
	 * Optional section-break title shown before this scene at compile
	 * time (D-06 rule extended). Absence means no break; presence
	 * triggers the break (preset-level
	 * `dbench-compile-include-section-breaks` gates the whole
	 * mechanism). Writer-set via the Properties panel.
	 */
	'dbench-section-break-title'?: string;
	/**
	 * Render hint for the break declared by
	 * `dbench-section-break-title`. `visual` = centered title between
	 * dinkus lines (default); `page-break` = begin a new page in
	 * PDF / ODT output. The markdown intermediate renders both
	 * identically; renderers honor page-break when they land in P3.C.
	 */
	'dbench-section-break-style'?: SectionBreakStyle;
}

export type SectionBreakStyle = 'visual' | 'page-break';

/**
 * Type guard: true iff `value` is an object whose `dbench-type` is
 * `"scene"` and whose `dbench-id` is a string. Sufficient for
 * filtering vault scans by note type.
 */
export function isSceneFrontmatter(value: unknown): value is SceneFrontmatter {
	if (typeof value !== 'object' || value === null) return false;
	const fm = value as Record<string, unknown>;
	return fm['dbench-type'] === 'scene' && typeof fm['dbench-id'] === 'string';
}
