import type { DbenchId } from './types';

/**
 * Frontmatter shape for a Draft Bench draft note (`dbench-type: draft`).
 *
 * Stamped by `stampDraftEssentials` at "new draft" time (or retrofit).
 *
 * Four target shapes exist (per [chapter-type.md § 4](../../docs/planning/chapter-type.md)
 * + [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md)):
 *
 * - **Scene draft** — snapshot of a single scene's body. When the
 *   scene has sub-scenes, the snapshot concatenates scene body +
 *   sub-scene bodies with `<!-- sub-scene: <basename> -->` boundaries.
 *   `dbench-scene` + `dbench-scene-id` point to the parent scene;
 *   chapter / sub-scene refs are absent.
 * - **Chapter draft** — snapshot of a chapter (chapter body +
 *   concatenated scene bodies in `dbench-order`). `dbench-chapter` +
 *   `dbench-chapter-id` point to the parent chapter;
 *   `dbench-scene` / `dbench-scene-id` are absent.
 * - **Sub-scene draft** — snapshot of a single sub-scene's body.
 *   `dbench-sub-scene` + `dbench-sub-scene-id` point to the parent
 *   sub-scene; `dbench-scene` / `dbench-scene-id` are absent
 *   (the sub-scene's own scene ref is sufficient context).
 * - **Single-scene-project draft** — drafts of single-scene projects.
 *   `dbench-scene` and `dbench-scene-id` are empty; the draft's
 *   `dbench-project` identifies the parent.
 *
 * Disambiguation is implicit: which parent ref is present tells the
 * draft target type. No explicit `dbench-draft-target` field.
 *
 * `dbench-draft-number` is plugin-managed and inferred from existing
 * drafts of the same parent; writers do not number manually.
 */
export interface DraftFrontmatter {
	'dbench-type': 'draft';
	'dbench-id': DbenchId;
	'dbench-project': string;
	'dbench-scene': string;
	'dbench-scene-id': DbenchId | '';
	'dbench-draft-number': number;
	/**
	 * Optional chapter parent — present for chapter-level drafts only.
	 * Absent for scene drafts and single-scene-project drafts.
	 */
	'dbench-chapter'?: string;
	'dbench-chapter-id'?: DbenchId;
	/**
	 * Optional sub-scene parent — present for sub-scene-level drafts
	 * only (per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md)).
	 * Absent for scene / chapter / single-scene-project drafts.
	 */
	'dbench-sub-scene'?: string;
	'dbench-sub-scene-id'?: DbenchId;
}

/**
 * Type guard: true iff `value` is an object whose `dbench-type` is
 * `"draft"` and whose `dbench-id` is a string. Sufficient for
 * filtering vault scans by note type.
 */
export function isDraftFrontmatter(value: unknown): value is DraftFrontmatter {
	if (typeof value !== 'object' || value === null) return false;
	const fm = value as Record<string, unknown>;
	return fm['dbench-type'] === 'draft' && typeof fm['dbench-id'] === 'string';
}
