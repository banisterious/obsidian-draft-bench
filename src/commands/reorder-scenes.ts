import type { Plugin } from 'obsidian';
import type { DraftBenchLinker } from '../core/linker';
import {
	findNoteById,
	findProjects,
	type ProjectNote,
} from '../core/discovery';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';
import { ReorderScenesModal } from '../ui/modals/reorder-scenes-modal';

/**
 * Register the "Draft Bench: Reorder scenes" command.
 *
 * Always enabled. When the active file is a scene, the modal pre-selects
 * that scene's project. When the active file is a project note, the
 * modal pre-selects that project. Otherwise the picker starts at the
 * first available project.
 */
export function registerReorderScenesCommand(
	plugin: Plugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'reorder-scenes',
		name: 'Reorder scenes',
		callback: () => {
			const initial = resolveInitialProject(plugin);
			new ReorderScenesModal(plugin.app, linker, initial).open();
		},
	});
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
		// Fallback: pick the project by ID from the cached list (keeps
		// pre-selection behavior intact even if findNoteById returns raw).
		const project = findProjects(plugin.app).find(
			(p) => p.frontmatter['dbench-id'] === projectId
		);
		return project ?? null;
	}

	return null;
}
