import type { SubSceneNote } from '../../../core/discovery';
import { readTargetWords } from '../../../core/targets';
import type { WordCountCache } from '../../../core/word-count-cache';
import {
	attachWikilinkOpenAffordances,
	type OpenSpec,
} from './open-affordances';
import { readOptionalString, renderStatusLabel, renderWordCount } from './scene-row';

/**
 * Sub-scene-row primitive used inside scene-card bodies (per
 * [sub-scene-type.md § 6](../../../docs/planning/sub-scene-type.md)).
 * Mirrors `renderSceneRow` (scene-row.ts) one structural level deeper.
 * Single-row 4-column grid: order · title · status · count. The row
 * flips to multi-row layout when the writer has set a
 * `dbench-subtitle` (italic tagline) or `dbench-synopsis` (regular
 * description); both can apply together. The D3 restyle (#30)
 * dropped the per-row draft-count column.
 *
 * Self-contained: fires its own async word-count fill so callers don't
 * need to thread word-badge collections.
 *
 * Shares the status-label, word-count, and `readOptionalString`
 * helpers from scene-row.ts; the BEM root differs (`__sub-scene-row`
 * vs. `__scene-row`) so styles can tune the deeper level (tighter
 * padding, indented order column) without affecting scenes.
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

	const subtitle = readOptionalString(subScene, 'dbench-subtitle');
	if (subtitle !== '') {
		item.addClass('dbench-manuscript-view__sub-scene-row--has-subtitle');
		item.createSpan({
			cls: 'dbench-manuscript-view__sub-scene-subtitle',
			text: subtitle,
		});
	}

	const synopsis = readOptionalString(subScene, 'dbench-synopsis');
	if (synopsis !== '') {
		item.addClass('dbench-manuscript-view__sub-scene-row--has-synopsis');
		item.createSpan({
			cls: 'dbench-manuscript-view__sub-scene-synopsis',
			text: synopsis,
		});
	}

	renderStatusLabel(item, subScene.frontmatter['dbench-status']);

	const wordEl = item.createDiv({
		cls: 'dbench-manuscript-view__sub-scene-words',
	});
	wordEl.setText('...');

	void wordCountCache
		.countForSubScene(subScene)
		.then((count) => {
			if (!wordEl.isConnected) return;
			const target = readTargetWords(
				subScene.frontmatter as unknown as Record<string, unknown>
			);
			renderWordCount(wordEl, count, target);
		})
		.catch(() => {
			if (!wordEl.isConnected) return;
			wordEl.setText('-');
		});
}

