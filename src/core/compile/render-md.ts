import type { App } from 'obsidian';
import type { CompilePresetNote, ProjectNote } from '../discovery';
import type { CompileResult } from '../compile-service';
import { getElectron, getNodeFs } from './disk-deps';
import { type RenderVaultResult, writeCompiledFile } from './vault-output';

/**
 * Markdown output renderer for the compile pipeline.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md):
 *
 * - `format: md` + `output: vault` -> `renderMdToVault` writes to
 *   `<project folder>/Compiled/<preset name>.md` inside the vault via
 *   the shared `writeCompiledFile` helper. First compile creates the
 *   `Compiled/` subfolder; subsequent compiles overwrite silently so
 *   the preset's output stays at a stable vault path (writers use git
 *   / vault snapshots to track per-compile diffs).
 * - `format: md` + `output: disk` -> `renderMdToDisk` prompts with
 *   the OS save dialog and writes outside the vault. Pure logic takes
 *   injected `pickPath` / `writeFile` dependencies so tests stay free
 *   of Electron; `createMdDiskDeps` wires the runtime implementations.
 */

/**
 * Write `result.markdown` to the preset's canonical vault location.
 * Thin orchestrator over `writeCompiledFile`; the shared helper owns
 * folder creation, the create-vs-modify branch, and the
 * path-collision-with-folder error case.
 */
export async function renderMdToVault(
	app: App,
	project: ProjectNote,
	preset: CompilePresetNote,
	result: CompileResult
): Promise<RenderVaultResult> {
	return await writeCompiledFile(app, project, preset, 'md', result.markdown);
}

// ---- Disk-save path --------------------------------------------------

/**
 * Dependencies the disk-save path reads from. Split out as an
 * interface so unit tests can inject fakes instead of the real
 * Electron dialog + Node `fs` shims.
 */
export interface MdDiskDeps {
	/**
	 * Prompt the user for a save-to path. Return `null` when the user
	 * cancels. `defaultName` is a sensible filename suggestion (the
	 * preset's basename with a `.md` extension).
	 */
	pickPath(options: { defaultName: string }): Promise<string | null>;
	/** Write `content` to `absolutePath` on the OS filesystem. */
	writeFile(absolutePath: string, content: string): Promise<void>;
}

/** Outcome of `renderMdToDisk`. */
export type RenderMdDiskResult =
	| { kind: 'written'; path: string }
	| { kind: 'canceled' };

/**
 * Prompt the user for a save location and write `result.markdown`
 * there. Returns `{ kind: 'canceled' }` if the user dismisses the
 * dialog; otherwise writes and returns the chosen path.
 *
 * Pure-logic function over injected `deps`. See `createMdDiskDeps`
 * for the runtime wiring.
 */
export async function renderMdToDisk(
	preset: CompilePresetNote,
	result: CompileResult,
	deps: MdDiskDeps
): Promise<RenderMdDiskResult> {
	const chosen = await deps.pickPath({
		defaultName: `${preset.file.basename}.md`,
	});
	if (chosen === null) return { kind: 'canceled' };
	await deps.writeFile(chosen, result.markdown);
	return { kind: 'written', path: chosen };
}

/**
 * Runtime wiring for `MdDiskDeps`: Electron's save dialog and Node
 * `fs.promises.writeFile`. Lives in this module rather than a
 * shared helper so the MD renderer stays self-contained; the PDF
 * and ODT renderers will get their own factories following the same
 * shape, and a shared disk-write module can come later if the
 * duplication warrants it.
 *
 * Not unit-tested — every branch depends on host-process APIs that
 * are awkward to fake in Vitest. Covered by manual dev-vault
 * walkthroughs.
 */
export function createMdDiskDeps(): MdDiskDeps {
	return {
		async pickPath({ defaultName }) {
			const electron = getElectron();
			const dialog = electron?.remote?.dialog ?? electron?.dialog;
			if (!dialog) {
				throw new Error(
					'Save dialog unavailable: Electron remote.dialog is not accessible from this runtime.'
				);
			}
			const response = await dialog.showSaveDialog({
				defaultPath: defaultName,
				filters: [{ name: 'Markdown', extensions: ['md'] }],
			});
			if (response.canceled || !response.filePath) return null;
			return response.filePath;
		},
		async writeFile(absolutePath, content) {
			const fs = getNodeFs();
			if (!fs) {
				throw new Error(
					'Disk write unavailable: Node fs module is not accessible from this runtime.'
				);
			}
			await fs.promises.writeFile(absolutePath, content, 'utf8');
		},
	};
}

