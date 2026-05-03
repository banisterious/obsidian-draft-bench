import type { DbenchId, DbenchStatus } from './types';
import type { SectionBreakStyle } from './scene';

/**
 * Frontmatter shape for a Draft Bench sub-scene note (`dbench-type: sub-scene`).
 *
 * Sub-scenes are constituent units of a parent scene, introduced post-V1
 * (per [sub-scene-type.md](../../docs/planning/sub-scene-type.md)) when
 * a writer wants per-unit status, drafts, and isolation within a single
 * scene that otherwise functions as a container of narrative units. A
 * scene with sub-scenes treats its body's `## Draft` as scene-introductory
 * prose only; sub-scene bodies hold the units themselves.
 *
 * All required fields are stamped by `stampSubSceneEssentials` at note
 * creation (or retrofit). The reverse arrays (`dbench-drafts`,
 * `dbench-draft-ids`) are maintained by the linker.
 *
 * `dbench-project` and `dbench-scene` may be empty when the sub-scene is
 * "orphan" (created via retrofit before being attached). `dbench-order`
 * is the position within the immediate parent scene (each scene resets
 * to 1, 2, 3...), matching the scenes-in-chapter precedent.
 *
 * Optional `dbench-target-words`, `dbench-subtitle`, `dbench-synopsis`,
 * and the `dbench-section-break-*` pair are writer-set; not stamped at
 * creation. See [sub-scene-type.md § 3](../../docs/planning/sub-scene-type.md)
 * for the full schema rationale.
 */
export interface SubSceneFrontmatter {
	'dbench-type': 'sub-scene';
	'dbench-id': DbenchId;
	'dbench-project': string;
	'dbench-project-id': DbenchId | '';
	'dbench-scene': string;
	'dbench-scene-id': DbenchId | '';
	/**
	 * Position within the immediate parent scene. Each scene resets the
	 * sub-scene order to 1, 2, 3...; matches the scenes-in-chapter
	 * `dbench-order` precedent (per [chapter-type.md § 3](../../docs/planning/chapter-type.md)).
	 */
	'dbench-order': number;
	'dbench-status': DbenchStatus;
	'dbench-drafts': string[];
	'dbench-draft-ids': DbenchId[];
	/**
	 * Opt-in authoring target for this sub-scene's word count. Writers
	 * set via the Properties panel; not stamped at creation. Per
	 * [sub-scene-type.md § 5](../../docs/planning/sub-scene-type.md), the
	 * project-level target stays the canonical writer commitment;
	 * sub-scene targets are local checkpoints.
	 */
	'dbench-target-words'?: number;
	/**
	 * Optional one-line subtitle, surfaced under the sub-scene title in
	 * the Manuscript view's sub-scene row. Mirrors the scene
	 * `dbench-subtitle` semantics.
	 */
	'dbench-subtitle'?: string;
	/**
	 * Optional one-line "what this unit does" tag, surfaced in the
	 * Manuscript view's sub-scene-card. Concrete use case (per
	 * [sub-scene-type.md § 3](../../docs/planning/sub-scene-type.md)
	 * ratification): short phrasings like "the lot's provenance falls
	 * apart" or "the buyer breaks the silence" for sub-scenes in a
	 * hierarchical scene.
	 */
	'dbench-synopsis'?: string;
	/**
	 * Optional section-break title shown before this sub-scene at compile
	 * time. Mirrors the scene `dbench-section-break-title` semantics
	 * (D-06 rule extended to sub-scenes for parity with scenes); preset-
	 * level `dbench-compile-include-section-breaks` gates the whole
	 * mechanism.
	 */
	'dbench-section-break-title'?: string;
	/**
	 * Render hint for the break declared by
	 * `dbench-section-break-title`. Mirrors the scene
	 * `dbench-section-break-style` semantics.
	 */
	'dbench-section-break-style'?: SectionBreakStyle;
}

/**
 * Type guard: true iff `value` is an object whose `dbench-type` is
 * `"sub-scene"` and whose `dbench-id` is a string. Sufficient for
 * filtering vault scans by note type.
 */
export function isSubSceneFrontmatter(value: unknown): value is SubSceneFrontmatter {
	if (typeof value !== 'object' || value === null) return false;
	const fm = value as Record<string, unknown>;
	return fm['dbench-type'] === 'sub-scene' && typeof fm['dbench-id'] === 'string';
}
