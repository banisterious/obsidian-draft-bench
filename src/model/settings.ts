/**
 * Plugin settings shape and defaults.
 *
 * Settings are persisted via Obsidian's `loadData()` / `saveData()`
 * APIs into `<vault>/.obsidian/plugins/draft-bench/data.json`.
 *
 * The Settings tab UI in `ui/settings/` reads and writes these.
 */

import { DEFAULT_STATUS_VOCABULARY } from './types';

/**
 * Where the drafts folder lives relative to projects in the vault.
 *
 * - `project-local` (default): `<draftsFolderName>/` inside each
 *   project folder.
 * - `per-scene`: `<Scene> - <draftsFolderName>/` sibling folder per
 *   scene, for writers who want draft history tightly co-located.
 * - `vault-wide`: a single `<draftsFolderName>/` at the vault root,
 *   with filenames disambiguated by project.
 */
export type DraftsFolderPlacement = 'project-local' | 'per-scene' | 'vault-wide';

/**
 * The two tabs in the Manuscript Builder modal. `build` is the form
 * stack (Metadata, Inclusion, Output, Content handling, Last compile);
 * `preview` renders the current preset's compile output as continuous
 * read-only prose. See [docs/planning/manuscript-builder-preview.md](../../docs/planning/manuscript-builder-preview.md).
 */
export type ManuscriptBuilderTab = 'build' | 'preview';

/**
 * Preview tab typography preferences. Surfaced as an in-modal
 * toolbar above the rendered prose; tunes the `--dbench-preview-*`
 * CSS variables consumed by the Preview tab (declared in
 * variables.css, applied in manuscript-builder.css). Persisted as
 * a top-level settings field rather than per-project: these are
 * reading-register preferences ("how I like to read prose"), not
 * project-specific settings.
 */
export type PreviewTextAlign = 'left' | 'justify';
export type PreviewReadingWidth = 'full' | 'medium' | 'narrow';
export type PreviewFontFamily = 'default' | 'serif' | 'sans' | 'mono';

export interface PreviewTypography {
	textAlign: PreviewTextAlign;
	readingWidth: PreviewReadingWidth;
	fontSize: number;
	fontFamily: PreviewFontFamily;
}

/**
 * The persisted plugin settings.
 *
 * Per Obsidian style: TypeScript identifiers are camelCase even though
 * UI labels (set via `Setting.setName()`) are sentence case.
 */
export interface DraftBenchSettings {
	/**
	 * Default folder template for new projects. Supports the `{project}`
	 * token, replaced with the project's title at creation time.
	 */
	projectsFolder: string;

	/**
	 * Default folder template for new scenes, **relative to the project's
	 * folder**. Supports `{project}` and `{chapter}` tokens (the latter
	 * expanded to the parent chapter's basename for scenes-in-chapters,
	 * or `''` for chapter-less scenes). Default `'{chapter}/'` nests
	 * scenes under their chapter for chapter-aware projects and degrades
	 * to flat-at-project-root for chapter-less projects (per
	 * [issue #11](https://github.com/banisterious/obsidian-draft-bench/issues/11));
	 * set to `''` to opt out and place scenes alongside the project note
	 * regardless of chapter shape, or to `'Scenes/'` for an unconditional
	 * subfolder. The `{project}` token is available for sibling-folder
	 * layouts (e.g., `'../{project} scenes/'`); the default omits it
	 * because the resolver already joins relative paths to the project
	 * folder, so `{project}/{chapter}/` would produce a doubled
	 * `<projectFolder>/<projectName>/<chapter>/` path.
	 */
	scenesFolder: string;

	/**
	 * Default folder template for new chapters, **relative to the project's
	 * folder**. Supports the `{project}` token. Default (empty string)
	 * places chapter notes alongside the project note; set to `'Chapters/'`
	 * to nest them in a subfolder. Mirrors `scenesFolder`'s shape.
	 */
	chaptersFolder: string;

	/**
	 * Default folder template for new sub-scenes, **relative to the
	 * parent scene's folder** (per [issue #12](https://github.com/banisterious/obsidian-draft-bench/issues/12)).
	 * Supports `{project}` and `{scene}` tokens (the latter expanded to
	 * the parent scene's basename). Default `'{scene}/'` produces a
	 * `<scene-folder>/<scene-name>/` subfolder, so sub-scenes nest next
	 * to their parent scene wherever it lives — chapter-aware scenes
	 * get sub-scenes nested under the chapter folder automatically;
	 * chapter-less scenes get them at the project root; writer-
	 * customized scene locations carry sub-scenes along (per
	 * [sub-scene-type.md § 10](../../docs/planning/sub-scene-type.md)).
	 * Set to `''` for flat-alongside-the-parent-scene (writers typically
	 * apply a `<Scene> - <Sub-scene>` filename prefix for clustering).
	 * The `{project}` token is available for sibling-folder layouts
	 * (e.g., `'../{project} sub-scenes/{scene}/'`); note that with the
	 * scene-folder join base, `..` walks up from the scene folder, so
	 * such templates resolve relative to the scene's parent rather than
	 * the project root.
	 */
	subScenesFolder: string;

