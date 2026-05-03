import { type App, type Plugin } from 'obsidian';
import type { DraftBenchLinker } from '../core/linker';
import {
	findChaptersInProject,
	findNoteById,
	findProjects,
	type ChapterNote,
	type ProjectNote,
} from '../core/discovery';
import { isChapterFrontmatter } from '../model/chapter';
import { isProjectFrontmatter } from '../model/project';
import { reorderChapters } from '../core/reorder';
import {
	ReorderChildrenModal,
	type ReorderModalConfig,
} from '../ui/modals/reorder-children-modal';

/**
 * Register the "Draft Bench: Reorder chapters in project" command.
 *
 * Mirrors `registerReorderScenesCommand`. Always enabled. When the
 * active file is a chapter, the modal pre-selects that chapter's
 * project. When the active file is a project note, the modal
 * pre-selects that project. Otherwise the picker starts at the first
 * available project.
 *
 * Now opens the generic `ReorderChildrenModal` per
 * [sub-scene-type.md § 8](../../docs/planning/sub-scene-type.md);
 * the chapter-specific configuration is built here at the command site.
 */
export function registerReorderChaptersCommand(
	plugin: Plugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'reorder-chapters-in-project',
		name: 'Reorder chapters in project',
		callback: () => {
			const config = buildChapterReorderConfig(
				plugin.app,
				resolveInitialProject(plugin)
			);
			new ReorderChildrenModal(plugin.app, linker, config).open();
		},
	});
}

export function buildChapterReorderConfig(
	app: App,
	initialProject: ProjectNote | null
): ReorderModalConfig<ChapterNote> {
	const projects = findProjects(app);
	return {
		title: 'Reorder chapters',
		itemLabel: 'chapter',
		itemLabelPlural: 'chapters',
		parentLabel: 'Project',
		parentDesc: 'Which project to reorder.',
		hint: 'Drag a chapter by its handle, or focus a row and use the up or down arrow keys (or j/k).',
		listLabel: 'Chapters in story order',
		emptyText: 'This project has no chapters yet.',
		noParentsText:
			'No projects exist yet. Create a project first via the command palette.',
		parents: projects.map((p) => ({
			id: p.frontmatter['dbench-id'],
			label: p.file.basename,
		})),
		initialParentId: initialProject?.frontmatter['dbench-id'] ?? null,
		loadItems: (projectId) => findChaptersInProject(app, projectId),
		applyOrder: (ordered) => reorderChapters(app, ordered),
	};
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
