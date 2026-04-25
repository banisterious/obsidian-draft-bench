import type { DbenchId, DbenchStatus, ProjectShape } from './types';

/**
 * Frontmatter shape for a Draft Bench project note (`dbench-type: project`).
 *
 * All fields are stamped by `stampProjectEssentials` at note creation
 * (or retrofit). The reverse arrays (`dbench-scenes`, `dbench-scene-ids`)
 * are maintained by the linker.
 *
 * The interface lists what a fully-stamped project looks like; the
 * `isProjectFrontmatter` guard checks the discriminator and the
 * presence of `dbench-id`. Other fields may be missing on partially-
 * typed notes, in which case the integrity service surfaces them
 * during repair.
 */
export interface ProjectFrontmatter {
	'dbench-type': 'project';
	'dbench-id': DbenchId;
	'dbench-project': string;
	'dbench-project-id': DbenchId;
	'dbench-project-shape': ProjectShape;
	'dbench-status': DbenchStatus;
	/**
	 * Reverse arrays for direct child scenes. Populated for chapter-less
	 * projects; empty for chapter-aware projects (per
	 * [chapter-type.md § 9](../../docs/planning/chapter-type.md), a
	 * project's children are either chapters or direct scenes, not both).
	 */
	'dbench-scenes': string[];
	'dbench-scene-ids': DbenchId[];
	/**
	 * Reverse arrays for child chapters. Populated for chapter-aware
	 * projects; empty for chapter-less projects. Maintained by the linker.
	 */
	'dbench-chapters': string[];
	'dbench-chapter-ids': DbenchId[];
	/**
	 * Reverse arrays for compile presets attached to this project.
	 * Maintained by the linker; seeded as empty arrays by
	 * `stampProjectEssentials`. See D-06 § Preset storage format.
	 */
	'dbench-compile-presets': string[];
	'dbench-compile-preset-ids': DbenchId[];
	/**
	 * Opt-in authoring target for total project word count. Writers set
	 * this via the Properties panel or in a template's frontmatter; not
	 * stamped at creation. The Project-tab hero progress bar reads from
	 * this value when set.
	 */
	'dbench-target-words'?: number;
}

/**
 * Type guard: true iff `value` is an object whose `dbench-type` is
 * `"project"` and whose `dbench-id` is a string. Sufficient for
 * filtering vault scans by note type.
 */
export function isProjectFrontmatter(value: unknown): value is ProjectFrontmatter {
	if (typeof value !== 'object' || value === null) return false;
	const fm = value as Record<string, unknown>;
	return fm['dbench-type'] === 'project' && typeof fm['dbench-id'] === 'string';
}
