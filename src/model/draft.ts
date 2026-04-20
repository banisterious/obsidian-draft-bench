import type { DbenchId } from './types';

/**
 * Frontmatter shape for a Draft Bench draft note (`dbench-type: draft`).
 *
 * Stamped by `stampDraftEssentials` at "new draft" time (or retrofit).
 *
 * `dbench-scene` and `dbench-scene-id` are empty for drafts of
 * single-scene projects (the draft's `dbench-project` identifies the
 * parent in that case; there's no intermediate scene).
 *
 * `dbench-draft-number` is plugin-managed and inferred from existing
 * drafts of the same scene; writers do not number manually.
 */
export interface DraftFrontmatter {
	'dbench-type': 'draft';
	'dbench-id': DbenchId;
	'dbench-project': string;
	'dbench-scene': string;
	'dbench-scene-id': DbenchId | '';
	'dbench-draft-number': number;
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
