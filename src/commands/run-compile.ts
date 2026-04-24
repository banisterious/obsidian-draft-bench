import { Notice, type App, type TFile } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import {
	compileAndNotify,
	pickPresetAndCompile,
	ProjectPickerModal,
} from '../core/compile/operations';
import {
	findNoteById,
	findProjects,
	type ProjectNote,
} from '../core/discovery';
import { isCompilePresetFrontmatter } from '../model/compile-preset';
import { isDraftFrontmatter } from '../model/draft';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';

/**
 * Register the "Draft Bench: Run compile" palette command.
 *
 * Smart file-context resolution (per D-06 § UI surfaces):
 *
 * - Active file is a compile-preset -> run it directly.
 * - Active file is a project -> pick one of its presets, then run.
 * - Active file is a scene or draft -> resolve to its parent project,
 *   pick one of that project's presets, then run.
 * - No usable context -> pick a project, then a preset, then run.
 *
 * Pickers + compile + notify logic live in
 * `src/core/compile/operations.ts`; this file is just the command
 * registration + context resolution.
 */
export function registerRunCompileCommand(plugin: DraftBenchPlugin): void {
	plugin.addCommand({
		id: 'run-compile',
		name: 'Run compile',
		callback: () => {
			void runCommand(plugin);
		},
	});
}

async function runCommand(plugin: DraftBenchPlugin): Promise<void> {
	const app = plugin.app;
	const active = app.workspace.getActiveFile();

	if (active) {
		const fm = app.metadataCache.getFileCache(active)?.frontmatter;
		if (fm && isCompilePresetFrontmatter(fm)) {
			await compileAndNotify(app, { file: active, frontmatter: fm });
			return;
		}
		if (fm) {
			const project = resolveProjectFromActive(app, active, fm);
			if (project) {
				await pickPresetAndCompile(plugin, project);
				return;
			}
		}
	}

	await pickProjectThenPresetAndRun(plugin);
}

function resolveProjectFromActive(
	app: App,
	file: TFile,
	fm: Record<string, unknown>
): ProjectNote | null {
	if (isProjectFrontmatter(fm)) {
		return { file, frontmatter: fm };
	}
	if (!isSceneFrontmatter(fm) && !isDraftFrontmatter(fm)) return null;

	const id = fm['dbench-project-id'];
	if (typeof id !== 'string' || id === '') return null;

	const resolved = findNoteById(app, id);
	if (!resolved) return null;
	if (!isProjectFrontmatter(resolved.frontmatter)) return null;
	return { file: resolved.file, frontmatter: resolved.frontmatter };
}

async function pickProjectThenPresetAndRun(
	plugin: DraftBenchPlugin
): Promise<void> {
	const projects = findProjects(plugin.app);
	if (projects.length === 0) {
		new Notice('No projects yet. Create a project first.');
		return;
	}
	if (projects.length === 1) {
		await pickPresetAndCompile(plugin, projects[0]);
		return;
	}
	new ProjectPickerModal(
		plugin,
		projects,
		'Pick a project to compile...',
		(project) => {
			void pickPresetAndCompile(plugin, project);
		}
	).open();
}