	/**
	 * Where the drafts folder lives. See `DraftsFolderPlacement`.
	 */
	draftsFolderPlacement: DraftsFolderPlacement;

	/**
	 * The drafts folder's name (used by `project-local` and `vault-wide`
	 * placements; ignored by `per-scene` which derives the name from the
	 * scene title).
	 */
	draftsFolderName: string;

	/**
	 * Folder where scene templates live. The built-in V1 scene template
	 * is seeded here on first scene creation if `sceneTemplatePath` is
	 * empty and the file is absent.
	 */
	templatesFolder: string;

	/**
	 * Override path for the scene template file. When empty (default),
	 * the plugin uses `<templatesFolder>/scene-template.md`. Set to any
	 * markdown file path to override — useful for writers who keep
	 * templates outside the default folder or share a template across
	 * projects.
	 */
	sceneTemplatePath: string;

	/**
	 * Override path for the chapter template file. When empty (default),
	 * the plugin uses `<templatesFolder>/chapter-template.md`. Mirrors
	 * `sceneTemplatePath`'s shape; the seeded built-in body matches the
	 * scene template (planning sections + `## Draft`) per
	 * [chapter-type.md § 1](../../docs/planning/chapter-type.md).
	 */
	chapterTemplatePath: string;

	/**
	 * Override path for the sub-scene template file. When empty (default),
	 * the plugin uses `<templatesFolder>/sub-scene-template.md`. Mirrors
	 * `sceneTemplatePath`'s shape; the seeded built-in body matches the
	 * scene template (planning sections + `## Draft`) per
	 * [sub-scene-type.md § 2](../../docs/planning/sub-scene-type.md)
	 * implications.
	 */
	subSceneTemplatePath: string;

	/**
	 * Folder where generated starter Bases (`.base` files) are written.
	 * The install command creates the folder if absent and skips any
	 * file that already exists at the target path (no overwrite).
	 */
	basesFolder: string;

	/**
	 * The ordered list of allowed workflow statuses (for scene and
	 * project `dbench-status`). The first entry is the default
	 * stamped onto new notes. Default matches the V1 hardcoded
	 * vocabulary (`idea`, `draft`, `revision`, `final`); writers can
	 * edit it in the Settings tab's Statuses section.
	 */
	statusVocabulary: string[];

	/**
	 * Master toggle for the bidirectional linker. When off, the live
	 * sync service is dormant (manual repair via the "Repair project
	 * links" command still works).
	 */
	enableBidirectionalSync: boolean;

	/**
	 * When true, the linker listens to `vault.on('modify')` events
	 * and reconciles forward / reverse references in real time. Can
	 * be disabled for performance in very large vaults.
	 */
	syncOnFileModify: boolean;

	/**
	 * One-shot flag: whether the Manuscript view has been auto-revealed
	 * to the writer after their first project creation. Set to true the
	 * first time a project is created from an empty vault so the leaf
	 * becomes visible without surprising writers who are retrofitting
	 * existing vaults (where projects might be created silently during
	 * bulk retrofit). Subsequent project creations don't re-reveal.
	 */
	firstProjectRevealed: boolean;

	/**
	 * One-shot flag: whether the onboarding welcome modal has been
	 * shown to the writer. Set to true the first time the modal is
	 * dismissed (any close path — CTA click, X button, escape).
	 * Subsequent plugin loads don't auto-open the modal; writers can
	 * still resurface it via the `Show welcome screen` palette command.
	 */
	welcomeShown: boolean;

	/**
	 * The last-selected project's `dbench-id`, or `null` when no
	 * project is selected. Persisted here (rather than in Obsidian's
	 * workspace state) so reload reliably restores the writer's
	 * current project — `requestSaveLayout` is debounced and can miss
	 * late-session selections. The Manuscript leaf mirrors this into
	 * `plugin.selection` on load.
	 */
	lastSelectedProjectId: string | null;

