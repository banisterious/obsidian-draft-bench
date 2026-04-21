import { TFile, type App, type TFolder } from 'obsidian';
import {
	stampDbenchId,
	stampDraftEssentials,
	stampProjectEssentials,
	stampSceneEssentials,
} from './essentials';
import { findProjects, findScenesInProject, type ProjectNote } from './discovery';

/**
 * Property-retrofit actions: bring existing notes under plugin management
 * by stamping missing frontmatter idempotently.
 *
 * Per spec § Applying Draft Bench properties to existing notes and D-05:
 *
 * - Never overwrites existing values.
 * - Empty strings / arrays for unresolvable references (writer fills in
 *   via the Properties panel or, in Phase 2, a picker modal).
 * - "Set as X" refuses (returns `skipped`) when the note already has a
 *   `dbench-type` set — the smart-menu layer hides the action in that
 *   case, but the palette still dispatches here and needs the refusal
 *   path.
 * - Single-file, multi-file, and folder scopes all share these helpers;
 *   batch callers aggregate results via `applyToFiles`.
 */

const REQUIRED_KEYS_BY_TYPE: Record<string, readonly string[]> = {
	project: [
		'dbench-id',
		'dbench-project',
		'dbench-project-id',
		'dbench-project-shape',
		'dbench-status',
		'dbench-scenes',
		'dbench-scene-ids',
	],
	scene: [
		'dbench-id',
		'dbench-project',
		'dbench-project-id',
		'dbench-order',
		'dbench-status',
		'dbench-drafts',
		'dbench-draft-ids',
	],
	draft: [
		'dbench-id',
		'dbench-project',
		'dbench-scene',
		'dbench-scene-id',
		'dbench-draft-number',
	],
};

export type RetrofitOutcome = 'updated' | 'skipped' | 'error';

/** Result of a single-file retrofit action. */
export interface RetrofitResult {
	outcome: RetrofitOutcome;
	file: TFile;
	/** Human-readable reason for `skipped` / `error` outcomes. */
	reason?: string;
}

/** Aggregate of per-file outcomes for a batch run. */
export interface BatchResult {
	updated: number;
	skipped: number;
	errors: number;
}

/**
 * Read `dbench-type` from the metadata cache. Returns null if absent
 * or not a string. Used by smart-menu visibility checks and by
 * "Set as X" / "Complete essentials" dispatch logic.
 */
export function readDbenchType(app: App, file: TFile): string | null {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm || typeof fm !== 'object') return null;
	const t = (fm as Record<string, unknown>)['dbench-type'];
	return typeof t === 'string' ? t : null;
}

/**
 * Return the list of required keys for `type` that are currently
 * absent from `frontmatter`. A key is "absent" when its value is
 * undefined or null (matches the setIfMissing convention in
 * `core/essentials`). Empty strings, zeros, and empty arrays count
 * as present.
 */
export function listMissingKeys(
	frontmatter: Record<string, unknown>,
	type: string
): string[] {
	const keys = REQUIRED_KEYS_BY_TYPE[type];
	if (!keys) return [];
	return keys.filter((k) => {
		const v = frontmatter[k];
		return v === undefined || v === null;
	});
}

/** Convenience: whether a note has `dbench-type` set but is missing other essentials. */
export function hasMissingEssentials(app: App, file: TFile): boolean {
	const type = readDbenchType(app, file);
	if (type === null) return false;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	return listMissingKeys(fm as Record<string, unknown>, type).length > 0;
}

/** Convenience: whether a typed note is missing only its `dbench-id`. */
export function hasMissingId(app: App, file: TFile): boolean {
	if (readDbenchType(app, file) === null) return false;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const id = (fm as Record<string, unknown>)['dbench-id'];
	return typeof id !== 'string' || id === '';
}

/**
 * Stamp project essentials on an untyped note. Returns `updated` on
 * success, `skipped` when the note is already typed (with the existing
 * type named in the reason), or `error` on write failure.
 */
