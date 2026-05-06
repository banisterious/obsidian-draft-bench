import { TFile, type App } from 'obsidian';
import type { CompilePresetNote, ProjectNote } from '../discovery';

/**
 * Shared vault-write helpers for the compile pipeline.
 *
 * Every format renderer (md / pdf / odt / docx) lands its output in the
 * preset's canonical vault location: `<project parent>/Compiled/<preset
 * basename>.<extension>`. The string and binary write paths converge
 * through `writeCompiledFile`, which handles folder creation, the
 * create-vs-modify branch, and the path-collision-with-folder error
 * case in one place. Each renderer's vault entry point delegates here
 * after producing the output content.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * `format: md` shipped vault output in V1; `format: pdf | odt | docx`
 * gained vault output via the mobile-elevation work tracked in #29.
 */

/** Outcome of a successful vault write. Shared across all formats. */
export interface RenderVaultResult {
	/** Vault-relative path the compiled output was written to. */
	path: string;
	/** `true` when an existing file was overwritten; `false` on first compile. */
	overwritten: boolean;
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

/** Create `folderPath` in the vault if it doesn't already exist. */
export async function ensureCompiledFolder(
	app: App,
	folderPath: string
): Promise<void> {
	if (app.vault.getAbstractFileByPath(folderPath) !== null) return;
	await app.vault.createFolder(folderPath);
}

/**
 * Write `content` to the preset's canonical vault location for the
 * given `extension`. Creates the `Compiled/` subfolder if missing;
 * overwrites an existing compiled file if present. Routes through
 * `app.vault.create` / `modify` for string content and
 * `app.vault.createBinary` / `modifyBinary` for binary content.
 * `Uint8Array` input is normalized to the underlying `ArrayBuffer`
 * slice so renderers can pass `buildXxxBytes` output directly.
 *
 * Returns the written path plus whether an existing file was
 * overwritten (for the compile-completion notice). Throws if the path
 * resolves to a non-file (e.g., a folder with the same name) or if the
 * underlying vault write fails.
 */
export async function writeCompiledFile(
	app: App,
	project: ProjectNote,
	preset: CompilePresetNote,
	extension: string,
	content: string | ArrayBuffer | Uint8Array
): Promise<RenderVaultResult> {
	const folder = compiledFolderFor(project);
	await ensureCompiledFolder(app, folder);

	const path = `${folder}/${preset.file.basename}.${extension}`;
	const existing = app.vault.getAbstractFileByPath(path);
	const normalized = typeof content === 'string' ? content : toArrayBuffer(content);

	if (existing === null) {
		if (typeof normalized === 'string') {
			await app.vault.create(path, normalized);
		} else {
			await app.vault.createBinary(path, normalized);
		}
		return { path, overwritten: false };
	}

	if (!(existing instanceof TFile)) {
		throw new Error(
			`Cannot write compiled output: "${path}" already exists and is not a file.`
		);
	}

	if (typeof normalized === 'string') {
		await app.vault.modify(existing, normalized);
	} else {
		await app.vault.modifyBinary(existing, normalized);
	}
	return { path, overwritten: true };
}

/**
 * Normalize a `Uint8Array` view to a freshly-sliced `ArrayBuffer`
 * containing exactly the view's bytes. Pass-through for `ArrayBuffer`
 * input. Avoids handing Obsidian a buffer that includes unrelated
 * bytes when the caller's `Uint8Array` is a partial view (common with
 * Node `Buffer` outputs from pdfmake / docx Packer / JSZip).
 */
function toArrayBuffer(content: ArrayBuffer | Uint8Array): ArrayBuffer {
	if (content instanceof Uint8Array) {
		return content.buffer.slice(
			content.byteOffset,
			content.byteOffset + content.byteLength
		) as ArrayBuffer;
	}
	return content;
}
