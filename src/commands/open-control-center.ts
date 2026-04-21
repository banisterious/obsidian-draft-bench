import type { Plugin } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftBenchLinker } from '../core/linker';
import {
	findNoteById,
	findProjects,
	type ProjectNote,
} from '../core/discovery';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';
import { ControlCenterModal } from '../ui/control-center/control-center-modal';

/**
 * Register the "Draft Bench: Open Control Center" command.
 *
 * Always enabled. Pre-selects the active file's project when the file
 * is a project or a scene; otherwise opens on the first discovered
 * project (or an empty-vault state if none exist).
 */
export function registerOpenControlCenterCommand(
	plugin: Plugin,
	getPlugin: () => DraftBenchPlugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'open-control-center',
		name: 'Open control center',
		callback: () => {
			const initial = resolveInitialProject(plugin);
			new ControlCenterModal(
				plugin.app,
				getPlugin(),
				linker,
				initial
			).open();
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
