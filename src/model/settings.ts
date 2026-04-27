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
	 * folder**. Supports the `{project}` token. Default (empty string)
	 * places scenes alongside the project note; set to `'Scenes/'` to
	 * nest them in a subfolder.
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
}

/**
 * Default settings applied on first plugin load. Merged with whatever
 * the user has saved (user settings take precedence).
 */
export const DEFAULT_SETTINGS: DraftBenchSettings = {
	projectsFolder: 'Draft Bench/{project}/',
	scenesFolder: '',
	chaptersFolder: '',
	draftsFolderPlacement: 'project-local',
	draftsFolderName: 'Drafts',
	templatesFolder: 'Draft Bench/Templates/',
	sceneTemplatePath: '',
	chapterTemplatePath: '',
	basesFolder: 'Draft Bench/Bases',
	statusVocabulary: [...DEFAULT_STATUS_VOCABULARY],
	enableBidirectionalSync: true,
	syncOnFileModify: true,
	firstProjectRevealed: false,
	welcomeShown: false,
	lastSelectedProjectId: null,
	chapterCollapseState: {},
};
