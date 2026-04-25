/**
 * Shared type aliases and unions used across the Draft Bench data model.
 *
 * Per-type frontmatter shapes and guards live in sibling files
 * (project.ts, scene.ts, draft.ts). Plugin settings live in settings.ts.
 */

/**
 * The discriminator value of `dbench-type`. V1 vocabulary:
 * `project`, `chapter`, `scene`, `draft`, `compile-preset`.
 *
 * `chapter` was promoted from Phase 5+ into V1 on 2026-04-25 per the
 * novelist-audience pivot. See [chapter-type.md](../../docs/planning/chapter-type.md)
 * for the full design rationale.
 */
export type DbenchType = 'project' | 'chapter' | 'scene' | 'draft' | 'compile-preset';

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
 * A scene or project workflow status. The vocabulary is user-
 * configurable (see `settings.statusVocabulary`); this alias is
 * kept to document intent at call sites that pass a status value
 * around.
 */
export type DbenchStatus = string;

/**
 * Built-in default status workflow, used to seed
 * `settings.statusVocabulary` on first load and as a fallback when
 * the user's vocabulary somehow ends up empty. The first entry is
 * the default status stamped onto new scenes and projects.
 */
export const DEFAULT_STATUS_VOCABULARY: readonly string[] = [
	'idea',
	'draft',
	'revision',
	'final',
] as const;
