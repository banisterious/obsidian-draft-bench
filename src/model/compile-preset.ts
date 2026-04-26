import type { DbenchId, DbenchStatus } from './types';

/**
 * Frontmatter shape for a Draft Bench compile preset note
 * (`dbench-type: compile-preset`).
 *
 * Presets are first-class vault notes (per D-06, § Preset storage
 * format: Option C). The note file IS the compile configuration —
 * editable via Obsidian's Properties panel, the Book Builder's
 * Compile tab form, or any other surface that reads frontmatter.
 *
 * The schema is deliberately flat (no nested objects or mappings)
 * because Obsidian's Properties panel does not round-trip nested
 * structures. Two knock-on consequences worth noting:
 *
 * - **Section breaks live on scenes, not the preset.** A scene that
 *   should emit a named break before it sets
 *   `dbench-section-break-title` / `dbench-section-break-style` in
 *   its own frontmatter; the preset's
 *   `dbench-compile-include-section-breaks` toggle gates the entire
 *   mechanism.
 * - **Compile state (`dbench-last-chapter-hashes`) is an array of
 *   `"<id>:<hash>"` strings**, not a YAML mapping.
 *
 * See [D-06 § Preset schema shape](../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md)
 * for the full rationale.
 */
export interface CompilePresetFrontmatter {
	'dbench-type': 'compile-preset';
	'dbench-id': DbenchId;
	'dbench-project': string;
	'dbench-project-id': DbenchId | '';
	'dbench-schema-version': 1;

	// Book-output metadata (empty defaults = "fall back to project title /
	// plugin setting / empty" at compile time). All user-facing strings.
	'dbench-compile-title': string;
	'dbench-compile-subtitle': string;
	'dbench-compile-author': string;
	'dbench-compile-date-format': CompileDateFormat;

	// Inclusion model. V1 uses implicit-auto only; explicit mode is
	// reserved for post-V1 via `dbench-compile-scene-source: explicit`
	// plus a `dbench-compile-chapters` array.
	'dbench-compile-scene-source': CompileSceneSource;
	'dbench-compile-scene-statuses': DbenchStatus[];
	'dbench-compile-scene-excludes': string[];

	// Output.
	'dbench-compile-format': CompileFormat;
	'dbench-compile-output': CompileOutput;
	'dbench-compile-page-size': CompilePageSize;
	'dbench-compile-include-cover': boolean;
	'dbench-compile-include-toc': boolean;
	'dbench-compile-chapter-numbering': CompileChapterNumbering;
	'dbench-compile-include-section-breaks': boolean;

	// Content-handling overrides (per-preset subset; see D-06
	// § Content-handling rules for the full 16-rule table).
	'dbench-compile-heading-scope': CompileHeadingScope;
	'dbench-compile-frontmatter': CompileFrontmatterRule;
	'dbench-compile-wikilinks': CompileWikilinkRule;
	'dbench-compile-embeds': CompileEmbedRule;
	'dbench-compile-dinkuses': CompileDinkusRule;

	// Compile state. Plugin-managed; updated on each run via
	// `processFrontMatter`. Empty strings / empty array = "never
	// compiled yet."
	'dbench-last-compiled-at': string;
	'dbench-last-output-path': string;
	'dbench-last-chapter-hashes': string[];
}

export type CompileDateFormat = 'iso' | 'mdy' | 'dmy' | 'ymd';
export type CompileSceneSource = 'auto'; // post-V1 adds 'explicit'
export type CompileFormat = 'md' | 'pdf' | 'odt';
export type CompileOutput = 'vault' | 'disk';
export type CompilePageSize = 'letter' | 'a4';
export type CompileChapterNumbering = 'none' | 'numeric' | 'roman';
export type CompileHeadingScope = 'draft' | 'full' | 'chapter';
export type CompileFrontmatterRule = 'strip' | 'preserve';
export type CompileWikilinkRule = 'display-text' | 'strip' | 'preserve-syntax';
export type CompileEmbedRule = 'strip' | 'resolve'; // V1 ships strip-only
export type CompileDinkusRule = 'preserve' | 'normalize';

/**
 * Default values for a fresh compile preset. Merged with the
 * identity / linkage fields (dbench-id, dbench-project, etc.) at
 * creation time by `stampCompilePresetEssentials`.
 *
 * Per compile-as-artifact: every field has a sensible default so a
 * near-empty preset (just identity + project link) compiles
 * successfully against its target project.
 */
export const DEFAULT_COMPILE_PRESET_VALUES = {
	'dbench-schema-version': 1 as const,

	'dbench-compile-title': '',
	'dbench-compile-subtitle': '',
	'dbench-compile-author': '',
	'dbench-compile-date-format': 'iso' as CompileDateFormat,

	'dbench-compile-scene-source': 'auto' as CompileSceneSource,
	'dbench-compile-scene-statuses': [] as DbenchStatus[],
	'dbench-compile-scene-excludes': [] as string[],

	'dbench-compile-format': 'md' as CompileFormat,
	'dbench-compile-output': 'vault' as CompileOutput,
	'dbench-compile-page-size': 'letter' as CompilePageSize,
	'dbench-compile-include-cover': false,
	'dbench-compile-include-toc': false,
	'dbench-compile-chapter-numbering': 'none' as CompileChapterNumbering,
	'dbench-compile-include-section-breaks': true,

	'dbench-compile-heading-scope': 'draft' as CompileHeadingScope,
	'dbench-compile-frontmatter': 'strip' as CompileFrontmatterRule,
	'dbench-compile-wikilinks': 'display-text' as CompileWikilinkRule,
	'dbench-compile-embeds': 'strip' as CompileEmbedRule,
	'dbench-compile-dinkuses': 'preserve' as CompileDinkusRule,

	'dbench-last-compiled-at': '',
	'dbench-last-output-path': '',
	'dbench-last-chapter-hashes': [] as string[],
};

/**
 * Type guard: true iff `value` is an object whose `dbench-type` is
 * `"compile-preset"` and whose `dbench-id` is a string. Sufficient
 * for filtering vault scans by note type; the full schema isn't
 * validated here.
 */
export function isCompilePresetFrontmatter(
	value: unknown
): value is CompilePresetFrontmatter {
	if (typeof value !== 'object' || value === null) return false;
	const fm = value as Record<string, unknown>;
	return fm['dbench-type'] === 'compile-preset' && typeof fm['dbench-id'] === 'string';
}
