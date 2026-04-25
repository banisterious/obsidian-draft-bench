import type { DbenchId } from './types';

/**
 * Frontmatter shape for a Draft Bench draft note (`dbench-type: draft`).
 *
 * Stamped by `stampDraftEssentials` at "new draft" time (or retrofit).
 *
 * Three target shapes exist (per [chapter-type.md § 4](../../docs/planning/chapter-type.md)):
 *
 * - **Scene draft** — snapshot of a single scene. `dbench-scene` +
 *   `dbench-scene-id` point to the parent scene; `dbench-chapter` /
 *   `dbench-chapter-id` are absent.
 * - **Chapter draft** — snapshot of a chapter (chapter body +
 *   concatenated scene bodies in `dbench-order`). `dbench-chapter` +
 *   `dbench-chapter-id` point to the parent chapter;
 *   `dbench-scene` / `dbench-scene-id` are absent.
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
