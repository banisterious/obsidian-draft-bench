import type { Menu, TFile } from 'obsidian';
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
import { addRetrofitMenuItem } from './shared';

/**
 * Compile-specific file-menu items, kept separate from
 * `file-menu.ts` so the dispatcher there stays readable. Each of
 * these helpers adds zero, one, or two items to the menu based on
 * the file type and its frontmatter state.
 *
 * Parallel to the palette commands in `src/commands/run-compile.ts`,
 * `duplicate-compile-preset.ts`, `create-compile-preset.ts`, and
 * `compile-current-project.ts`. Shared execution logic lives in
 * `src/core/compile/operations.ts`; this module is purely menu
 * plumbing.
 */

/**
 * Run compile + Duplicate compile preset items for a compile-preset
 * note. Both entries act directly on `file` without any intermediate
 * picker — the preset is already the target.
 */
export function addPresetMenuItems(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	menu: Menu,
	file: TFile
): void {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!isCompilePresetFrontmatter(fm)) return;
	const preset = { file, frontmatter: fm };

	addRetrofitMenuItem(menu, 'Run compile', 'play', () => {
		void compileAndNotify(plugin.app, preset);
	});
	addRetrofitMenuItem(menu, 'Duplicate compile preset', 'copy', () => {
		void duplicateAndOpen(plugin, linker, preset);
	});
}

/**
 * Create compile preset item for a project note. Opens the existing
 * `NewCompilePresetModal` pre-scoped to this project so the writer
 * just supplies a name + format.
 */
export function addProjectCompileItem(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	menu: Menu,
	file: TFile
): void {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return;
	const project = resolveProjectForActive(plugin.app, file, fm);
	if (!project) return;

	addRetrofitMenuItem(menu, 'Create compile preset', 'file-plus-2', () => {
		new NewCompilePresetModal(plugin.app, linker, project).open();
	});
}

/**
 * Compile current project item for a scene or draft. Skips silently
 * when the note's `dbench-project-id` doesn't resolve (integrity
 * service's job to flag that; the menu just shows nothing in the
 * meantime rather than surfacing a disabled affordance).
 */
export function addSceneOrDraftCompileItem(
	plugin: DraftBenchPlugin,
	menu: Menu,
	file: TFile
): void {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return;
	const project = resolveProjectForActive(plugin.app, file, fm);
	if (!project) return;

	addRetrofitMenuItem(
		menu,
		'Compile current project',
		'book-open-check',
		() => {
			void pickPresetAndCompile(plugin, project);
		}
	);
}
