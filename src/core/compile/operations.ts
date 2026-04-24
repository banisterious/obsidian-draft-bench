import { FuzzySuggestModal, Notice, type App, type TFile } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import { isDraftFrontmatter } from '../../model/draft';
import { isProjectFrontmatter } from '../../model/project';
import { isSceneFrontmatter } from '../../model/scene';
import { duplicateCompilePreset } from '../compile-presets';
import {
	findCompilePresetsOfProject,
	findNoteById,
	type CompilePresetNote,
	type ProjectNote,
} from '../discovery';
import type { DraftBenchLinker } from '../linker';
import { runCompile, type RunCompileOutcome } from './run';
import { formatStripSummary } from './strip-accumulator';

/**
 * Shared compile operations used by the palette commands (Run compile,
 * Duplicate compile preset, Compile current project), the compile-tab
 * Run button, and the context-menu entries. Consolidates the
 * "fuzzy-pick a preset -> run -> notify" and "duplicate -> notify ->
 * open" flows so every entry point behaves identically.
 */

/**
 * Generate + dispatch + persist state for one preset, then surface a
 * user-visible Notice describing the outcome. The single entry point
 * every compile trigger funnels through.
 */
export async function compileAndNotify(
	app: App,
	preset: CompilePresetNote
): Promise<void> {
	const outcome = await runCompile(app, preset);
	notifyOutcome(preset, outcome);
}

/**
 * Translate a dispatcher outcome into a Notice. Exported for the
 * handful of call sites that want to drive `runCompile` directly and
 * only reuse the message-formatting logic (currently none; the
 * canonical entry is `compileAndNotify`).
 */
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
			const stripLine = formatStripSummary(outcome.stripSummary);
			if (stripLine) msg += `\n${stripLine}`;
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

/**
 * Pick a compile preset for the given project (fuzzy-suggest modal)
 * and run it. Short-circuits to immediate execution when the project
 * has exactly one preset, and shows a "no presets yet" notice when it
 * has none.
 */
export async function pickPresetAndCompile(
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
		await compileAndNotify(plugin.app, presets[0]);
		return;
	}
	new PresetPickerModal(
		plugin,
		presets,
		'Pick a compile preset to run...',
		(preset) => {
			void compileAndNotify(plugin.app, preset);
		}
	).open();
}

/**
 * Duplicate a compile preset (inside `linker.withSuspended(...)` so
 * the linker doesn't react to the two-file rewrite), show a success
 * notice, and open the new preset in the active leaf. Failures surface
 * as an error notice without throwing to the caller.
 */
export async function duplicateAndOpen(
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
		new Notice(`Could not duplicate "${preset.file.basename}": ${message}`);
	}
}

/**
 * Reusable preset picker. Kept exported so commands (which used to
 * each declare their own identical class) can share this one.
 */
export class PresetPickerModal extends FuzzySuggestModal<CompilePresetNote> {
	constructor(
		plugin: DraftBenchPlugin,
		private presets: CompilePresetNote[],
		placeholder: string,
		private onPick: (preset: CompilePresetNote) => void
	) {
		super(plugin.app);
		this.setPlaceholder(placeholder);
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
 * Reusable project picker for compile flows that need a project
 * before they can offer presets (Run compile / Duplicate compile
 * preset when invoked without useful active-file context).
 */
export class ProjectPickerModal extends FuzzySuggestModal<ProjectNote> {
	constructor(
		plugin: DraftBenchPlugin,
		private projects: ProjectNote[],
		placeholder: string,
		private onPick: (project: ProjectNote) => void
	) {
		super(plugin.app);
		this.setPlaceholder(placeholder);
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

function pluralize(n: number, singular: string, plural: string): string {
	return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Resolve the "owning project" for an active file. Project notes are
 * their own project; scenes and drafts follow `dbench-project-id` via
 * the rename-safe id companion. Anything else (compile preset,
 * untyped, unmanaged) returns null — callers decide whether to fall
 * back to a picker.
 *
 * Compile presets are deliberately excluded: a caller that wants to
 * act on a preset directly should type-check the frontmatter first;
 * this helper is for the "find this file's project" flow only.
 */
export function resolveProjectForActive(
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
