import type { TFile } from 'obsidian';

/**
 * Canonical frontmatter-access helpers. Single source of truth for the
 * "type-narrowing boundary" between Obsidian's `any`/`unknown`-returning
 * frontmatter API and the project's typed code. Per the 0.6.0 refactor
 * plan (`docs/planning/frontmatter-type-narrowing.md`, gitignored).
 *
 * Replaces and consolidates:
 *
 * - The ad-hoc `toGeneric` helper in `src/core/integrity.ts`.
 * - The duplicated `readArray` / `readString` helpers in
 *   `src/core/{scenes,chapters,sub-scenes,drafts,chapter-drafts,sub-scene-drafts}.ts`,
 *   `src/core/integrity.ts`, and `src/core/linker/readers.ts`.
 * - The bracket-notation `fm['dbench-X']` reads / writes inside
 *   `processFrontMatter` callbacks (call sites wrap the param with
 *   `adaptProcessFrontMatter`).
 *
 * The strict `@typescript-eslint/no-unsafe-*` rules (which the
 * community.obsidian.md scanner runs but our local config currently
 * disables) flag bracket access on `any` values. Routing through this
 * module's helpers narrows `any` -> `unknown` at the API boundary, then
 * narrows `unknown` -> a typed value via the Layer 3 helpers. After the
 * refactor lands the local rules re-enable; the helpers become the
 * documented, audited boundary.
 *
 * Module layers:
 *
 * 1. Generic adapters (`adaptProcessFrontMatter`, `toGeneric`) reshape
 *    Obsidian's API-shaped values into `Record<string, unknown>`.
 * 2. Primitive narrowing helpers (`readString`, `readNumber`,
 *    `readBoolean`, `readArray`) consume `unknown` and return a typed
 *    value with a documented default for non-conforming inputs.
 */

// ============================================================
// Layer 1: generic adapters
// ============================================================

/**
 * Adapt the `fm` parameter Obsidian passes to `processFrontMatter`
 * callbacks (typed `any` in `FileManager.processFrontMatter`'s signature).
 * The single cast happens here; downstream reads return `unknown` and
 * require explicit narrowing via Layer 3 helpers.
 *
 * Usage:
 *
 * ```ts
 * await app.fileManager.processFrontMatter(file, (raw) => {
 *     const fm = adaptProcessFrontMatter(raw);
 *     fm['dbench-status'] = 'draft';
 *     const order = readNumber(fm['dbench-order']);
 * });
 * ```
 */
export function adaptProcessFrontMatter(fm: unknown): Record<string, unknown> {
	return fm as Record<string, unknown>;
}

/**
 * Wrap a typed-discovery note (`ProjectNote`, `SceneNote`, `ChapterNote`,
 * etc.) in a generic shape so call-site reads route through
 * `Record<string, unknown>` rather than the specific typed-frontmatter
 * interface. The typed interfaces have literal-key shapes that don't
 * satisfy `Record<string, unknown>` directly; the cast goes through
 * `unknown` to shed the specific type.
 *
 * Used by `IntegrityService.scanRelationship` (which takes generic
 * `parent` and `declaredChildren` parameters because it walks
 * relationships uniformly across project/scene/chapter/sub-scene
 * hierarchies).
 */
export function toGeneric<T extends { file: TFile; frontmatter: object }>(
	note: T
): { file: TFile; frontmatter: Record<string, unknown> } {
	return {
		file: note.file,
		frontmatter: note.frontmatter as unknown as Record<string, unknown>,
	};
}

// ============================================================
// Layer 3: primitive narrowing helpers
// ============================================================

/**
 * Narrow an `unknown` value to `string`, returning `''` for non-string
 * or absent values. Matches the convention established in `integrity.ts`
 * and `linker/readers.ts` (which this module subsumes). Use for any
 * frontmatter field expected to be string-typed.
 */
export function readString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * Narrow an `unknown` value to `number`, returning `null` for non-numeric
 * or absent values. Distinct from `readString`'s `''` default because
 * `0` is a valid frontmatter value (`dbench-order` etc.) and conflating
 * `0` with "missing" would corrupt order semantics.
 *
 * Also rejects `NaN` defensively: YAML can produce it for malformed
 * numeric literals, and downstream arithmetic would propagate the
 * corruption silently.
 */
export function readNumber(value: unknown): number | null {
	return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

/**
 * Narrow an `unknown` value to `boolean`, returning `null` for
 * non-boolean or absent values. Distinct default from `readString`'s
 * `''` because `false` is a meaningful boolean value distinct from
 * "missing."
 */
export function readBoolean(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null;
}

/**
 * Narrow an `unknown` value to `string[]`, returning `[]` for non-array
 * or absent values. Caller can trust the result is an array; individual
 * element types are not narrowed (assumed string per the project's
 * frontmatter conventions for `dbench-scenes`, `dbench-scene-ids`,
 * `dbench-drafts`, etc.). If a future field has typed elements other
 * than strings, write a new helper rather than weakening this one's
 * contract.
 */
export function readArray(value: unknown): string[] {
	return Array.isArray(value) ? (value as string[]) : [];
}
