import type { App, TFile } from 'obsidian';
import type { DbenchId } from '../model/types';
import { isProjectFrontmatter, type ProjectFrontmatter } from '../model/project';
import { isSceneFrontmatter, type SceneFrontmatter } from '../model/scene';
import { isDraftFrontmatter, type DraftFrontmatter } from '../model/draft';

/**
 * Vault-wide discovery utilities.
 *
 * Per [D-04 — Folder flexibility](../../docs/planning/decisions/D-04-folder-flexibility.md),
 * Draft Bench identifies plugin-managed notes by frontmatter, not by
 * folder path. These helpers walk `app.vault.getMarkdownFiles()` and
 * filter by `dbench-type` and ID-companion fields. Folder location is
 * never consulted.
 *
 * Performance note (per the spec's Performance section): the underlying
 * `getMarkdownFiles()` call is O(1) (it returns the cached file list),
 * and `metadataCache.getFileCache()` is an in-memory hash lookup. A full
 * vault scan is therefore O(n) over cached YAML and completes in
 * milliseconds for typical vaults. Phase 5+ adds an optional folder
 * filter for very large mixed-purpose vaults.
 */

/** A discovered project note paired with its parsed frontmatter. */
export interface ProjectNote {
	file: TFile;
	frontmatter: ProjectFrontmatter;
}

/** A discovered scene note paired with its parsed frontmatter. */
export interface SceneNote {
	file: TFile;
	frontmatter: SceneFrontmatter;
}

/** A discovered draft note paired with its parsed frontmatter. */
export interface DraftNote {
	file: TFile;
	frontmatter: DraftFrontmatter;
}

/**
 * Find every project note in the vault.
 */
export function findProjects(app: App): ProjectNote[] {
	const out: ProjectNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isProjectFrontmatter(fm)) {
			out.push({ file, frontmatter: fm });
		}
	}
	return out;
}

/**
 * Find every scene note in the vault.
 */
export function findScenes(app: App): SceneNote[] {
	const out: SceneNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isSceneFrontmatter(fm)) {
			out.push({ file, frontmatter: fm });
		}
	}
	return out;
}

/**
 * Find every draft note in the vault.
 */
export function findDrafts(app: App): DraftNote[] {
	const out: DraftNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isDraftFrontmatter(fm)) {
			out.push({ file, frontmatter: fm });
		}
	}
	return out;
}

/**
 * Find scenes whose `dbench-project-id` matches the given project ID.
 *
 * Match is on the stable ID companion (rename-safe), not the wikilink.
 * Scenes with empty `dbench-project-id` (orphan scenes that haven't
 * been attached to a project yet) are excluded.
 */
export function findScenesInProject(app: App, projectId: DbenchId): SceneNote[] {
	if (projectId === '') return [];
	return findScenes(app).filter(
		(scene) => scene.frontmatter['dbench-project-id'] === projectId
	);
}

/**
 * Find drafts whose `dbench-scene-id` matches the given scene ID.
 *
 * Excludes drafts of single-scene projects, which have empty
 * `dbench-scene-id` (their parent is identified by `dbench-project`).
 */
export function findDraftsOfScene(app: App, sceneId: DbenchId): DraftNote[] {
	if (sceneId === '') return [];
	return findDrafts(app).filter(
		(draft) => draft.frontmatter['dbench-scene-id'] === sceneId
	);
}

/**
 * Find drafts whose `dbench-project` ID-companion matches the given
 * project ID. Used for single-scene projects, where drafts attach
 * directly to the project rather than to an intermediate scene.
 *
 * Note: the field name is `dbench-project-id` (string), present on
 * every plugin-managed note including drafts.
 */
export function findDraftsOfProject(app: App, projectId: DbenchId): DraftNote[] {
	if (projectId === '') return [];
	return findDrafts(app).filter((draft) => {
		// Drafts also carry dbench-project-id when stamped (per essentials),
		// though the field is not part of the strict DraftFrontmatter type.
		// Read defensively from the underlying Record.
		const fm = draft.frontmatter as unknown as Record<string, unknown>;
		return fm['dbench-project-id'] === projectId;
	});
}

/**
 * Find any plugin-managed note (project, scene, or draft) by its
 * stable `dbench-id`. Returns the file and its raw frontmatter, or
 * `null` if no note with that ID exists.
 *
 * Used by the integrity service to repair forward references whose
 * wikilink target is missing but whose ID companion is still valid.
 */
export function findNoteById(
	app: App,
	id: DbenchId
): { file: TFile; frontmatter: Record<string, unknown> } | null {
	if (id === '') return null;
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm && typeof fm === 'object' && (fm as Record<string, unknown>)['dbench-id'] === id) {
			return { file, frontmatter: fm as Record<string, unknown> };
		}
	}
	return null;
}
