import { setIcon, type App } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import type {
	ChapterNote,
	SceneNote,
} from '../../../core/discovery';
import { findScenesInChapter } from '../../../core/discovery';
import { sortScenesByOrder } from '../../../core/sort-scenes';
import { readTargetWords } from '../../../core/targets';
import type { WordCountCache } from '../../../core/word-count-cache';
import {
	renderSceneRow,
	renderStatusChip,
	renderWordsAndProgress,
} from './scene-row';

/**
 * Manuscript body renderer for chapter-aware projects (those with at
 * least one chapter). Renders a vertical list of chapter cards in
 * `dbench-order`; each card has a clickable header (chevron + order
 * capsule + title + status + chapter word-count rollup) and a body
 * holding the chapter's scene rows when expanded.
 *
 * Collapse state is per-chapter, persisted via `plugin.settings.
 * chapterCollapseState` keyed by `dbench-id`. Missing entries default
 * to expanded; toggling triggers an immediate `saveSettings()`.
 *
 * Per § 5 of chapter-type.md, the chapter word-count rollup is
 * chapter body's `## Draft` plus the sum of child scenes' `## Draft`
 * sections. Computed via `WordCountCache.countForChapter`.
 */
export function renderChapterListBody(
	body: HTMLElement,
	chapters: ChapterNote[],
	app: App,
	wordCountCache: WordCountCache,
	plugin: DraftBenchPlugin,
	onOpenChapter: (chapter: ChapterNote) => void,
	onOpenScene: (scene: SceneNote) => void
): void {
	body.empty();

	if (chapters.length === 0) {
		body.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: 'No chapters yet. Add the first one from the toolbar above.',
		});
		return;
	}

	const list = body.createEl('div', {
		cls: 'dbench-manuscript-view__chapter-list',
	});

	for (const chapter of chapters) {
		const scenes = sortScenesByOrder(
			findScenesInChapter(app, chapter.frontmatter['dbench-id'])
		);
		renderChapterCard(
			list,
			chapter,
			scenes,
			wordCountCache,
			plugin,
			onOpenChapter,
			onOpenScene
		);
	}
}

function renderChapterCard(
	parent: HTMLElement,
	chapter: ChapterNote,
	scenes: SceneNote[],
	wordCountCache: WordCountCache,
	plugin: DraftBenchPlugin,
	onOpenChapter: (chapter: ChapterNote) => void,
	onOpenScene: (scene: SceneNote) => void
): void {
	const id = chapter.frontmatter['dbench-id'];
	// Map semantic: stored value is `true` when the writer has explicitly
	// collapsed the card; `false` or absent means expanded. Default-
	// expanded matches writer expectation when first viewing a chapter
	// (they probably want to see the scenes).
	const collapsed = plugin.settings.chapterCollapseState[id] === true;

	const card = parent.createEl('section', {
		cls: 'dbench-manuscript-view__chapter-card',
	});
	if (!collapsed) {
		card.addClass('dbench-manuscript-view__chapter-card--expanded');
	}

	const header = card.createDiv({
		cls: 'dbench-manuscript-view__chapter-header',
		attr: {
			role: 'button',
			tabindex: '0',
			'aria-expanded': String(!collapsed),
		},
	});

	const chevron = header.createSpan({
		cls: 'dbench-manuscript-view__chapter-chevron',
		attr: { 'aria-hidden': 'true' },
	});
	setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');

	header.createSpan({
		cls: 'dbench-manuscript-view__chapter-order',
		text: String(chapter.frontmatter['dbench-order']),
	});

	const titleEl = header.createEl('a', {
		cls: 'internal-link dbench-manuscript-view__chapter-title',
		text: chapter.file.basename,
		href: '#',
	});
	titleEl.addEventListener('click', (evt) => {
		evt.preventDefault();
		// Stop the click from bubbling to the header's toggle handler —
		// opening the chapter note shouldn't also flip the collapse state.
		evt.stopPropagation();
		onOpenChapter(chapter);
	});

	renderStatusChip(header, chapter.frontmatter['dbench-status']);

	const wordEl = header.createDiv({
		cls: 'dbench-manuscript-view__chapter-words',
	});
	wordEl.setText('...');

	const cardBody = card.createDiv({
		cls: 'dbench-manuscript-view__chapter-body',
	});
	if (collapsed) {
		cardBody.addClass('dbench-manuscript-view__chapter-body--collapsed');
	}

	if (scenes.length === 0) {
		cardBody.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: 'No scenes in this chapter yet.',
		});
	} else {
		const sceneList = cardBody.createEl('ol', {
			cls: 'dbench-manuscript-view__scene-list',
		});
		for (const scene of scenes) {
			renderSceneRow(sceneList, scene, wordCountCache, onOpenScene);
		}
	}

	const toggle = (): void => {
		const isExpanded = card.hasClass(
			'dbench-manuscript-view__chapter-card--expanded'
		);
		const nextExpanded = !isExpanded;
		card.toggleClass(
			'dbench-manuscript-view__chapter-card--expanded',
			nextExpanded
		);
		cardBody.toggleClass(
			'dbench-manuscript-view__chapter-body--collapsed',
			!nextExpanded
		);
		setIcon(chevron, nextExpanded ? 'chevron-down' : 'chevron-right');
		header.setAttribute('aria-expanded', String(nextExpanded));
		plugin.settings.chapterCollapseState[id] = !nextExpanded;
		void plugin.saveSettings();
	};

	header.addEventListener('click', (ev) => {
		// Inner anchor (chapter title) handles its own click + stopPropagation;
		// any other inner element bubbles here and toggles.
		toggle();
		void ev;
	});
	header.addEventListener('keydown', (ev) => {
		if (ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			toggle();
		}
	});

	void wordCountCache
		.countForChapter(chapter, scenes)
		.then((count) => {
			if (!wordEl.isConnected) return;
			const target = readTargetWords(
				chapter.frontmatter as unknown as Record<string, unknown>
			);
			renderWordsAndProgress(
				wordEl,
				count,
				target,
				'dbench-manuscript-view__chapter-words--overage'
			);
		})
		.catch(() => {
			if (!wordEl.isConnected) return;
			wordEl.setText('-');
		});
}
