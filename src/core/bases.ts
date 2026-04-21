import type { App, TFile } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { BaseTemplate } from './bases-templates';

/**
 * Bases integration: generate `.base` files (YAML) into a user-
 * configurable folder, following the Charted Roots pattern documented
 * in [bases-reference.md](../../docs/planning/bases-reference.md).
 *
 * Three responsibilities live here:
 *
 *   1. Detect whether the Bases core plugin is enabled (soft gate —
 *      we still create the file either way; a notice explains the
 *      situation when Bases is absent).
 *   2. Resolve the target path from `settings.basesFolder`.
 *   3. Create the file (creating the folder if needed), skipping if
 *      one already exists at the path, and optionally opening it.
 *
 * Template contents are supplied by the caller (`bases-templates.ts`
 * holds the four V1 starter templates).
 */

/**
 * Pure helper: true iff the given internal-plugins record has `bases`
 * enabled. Exposed separately from `isBasesAvailable` so unit tests
 * can exercise the check without mocking the app-level internal API.
 */
export function isBasesEnabledInPlugins(
	plugins:
		| Readonly<Record<string, { enabled?: boolean } | undefined>>
		| null
		| undefined
): boolean {
	if (plugins === null || plugins === undefined) return false;
	return plugins.bases?.enabled === true;
}

/**
 * True iff Obsidian's Bases core plugin is currently enabled. Reads
 * `app.internalPlugins.plugins.bases.enabled` via a narrow type
 * assertion (the field is internal-but-widely-used; not in the
 * public `obsidian.d.ts`). Returns `false` if any part of the
 * access path is missing.
 *
 * Soft gate: callers should still proceed with base-file creation
 * even if this returns `false`. The `.base` format is plain YAML
 * and remains useful once Bases is enabled.
 */
export function isBasesAvailable(app: App): boolean {
	const plugins = (
		app as unknown as {
			internalPlugins?: {
				plugins?: Record<string, { enabled?: boolean } | undefined>;
			};
		}
	).internalPlugins?.plugins;
	return isBasesEnabledInPlugins(plugins);
}

/**
 * Resolve the vault-relative path for a base file. Normalizes slashes
 * on `settings.basesFolder` so `'Bases'`, `'Bases/'`, and `'/Bases/'`
 * all produce the same result. Appends `.base` if the filename
 * doesn't already include the extension.
 */
export function resolveBasePath(
	settings: DraftBenchSettings,
	filename: string
): string {
	const folder = settings.basesFolder.replace(/^\/+|\/+$/g, '');
	const base = filename.endsWith('.base') ? filename : `${filename}.base`;
	return folder === '' ? base : `${folder}/${base}`;
}

export interface CreateBaseOptions {
	/** Open the file in the active leaf after creation. Default false. */
	openAfterCreate?: boolean;
}

export type CreateBaseResult =
	| { status: 'created'; path: string; file: TFile }
	| { status: 'already-exists'; path: string };

/**
 * Write a `.base` file at `path` with the given YAML `content`.
 *
 * - If a file already exists at `path`, returns `{ status: 'already-exists' }`
 *   without overwriting. Matches the CR "no clobber" contract: writers
 *   who have customized their base keep their edits.
 * - Creates the parent folder on demand.
 * - Optionally opens the created file in the active leaf.
 */
export async function createBaseFile(
	app: App,
	path: string,
	content: string,
	options?: CreateBaseOptions
): Promise<CreateBaseResult> {
	if (app.vault.getAbstractFileByPath(path) !== null) {
		return { status: 'already-exists', path };
	}

	const folder = parentPath(path);
	if (folder !== '' && app.vault.getAbstractFileByPath(folder) === null) {
		await app.vault.createFolder(folder);
	}

	const file = await app.vault.create(path, content);

	if (options?.openAfterCreate ?? false) {
		await app.workspace.getLeaf(false).openFile(file);
	}

	return { status: 'created', path, file };
}

function parentPath(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return '';
	return filePath.slice(0, idx);
}

/**
 * Aggregate result from `installBases`: per-template outcome buckets.
 * `created` and `skipped` both list template paths; `errors` captures
 * the template path and the error message for any that threw during
 * write.
 */
export interface InstallBasesResult {
	created: string[];
	skipped: string[];
	errors: { path: string; message: string }[];
}

/**
 * Create every template in `templates` under `settings.basesFolder`.
 *
 * Per-template outcomes bucket into `created` (new file written),
 * `skipped` (a file already exists at the target path — no overwrite),
 * or `errors` (unexpected write failure). Errors don't abort; the
 * remaining templates still attempt. Callers shape the user-facing
 * notice from the aggregate result.
 */
export async function installBases(
	app: App,
	settings: DraftBenchSettings,
	templates: readonly BaseTemplate[]
): Promise<InstallBasesResult> {
	const result: InstallBasesResult = {
		created: [],
		skipped: [],
		errors: [],
	};

	for (const template of templates) {
		const path = resolveBasePath(settings, template.filename);
		try {
			const outcome = await createBaseFile(app, path, template.content);
			if (outcome.status === 'created') {
				result.created.push(outcome.path);
			} else {
				result.skipped.push(outcome.path);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			result.errors.push({ path, message });
		}
	}

	return result;
}
