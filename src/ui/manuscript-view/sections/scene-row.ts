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
 * projects). Renders one `<li>` row in a single-row 4-column grid
 * (order · title · status · count), with the row flipping to a
 * 2-row layout only when the writer has set a `dbench-subtitle`. The
 * D3 restyle (#30) dropped the per-row draft-count column; writers
 * see drafts on the scene file itself.
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
	// the title. The modifier class flips the row to a 2-row grid;
	// rows without a subtitle keep the default single-row layout.
	const subtitle = readSubtitle(scene);
	if (subtitle !== '') {
		item.addClass('dbench-manuscript-view__scene-row--has-subtitle');
		item.createSpan({
			cls: 'dbench-manuscript-view__scene-subtitle',
			text: subtitle,
		});
	}

	renderStatusLabel(item, scene.frontmatter['dbench-status']);

	const wordEl = item.createDiv({
		cls: 'dbench-manuscript-view__scene-words',
	});
	wordEl.setText('...');

	void wordCountCache
		.countForScene(scene)
		.then((count) => {
			if (!wordEl.isConnected) return;
			const target = readTargetWords(
				scene.frontmatter as unknown as Record<string, unknown>
			);
			renderWordCount(wordEl, count, target);
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
 * Render the scene's status as inline small-caps muted text. Reused
 * across scene rows, sub-scene rows, chapter cards, and scene cards.
 * The `data-status` attribute carries the status value lowercased so
 * future selectors / queries can target it; current CSS doesn't use
 * per-status color rules (D3 restyle dropped semantic-status palette
 * in #30). Label text preserves the writer's configured casing — the
 * small-caps treatment comes from `font-variant`, not from
 * `text-transform`.
 *
 * Exported for chapter / scene / sub-scene callers.
 */
export function renderStatusLabel(container: HTMLElement, status: string): void {
	container.createSpan({
		cls: 'dbench-manuscript-view__status-label',
		text: status,
		attr: { 'data-status': status.toLowerCase() },
	});
}

/**
 * Render a word count (with optional target-progress label) as inline
 * text into `container`. Used by scene rows, sub-scene rows, scene
 * cards, and chapter cards. The D3 restyle (#30) dropped the
 * mini progress bar that previously rendered alongside the label;
 * the writer reads progress as text ("820 / 1,000 (82%)") rather
 * than a visualized bar. Overage state is no longer surfaced
 * per-row; the project-level progress bar is the canonical signal.
 */
export function renderWordCount(
	container: HTMLElement,
	count: number,
	target: number | null
): void {
	container.empty();

	const label = container.createEl('span', {
		cls: 'dbench-manuscript-view__scene-words-label',
	});

	if (target === null) {
		label.setText(
			`${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
		);
	} else {
		const view = formatProgress(count, target);
		label.setText(view.label);
	}
}
