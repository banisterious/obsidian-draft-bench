import { FuzzySuggestModal, Notice, type App, type TFile } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import { runCompile } from '../core/compile/run';
import {
	findCompilePresetsOfProject,
	findNoteById,
	type CompilePresetNote,
	type ProjectNote,
} from '../core/discovery';
import { isCompilePresetFrontmatter } from '../model/compile-preset';
import { isDraftFrontmatter } from '../model/draft';
import { isProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter } from '../model/scene';
import { notifyOutcome } from './run-compile';

/**
 * Register the "Draft Bench: Compile current project" palette command.
 *
 * Narrower than Run compile — requires an active file that belongs to
 * a project (project note, scene, draft, or preset). Refuses to fall
 * back to a project picker: the point of this command is "compile the
 * project this note is part of," and asking which one defeats that.
 *
 * From a preset, runs it directly (that's the natural compile choice
 * for that project). From a project / scene / draft, picks a preset
 * (skipped when the project has exactly one).
 */
export function registerCompileCurrentProjectCommand(
	plugin: DraftBenchPlugin
): void {
	plugin.addCommand({
		id: 'compile-current-project',
		name: 'Compile current project',
		callback: () => {
			void runCommand(plugin);
		},
	});
}

async function runCommand(plugin: DraftBenchPlugin): Promise<void> {
	const app = plugin.app;
	const active = app.workspace.getActiveFile();
	if (!active) {
		notifyNoContext();
		return;
	}
	const fm = app.metadataCache.getFileCache(active)?.frontmatter;
	if (!fm) {
		notifyNoContext();
		return;
	}

	if (isCompilePresetFrontmatter(fm)) {
		await execute(plugin, { file: active, frontmatter: fm });
		return;
	}

	const project = resolveProjectFromActive(app, active, fm);
	if (!project) {
		notifyNoContext();
		return;
	}
	await pickPresetAndRun(plugin, project);
}

function notifyNoContext(): void {
	new Notice(
		'Open a project, scene, draft, or compile preset to use this command.'
	);
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

async function execute(
	plugin: DraftBenchPlugin,
	preset: CompilePresetNote
): Promise<void> {
	const outcome = await runCompile(plugin.app, preset);
	notifyOutcome(preset, outcome);
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
