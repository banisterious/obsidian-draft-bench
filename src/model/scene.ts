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
	'dbench-order': number;
	'dbench-status': DbenchStatus;
	'dbench-drafts': string[];
	'dbench-draft-ids': DbenchId[];
}

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
