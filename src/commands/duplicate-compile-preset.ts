import { FuzzySuggestModal, Notice, type App, type TFile } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import { duplicateCompilePreset } from '../core/compile-presets';
import type { DraftBenchLinker } from '../core/linker';
import {
	findCompilePresetsOfProject,
	findNoteById,
	findProjects,
	type CompilePresetNote,
	type ProjectNote,
} from '../core/discovery';
import { isCompilePresetFrontmatter } from '../model/compile-preset';
import { isDraftFrontmatter } from '../model/draft';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';

/**
 * Register the "Draft Bench: Duplicate compile preset" palette
 * command. Picks a preset using the same file-context resolution as
 * Run compile, then invokes `duplicateCompilePreset` inside
 * `linker.withSuspended` and opens the new preset note.
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
			await duplicate(plugin, linker, { file: active, frontmatter: fm });
			return;
		}
		if (fm) {
			const project = resolveProjectFromActive(app, active, fm);
			if (project) {
				await pickPresetAndDuplicate(plugin, linker, project);
				return;
			}
		}
	}

	await pickProjectThenPresetAndDuplicate(plugin, linker);
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
		await duplicate(plugin, linker, presets[0]);
		return;
	}
	new PresetPickerModal(plugin, presets, (preset) => {
		void duplicate(plugin, linker, preset);
	}).open();
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
	new ProjectPickerModal(plugin, projects, (project) => {
		void pickPresetAndDuplicate(plugin, linker, project);
	}).open();
}

async function duplicate(
	plugin: DraftBenchPlugin,
	linker: DraftBenchLinker,
	preset: CompilePresetNote
): Promise<void> {
	try {
		const file = await linker.withSuspended(() =>
			duplicateCompilePreset(plugin.app, preset)
		);
		new Notice(`✓ Duplicated as ${file.basename}`);
		const leaf = plugin.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		new Notice(
			`Could not duplicate "${preset.file.basename}": ${message}`
		);
	}
}

class ProjectPickerModal extends FuzzySuggestModal<ProjectNote> {
	constructor(
		plugin: DraftBenchPlugin,
		private projects: ProjectNote[],
		private onPick: (project: ProjectNote) => void
	) {
		super(plugin.app);
		this.setPlaceholder('Pick a project...');
	}
	getItems(): ProjectNote[] {
		return this.projects;
	}
	getItemText(project: ProjectNote): string {
		return project.file.basename;
	}
	onChooseItem(project: ProjectNote): void {
		this.onPick(project);
	}
}

class PresetPickerModal extends FuzzySuggestModal<CompilePresetNote> {
	constructor(
		plugin: DraftBenchPlugin,
		private presets: CompilePresetNote[],
		private onPick: (preset: CompilePresetNote) => void
	) {
		super(plugin.app);
		this.setPlaceholder('Pick a compile preset to duplicate...');
	}
	getItems(): CompilePresetNote[] {
		return this.presets;
	}
	getItemText(preset: CompilePresetNote): string {
		return preset.file.basename;
	}
	onChooseItem(preset: CompilePresetNote): void {
		this.onPick(preset);
	}
}
