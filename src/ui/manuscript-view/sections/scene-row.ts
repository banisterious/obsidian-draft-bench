import type { SceneNote } from '../../../core/discovery';
import { formatProgress, readTargetWords } from '../../../core/targets';
import type { WordCountCache } from '../../../core/word-count-cache';
import {
	attachWikilinkOpenAffordances,
	type OpenSpec,
} from './open-affordances';

/**
 * Reusable scene-row primitive shared by the flat manuscript list
 * (chapter-less projects) and the chapter-card body (chapter-aware
 * projects). Renders one `<li>` row with order capsule, clickable
 * title, status chip, async word-count badge, and draft count, then
 * fires its own async word-count fill — the row is self-contained so
 * callers don't need to thread word-badge collections.
 */
export function renderSceneRow(
	parent: HTMLElement,
	scene: SceneNote,
	wordCountCache: WordCountCache,
	onOpen: (scene: SceneNote, spec: OpenSpec) => void
): void {
	const item = parent.createEl('li', {
		cls: 'dbench-manuscript-view__scene-row',
	});

	item.createSpan({
		cls: 'dbench-manuscript-view__scene-order',
		text: String(scene.frontmatter['dbench-order']),
	});

	// `internal-link` inherits Obsidian's wikilink color + hover
	// styling theme-correctly; the dbench-* class supplies layout
	// only (grid placement + reset of underline default). The wikilink
	// affordances helper wires up plain click + modifier-click +
	// middle-click + right-click context menu to match Obsidian's
	// standard wikilink behavior.
	const titleEl = item.createEl('a', {
		cls: 'internal-link dbench-manuscript-view__scene-title',
		text: scene.file.basename,
		href: '#',
	});
	attachWikilinkOpenAffordances(titleEl, (spec) => onOpen(scene, spec));

	// Optional subtitle (`dbench-subtitle`) shown as muted text below
	// the title. The modifier class flips the row to a 3-row grid;
	// rows without a subtitle keep the original 2-row layout so they
	// don't reserve vertical space.
	const subtitle = readSubtitle(scene);
	if (subtitle !== '') {
		item.addClass('dbench-manuscript-view__scene-row--has-subtitle');
		item.createSpan({
			cls: 'dbench-manuscript-view__scene-subtitle',
			text: subtitle,
		});
	}

	renderStatusChip(item, scene.frontmatter['dbench-status']);

	const wordEl = item.createDiv({
		cls: 'dbench-manuscript-view__scene-words',
	});
	wordEl.setText('...');

	const draftCount = scene.frontmatter['dbench-drafts']?.length ?? 0;
	item.createSpan({
		cls: 'dbench-manuscript-view__scene-drafts',
		text: draftCount === 1 ? '1 draft' : `${draftCount} drafts`,
	});

	void wordCountCache
		.countForScene(scene)
		.then((count) => {
			if (!wordEl.isConnected) return;
			const target = readTargetWords(
				scene.frontmatter as unknown as Record<string, unknown>
			);
			renderWordsAndProgress(
				wordEl,
				count,
				target,
				'dbench-manuscript-view__scene-words--overage'
			);
		})
		.catch(() => {
			if (!wordEl.isConnected) return;
			wordEl.setText('-');
		});
}

/**
 * Read the optional `dbench-subtitle` value off a scene's frontmatter,
 * trimming whitespace. Returns `''` when absent, blank, or non-string
 * (defensive — frontmatter values arrive as `unknown` per Obsidian's
 * cache shape).
 */
function readSubtitle(scene: SceneNote): string {
	const fm = scene.frontmatter as unknown as Record<string, unknown>;
	const raw = fm['dbench-subtitle'];
	return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Render a status chip — a small pill with a colored dot + label.
 * The `data-status` attribute carries the status value lowercased so
 * CSS selectors can assign per-status color via
 * `[data-status="brainstorm"]` etc. Label text preserves the writer's
 * configured casing. Out-of-vocabulary values inherit the
 * default-neutral color.
 *
 * Exported for chapter-card headers, which also use a chip.
 */
export function renderStatusChip(container: HTMLElement, status: string): void {
	const chip = container.createSpan({
		cls: 'dbench-manuscript-view__status-chip',
		attr: { 'data-status': status.toLowerCase() },
	});
	chip.createSpan({
		cls: 'dbench-manuscript-view__status-chip-dot',
		attr: { 'aria-hidden': 'true' },
	});
	chip.createSpan({
		cls: 'dbench-manuscript-view__status-chip-label',
		text: status,
	});
}

/**
 * Render a word count + optional target progress into `container`.
 * Used by both scene rows and chapter cards; `overageClass` is the
 * caller's BEM modifier added when the count exceeds the target so
 * each context can tint its own track.
 */
export function renderWordsAndProgress(
	container: HTMLElement,
	count: number,
	target: number | null,
	overageClass: string
): void {
	container.empty();
	container.removeClass(overageClass);

	const label = container.createEl('span', {
		cls: 'dbench-manuscript-view__scene-progress-label',
	});

	let percent = 0;
	if (target === null) {
		label.setText(
			`${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
		);
	} else {
		const view = formatProgress(count, target);
		label.setText(view.label);
		percent = view.percent;
		if (view.overage) {
			container.addClass(overageClass);
		}
	}

	const track = container.createDiv({
		cls: 'dbench-manuscript-view__scene-progress-track',
	});
	const fill = track.createDiv({
		cls: 'dbench-manuscript-view__scene-progress-fill',
	});
	fill.style.width = `${percent}%`;
}
