import type { Plugin } from 'obsidian';
import type { DraftBenchLinker } from '../core/linker';
import {
	findNoteById,
	findProjects,
	type ProjectNote,
} from '../core/discovery';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';
import { isDraftFrontmatter } from '../model/draft';
import { isCompilePresetFrontmatter } from '../model/compile-preset';
import { NewCompilePresetModal } from '../ui/modals/new-compile-preset-modal';

/**
 * Register the "Draft Bench: Create compile preset" command.
 *
 * Always enabled. Resolves the initial project from file context:
 * active project / scene / draft / existing preset all pre-select
 * their parent project in the modal's dropdown. Otherwise the modal
 * falls back to the first available project.
 */
export function registerCreateCompilePresetCommand(
	plugin: Plugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'create-compile-preset',
		name: 'Create compile preset',
		callback: () => {
			const initial = resolveInitialProject(plugin);
			new NewCompilePresetModal(plugin.app, linker, initial).open();
		},
	});
}

/**
 * Derive the "most relevant project" for the active file:
 * - Project note: itself.
 * - Scene / draft / compile-preset: the project their `dbench-project-id`
 *   points at.
 * - Anything else (unmanaged file, no active file): null.
 */
function resolveInitialProject(plugin: Plugin): ProjectNote | null {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) return null;

	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return null;

	if (isProjectFrontmatter(fm)) {
		return { file, frontmatter: fm };
	}

	const parentIdField =
		isSceneFrontmatter(fm) ||
		isDraftFrontmatter(fm) ||
		isCompilePresetFrontmatter(fm)
			? 'dbench-project-id'
			: null;
	if (parentIdField === null) return null;

	const projectId = (fm as Record<string, unknown>)[parentIdField];
	if (typeof projectId !== 'string' || projectId === '') return null;

	const resolved = findNoteById(plugin.app, projectId);
	if (resolved && isProjectFrontmatter(resolved.frontmatter)) {
		return { file: resolved.file, frontmatter: resolved.frontmatter };
	}
	const project = findProjects(plugin.app).find(
		(p) => p.frontmatter['dbench-id'] === projectId
	);
	return project ?? null;
}
