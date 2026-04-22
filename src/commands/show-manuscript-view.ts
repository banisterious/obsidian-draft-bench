import type { Plugin } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import {
	findNoteById,
	findProjects,
	type ProjectNote,
} from '../core/discovery';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';
import { activateManuscriptView } from '../ui/manuscript-view/activate';

/**
 * Register `Draft Bench: Show manuscript view`.
 *
 * Opens / reveals the Manuscript leaf. When the active file is a
 * plugin-managed project or scene, the leaf's selection is set to
 * that project so the writer lands on the right manuscript without
 * re-picking from the dropdown.
 *
 * Falls through cleanly when no active file or no resolvable project
 * — the leaf renders its empty state in that case.
 */
export function registerShowManuscriptViewCommand(
	plugin: Plugin,
	getPlugin: () => DraftBenchPlugin
): void {
	plugin.addCommand({
		id: 'show-manuscript-view',
		name: 'Show manuscript view',
		callback: () => {
			void (async () => {
				const db = getPlugin();
				const initial = resolveInitialProject(plugin);
				if (initial) {
					db.selection.set(initial.frontmatter['dbench-id']);
				}
				await activateManuscriptView(plugin.app);
			})();
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
