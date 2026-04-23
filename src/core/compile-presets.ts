import type { App, TFile } from 'obsidian';
import type { CompileFormat } from '../model/compile-preset';
import { stampCompilePresetEssentials } from './essentials';
import type { CompilePresetNote, ProjectNote } from './discovery';

/**
 * Compile-preset creation and management.
 *
 * Presets are first-class vault notes (per D-06 § Preset storage format:
 * Option C); this module is the canonical place to create new preset
 * notes, duplicate existing ones, and compute target paths.
 *
 * Per the compile-as-artifact principle, presets live in the project
 * folder (folder projects) or alongside the project note (single-scene
 * projects), under a `Compile Presets/` subfolder. The plugin creates
 * the subfolder on first preset creation if absent.
 *
 * Discovery (finding all presets, finding presets of a project) lives
 * in `discovery.ts` alongside the other type-scoped finders.
 */

/**
 * Folder name (relative to the project note's folder) where new preset
 * notes are created. Hardcoded in V1; a setting can land post-V1 if
 * writers want a custom location.
 */
export const COMPILE_PRESETS_SUBFOLDER = 'Compile Presets';

/** Same character blacklist as `resolveProjectPaths`. */
const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/;

/**
 * Inputs to `createCompilePreset`.
 */
export interface CreateCompilePresetOptions {
	/** Preset name; becomes the note's filename. */
	name: string;

	/** Target project. The preset's `dbench-project` + id-companion point here. */
	project: ProjectNote;

	/**
	 * Output format stamped onto the new preset. When omitted, the
	 * preset uses the schema's default (`md`). Callers usually pass a
	 * value from the create modal's radio.
	 */
	format?: CompileFormat;
}

/**
 * Result of `resolveCompilePresetPaths`. All fields are plain strings
 * so the create modal can render the filename and full path in a
 * preview without re-running the resolver.
 */
export interface ResolvedCompilePresetPaths {
	folderPath: string;
	filePath: string;
}

/**
 * Compute the folder and file paths a new preset with the given name
 * would land at, given its target project. Pure; no filesystem side
 * effects.
 *
 * Folder rule: `<project note's parent folder>/Compile Presets/`.
 * For folder projects (the common case) this is
 * `Draft Bench/My Novel/Compile Presets/`. For single-scene projects
 * the parent folder is shared with the project note, so presets from
 * multiple single-scene projects in the same folder coexist in one
 * `Compile Presets/` subfolder — correct since each preset's frontmatter
 * identifies its project.
 *
 * @throws Error if the name is empty after trim or contains forbidden
 *   filesystem characters.
 */
export function resolveCompilePresetPaths(
	project: ProjectNote,
	name: string
): ResolvedCompilePresetPaths {
	const trimmed = name.trim();
	if (trimmed === '') {
		throw new Error('Compile preset name cannot be empty.');
	}
	if (FILENAME_FORBIDDEN_CHARS.test(trimmed)) {
		throw new Error(
			`Compile preset name contains characters not allowed in filenames: ${trimmed}`
		);
	}

	const projectParent = parentFolderOf(project.file.path);
	const folderPath =
		projectParent === ''
			? COMPILE_PRESETS_SUBFOLDER
			: `${projectParent}/${COMPILE_PRESETS_SUBFOLDER}`;
	const filePath = `${folderPath}/${trimmed}.md`;

	return { folderPath, filePath };
}

/**
 * Extract the parent folder of a vault-relative file path. Returns `''`
 * for files at the vault root. Parsed from the string rather than read
 * from `TFile.parent` so the resolver works on any path-shaped input,
 * including test mocks that don't set `parent` automatically.
 */
function parentFolderOf(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash < 0 ? '' : path.slice(0, slash);
}

/**
 * Result of a successful `createCompilePreset` call. `presetId` is
 * captured inside the `processFrontMatter` callback so callers don't
 * need to read the metadata cache (which updates asynchronously and
 * can be stale immediately after creation).
 */
export interface CreateCompilePresetResult {
	file: TFile;
	presetId: string;
}

/**
 * Create a new compile-preset note.
 *
 * Steps:
 *   1. Resolve folder + file paths via `resolveCompilePresetPaths`.
 *   2. Refuse to overwrite if the file already exists.
 *   3. Create the `Compile Presets/` subfolder if missing.
 *   4. Create the preset note (empty body).
 *   5. Stamp essentials + compile-preset defaults via `processFrontMatter` +
 *      `stampCompilePresetEssentials`; capture the generated `dbench-id`
 *      inside the callback.
 *   6. Return `{ file, presetId }` so callers can open the note.
 *
 * Does not open the note, show a notice, or register the created
 * preset with the linker's reverse arrays — those concerns belong to
 * the calling command / modal layer (the linker handles reverse-array
 * sync on vault events after creation).
 */
