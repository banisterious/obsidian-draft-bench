import { type App, type Plugin } from 'obsidian';
import type { DraftBenchLinker } from '../core/linker';
import {
	findNoteById,
	findProjects,
	findScenesInProject,
	type ProjectNote,
	type SceneNote,
} from '../core/discovery';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';
import { reorderScenes } from '../core/reorder';
import {
	ReorderChildrenModal,
	type ReorderModalConfig,
} from '../ui/modals/reorder-children-modal';

/**
 * Register the "Draft Bench: Reorder scenes" command.
 *
 * Always enabled. When the active file is a scene, the modal pre-selects
 * that scene's project. When the active file is a project note, the
 * modal pre-selects that project. Otherwise the picker starts at the
 * first available project.
 *
 * Now opens the generic `ReorderChildrenModal` per
 * [sub-scene-type.md § 8](../../docs/planning/sub-scene-type.md);
 * the scene-specific configuration is built here at the command site.
 */
export function registerReorderScenesCommand(
	plugin: Plugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'reorder-scenes',
		name: 'Reorder scenes',
		callback: () => {
			const config = buildSceneReorderConfig(
				plugin.app,
				resolveInitialProject(plugin)
			);
			new ReorderChildrenModal(plugin.app, linker, config).open();
		},
	});
}

export function buildSceneReorderConfig(
	app: App,
	initialProject: ProjectNote | null
): ReorderModalConfig<SceneNote> {
	const projects = findProjects(app);
	return {
		title: 'Reorder scenes',
		itemLabel: 'scene',
		itemLabelPlural: 'scenes',
		parentLabel: 'Project',
		parentDesc: 'Which project to reorder.',
		hint: 'Drag a scene by its handle, or focus a row and use the up or down arrow keys (or j/k).',
		listLabel: 'Scenes in story order',
		emptyText: 'This project has no scenes yet.',
		noParentsText:
			'No projects exist yet. Create a project first via the command palette.',
		parents: projects.map((p) => ({
			id: p.frontmatter['dbench-id'],
			label: p.file.basename,
		})),
		initialParentId: initialProject?.frontmatter['dbench-id'] ?? null,
		loadItems: (projectId) => findScenesInProject(app, projectId),
		applyOrder: (ordered) => reorderScenes(app, ordered),
	};
}

function resolveInitialProject(plugin: Plugin): ProjectNote | null {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) return null;

	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;

	if (isProjectFrontmatter(fm)) {
		return { file, frontmatter: fm };
	}

	if (isSceneFrontmatter(fm)) {
		const projectId = fm['dbench-project-id'];
		if (projectId === '') return null;
		const resolved = findNoteById(plugin.app, projectId);
		if (resolved && isProjectFrontmatter(resolved.frontmatter)) {
			return {
				file: resolved.file,
				frontmatter: resolved.frontmatter,
			};
		}
		const project = findProjects(plugin.app).find(
			(p) => p.frontmatter['dbench-id'] === projectId
		);
		return project ?? null;
	}

	return null;
}
