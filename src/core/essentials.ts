import { generateDbenchId } from './id';
import { DEFAULT_STATUS_VOCABULARY } from '../model/types';

/**
 * "Essentials" helpers stamp the V1 frontmatter schema onto a note.
 *
 * Used by both the Create commands (new project, new scene, new
 * draft) and the retrofit context-menu actions (Set as project /
 * scene / draft, Complete essential properties, Add dbench-id).
 *
 * All helpers are idempotent: a key that already exists in the
 * frontmatter is left untouched. Only undefined or null values are
 * treated as "missing" and replaced with defaults. Empty strings,
 * zeros, and empty arrays count as set values and are preserved.
 *
 * See the specification's "Applying Draft Bench properties to
 * existing notes" section and decision record D-05 for the full
 * design rationale.
 */

/**
 * Context for stamping helpers. Carries information about the file
 * the frontmatter belongs to, used for properties that default to
 * filename-derived values (like a project's self-link).
 */
export interface EssentialsContext {
	/** The file's basename without extension (e.g., "My Novel"). */
	basename: string;

	/**
	 * The status value written when `dbench-status` is absent. Callers
	 * typically pass `settings.statusVocabulary[0]`; when omitted, the
	 * built-in default (first entry of `DEFAULT_STATUS_VOCABULARY`) is
	 * used, which keeps retrofits against a still-loading plugin safe.
	 */
	defaultStatus?: string;
}

const DEFAULT_PROJECT_SHAPE = 'folder';
const DEFAULT_SCENE_ORDER = 9999;
const DEFAULT_DRAFT_NUMBER = 1;

/**
 * Resolve the default status from an `EssentialsContext`, falling back
 * to the first value of the built-in vocabulary when the caller didn't
 * pass one. Callers that know their settings should always pass an
 * explicit value; the fallback is a safety net, not a feature.
 */
function defaultStatusOf(context: EssentialsContext): string {
	return context.defaultStatus ?? DEFAULT_STATUS_VOCABULARY[0];
}

/**
 * Stamp project essentials onto `frontmatter`.
 *
 * Adds (when absent): `dbench-type`, `dbench-id`, `dbench-project`
 * (self-link from `context.basename`), `dbench-project-id` (mirrors
 * `dbench-id`), `dbench-project-shape`, `dbench-status`, and the
 * empty `dbench-scenes` / `dbench-scene-ids` reverse arrays.
 *
 * The note "becomes" a project in one step. Idempotent.
 */
export function stampProjectEssentials(
	frontmatter: Record<string, unknown>,
	context: EssentialsContext
): void {
	setIfMissing(frontmatter, 'dbench-type', 'project');
	setIfMissing(frontmatter, 'dbench-id', generateDbenchId());

	// At this point dbench-id is guaranteed to be present.
	const id = String(frontmatter['dbench-id']);

	setIfMissing(frontmatter, 'dbench-project', `[[${context.basename}]]`);
	setIfMissing(frontmatter, 'dbench-project-id', id);
	setIfMissing(frontmatter, 'dbench-project-shape', DEFAULT_PROJECT_SHAPE);
	setIfMissing(frontmatter, 'dbench-status', defaultStatusOf(context));
	setIfMissing(frontmatter, 'dbench-scenes', []);
	setIfMissing(frontmatter, 'dbench-scene-ids', []);
}

/**
 * Stamp scene essentials onto `frontmatter`.
 *
 * Adds (when absent): `dbench-type`, `dbench-id`, `dbench-project`
 * (empty placeholder until the writer assigns a project),
 * `dbench-project-id` (empty placeholder), `dbench-order`
 * (high default so the scene sorts at the end), `dbench-status`,
 * and the empty `dbench-drafts` / `dbench-draft-ids` reverse arrays.
 *
 * `context.defaultStatus` seeds `dbench-status` when absent; callers
 * should pass `settings.statusVocabulary[0]`. Idempotent.
 */
export function stampSceneEssentials(
	frontmatter: Record<string, unknown>,
	context: EssentialsContext
): void {
	setIfMissing(frontmatter, 'dbench-type', 'scene');
	setIfMissing(frontmatter, 'dbench-id', generateDbenchId());
	setIfMissing(frontmatter, 'dbench-project', '');
	setIfMissing(frontmatter, 'dbench-project-id', '');
	setIfMissing(frontmatter, 'dbench-order', DEFAULT_SCENE_ORDER);
	setIfMissing(frontmatter, 'dbench-status', defaultStatusOf(context));
	setIfMissing(frontmatter, 'dbench-drafts', []);
	setIfMissing(frontmatter, 'dbench-draft-ids', []);
}

/**
 * Stamp draft essentials onto `frontmatter`.
 *
 * Adds (when absent): `dbench-type`, `dbench-id`, `dbench-project`
 * (empty), `dbench-scene` (empty), `dbench-scene-id` (empty), and
 * `dbench-draft-number` (defaults to 1; writers retrofitting a
 * non-first draft adjust via the Properties panel).
 *
 * `context` is accepted for signature uniformity with the project
 * helper but is currently unused. Idempotent.
 */
export function stampDraftEssentials(
	frontmatter: Record<string, unknown>,
	_context: EssentialsContext
): void {
	setIfMissing(frontmatter, 'dbench-type', 'draft');
	setIfMissing(frontmatter, 'dbench-id', generateDbenchId());
	setIfMissing(frontmatter, 'dbench-project', '');
	setIfMissing(frontmatter, 'dbench-scene', '');
	setIfMissing(frontmatter, 'dbench-scene-id', '');
	setIfMissing(frontmatter, 'dbench-draft-number', DEFAULT_DRAFT_NUMBER);
}

/**
 * Stamp only `dbench-id` onto `frontmatter`.
 *
 * Used by the standalone "Add dbench-id" retrofit action for notes
 * that already have `dbench-type` set but lack an identifier.
 * Idempotent.
 */
export function stampDbenchId(frontmatter: Record<string, unknown>): void {
	setIfMissing(frontmatter, 'dbench-id', generateDbenchId());
}

/**
 * Set `frontmatter[key]` to `value` only if the key is currently
 * absent. "Absent" means the value is `undefined` or `null` —
 * existing values (including empty strings, zeros, and empty
 * arrays) are preserved.
 *
 * The `null` case matters because YAML parses an empty value
 * (`dbench-status:` with no value after the colon) as `null`, and
 * we want to treat that as missing.
 */
function setIfMissing(
	frontmatter: Record<string, unknown>,
	key: string,
	value: unknown
): void {
	const current = frontmatter[key];
	if (current === undefined || current === null) {
		frontmatter[key] = value;
	}
}
