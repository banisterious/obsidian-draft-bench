import type { CompilePresetNote, ProjectNote } from '../discovery';

/**
 * Identifier for the synthetic preset feeding the Manuscript view's
 * Continuous mode. Distinct enough that it won't collide with any
 * vault-stored preset id (those are djb2 hashes), and recognizable in
 * logs / tests if it ever leaks into a code path that expects a real
 * preset.
 */
export const CONTINUOUS_SYNTHETIC_PRESET_ID = '__dbench-continuous-synthetic__';

export interface ContinuousPresetOptions {
	/**
	 * Scene basenames to exclude from the render (fed into the existing
	 * `dbench-compile-scene-excludes` field). Used by the Manuscript
	 * view's archive filter to drop scenes whose status is in
	 * `settings.hiddenStatuses` when the "Show archived" toggle is off.
	 * Defaults to `[]` (include all scenes).
	 */
	excludeBasenames?: readonly string[];
}

/**
 * Build a synthetic compile preset for the Manuscript view's Continuous
 * mode. Feeds the existing `CompileService.generate` pipeline with
 * minimal-transform defaults: no status filtering, no scene exclusions,
 * full-body heading scope, frontmatter stripped, wikilinks preserved
 * for click-to-open, no chapter numbering or cover/TOC.
 *
 * Per [docs/planning/manuscript-view-continuous-mode.md § 2](../../../docs/planning/manuscript-view-continuous-mode.md).
 *
 * Per-call rather than cached: a project's frontmatter (id, basename)
 * may shift while the leaf is open and the construction cost is
 * negligible (a single object literal, no allocations beyond it).
 *
 * **Embeds note:** the planning doc § 2 specified `preserve` for embeds,
 * but the V1 compile pipeline's `stripEmbeds` always strips regardless
 * of the rule value. This preset records `'strip'` to match pipeline
 * reality; lifting embeds into the rendered output is tracked as the
 * "Embed handling" open question in the planning doc.
 */
export function buildContinuousPreset(
	project: ProjectNote,
	options: ContinuousPresetOptions = {}
): CompilePresetNote {
	return {
		file: project.file,
		frontmatter: {
			'dbench-type': 'compile-preset',
			'dbench-id': CONTINUOUS_SYNTHETIC_PRESET_ID,
			'dbench-project': project.file.basename,
			'dbench-project-id': project.frontmatter['dbench-id'],
			'dbench-schema-version': 1,

			'dbench-compile-title': '',
			'dbench-compile-subtitle': '',
			'dbench-compile-author': '',
			'dbench-compile-date-format': 'iso',

			'dbench-compile-scene-source': 'auto',
			'dbench-compile-scene-statuses': [],
			'dbench-compile-scene-excludes': [...(options.excludeBasenames ?? [])],

			'dbench-compile-format': 'md',
			'dbench-compile-output': 'vault',
			'dbench-compile-page-size': 'letter',
			'dbench-compile-include-cover': false,
			'dbench-compile-include-toc': false,
			'dbench-compile-chapter-numbering': 'none',
			'dbench-compile-include-section-breaks': true,

			'dbench-compile-heading-scope': 'full',
			'dbench-compile-frontmatter': 'strip',
			'dbench-compile-wikilinks': 'preserve-syntax',
			'dbench-compile-embeds': 'strip',
			'dbench-compile-dinkuses': 'preserve',

			'dbench-last-compiled-at': '',
			'dbench-last-output-path': '',
			'dbench-last-chapter-hashes': [],
		},
	};
}
