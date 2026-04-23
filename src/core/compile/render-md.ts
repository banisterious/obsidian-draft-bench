import { TFile, type App } from 'obsidian';
import type { CompilePresetNote, ProjectNote } from '../discovery';
import type { CompileResult } from '../compile-service';

/**
 * Markdown output renderer for the compile pipeline.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md):
 *
 * - `format: md` + `output: vault` -> `renderMdToVault` writes to
 *   `<project folder>/Compiled/<preset name>.md` inside the vault.
 *   First compile creates the `Compiled/` subfolder; subsequent
 *   compiles overwrite silently so the preset's output stays at a
 *   stable vault path (writers use git / vault snapshots to track
 *   per-compile diffs).
 * - `format: md` + `output: disk` -> `renderMdToDisk` prompts with
 *   the OS save dialog and writes outside the vault. Pure logic takes
 *   injected `pickPath` / `writeFile` dependencies so tests stay free
 *   of Electron; `createMdDiskDeps` wires the runtime implementations.
 */

/** Outcome of a successful MD write. */
export interface RenderMdVaultResult {
	/** Vault-relative path the compiled markdown was written to. */
	path: string;
	/** `true` when an existing file was overwritten; `false` on first compile. */
	overwritten: boolean;
}

/**
 * Write `result.markdown` to the preset's canonical vault location.
 * Creates the `Compiled/` subfolder if missing; overwrites an
 * existing compiled file if present.
 *
 * Returns the written path plus whether an existing file was
 * overwritten (for the compile-completion notice). Throws if the
 * path resolves to a non-file (e.g., a folder with the same name)
 * or if the write fails.
 */
export async function renderMdToVault(
	app: App,
	project: ProjectNote,
	preset: CompilePresetNote,
	result: CompileResult
): Promise<RenderMdVaultResult> {
	const folder = compiledFolderFor(project);
	await ensureFolder(app, folder);

	const path = `${folder}/${preset.file.basename}.md`;
	const existing = app.vault.getAbstractFileByPath(path);

	if (existing === null) {
		await app.vault.create(path, result.markdown);
		return { path, overwritten: false };
	}

	if (!(existing instanceof TFile)) {
		throw new Error(
			`Cannot write compiled output: "${path}" already exists and is not a file.`
		);
	}

	await app.vault.modify(existing, result.markdown);
	return { path, overwritten: true };
}

/**
 * Resolve `<project folder>/Compiled` for either project shape.
 *
 * For folder projects, `parent` is the project folder itself
 * (`Draft Bench/My Novel` -> `Draft Bench/My Novel/Compiled`). For
 * single-scene projects, `parent` is whichever folder holds the
 * project note (`Short Stories/Flash.md` -> `Short Stories/Compiled`).
 * Project notes at the vault root map to `Compiled` at the root.
 *
 * Parsed from `project.file.path` rather than read from
 * `TFile.parent` so the helper works against test fixtures that
 * don't populate `parent` automatically.
 */
export function compiledFolderFor(project: ProjectNote): string {
	const path = project.file.path;
	const slash = path.lastIndexOf('/');
	const parent = slash < 0 ? '' : path.slice(0, slash);
	return parent.length === 0 ? 'Compiled' : `${parent}/Compiled`;
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	if (app.vault.getAbstractFileByPath(folderPath) !== null) return;
	await app.vault.createFolder(folderPath);
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

// Host-process accessors. Obsidian desktop exposes both via
// `window.require`; both return `null` in any environment where the
// accessor isn't available (tests, mobile, some embed contexts).

interface ElectronDialog {
	showSaveDialog(options: {
		defaultPath?: string;
		filters?: Array<{ name: string; extensions: string[] }>;
	}): Promise<{ canceled: boolean; filePath?: string }>;
}

interface ElectronModule {
	remote?: { dialog?: ElectronDialog };
	dialog?: ElectronDialog;
}

interface NodeFsModule {
	promises: {
		writeFile(
			path: string,
			content: string,
			encoding: 'utf8'
		): Promise<void>;
	};
}

function getElectron(): ElectronModule | null {
	const req = (window as unknown as { require?: (m: string) => unknown })
		.require;
	if (typeof req !== 'function') return null;
	try {
		return req('electron') as ElectronModule;
	} catch {
		return null;
	}
}

function getNodeFs(): NodeFsModule | null {
	const req = (window as unknown as { require?: (m: string) => unknown })
		.require;
	if (typeof req !== 'function') return null;
	try {
		return req('fs') as NodeFsModule;
	} catch {
		return null;
	}
}
