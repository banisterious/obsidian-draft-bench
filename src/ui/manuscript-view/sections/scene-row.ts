import type { SceneNote } from '../../../core/discovery';
import { formatProgress, readTargetWords } from '../../../core/targets';
import type { WordCountCache } from '../../../core/word-count-cache';

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
	onOpen: (scene: SceneNote) => void
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
	// only (grid placement + reset of underline default).
	const titleEl = item.createEl('a', {
		cls: 'internal-link dbench-manuscript-view__scene-title',
		text: scene.file.basename,
		href: '#',
	});
	titleEl.addEventListener('click', (evt) => {
		evt.preventDefault();
		onOpen(scene);
	});

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
