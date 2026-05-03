import type { SubSceneNote } from '../../../core/discovery';
import { readTargetWords } from '../../../core/targets';
import type { WordCountCache } from '../../../core/word-count-cache';
import {
	attachWikilinkOpenAffordances,
	type OpenSpec,
} from './open-affordances';
import { renderStatusChip, renderWordsAndProgress } from './scene-row';

/**
 * Sub-scene-row primitive used inside scene-card bodies (per
 * [sub-scene-type.md § 6](../../../docs/planning/sub-scene-type.md)).
 * Mirrors `renderSceneRow` (scene-row.ts) one structural level deeper:
 * order capsule + clickable title + optional subtitle + status chip +
 * async word-count badge + draft count.
 *
 * Self-contained: fires its own async word-count fill so callers don't
 * need to thread word-badge collections.
 *
 * Shares the status-chip and progress helpers from scene-row.ts; the
 * BEM root differs (`__sub-scene-row` vs. `__scene-row`) so styles can
 * tune the deeper level (smaller order capsule, tighter padding) without
 * affecting scenes.
 */
export function renderSubSceneRow(
	parent: HTMLElement,
	subScene: SubSceneNote,
	wordCountCache: WordCountCache,
	onOpen: (subScene: SubSceneNote, spec: OpenSpec) => void
): void {
	const item = parent.createEl('li', {
		cls: 'dbench-manuscript-view__sub-scene-row',
	});

	item.createSpan({
		cls: 'dbench-manuscript-view__sub-scene-order',
		text: String(subScene.frontmatter['dbench-order']),
	});

	const titleEl = item.createEl('a', {
		cls: 'internal-link dbench-manuscript-view__sub-scene-title',
		text: subScene.file.basename,
		href: '#',
	});
	attachWikilinkOpenAffordances(titleEl, (spec) => onOpen(subScene, spec));

	const subtitle = readSubtitle(subScene);
	if (subtitle !== '') {
		item.addClass('dbench-manuscript-view__sub-scene-row--has-subtitle');
		item.createSpan({
			cls: 'dbench-manuscript-view__sub-scene-subtitle',
			text: subtitle,
		});
	}

	renderStatusChip(item, subScene.frontmatter['dbench-status']);

	const wordEl = item.createDiv({
		cls: 'dbench-manuscript-view__sub-scene-words',
	});
	wordEl.setText('...');

	const draftCount = subScene.frontmatter['dbench-drafts']?.length ?? 0;
	item.createSpan({
		cls: 'dbench-manuscript-view__sub-scene-drafts',
		text: draftCount === 1 ? '1 draft' : `${draftCount} drafts`,
	});

	void wordCountCache
		.countForSubScene(subScene)
		.then((count) => {
			if (!wordEl.isConnected) return;
			const target = readTargetWords(
				subScene.frontmatter as unknown as Record<string, unknown>
			);
			renderWordsAndProgress(
				wordEl,
				count,
				target,
				'dbench-manuscript-view__sub-scene-words--overage'
			);
		})
		.catch(() => {
			if (!wordEl.isConnected) return;
			wordEl.setText('-');
		});
}

function readSubtitle(subScene: SubSceneNote): string {
	const fm = subScene.frontmatter as unknown as Record<string, unknown>;
	const raw = fm['dbench-subtitle'];
	return typeof raw === 'string' ? raw.trim() : '';
}
