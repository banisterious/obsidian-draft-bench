import { Notice } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import {
	duplicateAndOpen,
	PresetPickerModal,
	ProjectPickerModal,
	resolveProjectForActive,
} from '../core/compile/operations';
import type { DraftBenchLinker } from '../core/linker';
import {
	findCompilePresetsOfProject,
	findProjects,
	type ProjectNote,
} from '../core/discovery';
import { isCompilePresetFrontmatter } from '../model/compile-preset';

/**
 * Register the "Draft Bench: Duplicate compile preset" palette
 * command. Same file-context resolution as Run compile; once a preset
 * is picked, runs `duplicateAndOpen` from
 * `src/core/compile/operations.ts` which handles linker-suspension,
 * notice, and opening the duplicate.
 */
export function registerDuplicateCompilePresetCommand(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker
): void {
	plugin.addCommand({
		id: 'duplicate-compile-preset',
		name: 'Duplicate compile preset',
		callback: () => {
			void runCommand(plugin, linker);
		},
	});
}

async function runCommand(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker
): Promise<void> {
	const app = plugin.app;
	const active = app.workspace.getActiveFile();

	if (active) {
		const fm = app.metadataCache.getFileCache(active)?.frontmatter;
		if (fm && isCompilePresetFrontmatter(fm)) {
			await duplicateAndOpen(plugin, linker, {
				file: active,
				frontmatter: fm,
			});
			return;
		}
		if (fm) {
			const project = resolveProjectForActive(app, active, fm);
			if (project) {
				await pickPresetAndDuplicate(plugin, linker, project);
				return;
			}
		}
	}

	await pickProjectThenPresetAndDuplicate(plugin, linker);
}

async function pickPresetAndDuplicate(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	project: ProjectNote
): Promise<void> {
	const presets = findCompilePresetsOfProject(
		plugin.app,
		project.frontmatter['dbench-id']
	);
	if (presets.length === 0) {
		new Notice(
			`"${project.file.basename}" has no compile presets to duplicate.`
		);
		return;
	}
	if (presets.length === 1) {
		await duplicateAndOpen(plugin, linker, presets[0]);
		return;
	}
	new PresetPickerModal(
		plugin,
		presets,
		'Pick a compile preset to duplicate...',
		(preset) => {
			void duplicateAndOpen(plugin, linker, preset);
		}
	).open();
}

async function pickProjectThenPresetAndDuplicate(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker
): Promise<void> {
	const projects = findProjects(plugin.app);
	if (projects.length === 0) {
		new Notice('No projects yet. Create a project first.');
		return;
	}
	if (projects.length === 1) {
		await pickPresetAndDuplicate(plugin, linker, projects[0]);
		return;
	}
	new ProjectPickerModal(
		plugin,
		projects,
		'Pick a project...',
		(project) => {
			void pickPresetAndDuplicate(plugin, linker, project);
		}
	).open();
}
