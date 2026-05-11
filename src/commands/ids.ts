import type { App } from 'obsidian';

/**
 * Typed constants for every Draft Bench command. The values are the
 * bare command IDs registered via `plugin.addCommand({ id })`;
 * Obsidian prepends the plugin's ID (`draft-bench:`) at invocation
 * time. Use `runCommand(app, id)` to invoke a command from anywhere
 * in the plugin — it handles the prefix and the unsafe cast around
 * `app.commands.executeCommandById` (which is not in Obsidian's
 * public typings).
 *
 * Adding a new command? Add its bare ID here AND in the `addCommand`
 * registration in the corresponding `src/commands/<name>.ts` file.
 * Keeping the two in sync via the same constant makes renames a
 * single-line change.
 */
export const COMMAND_IDS = {
	// Project + content creation
	CREATE_PROJECT: 'create-project',
	CREATE_EXAMPLE_PROJECT: 'create-example-project',
	NEW_CHAPTER_IN_PROJECT: 'new-chapter-in-project',
	NEW_SCENE_IN_PROJECT: 'new-scene-in-project',
	NEW_SUB_SCENE_IN_SCENE: 'new-sub-scene-in-scene',

	// Drafts
	NEW_DRAFT_OF_THIS_SCENE: 'new-draft-of-this-scene',
	NEW_DRAFT_OF_THIS_CHAPTER: 'new-draft-of-this-chapter',
	NEW_DRAFT_OF_THIS_SUB_SCENE: 'new-draft-of-this-sub-scene',

	// Compile
	BUILD_MANUSCRIPT: 'build-manuscript',
	COMPILE_CURRENT_PROJECT: 'compile-current-project',
	RUN_COMPILE: 'run-compile',
	CREATE_COMPILE_PRESET: 'create-compile-preset',
	DUPLICATE_COMPILE_PRESET: 'duplicate-compile-preset',

	// Reorder
	REORDER_CHAPTERS_IN_PROJECT: 'reorder-chapters-in-project',
	REORDER_SCENES: 'reorder-scenes',
	REORDER_SUB_SCENES_IN_SCENE: 'reorder-sub-scenes-in-scene',

	// Import / install / repair
	IMPORT_FROM_SCRIVENER: 'import-from-scrivener',
	INSTALL_STARTER_BASES: 'install-starter-bases',
	REPAIR_PROJECT_LINKS: 'repair-project-links',

	// UI
	SHOW_MANUSCRIPT_VIEW: 'show-manuscript-view',
	SHOW_WELCOME: 'show-welcome',

	// Retrofit
	SET_AS_PROJECT: 'set-as-project',
	SET_AS_CHAPTER: 'set-as-chapter',
	SET_AS_SCENE: 'set-as-scene',
	SET_AS_SUB_SCENE: 'set-as-sub-scene',
	SET_AS_DRAFT: 'set-as-draft',
	COMPLETE_ESSENTIAL_PROPERTIES: 'complete-essential-properties',
	ADD_DBENCH_ID: 'add-dbench-id',
} as const;

export type CommandId = (typeof COMMAND_IDS)[keyof typeof COMMAND_IDS];

const PLUGIN_ID = 'draft-bench';

/**
 * Invoke a Draft Bench command via Obsidian's command palette plumbing.
 * Centralizes the unsafe cast around `app.commands.executeCommandById`
 * and the plugin-ID prefix. Returns `true` when the command was found
 * and invoked, `false` otherwise (e.g., when the palette plumbing is
 * absent under tests).
 */
export function runCommand(app: App, commandId: CommandId): boolean {
	const commands = (
		app as unknown as {
			commands?: { executeCommandById: (id: string) => boolean };
		}
	).commands;
	return commands?.executeCommandById(`${PLUGIN_ID}:${commandId}`) ?? false;
}
