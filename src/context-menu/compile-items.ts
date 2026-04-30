import type { TFile } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import {
	compileAndNotify,
	duplicateAndOpen,
	pickPresetAndCompile,
	resolveProjectForActive,
} from '../core/compile/operations';
import type { DraftBenchLinker } from '../core/linker';
import { isCompilePresetFrontmatter } from '../model/compile-preset';
import { NewCompilePresetModal } from '../ui/modals/new-compile-preset-modal';
import type { MenuItemSpec } from './shared';

/**
 * Compile-specific menu specs, kept separate from `file-menu.ts` so the
 * dispatcher there stays readable. Each helper returns zero, one, or
 * two `MenuItemSpec` entries based on the file type and its frontmatter
 * state. Callers (file-menu / editor-menu) merge these with retrofit
 * specs and hand the combined list to `populateMenuSurface`.
 *
 * Parallel to the palette commands in `src/commands/run-compile.ts`,
 * `duplicate-compile-preset.ts`, `create-compile-preset.ts`, and
 * `compile-current-project.ts`. Shared execution logic lives in
 * `src/core/compile/operations.ts`; this module is purely menu plumbing.
 */

/**
 * Run-compile + Duplicate-compile-preset entries for a compile-preset
 * note. Both act directly on `file` without an intermediate picker —
 * the preset is already the target.
 */
export function presetItemSpecs(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	file: TFile
): MenuItemSpec[] {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!isCompilePresetFrontmatter(fm)) return [];
	const preset = { file, frontmatter: fm };
	return [
		{
			title: 'Run compile',
			icon: 'play',
			onClick: () => {
				void compileAndNotify(plugin.app, preset);
			},
		},
		{
			title: 'Duplicate compile preset',
			icon: 'copy',
			onClick: () => {
				void duplicateAndOpen(plugin, linker, preset);
			},
		},
	];
}

/**
 * Create-compile-preset entry for a project note. Opens
 * `NewCompilePresetModal` pre-scoped to this project so the writer
 * supplies a name + format.
 */
export function projectCompileItemSpecs(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	file: TFile
): MenuItemSpec[] {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return [];
	const project = resolveProjectForActive(plugin.app, file, fm);
	if (!project) return [];
	return [
		{
			title: 'Create compile preset',
			icon: 'file-plus-2',
			onClick: () => {
				new NewCompilePresetModal(plugin.app, linker, project).open();
			},
		},
	];
}

/**
 * Compile-current-project entry for a scene or draft. Skips silently
 * when the note's `dbench-project-id` doesn't resolve (the integrity
 * service flags that; the menu just shows nothing rather than a
 * disabled affordance).
 */
export function sceneOrDraftCompileItemSpecs(
	plugin: DraftBenchPlugin,
	file: TFile
): MenuItemSpec[] {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return [];
	const project = resolveProjectForActive(plugin.app, file, fm);
	if (!project) return [];
	return [
		{
			title: 'Compile current project',
			icon: 'book-open-check',
			onClick: () => {
				void pickPresetAndCompile(plugin, project);
			},
		},
	];
}
