import type { Plugin } from 'obsidian';
import type { DraftBenchLinker } from '../core/linker';
import {
	findNoteById,
	findProjects,
	type ProjectNote,
} from '../core/discovery';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';
import { RepairProjectModal } from '../ui/modals/repair-project-modal';

/**
 * Register the "Draft Bench: Repair project links" command.
 *
 * Always enabled. When the active file is a project, the modal
 * pre-selects it. When the active file is a scene, the modal
 * pre-selects the scene's project. Otherwise falls back to the first
 * available project in the picker (matching `Reorder scenes`).
 */
export function registerRepairProjectCommand(
	plugin: Plugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'repair-project-links',
		name: 'Repair project links',
		callback: () => {
			const initial = resolveInitialProject(plugin);
			new RepairProjectModal(plugin.app, linker, initial).open();
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
			return { file: resolved.file, frontmatter: resolved.frontmatter };
		}
		const project = findProjects(plugin.app).find(
			(p) => p.frontmatter['dbench-id'] === projectId
		);
		return project ?? null;
	}

	return null;
}
