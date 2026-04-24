import { FuzzySuggestModal, Notice, type App, type TFile } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import { runCompile, type RunCompileOutcome } from '../core/compile/run';
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
 * Single-item short-circuits: if the resolution narrows to exactly one
 * project (or one preset under the chosen project), the picker is
 * skipped. Lets writers with one project + one preset compile with a
 * single palette invocation.
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
			await execute(plugin, { file: active, frontmatter: fm });
			return;
		}
		if (fm) {
			const project = resolveProjectFromActive(app, active, fm);
			if (project) {
				await pickPresetAndRun(plugin, project);
				return;
			}
		}
	}

	await pickProjectThenPresetAndRun(plugin);
}

/**
 * Derive the "owning project" for an active file that isn't itself a
 * preset. Project notes are their own project; scenes and drafts
 * follow `dbench-project-id` via the rename-safe id companion.
 * Anything else (unmanaged markdown, untyped note) returns null.
 */
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

async function pickPresetAndRun(
	plugin: DraftBenchPlugin,
	project: ProjectNote
): Promise<void> {
	const presets = findCompilePresetsOfProject(
		plugin.app,
		project.frontmatter['dbench-id']
	);
	if (presets.length === 0) {
		new Notice(
			`"${project.file.basename}" has no compile presets. Create one with "Create compile preset".`
		);
		return;
	}
	if (presets.length === 1) {
		await execute(plugin, presets[0]);
		return;
	}
	new PresetPickerModal(plugin, presets, (preset) => {
		void execute(plugin, preset);
	}).open();
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
		await pickPresetAndRun(plugin, projects[0]);
		return;
	}
	new ProjectPickerModal(plugin, projects, (project) => {
		void pickPresetAndRun(plugin, project);
	}).open();
}

class ProjectPickerModal extends FuzzySuggestModal<ProjectNote> {
	constructor(
		plugin: DraftBenchPlugin,
		private projects: ProjectNote[],
		private onPick: (project: ProjectNote) => void
	) {
		super(plugin.app);
		this.setPlaceholder('Pick a project to compile...');
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
		this.setPlaceholder('Pick a compile preset to run...');
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

/**
 * Run the dispatcher and translate its outcome into a user-visible
 * Notice. Default deps (real Electron save dialog, Node fs, real
 * pdfmake) — the command layer is the place where the real host
 * integrations come in.
 */
async function execute(
	plugin: DraftBenchPlugin,
	preset: CompilePresetNote
): Promise<void> {
	const outcome = await runCompile(plugin.app, preset);
	notifyOutcome(preset, outcome);
}

export function notifyOutcome(
	preset: CompilePresetNote,
	outcome: RunCompileOutcome
): void {
	switch (outcome.kind) {
		case 'success': {
			const scenes = pluralize(outcome.scenesCompiled, 'scene', 'scenes');
			let msg = `✓ Compiled ${scenes} to ${outcome.outputPath}`;
			if (outcome.scenesSkipped > 0) {
				msg += ` (${outcome.scenesSkipped} skipped)`;
			}
			new Notice(msg);
			return;
		}
		case 'canceled':
			new Notice('Compile canceled.');
			return;
		case 'empty': {
			const first = outcome.warnings[0];
			new Notice(
				first ?? `Preset "${preset.file.basename}" has no scenes to compile.`
			);
			return;
		}
		case 'no-project':
			new Notice(outcome.message);
			return;
		case 'error':
			new Notice(
				`Could not compile "${preset.file.basename}": ${outcome.message}`
			);
			return;
	}
}

function pluralize(n: number, singular: string, plural: string): string {
	return `${n} ${n === 1 ? singular : plural}`;
}
