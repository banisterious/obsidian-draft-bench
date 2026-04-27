import type { App } from 'obsidian';
import { isProjectFrontmatter } from '../../model/project';
import {
	CompileService,
	type CompileError,
	type CompileResult,
} from '../compile-service';
import {
	findNoteById,
	type CompilePresetNote,
	type ProjectNote,
} from '../discovery';
import { applyCompileState } from './apply-compile-state';
import type { StripSummary } from './strip-accumulator';
import {
	createMdDiskDeps,
	renderMdToDisk,
	renderMdToVault,
	type MdDiskDeps,
} from './render-md';
import {
	createOdtDiskDeps,
	renderOdtToDisk,
	type OdtDiskDeps,
} from './render-odt';
import {
	createPdfDiskDeps,
	renderPdfToDisk,
	type PdfDiskDeps,
} from './render-pdf';
import {
	createDocxDiskDeps,
	renderDocxToDisk,
	type DocxDiskDeps,
} from './render-docx';

/**
 * Compile dispatcher: the single entry point that bundles
 * `CompileService.generate` -> format-specific renderer -> `applyCompileState`
 * into one call. Palette commands, context-menu entries, and the
 * Compile tab's Run button all go through here.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * the preset's `dbench-compile-format` (`md` | `pdf` | `odt` | `docx`) and
 * `dbench-compile-output` (`vault` | `disk`) together pick the
 * renderer. The matrix has five reachable cells: md+vault, md+disk,
 * odt+disk, pdf+disk, docx+disk (odt, pdf, and docx are disk-only
 * per D-06, so their `output` value is ignored).
 *
 * Compile state (`dbench-last-*` fields on the preset) is written
 * only on a successful write. Cancellations preserve the previous
 * state so the Compile tab's "N scenes changed since last compile"
 * readout keeps reflecting the last real run.
 */

/**
 * Outcome of a dispatcher call. Each variant carries enough
 * information for the caller to assemble a Notice and decide
 * whether to open the written file.
 */
export type RunCompileOutcome =
	| {
			kind: 'success';
			outputPath: string;
			scenesCompiled: number;
			scenesSkipped: number;
			warnings: string[];
			errors: CompileError[];
			stripSummary: StripSummary;
	  }
	| {
			kind: 'canceled';
			warnings: string[];
			errors: CompileError[];
	  }
	| {
			kind: 'empty';
			warnings: string[];
			errors: CompileError[];
	  }
	| { kind: 'no-project'; message: string }
	| { kind: 'error'; message: string };

/**
 * Injectable dependencies. Production callers omit this; unit tests
 * substitute fakes so host-process code paths (Electron dialog, Node
 * `fs.promises`, pdfmake runtime) don't have to run.
 */
export interface RunCompileDeps {
	mdDiskDeps?: MdDiskDeps;
	odtDiskDeps?: OdtDiskDeps;
	pdfDiskDeps?: PdfDiskDeps;
	docxDiskDeps?: DocxDiskDeps;
	/** Override for the compiled-at timestamp. */
	now?: Date;
}

/**
 * Run the compile pipeline for one preset, dispatching to the
 * correct renderer and persisting state on success.
 */
export async function runCompile(
	app: App,
	preset: CompilePresetNote,
	deps?: RunCompileDeps
): Promise<RunCompileOutcome> {
	const project = resolveProject(app, preset);
	if (!project) {
		return {
			kind: 'no-project',
			message: `Preset "${preset.file.basename}" has no resolvable project; fix the preset's project link and retry.`,
		};
	}

	let result: CompileResult;
	try {
		result = await new CompileService(app).generate(preset);
	} catch (err) {
		return {
			kind: 'error',
			message: messageOf(err),
		};
	}

	// Empty markdown -> nothing to render and nothing to persist. The
	// preset's prior compile state stays valid; the caller shows the
	// CompileService warnings (e.g., "all scenes filtered out").
	if (result.scenesCompiled === 0) {
		return {
			kind: 'empty',
			warnings: result.warnings,
			errors: result.errors,
		};
	}

	let outputPath: string | null;
	try {
		outputPath = await dispatch(app, project, preset, result, deps);
	} catch (err) {
		return { kind: 'error', message: messageOf(err) };
	}

	if (outputPath === null) {
		return {
			kind: 'canceled',
			warnings: result.warnings,
			errors: result.errors,
		};
	}

	await applyCompileState(app, preset, {
		outputPath,
		chapterHashes: result.chapterHashes,
		now: deps?.now,
	});

	return {
		kind: 'success',
		outputPath,
		scenesCompiled: result.scenesCompiled,
		scenesSkipped: result.scenesSkipped,
		warnings: result.warnings,
		errors: result.errors,
		stripSummary: result.stripSummary,
	};
}

/**
 * Route to the renderer matching the preset's format + output.
 * Returns the written path on success, `null` on user-cancel. Throws
 * on renderer failure (caught by `runCompile` and wrapped in an
 * `error` outcome).
 *
 * ODT, PDF, and DOCX ignore the `output` value — per D-06 they're
 * disk-only. A preset with `format: odt` + `output: vault` still
 * lands in the disk-save branch.
 */
async function dispatch(
	app: App,
	project: ProjectNote,
	preset: CompilePresetNote,
	result: CompileResult,
	deps: RunCompileDeps | undefined
): Promise<string | null> {
	const format = preset.frontmatter['dbench-compile-format'];
	const output = preset.frontmatter['dbench-compile-output'];

	if (format === 'md') {
		if (output === 'vault') {
			const r = await renderMdToVault(app, project, preset, result);
			return r.path;
		}
		const r = await renderMdToDisk(
			preset,
			result,
			deps?.mdDiskDeps ?? createMdDiskDeps()
		);
		return r.kind === 'written' ? r.path : null;
	}

	if (format === 'odt') {
		const r = await renderOdtToDisk(
			preset,
			result,
			deps?.odtDiskDeps ?? createOdtDiskDeps()
		);
		return r.kind === 'written' ? r.path : null;
	}

	if (format === 'pdf') {
		const r = await renderPdfToDisk(
			preset,
			result,
			deps?.pdfDiskDeps ?? createPdfDiskDeps()
		);
		return r.kind === 'written' ? r.path : null;
	}

	if (format === 'docx') {
		const r = await renderDocxToDisk(
			preset,
			result,
			deps?.docxDiskDeps ?? createDocxDiskDeps()
		);
		return r.kind === 'written' ? r.path : null;
	}

	throw new Error(
		`Unsupported compile format "${format as string}" in preset "${preset.file.basename}".`
	);
}

/**
 * Resolve the preset's project via the rename-safe id companion.
 * Falls back to `null` when the project has been deleted or its
 * `dbench-id` was somehow reassigned (integrity service's job to
 * flag that; the dispatcher just reports `no-project`).
 */
function resolveProject(app: App, preset: CompilePresetNote): ProjectNote | null {
	const projectId = preset.frontmatter['dbench-project-id'];
	if (typeof projectId !== 'string' || projectId === '') return null;
	const resolved = findNoteById(app, projectId);
	if (!resolved) return null;
	if (!isProjectFrontmatter(resolved.frontmatter)) return null;
	return { file: resolved.file, frontmatter: resolved.frontmatter };
}

function messageOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
