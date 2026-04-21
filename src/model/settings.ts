/**
 * Plugin settings shape and defaults.
 *
 * Settings are persisted via Obsidian's `loadData()` / `saveData()`
 * APIs into `<vault>/.obsidian/plugins/draft-bench/data.json`.
 *
 * The Settings tab UI in `ui/settings/` reads and writes these.
 */

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
	 * Folder where generated starter Bases (`.base` files) are written.
	 * The install command creates the folder if absent and skips any
	 * file that already exists at the target path (no overwrite).
	 */
	basesFolder: string;

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
}

/**
 * Default settings applied on first plugin load. Merged with whatever
 * the user has saved (user settings take precedence).
 */
export const DEFAULT_SETTINGS: DraftBenchSettings = {
	projectsFolder: 'Draft Bench/{project}/',
	scenesFolder: '',
	draftsFolderPlacement: 'project-local',
	draftsFolderName: 'Drafts',
	templatesFolder: 'Draft Bench/Templates/',
	sceneTemplatePath: '',
	basesFolder: 'Draft Bench/Bases',
	enableBidirectionalSync: true,
	syncOnFileModify: true,
};
