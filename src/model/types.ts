/**
 * Shared type aliases and unions used across the Draft Bench data model.
 *
 * Per-type frontmatter shapes and guards live in sibling files
 * (project.ts, scene.ts, draft.ts). Plugin settings live in settings.ts.
 */

/**
 * The discriminator value of `dbench-type`. V1 vocabulary:
 * `project`, `scene`, `draft`. Post-V1 will add `chapter` and others.
 */
export type DbenchType = 'project' | 'scene' | 'draft';

/**
 * A Draft Bench stable identifier (format `abc-123-def-456`).
 *
 * This is a structural alias for `string` rather than a branded type:
 * for V1 simplicity we trust callers to validate via `isValidDbenchId`
 * at the boundaries (load from frontmatter, parse from user input).
 * If runtime confusion ever surfaces, this can be promoted to a brand.
 */
export type DbenchId = string;

/**
 * Project-shape values for `dbench-project-shape`. Determines whether
 * a project is a folder containing scene notes (the default) or a
 * single note that is the whole work (flash fiction, poems).
 */
export type ProjectShape = 'folder' | 'single';

/**
 * V1 hardcoded status workflow. User-configurable vocabulary is
 * deferred to Phase 2 (see specification.md § Open Questions).
 */
export type DbenchStatus = 'idea' | 'draft' | 'revision' | 'final';

/**
 * The four V1 status values as a runtime array, for iteration in
 * UI surfaces (status pickers, validation).
 */
export const DBENCH_STATUSES: readonly DbenchStatus[] = [
	'idea',
	'draft',
	'revision',
	'final',
] as const;
