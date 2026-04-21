/**
 * V1 starter Bases templates for Draft Bench.
 *
 * Each template is a static YAML string — no interpolation needed
 * because DB doesn't have a property-alias system (see
 * [bases-reference.md § DB commitments](../../docs/planning/bases-reference.md)).
 *
 * Property reference conventions per Obsidian's Bases syntax docs
 * ([external/obsidian-help/en/Bases/Bases syntax.md]):
 *
 *   - `order:` entries and `properties:` keys use the bare shorthand
 *     for note properties: `dbench-status`, not `note["dbench-status"]`.
 *     This lets Bases resolve the displayName override correctly.
 *   - Filter expressions still need `note["dbench-type"]` bracket
 *     notation because hyphens aren't valid in dot-notation JS
 *     expressions.
 *   - Formulas follow the same rule: expressions use `note["..."]`.
 */

export interface BaseTemplate {
	/** Filename without extension; `.base` appended at write time. */
	filename: string;
	/** Short name for palette messages and settings descriptions. */
	displayName: string;
	/** One-line description of what the base surfaces. */
	description: string;
	/** YAML body written to the `.base` file. */
	content: string;
}

const PROJECTS_BASE = `filters:
  and:
    - 'note["dbench-type"] == "project"'

properties:
  dbench-status:
    displayName: Status
  dbench-project-shape:
    displayName: Shape

views:
  - type: table
    name: All projects
    order:
      - file.name
      - dbench-status
      - dbench-project-shape
      - file.mtime

  - type: table
    name: In progress
    filters:
      and:
        - 'note["dbench-status"] != "final"'
    order:
      - file.name
      - dbench-status
      - file.mtime
`;

const SCENES_BASE = `filters:
  and:
    - 'note["dbench-type"] == "scene"'

formulas:
  draft_count: 'if(note["dbench-drafts"], note["dbench-drafts"].length, 0)'

properties:
  dbench-order:
    displayName: Order
  dbench-status:
    displayName: Status
  dbench-project:
    displayName: Project
  formula.draft_count:
    displayName: Drafts

views:
  - type: table
    name: Manuscript outline
    order:
      - dbench-order
      - file.name
      - dbench-status
      - dbench-project
      - formula.draft_count

  - type: table
    name: In current project
    filters:
      and:
        - 'note["dbench-project-id"] == this["dbench-id"]'
    order:
      - dbench-order
      - file.name
      - dbench-status
      - formula.draft_count

  - type: table
    name: By status
    groupBy:
      property: dbench-status
      direction: ASC
    order:
      - file.name
      - dbench-order
      - dbench-project

  - type: table
    name: Revision queue
    filters:
      and:
        - 'note["dbench-status"] == "revision"'
    order:
      - file.name
      - dbench-project
      - dbench-order

  - type: cards
    name: Corkboard
    order:
      - file.name
      - dbench-status
      - dbench-project
`;

const DRAFTS_BASE = `filters:
  and:
    - 'note["dbench-type"] == "draft"'

properties:
  dbench-scene:
    displayName: Scene
  dbench-project:
    displayName: Project
  file.ctime:
    displayName: Created

views:
  - type: table
    name: All drafts
    order:
      - file.name
      - dbench-scene
      - dbench-project
      - file.ctime

  - type: table
    name: History for current scene
    filters:
      and:
        - 'note["dbench-scene-id"] == this["dbench-id"]'
    order:
      - file.name
      - file.ctime
`;

export const BASE_TEMPLATES: readonly BaseTemplate[] = [
	{
		filename: 'projects',
		displayName: 'Projects',
		description: 'All projects, with an "In progress" view.',
		content: PROJECTS_BASE,
	},
	{
		filename: 'scenes',
		displayName: 'Scenes',
		description:
			'Manuscript outline, per-project scenes (when embedded in a project note), grouped-by-status, revision queue, and a corkboard view.',
		content: SCENES_BASE,
	},
	{
		filename: 'drafts',
		displayName: 'Drafts',
		description:
			'All drafts plus a history view for the current scene (when embedded in a scene note).',
		content: DRAFTS_BASE,
	},
] as const;