	/**
	 * Per-chapter expanded/collapsed state for the Manuscript view's
	 * chapter cards (chapter-aware projects only). Keyed by the
	 * chapter's `dbench-id`. Missing entries default to expanded.
	 *
	 * Persisted via `saveSettings()` rather than Obsidian's workspace
	 * state because `requestSaveLayout` is debounced and loses late-
	 * session toggles on reload (per the same lesson that drove
	 * `lastSelectedProjectId` here). Empty `{}` on first install — no
	 * eager seeding, since chapters may not exist yet.
	 */
	chapterCollapseState: Record<string, boolean>;

	/**
	 * Per-scene expanded/collapsed state for the Manuscript view's
	 * scene cards (hierarchical scenes only — scenes with sub-scenes
	 * render as collapsible cards mirroring the chapter-card pattern,
	 * per [sub-scene-type.md § 6](../../docs/planning/sub-scene-type.md)).
	 * Keyed by the scene's `dbench-id`. Missing entries default to
	 * expanded.
	 *
	 * Same persistence rationale as `chapterCollapseState`: route through
	 * `saveSettings()` so late-session toggles survive reload. Empty `{}`
	 * on first install.
	 */
	sceneCollapseState: Record<string, boolean>;

	/**
	 * Per-project last-active tab in the Manuscript Builder modal.
	 * Keyed by the project's `dbench-id`. Missing entries default to
	 * `'build'`, so a writer who has never opened Preview lands on the
	 * familiar form stack on first open.
	 *
	 * Persistence rationale mirrors `chapterCollapseState` /
	 * `sceneCollapseState`: route through `saveSettings()` so late-
	 * session flips survive reload (per
	 * [docs/planning/manuscript-builder-preview.md § "What's locked at
	 * the meta level"](../../docs/planning/manuscript-builder-preview.md)).
	 * Empty `{}` on first install.
	 */
	manuscriptBuilderTabState: Record<string, ManuscriptBuilderTab>;

	/**
	 * Preview tab typography preferences. Tunes the in-modal
	 * Preview toolbar's controls (text alignment, reading width,
	 * font size, font family). Globally scoped — these are
	 * reading-register preferences, not per-project settings.
	 *
	 * The four values map to the `--dbench-preview-*` CSS
	 * variables: textAlign -> --dbench-preview-text-align,
	 * readingWidth -> --dbench-preview-max-width (named values
	 * "full" | "medium" | "narrow" map to "none" | "65em" |
	 * "45em"), fontSize -> --dbench-preview-font-size (px),
	 * fontFamily -> --dbench-preview-font-family (named values
	 * "default" | "serif" | "sans" | "mono" map to font-family
	 * stacks).
	 */
	previewTypography: PreviewTypography;

	/**
	 * One-shot migration marker for the `scenesFolder` default flip from
	 * `''` (V1) to `'{chapter}/'` (per [issue #11](https://github.com/banisterious/obsidian-draft-bench/issues/11)).
	 * `loadSettings` runs the migration exactly once: when an existing
	 * data.json is loaded that lacks this key, the empty-string V1
	 * default is rewritten to `'{chapter}/'` and the flag is flipped
	 * true. Subsequent loads see the flag and skip the migration, so a
	 * writer who deliberately re-sets `''` after the upgrade keeps that
	 * choice. Fresh installs persist `true` on first save without
	 * touching `scenesFolder`.
	 */
	scenesFolderMigrated: boolean;
}

/**
 * Default settings applied on first plugin load. Merged with whatever
 * the user has saved (user settings take precedence).
 */
export const DEFAULT_SETTINGS: DraftBenchSettings = {
	projectsFolder: 'Draft Bench/{project}/',
	scenesFolder: '{chapter}/',
	chaptersFolder: '',
	subScenesFolder: '{scene}/',
	draftsFolderPlacement: 'project-local',
	draftsFolderName: 'Drafts',
	templatesFolder: 'Draft Bench/Templates/',
	sceneTemplatePath: '',
	chapterTemplatePath: '',
	subSceneTemplatePath: '',
	basesFolder: 'Draft Bench/Bases',
	statusVocabulary: [...DEFAULT_STATUS_VOCABULARY],
	enableBidirectionalSync: true,
	syncOnFileModify: true,
	firstProjectRevealed: false,
	welcomeShown: false,
	lastSelectedProjectId: null,
	chapterCollapseState: {},
	sceneCollapseState: {},
	manuscriptBuilderTabState: {},
	previewTypography: {
		textAlign: 'left',
		readingWidth: 'full',
		fontSize: 16,
		fontFamily: 'default',
	},
	scenesFolderMigrated: true,
};