export async function createCompilePreset(
	app: App,
	options: CreateCompilePresetOptions
): Promise<CreateCompilePresetResult> {
	const { folderPath, filePath } = resolveCompilePresetPaths(
		options.project,
		options.name
	);

	if (app.vault.getAbstractFileByPath(filePath) !== null) {
		throw new Error(`A file already exists at ${filePath}.`);
	}

	if (folderPath !== '' && app.vault.getAbstractFileByPath(folderPath) === null) {
		await app.vault.createFolder(folderPath);
	}

	const file = await app.vault.create(filePath, '');

	let presetId = '';
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		stampCompilePresetEssentials(frontmatter, {
			basename: file.basename,
			projectWikilink: `[[${options.project.file.basename}]]`,
			projectId: options.project.frontmatter['dbench-id'],
			format: options.format,
		});
		const id = frontmatter['dbench-id'];
		if (typeof id === 'string') presetId = id;
	});

	return { file, presetId };
}

/**
 * Duplicate an existing compile-preset into a new note alongside the
 * source.
 *
 * The duplicate copies every `dbench-compile-*` field and the book-
 * output metadata, then:
 *   - Regenerates `dbench-id` (new identity).
 *   - Preserves `dbench-project` / `dbench-project-id` (same project).
 *   - Clears compile state (`dbench-last-compiled-at`,
 *     `dbench-last-output-path`, `dbench-last-chapter-hashes`) so the
 *     new preset starts from a never-compiled state.
 *
 * Filename: appends `" (copy)"` to the source basename, bumping with
 * a counter (`" (copy 2)"`, `" (copy 3)"`, ...) if a collision exists
 * at the target folder.
 */
export async function duplicateCompilePreset(
	app: App,
	preset: CompilePresetNote
): Promise<TFile> {
	const folder = parentFolderOf(preset.file.path);
	const sourceBasename = preset.file.basename;
	const targetBasename = pickDuplicateBasename(app, folder, sourceBasename);
	const targetPath = folder === ''
		? `${targetBasename}.md`
		: `${folder}/${targetBasename}.md`;

	const file = await app.vault.create(targetPath, '');

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Copy every frontmatter field from the source preset except the
		// plugin-managed identity + state fields.
		const source = preset.frontmatter as unknown as Record<string, unknown>;
		for (const [key, value] of Object.entries(source)) {
			if (key === 'dbench-id') continue; // new identity
			if (key === 'dbench-last-compiled-at') continue;
			if (key === 'dbench-last-output-path') continue;
			if (key === 'dbench-last-chapter-hashes') continue;
			// Clone arrays so the duplicate's mutations don't leak back.
			frontmatter[key] = Array.isArray(value) ? [...value] : value;
		}
		// Stamping regenerates dbench-id (since it's now missing) and
		// fills in the cleared state fields with their defaults.
		stampCompilePresetEssentials(frontmatter, {
			basename: file.basename,
			projectWikilink:
				typeof source['dbench-project'] === 'string'
					? source['dbench-project']
					: '',
			projectId:
				typeof source['dbench-project-id'] === 'string'
					? source['dbench-project-id']
					: '',
		});
	});

	return file;
}

/**
 * Pick a non-colliding basename for a duplicate, starting with
 * `<source> (copy)` and bumping with an integer suffix on collision
 * (`<source> (copy 2)`, `<source> (copy 3)`, ...).
 */
function pickDuplicateBasename(app: App, folder: string, sourceBasename: string): string {
	const base = `${sourceBasename} (copy)`;
	if (!pathExists(app, folder, `${base}.md`)) return base;

	for (let n = 2; n < 1000; n++) {
		const candidate = `${sourceBasename} (copy ${n})`;
		if (!pathExists(app, folder, `${candidate}.md`)) return candidate;
	}
	// Extremely unlikely fallback: if the writer has somehow accumulated
	// 999 duplicates, use a timestamp rather than throw.
	return `${sourceBasename} (copy ${Date.now()})`;
}

function pathExists(app: App, folder: string, filename: string): boolean {
	const full = folder === '' ? filename : `${folder}/${filename}`;
	return app.vault.getAbstractFileByPath(full) !== null;
}
