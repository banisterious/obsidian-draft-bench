import { setIcon } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import type {
	ProjectNote,
	SceneNote,
	SubSceneNote,
} from '../../../core/discovery';
import type { DraftBenchLinker } from '../../../core/linker';
import { sortSubScenesByOrder } from '../../../core/sort-scenes';
import { readTargetWords } from '../../../core/targets';
import type { WordCountCache } from '../../../core/word-count-cache';
import { NewSubSceneModal } from '../../modals/new-sub-scene-modal';
import {
	attachWikilinkOpenAffordances,
	type OpenSpec,
} from './open-affordances';
import { renderStatusChip, renderWordsAndProgress } from './scene-row';
import { renderSubSceneRow } from './sub-scene-row';

/**
 * Scene-card renderer for hierarchical scenes (those with sub-scenes).
 * Mirrors the chapter-card pattern from `chapter-card-section.ts` one
 * structural level deeper, per [sub-scene-type.md § 6](../../../docs/planning/sub-scene-type.md):
 * collapsible card with header (chevron + order capsule + title +
 * status + scene-rollup word count + "New sub-scene" affordance) and a
 * body holding sub-scene rows when expanded.
 *
 * Collapse state is per-scene, persisted via `plugin.settings.sceneCollapseState`
 * keyed by `dbench-id`. Missing entries default to expanded; toggling
 * triggers an immediate `saveSettings()`. Mirrors the chapter
 * `chapterCollapseState` pattern.
 *
 * Per § 5 of sub-scene-type.md, the scene rollup is scene body's
 * `## Draft` (intro prose, often empty for hierarchical scenes) plus
 * the sum of child sub-scene `## Draft` sections. Computed via
 * `WordCountCache.countForSceneWithSubScenes`.
 *
 * Used by both:
 *   - `manuscript-list-section` (chapter-less projects), where scene-cards
 *     sit at the top level alongside flat scene rows.
 *   - `chapter-card-section` (chapter-aware projects), where scene-cards
 *     nest inside a chapter-card body alongside flat scene rows.
 */
export function renderSceneCard(
	parent: HTMLElement,
	project: ProjectNote,
	scene: SceneNote,
	subScenes: SubSceneNote[],
	wordCountCache: WordCountCache,
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	onOpenScene: (scene: SceneNote, spec: OpenSpec) => void,
	onOpenSubScene: (subScene: SubSceneNote, spec: OpenSpec) => void
): void {
	const id = scene.frontmatter['dbench-id'];
	const collapsed = plugin.settings.sceneCollapseState[id] === true;

	const card = parent.createEl('section', {
		cls: 'dbench-manuscript-view__scene-card',
	});
	if (!collapsed) {
		card.addClass('dbench-manuscript-view__scene-card--expanded');
	}

	const header = card.createDiv({
		cls: 'dbench-manuscript-view__scene-card-header',
		attr: {
			role: 'button',
			tabindex: '0',
			'aria-expanded': String(!collapsed),
		},
	});

	const chevron = header.createSpan({
		cls: 'dbench-manuscript-view__scene-card-chevron',
		attr: { 'aria-hidden': 'true' },
	});
	setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');

	header.createSpan({
		cls: 'dbench-manuscript-view__scene-card-order',
		text: String(scene.frontmatter['dbench-order']),
	});

	const titleEl = header.createEl('a', {
		cls: 'internal-link dbench-manuscript-view__scene-card-title',
		text: scene.file.basename,
		href: '#',
	});
	attachWikilinkOpenAffordances(titleEl, (spec) => onOpenScene(scene, spec));

	renderStatusChip(header, scene.frontmatter['dbench-status']);

	const wordEl = header.createDiv({
		cls: 'dbench-manuscript-view__scene-card-words',
	});
	wordEl.setText('...');

	const newSubSceneBtn = header.createEl('button', {
		cls: 'clickable-icon dbench-manuscript-view__scene-card-action',
		attr: {
			'aria-label': 'New sub-scene',
			type: 'button',
		},
	});
	setIcon(newSubSceneBtn, 'rows');
	newSubSceneBtn.addEventListener('click', (evt) => {
		evt.preventDefault();
		// Stop the click from bubbling to the header's toggle handler.
		evt.stopPropagation();
		new NewSubSceneModal(
			plugin.app,
			plugin.settings,
			linker,
			project,
			scene
		).open();
	});

	const cardBody = card.createDiv({
		cls: 'dbench-manuscript-view__scene-card-body',
	});
	if (collapsed) {
		cardBody.addClass('dbench-manuscript-view__scene-card-body--collapsed');
	}

	if (subScenes.length === 0) {
		cardBody.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: 'No sub-scenes in this scene yet.',
		});
	} else {
		const list = cardBody.createEl('ol', {
			cls: 'dbench-manuscript-view__sub-scene-list',
		});
		const sorted = sortSubScenesByOrder(subScenes);
		for (const subScene of sorted) {
			renderSubSceneRow(list, subScene, wordCountCache, onOpenSubScene);
		}
	}

	const toggle = (): void => {
		const isExpanded = card.hasClass(
			'dbench-manuscript-view__scene-card--expanded'
		);
		const nextExpanded = !isExpanded;
		card.toggleClass(
			'dbench-manuscript-view__scene-card--expanded',
			nextExpanded
		);
		cardBody.toggleClass(
			'dbench-manuscript-view__scene-card-body--collapsed',
			!nextExpanded
		);
		setIcon(chevron, nextExpanded ? 'chevron-down' : 'chevron-right');
		header.setAttribute('aria-expanded', String(nextExpanded));
		plugin.settings.sceneCollapseState[id] = !nextExpanded;
		void plugin.saveSettings();
	};

	header.addEventListener('click', () => toggle());
	header.addEventListener('keydown', (ev) => {
		if (ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			toggle();
		}
	});

	void wordCountCache
		.countForSceneWithSubScenes(scene, subScenes)
		.then((count) => {
			if (!wordEl.isConnected) return;
			const target = readTargetWords(
				scene.frontmatter as unknown as Record<string, unknown>
			);
			renderWordsAndProgress(
				wordEl,
				count,
				target,
				'dbench-manuscript-view__scene-card-words--overage'
			);
		})
		.catch(() => {
			if (!wordEl.isConnected) return;
			wordEl.setText('-');
		});
}
