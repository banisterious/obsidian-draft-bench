import type { App } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import type {
	ProjectNote,
	SceneNote,
	SubSceneNote,
} from '../../../core/discovery';
import { findSubScenesInScene } from '../../../core/discovery';
import type { DraftBenchLinker } from '../../../core/linker';
import type { WordCountCache } from '../../../core/word-count-cache';
import type { OpenSpec } from './open-affordances';
import { renderSceneCard } from './scene-card-section';
import { renderSceneRow } from './scene-row';

/**
 * Manuscript-list section body renderer for chapter-less projects.
 * Renders a list whose entries are either flat scene rows (scenes
 * without sub-scenes) or collapsible scene-cards (scenes with
 * sub-scenes), per the mixed-shape ratification in
 * [sub-scene-type.md § 6](../../../docs/planning/sub-scene-type.md):
 * a project where some scenes have sub-scenes and some don't is
 * normal and expected.
 *
 * The toolbar (New scene / New draft / Reorder / Compile) lives in a
 * separate section above this one.
 */
export function renderManuscriptListBody(
	body: HTMLElement,
	project: ProjectNote,
	scenes: SceneNote[],
	app: App,
	wordCountCache: WordCountCache,
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	onOpenScene: (scene: SceneNote, spec: OpenSpec) => void,
	onOpenSubScene: (subScene: SubSceneNote, spec: OpenSpec) => void
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
		const subScenes = findSubScenesInScene(app, scene.frontmatter['dbench-id']);
		if (subScenes.length === 0) {
			renderSceneRow(list, scene, wordCountCache, onOpenScene);
		} else {
			renderSceneCard(
				list,
				project,
				scene,
				subScenes,
				wordCountCache,
				plugin,
				linker,
				onOpenScene,
				onOpenSubScene
			);
		}
	}
}
