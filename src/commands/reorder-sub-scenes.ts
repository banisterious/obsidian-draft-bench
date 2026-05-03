import { type App, type Plugin } from 'obsidian';
import type { DraftBenchLinker } from '../core/linker';
import {
	findScenes,
	findSubScenesInScene,
	type SceneNote,
	type SubSceneNote,
} from '../core/discovery';
import { isSceneFrontmatter } from '../model/scene';
import { isSubSceneFrontmatter } from '../model/sub-scene';
import { reorderSubScenes } from '../core/reorder';
import {
	ReorderChildrenModal,
	type ReorderModalConfig,
} from '../ui/modals/reorder-children-modal';

/**
 * Register the "Draft Bench: Reorder sub-scenes in scene" command per
 * [sub-scene-type.md § 8](../../docs/planning/sub-scene-type.md). The
 * third reorder context (sub-scenes-in-scene) — landed alongside the
 * `ReorderChildrenModal` genericization that this third trigger
 * motivated.
 *
 * Always enabled. Pre-selects a scene parent when the active file is a
 * scene (or a sub-scene — uses its parent scene). Picker lists every
 * scene in the vault; the modal's parent picker dropdown handles the
 * cross-project case naturally.
 */
export function registerReorderSubScenesCommand(
	plugin: Plugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'reorder-sub-scenes-in-scene',
		name: 'Reorder sub-scenes in scene',
		callback: () => {
			const config = buildSubSceneReorderConfig(
				plugin.app,
				resolveInitialScene(plugin)
			);
			new ReorderChildrenModal(plugin.app, linker, config).open();
		},
	});
}

export function buildSubSceneReorderConfig(
	app: App,
	initialScene: SceneNote | null
): ReorderModalConfig<SubSceneNote> {
	const scenes = findScenes(app);
	return {
		title: 'Reorder sub-scenes',
		itemLabel: 'sub-scene',
		itemLabelPlural: 'sub-scenes',
		parentLabel: 'Scene',
		parentDesc: 'Which scene to reorder sub-scenes within.',
		hint: 'Drag a sub-scene by its handle, or focus a row and use the up or down arrow keys (or j/k).',
		listLabel: 'Sub-scenes in story order',
		emptyText: 'This scene has no sub-scenes yet.',
		noParentsText:
			'No scenes exist yet. Create a scene first via the command palette.',
		parents: scenes.map((s) => ({
			id: s.frontmatter['dbench-id'],
			label: s.file.basename,
		})),
		initialParentId: initialScene?.frontmatter['dbench-id'] ?? null,
		loadItems: (sceneId) => findSubScenesInScene(app, sceneId),
		applyOrder: (ordered) => reorderSubScenes(app, ordered),
	};
}

function resolveInitialScene(plugin: Plugin): SceneNote | null {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) return null;

	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;

	if (isSceneFrontmatter(fm)) {
		return { file, frontmatter: fm };
	}

	if (isSubSceneFrontmatter(fm)) {
		// Active file is a sub-scene — pre-select its parent scene.
		const parentSceneId = fm['dbench-scene-id'];
		if (typeof parentSceneId !== 'string' || parentSceneId === '') {
			return null;
		}
		const parent = findScenes(plugin.app).find(
			(s) => s.frontmatter['dbench-id'] === parentSceneId
		);
		return parent ?? null;
	}

	return null;
}
