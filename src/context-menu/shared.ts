import { Notice, Platform, type App, type Menu, type TFile } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import {
	applyToFiles,
	type BatchResult,
	type RetrofitResult,
} from '../core/retrofit';

/**
 * `MenuItem.setSubmenu()` exists in production Obsidian (used widely by
 * community plugins) but isn't in the public typings yet. Augment the
 * module so the desktop submenu branch in `populateMenuSurface` typechecks.
 * Drop this when Obsidian's typings expose it.
 */
declare module 'obsidian' {
	interface MenuItem {
		setSubmenu(): Menu;
	}
}

/**
 * Brand label for the Draft Bench submenu (desktop) and the prefix
 * applied to flat-mode item titles on mobile (e.g.,
 * `Draft Bench: Set as project`). Centralized so a future rename or
 * locale change touches one constant.
 */
export const DRAFT_BENCH_MENU_LABEL = 'Draft Bench';

/**
 * Lucide icon for the submenu entry. Matches the plugin's ribbon
 * (`scroll-text` per `main.ts`) and the Manuscript view's icon, so the
 * submenu reads as a continuation of the same brand surface.
 */
export const DRAFT_BENCH_MENU_ICON = 'scroll-text';

/**
 * Shared context-menu helpers.
 *
 * Retrofit items live under Obsidian's standard "action" menu section
 * (a consistent grouping users already recognize from other plugins).
 * Single-file runs show the plain notice from `noticeForResult`; batch
 * runs format a summary in the `Set as scene: 5 updated, 3 skipped, 1 error` shape
 * per spec § Feedback.
 */

export interface BatchNoticeLabels {
	/** The action verb phrase in the summary, e.g., "Set as scene". */
	action: string;
}

/**
 * Show the notice for a single-file retrofit result (success, skipped,
 * or error). Mirrors the palette-command notice shape for consistency.
 */
export function noticeForSingleFile(
	result: RetrofitResult,
	labels: { success: string; failureVerb: string }
): void {
	if (result.outcome === 'updated') {
		new Notice(`\u2713 ${labels.success}`);
	} else if (result.outcome === 'skipped') {
		new Notice(result.reason ?? 'Nothing to change.');
	} else {
		const reason = result.reason ? ` ${result.reason}` : '';
		new Notice(`Could not ${labels.failureVerb}.${reason}`);
	}
}

/**
 * Show the batch summary notice, following the spec's format:
 *
 *   Set as scene: 5 updated, 3 skipped, 1 error
 *
 * Uses "skipped" (rather than the spec's "already typed") because
 * skip reasons vary across actions (already typed, already has id,
 * already complete, etc.). A single generic label keeps the format
 * consistent across actions.
 */
export function noticeForBatch(
	result: BatchResult,
	labels: BatchNoticeLabels
): void {
	const parts: string[] = [];
	if (result.updated > 0) parts.push(`${result.updated} updated`);
	if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
	if (result.errors > 0) {
		parts.push(`${result.errors} ${result.errors === 1 ? 'error' : 'errors'}`);
	}
	if (parts.length === 0) {
		new Notice(`${labels.action}: no files changed.`);
		return;
	}
	const prefix = result.errors === 0 ? '\u2713 ' : '';
	new Notice(`${prefix}${labels.action}: ${parts.join(', ')}.`);
}

/**
 * Run a retrofit action against a list of files and show the
 * batch summary. Thin convenience wrapper around `applyToFiles`
 * and `noticeForBatch`.
 */
export async function runBatch(
	app: App,
	settings: DraftBenchSettings,
	files: TFile[],
	action: (
		app: App,
		settings: DraftBenchSettings,
		file: TFile
	) => Promise<RetrofitResult>,
	labels: BatchNoticeLabels
): Promise<void> {
	const result = await applyToFiles(app, settings, files, action);
	noticeForBatch(result, labels);
}

/**
 * Add a retrofit item to a context menu. The item is placed in
 * Obsidian's "action" section so Draft Bench items cluster with
 * other action verbs.
 */
export function addRetrofitMenuItem(
	menu: Menu,
	title: string,
	icon: string,
	onClick: () => void | Promise<void>
): void {
	menu.addItem((item) => {
		item
			.setTitle(title)
			.setIcon(icon)
			.setSection('action')
			.onClick(() => void onClick());
	});
}

/**
 * One Draft Bench context-menu action expressed as data, decoupled
 * from where it lands in the menu (top-level submenu on desktop,
 * top-level flat list with `Draft Bench:` prefix on mobile). The
 * file-menu / files-menu / editor-menu builders return arrays of
 * these and let `populateMenuSurface` choose the rendering branch.
 */
export interface MenuItemSpec {
	/** Action title without any namespace prefix (e.g., `Set as project`). */
	title: string;
	/** Lucide icon name. */
	icon: string;
	/** Click handler; may be async. */
	onClick: () => void | Promise<void>;
}

/**
 * Render a list of Draft Bench menu specs onto Obsidian's right-click
 * `menu`, branching on `Platform.isDesktop && !Platform.isMobile`:
 *
 * - **Desktop** — adds a separator, then a single `Draft Bench` item
 *   whose `setSubmenu()` holds the specs as sub-items with their plain
 *   titles. Collapses the plugin's contribution to one top-level entry.
 * - **Mobile** — adds a separator, then each spec as a top-level item
 *   with title `Draft Bench: <title>`. Obsidian's mobile menu doesn't
 *   support submenus yet (per the
 *   [context-menu reference](../../docs/planning/context-menu-reference.md)),
 *   so the prefix preserves namespace-distinguishability.
 *
 * `specs.length === 0` is a no-op: no separator, no submenu, no flat
 * items. Smart visibility (D-05) lives in the spec builders, not here;
 * this function is purely render layer.
 */
export function populateMenuSurface(menu: Menu, specs: MenuItemSpec[]): void {
	if (specs.length === 0) return;
	const useSubmenu = Platform.isDesktop && !Platform.isMobile;
	menu.addSeparator();
	if (useSubmenu) {
		menu.addItem((item) => {
			const submenu = item
				.setTitle(DRAFT_BENCH_MENU_LABEL)
				.setIcon(DRAFT_BENCH_MENU_ICON)
				.setSection('action')
				.setSubmenu();
			for (const spec of specs) {
				addRetrofitMenuItem(submenu, spec.title, spec.icon, spec.onClick);
			}
		});
	} else {
		for (const spec of specs) {
			addRetrofitMenuItem(
				menu,
				`${DRAFT_BENCH_MENU_LABEL}: ${spec.title}`,
				spec.icon,
				spec.onClick
			);
		}
	}
}