export async function setAsProject(
	app: App,
	file: TFile
): Promise<RetrofitResult> {
	const existing = readDbenchType(app, file);
	if (existing !== null) {
		return { outcome: 'skipped', file, reason: `Already a ${existing}` };
	}
	try {
		await app.fileManager.processFrontMatter(file, (fm) => {
			stampProjectEssentials(fm, { basename: file.basename });
		});
		return { outcome: 'updated', file };
	} catch (err) {
		return {
			outcome: 'error',
			file,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Stamp scene essentials on an untyped note. See `setAsProject` for
 * return semantics.
 *
 * When the file's immediate parent folder contains exactly one
 * project note, `dbench-project`, `dbench-project-id`, and
 * `dbench-order` are pre-populated from that project (order is
 * `max(existing order) + 1`). Any ambiguity (zero or multiple
 * project notes in the folder) falls back to the empty-placeholder
 * behavior.
 */
export async function setAsScene(
	app: App,
	file: TFile
): Promise<RetrofitResult> {
	const existing = readDbenchType(app, file);
	if (existing !== null) {
		return { outcome: 'skipped', file, reason: `Already a ${existing}` };
	}
	try {
		const inferred = inferProjectForScene(app, file);
		await app.fileManager.processFrontMatter(file, (fm) => {
			if (inferred) {
				fm['dbench-project'] = `[[${inferred.file.basename}]]`;
				fm['dbench-project-id'] = inferred.frontmatter['dbench-id'];
				fm['dbench-order'] = nextSceneOrderForProject(
					app,
					inferred.frontmatter['dbench-id']
				);
			}
			stampSceneEssentials(fm, { basename: file.basename });
		});
		return { outcome: 'updated', file };
	} catch (err) {
		return {
			outcome: 'error',
			file,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Stamp draft essentials on an untyped note. The draft number is
 * inferred from the filename (`... Draft N ...`); falls back to `1`.
 *
 * When an ancestor folder contains exactly one project note,
 * `dbench-project` and `dbench-project-id` are pre-populated from
 * that project (walk-up handles the common `<project>/Drafts/<file>.md`
 * layout). `dbench-project-id` is always set — to `''` when inference
 * fails — so drafts have a consistent frontmatter shape.
 */
export async function setAsDraft(
	app: App,
	file: TFile
): Promise<RetrofitResult> {
	const existing = readDbenchType(app, file);
	if (existing !== null) {
		return { outcome: 'skipped', file, reason: `Already a ${existing}` };
	}
	try {
		const inferred = inferProjectForDraft(app, file);
		await app.fileManager.processFrontMatter(file, (fm) => {
			if (inferred) {
				fm['dbench-project'] = `[[${inferred.file.basename}]]`;
				fm['dbench-project-id'] = inferred.frontmatter['dbench-id'];
			} else if (
				fm['dbench-project-id'] === undefined ||
				fm['dbench-project-id'] === null
			) {
				fm['dbench-project-id'] = '';
			}
			if (
				fm['dbench-draft-number'] === undefined ||
				fm['dbench-draft-number'] === null
			) {
				fm['dbench-draft-number'] = inferDraftNumber(file.basename);
			}
			stampDraftEssentials(fm, { basename: file.basename });
		});
		return { outcome: 'updated', file };
	} catch (err) {
		return {
			outcome: 'error',
			file,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Fill in missing essentials on an already-typed note. Dispatches to
 * the stamper matching the existing `dbench-type`. Returns `skipped`
 * when the note is untyped or when nothing would change.
 *
 * For scenes and drafts, folder inference runs first: if the note's
 * location lets us resolve a parent project, empty `dbench-project`,
 * empty `dbench-project-id`, and (for scenes) a placeholder
 * `dbench-order` of 9999 are upgraded to real values. Non-empty
 * existing values are never overwritten.
 */
export async function completeEssentials(
	app: App,
	file: TFile
): Promise<RetrofitResult> {
	const type = readDbenchType(app, file);
	if (type === null) {
		return {
			outcome: 'skipped',
			file,
			reason: 'Note has no dbench-type',
		};
	}
	const cached = (app.metadataCache.getFileCache(file)?.frontmatter ??
		{}) as Record<string, unknown>;
	const missing = listMissingKeys(cached, type);

	const inferred =
		type === 'scene'
			? inferProjectForScene(app, file)
			: type === 'draft'
				? inferProjectForDraft(app, file)
				: null;
	const wouldUpgrade =
		inferred !== null &&
		(isEmpty(cached['dbench-project']) ||
			isEmpty(cached['dbench-project-id']) ||
			(type === 'scene' && cached['dbench-order'] === 9999));

	if (missing.length === 0 && !wouldUpgrade) {
		return {
			outcome: 'skipped',
			file,
			reason: 'Essentials already complete',
		};
	}

	try {
		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (inferred) {
				if (isEmpty(frontmatter['dbench-project'])) {
					frontmatter['dbench-project'] = `[[${inferred.file.basename}]]`;
				}
				if (isEmpty(frontmatter['dbench-project-id'])) {
					frontmatter['dbench-project-id'] =
						inferred.frontmatter['dbench-id'];
				}
				if (
					type === 'scene' &&
					(frontmatter['dbench-order'] === undefined ||
						frontmatter['dbench-order'] === null ||
						frontmatter['dbench-order'] === 9999)
				) {
					frontmatter['dbench-order'] = nextSceneOrderForProject(
						app,
						inferred.frontmatter['dbench-id']
					);
				}
			}
			if (type === 'project') {
				stampProjectEssentials(frontmatter, { basename: file.basename });
			} else if (type === 'scene') {
				stampSceneEssentials(frontmatter, { basename: file.basename });
			} else if (type === 'draft') {
				if (
					frontmatter['dbench-draft-number'] === undefined ||
					frontmatter['dbench-draft-number'] === null
				) {
					frontmatter['dbench-draft-number'] = inferDraftNumber(
						file.basename
					);
				}
				stampDraftEssentials(frontmatter, { basename: file.basename });
			}
		});
		return { outcome: 'updated', file };
	} catch (err) {
		return {
			outcome: 'error',
			file,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Whether `value` should be treated as "empty" for inference purposes:
 * undefined, null, or an empty string. Empty arrays are *not* empty
 * here — they're the stamper's correct default for reverse arrays.
 */
function isEmpty(value: unknown): boolean {
	return value === undefined || value === null || value === '';
}

/**
 * Stamp `dbench-id` on a note that lacks one. Returns `skipped` if
 * an id is already present.
 */
export async function addDbenchId(
	app: App,
	file: TFile
): Promise<RetrofitResult> {
	if (!hasMissingId(app, file) && readDbenchType(app, file) !== null) {
		return {
			outcome: 'skipped',
			file,
			reason: 'Already has dbench-id',
		};
	}
	try {
		await app.fileManager.processFrontMatter(file, (fm) => {
			stampDbenchId(fm);
		});
		return { outcome: 'updated', file };
	} catch (err) {
		return {
			outcome: 'error',
			file,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Apply `action` to each file in `files` sequentially, aggregating
 * outcomes. Sequential (rather than parallel) execution keeps
 * `processFrontMatter` writes serialized so the metadata cache
 * remains consistent between calls.
 */
export async function applyToFiles(
	app: App,
	files: TFile[],
	action: (app: App, file: TFile) => Promise<RetrofitResult>
): Promise<BatchResult> {
	const result: BatchResult = { updated: 0, skipped: 0, errors: 0 };
	for (const file of files) {
		const r = await action(app, file);
		if (r.outcome === 'updated') result.updated++;
		else if (r.outcome === 'skipped') result.skipped++;
		else result.errors++;
	}
	return result;
}

/**
 * Recursively collect markdown files within `folder`. Implemented by
 * filtering the vault's flat markdown-file list by path prefix rather
 * than walking `TFolder.children`, which keeps this robust against
 * parent/children tracking quirks across runtimes.
 */
export function collectMarkdownFiles(app: App, folder: TFolder): TFile[] {
	const normalized = folder.path.replace(/\/+$/, '');
	const prefix = normalized === '' ? '' : `${normalized}/`;
	return app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
}

/**
 * Parse a draft number out of a filename. Matches ` Draft N ` (case-
 * sensitive, word-boundary) and returns N when positive integer; falls
 * back to 1. Matches the plugin's own `<Scene> - Draft N (YYYYMMDD).md`
 * naming and common Longform-era conventions.
 */
function inferDraftNumber(basename: string): number {
	const match = basename.match(/\bDraft (\d+)\b/);
	if (!match) return 1;
	const n = Number.parseInt(match[1], 10);
	return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Return the parent-folder portion of a path (everything before the
 * final slash). Returns `''` for vault-root files.
 */
function parentPath(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return '';
	return filePath.slice(0, idx);
}

/**
 * Project notes that sit directly in `folderPath` (no subfolders).
 * Reads project-typed frontmatter from the cache.
 */
function findProjectsInFolder(app: App, folderPath: string): ProjectNote[] {
	return findProjects(app).filter((p) => parentPath(p.file.path) === folderPath);
}

/**
 * Infer the parent project for a scene from its immediate parent
 * folder. Returns null when zero or multiple project notes live in
 * the same folder — the caller falls back to empty placeholders.
 *
 * Per D-04, discovery is frontmatter-based, not folder-based; this
 * helper runs at *creation time* (retrofit) as a convenience for the
 * common "scene sits in its project folder" layout. It does not
 * change how existing scenes are discovered.
 */
export function inferProjectForScene(
	app: App,
	file: TFile
): ProjectNote | null {
	const folder = parentPath(file.path);
	const projects = findProjectsInFolder(app, folder);
	return projects.length === 1 ? projects[0] : null;
}

/**
 * Infer the parent project for a draft by walking up from its parent
 * folder. At each level, look for exactly one project note; return
 * it when found. If a level contains multiple project notes the walk
 * stops (ambiguous); if the walk reaches the vault root with no
 * match, returns null.
 *
 * Walk-up (vs. immediate-parent only) handles the common case where
 * drafts live in `<project>/Drafts/<file>.md` — the project lives one
 * level above the draft's folder.
 */
export function inferProjectForDraft(
	app: App,
	file: TFile
): ProjectNote | null {
	let folder: string | null = parentPath(file.path);
	while (folder !== null) {
		const projects = findProjectsInFolder(app, folder);
		if (projects.length === 1) return projects[0];
		if (projects.length > 1) return null;
		if (folder === '') return null;
		folder = parentPath(folder);
	}
	return null;
}

/**
 * Next order value for a scene being attached to `projectId`:
 * `max(existing orders) + 1`, or `1` when no scenes exist yet. Used
 * at retrofit time when the scene's project can be inferred from
 * folder context.
 */
export function nextSceneOrderForProject(
	app: App,
	projectId: string
): number {
	if (projectId === '') return 1;
	const scenes = findScenesInProject(app, projectId);
	if (scenes.length === 0) return 1;
	const max = Math.max(
		...scenes.map((s) => s.frontmatter['dbench-order'])
	);
	return max + 1;
}
