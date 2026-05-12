import type { App } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import type {
	ProjectNote,
	SceneNote,
	SubSceneNote,
} from '../../../core/discovery';
import { findSubScenesInScene } from '../../../core/discovery';
import type { DraftBenchLinker } from '../../../core/linker';
import { isHiddenStatus } from '../../../core/statuses';
import type { WordCountCache } from '../../../core/word-count-cache';
import type { OpenSpec } from './open-affordances';
import { renderSceneCard } from './scene-card-section';
import { renderSceneRow } from './scene-row';

/**
 * Archive-visibility spec passed through the section renderers. When
 * the leaf's "Show archived" toggle is off, scenes whose status is in
 * `hiddenStatuses` are dropped from the list. When on, those scenes
 * are rendered with a `--archived` modifier so CSS can mute them.
 * Sub-scenes carrying a hidden status follow the same rules inside
 * scene cards; chapter cards apply the rule recursively to their
 * scene members but render the chapter row itself even if archived
 * (chapter archive is unusual — surface it muted rather than hide it
 * entirely to avoid losing track of an archived chapter).
 */
export interface ArchiveVisibility {
	hiddenStatuses: readonly string[];
	showArchived: boolean;
}

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
	onOpenSubScene: (subScene: SubSceneNote, spec: OpenSpec) => void,
	archive: ArchiveVisibility
): void {
	body.empty();

	const visibleScenes = filterArchivedScenes(scenes, archive);

	if (visibleScenes.length === 0) {
		const hiddenCount = scenes.length - visibleScenes.length;
		const message =
			scenes.length === 0
				? 'No scenes yet. Add the first one from the toolbar above.'
				: hiddenCount > 0
				? `All ${hiddenCount === 1 ? 'scene is' : 'scenes are'} archived. Use the toolbar's "Show archived" toggle to reveal them.`
				: 'No scenes yet. Add the first one from the toolbar above.';
		body.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: message,
		});
		return;
	}

	const list = body.createEl('ol', {
		cls: 'dbench-manuscript-view__scene-list',
	});

	for (const scene of visibleScenes) {
		const allSubScenes = findSubScenesInScene(
			app,
			scene.frontmatter['dbench-id']
		);
		const sceneArchived = isHiddenStatus(
			scene.frontmatter['dbench-status'],
			archive.hiddenStatuses
		);
		if (allSubScenes.length === 0) {
			renderSceneRow(list, scene, wordCountCache, onOpenScene, {
				archived: sceneArchived,
			});
		} else {
			renderSceneCard(
				list,
				project,
				scene,
				allSubScenes,
				wordCountCache,
				plugin,
				linker,
				onOpenScene,
				onOpenSubScene,
				archive
			);
		}
	}
}

/**
 * Drop scenes whose `dbench-status` is in `hiddenStatuses` when the
 * archive toggle is off. When on, return the list unchanged so the
 * row renderers can apply the `--archived` modifier instead.
 */
export function filterArchivedScenes<T extends { frontmatter: { 'dbench-status': string } }>(
	scenes: readonly T[],
	archive: ArchiveVisibility
): T[] {
	if (archive.showArchived) return [...scenes];
	return scenes.filter(
		(s) => !isHiddenStatus(s.frontmatter['dbench-status'], archive.hiddenStatuses)
	);
}
