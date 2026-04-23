import { TFile, type App } from 'obsidian';
import type { CompilePresetNote, ProjectNote } from '../discovery';
import type { CompileResult } from '../compile-service';

/**
 * Markdown output renderer for the compile pipeline.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * `format: md` + `output: vault` writes to
 * `<project folder>/Compiled/<preset name>.md` in the writer's vault.
 * First compile creates the `Compiled/` subfolder; subsequent
 * compiles overwrite silently so the preset's file location stays
 * stable across runs (git / version-history is the recommended way
 * to track per-compile diffs).
 *
 * The disk-save path (`output: disk`) lands in a follow-up commit —
 * it needs Electron dialog plumbing that's awkward to unit-test and
 * deserves its own diff.
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
