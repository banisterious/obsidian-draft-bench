import type { App, TFile } from 'obsidian';
import type { ProjectShape } from '../model/types';
import type { DraftBenchSettings } from '../model/settings';
import { stampProjectEssentials } from './essentials';

/**
 * Project creation: resolves the target file path from settings and
 * options, creates the folder (folder shape) and project note, stamps
 * essentials, returns the created TFile.
 *
 * Lives in `core/` rather than `commands/` so it's importable from the
 * UI modal, the command registration, and tests without UI-class
 * coupling. Modal and command-registration code wrap this with input
 * validation and Obsidian wiring.
 */

const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/;

/**
 * Inputs to `createProject`.
 */
export interface CreateProjectOptions {
	/** Project title (also used as the project note's filename). */
	title: string;

	/** Folder shape ('folder' or 'single'). */
	shape: ProjectShape;

	/**
	 * Override for the projects-folder template. Falls back to
	 * `settings.projectsFolder` when omitted. Supports the `{project}`
	 * token, replaced with `title`.
	 */
	location?: string;
}

/**
 * Result of `resolveProjectPaths`.
 */
export interface ResolvedProjectPaths {
	/** Folder that will be created (folder shape) or used (single shape). */
	folderPath: string;

	/** Full path to the project note that will be created. */
	filePath: string;
}

/**
 * Pure function: given settings + options, compute the folder and
 * file paths that `createProject` would produce. No filesystem side
 * effects; useful for previews and tests.
 *
 * Folder shape:
 *   `Draft Bench/{project}/`  +  title "My Novel"
 *   -> folderPath: "Draft Bench/My Novel"
 *      filePath:   "Draft Bench/My Novel/My Novel.md"
 *
 * Single shape (the `{project}/` segment is stripped along with the
 * trailing slash, since single-scene projects are one note in a
 * shared parent folder, not a per-project folder):
 *   `Draft Bench/{project}/`  +  title "A Brief Encounter"
 *   -> folderPath: "Draft Bench"
 *      filePath:   "Draft Bench/A Brief Encounter.md"
 *
 * @throws Error if the title is empty after trim or contains forbidden
 *   filesystem characters.
 */
export function resolveProjectPaths(
	settings: DraftBenchSettings,
	options: CreateProjectOptions
): ResolvedProjectPaths {
	const title = options.title.trim();
	if (title === '') {
		throw new Error('Project title cannot be empty.');
	}
	if (FILENAME_FORBIDDEN_CHARS.test(title)) {
		throw new Error(
			`Project title contains characters not allowed in filenames: ${title}`
		);
	}

	const template = options.location ?? settings.projectsFolder;

	let folderPath: string;
	if (options.shape === 'folder') {
		folderPath = template.replace(/\{project\}/g, title);
	} else {
		// Single shape: strip {project}/ segment (and any trailing slash).
		folderPath = template
			.replace(/\{project\}\/?/g, '')
			.replace(/\/+$/, '');
	}

	// Normalize: drop trailing slashes, collapse double slashes.
	folderPath = folderPath.replace(/\/+/g, '/').replace(/\/+$/, '');

	const filePath = folderPath === ''
		? `${title}.md`
		: `${folderPath}/${title}.md`;

	return { folderPath, filePath };
}

/**
 * Create a new Draft Bench project.
 *
 * Steps:
 *   1. Resolve folder + file paths via `resolveProjectPaths`.
 *   2. Refuse to overwrite if the file already exists.
 *   3. Create the folder (if folder path is non-empty and doesn't exist).
 *   4. Create the project note (empty).
 *   5. Stamp essentials via `processFrontMatter` + `stampProjectEssentials`.
 *   6. Return the created TFile so callers can open it.
 *
 * Does not register a command, open the file, or show notices — those
 * concerns belong to the calling command / modal layer.
 */
export async function createProject(
	app: App,
	settings: DraftBenchSettings,
	options: CreateProjectOptions
): Promise<TFile> {
	const { folderPath, filePath } = resolveProjectPaths(settings, options);

	if (app.vault.getAbstractFileByPath(filePath) !== null) {
		throw new Error(`A file already exists at ${filePath}.`);
	}

	if (folderPath !== '' && app.vault.getAbstractFileByPath(folderPath) === null) {
		await app.vault.createFolder(folderPath);
	}

	const file = await app.vault.create(filePath, '');

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		// Pre-set the shape so stampProjectEssentials' setIfMissing leaves
		// it alone. Cleaner than overriding after stamping.
		frontmatter['dbench-project-shape'] = options.shape;
		stampProjectEssentials(frontmatter, {
			basename: file.basename,
			defaultStatus: settings.statusVocabulary[0],
		});
	});

	return file;
}
