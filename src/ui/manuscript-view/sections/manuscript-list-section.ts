import type { App } from 'obsidian';
import type { SceneNote } from '../../../core/discovery';
import type { WordCountCache } from '../../../core/word-count-cache';
import { renderSceneRow } from './scene-row';

/**
 * Manuscript-list section body renderer for chapter-less projects.
 * Renders the flat scene list with the shared `renderSceneRow`
 * primitive (also used by the chapter-card body for chapter-aware
 * projects). Scene rows are click-through links to the scene note;
 * the toolbar (New scene / New draft / Reorder / Compile) lives in a
 * separate section above this one.
 */
export function renderManuscriptListBody(
	body: HTMLElement,
	scenes: SceneNote[],
	app: App,
	wordCountCache: WordCountCache,
	onOpenScene: (scene: SceneNote) => void
): void {
	body.empty();

	if (scenes.length === 0) {
		body.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: 'No scenes yet. Add the first one from the toolbar above.',
		});
		return;
	}

	const list = body.createEl('ol', {
		cls: 'dbench-manuscript-view__scene-list',
	});

	for (const scene of scenes) {
		renderSceneRow(list, scene, wordCountCache, onOpenScene);
	}

	// Reserved for future hooks (suggestion bars, inline editors).
	void app;
}
