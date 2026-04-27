import type { Plugin } from 'obsidian';
import type { DraftBenchLinker } from '../core/linker';
import {
	findNoteById,
	findProjects,
	type ProjectNote,
} from '../core/discovery';
import { isChapterFrontmatter } from '../model/chapter';
import { isProjectFrontmatter } from '../model/project';
import { ReorderChaptersModal } from '../ui/modals/reorder-chapters-modal';

/**
 * Register the "Draft Bench: Reorder chapters in project" command.
 *
 * Mirrors `registerReorderScenesCommand`. Always enabled. When the
 * active file is a chapter, the modal pre-selects that chapter's
 * project. When the active file is a project note, the modal
 * pre-selects that project. Otherwise the picker starts at the
 * first available project.
 */
export function registerReorderChaptersCommand(
	plugin: Plugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'reorder-chapters-in-project',
		name: 'Reorder chapters in project',
		callback: () => {
			const initial = resolveInitialProject(plugin);
			new ReorderChaptersModal(plugin.app, linker, initial).open();
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

	if (isChapterFrontmatter(fm)) {
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
