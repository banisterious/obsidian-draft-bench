import {
	type Editor,
	type MarkdownFileInfo,
	type MarkdownView,
	type Menu,
} from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftBenchLinker } from '../core/linker';
import { buildSingleFileItemSpecs } from './file-menu';
import { populateMenuSurface } from './shared';

/**
 * Populate the `editor-menu` event's menu for the active editor's
 * file. Right-click inside an open editor surfaces the same single-
 * file action set the file-menu offers when right-clicking the file
 * in the explorer (per #5 + the
 * [context-menu reference](../../docs/planning/context-menu-reference.md)).
 *
 * `MarkdownFileInfo.file` is `TFile | null`; `null` happens for
 * detached editors or empty leaves. Bail when no file is in scope.
 *
 * Smart visibility from `buildSingleFileItemSpecs` carries through:
 * a fully-stamped note shows no Draft Bench entries (the submenu
 * itself doesn't appear). The render layer (`populateMenuSurface`)
 * handles the desktop-submenu vs. mobile-flat split.
 *
 * The `editor` parameter is unused — Draft Bench's actions operate
 * on the file as a whole, not on the editor's selection or cursor.
 * Kept in the signature to match Obsidian's `editor-menu` callback
 * shape exactly.
 */
export function buildEditorMenuItems(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	menu: Menu,
	_editor: Editor,
	info: MarkdownView | MarkdownFileInfo
): void {
	const file = info.file;
	if (!file || file.extension !== 'md') return;
	const specs = buildSingleFileItemSpecs(plugin, linker, file);
	populateMenuSurface(menu, specs);
}
