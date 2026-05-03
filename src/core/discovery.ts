import type { App, TFile } from 'obsidian';
import type { DbenchId } from '../model/types';
import { isProjectFrontmatter, type ProjectFrontmatter } from '../model/project';
import { isChapterFrontmatter, type ChapterFrontmatter } from '../model/chapter';
import { isSceneFrontmatter, type SceneFrontmatter } from '../model/scene';
import { isSubSceneFrontmatter, type SubSceneFrontmatter } from '../model/sub-scene';
import { isDraftFrontmatter, type DraftFrontmatter } from '../model/draft';
import {
	isCompilePresetFrontmatter,
	type CompilePresetFrontmatter,
} from '../model/compile-preset';

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

/** A discovered chapter note paired with its parsed frontmatter. */
export interface ChapterNote {
	file: TFile;
	frontmatter: ChapterFrontmatter;
}

/** A discovered scene note paired with its parsed frontmatter. */
export interface SceneNote {
	file: TFile;
	frontmatter: SceneFrontmatter;
}

/** A discovered sub-scene note paired with its parsed frontmatter. */
export interface SubSceneNote {
	file: TFile;
	frontmatter: SubSceneFrontmatter;
}

/** A discovered draft note paired with its parsed frontmatter. */
export interface DraftNote {
	file: TFile;
	frontmatter: DraftFrontmatter;
}

/** A discovered compile-preset note paired with its parsed frontmatter. */
export interface CompilePresetNote {
	file: TFile;
	frontmatter: CompilePresetFrontmatter;
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
 * Find every chapter note in the vault.
 */
export function findChapters(app: App): ChapterNote[] {
	const out: ChapterNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isChapterFrontmatter(fm)) {
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
 * Find every sub-scene note in the vault.
 */
export function findSubScenes(app: App): SubSceneNote[] {
	const out: SubSceneNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isSubSceneFrontmatter(fm)) {
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
 * Find every compile-preset note in the vault.
 */
export function findCompilePresets(app: App): CompilePresetNote[] {
	const out: CompilePresetNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isCompilePresetFrontmatter(fm)) {
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
 *
 * For chapter-aware projects, scenes-in-chapters carry both
 * `dbench-project-id` (pointing to the project) and `dbench-chapter-id`
 * (pointing to their chapter) per
 * [chapter-type.md § 3](../../docs/planning/chapter-type.md). This
 * function returns the flat list of all scenes across all chapters in
 * the project. Use `findChaptersInProject` + `findScenesInChapter` when
 * the hierarchy matters.
 */
export function findScenesInProject(app: App, projectId: DbenchId): SceneNote[] {
	if (projectId === '') return [];
	return findScenes(app).filter(
		(scene) => scene.frontmatter['dbench-project-id'] === projectId
	);
}

/**
 * Find chapters whose `dbench-project-id` matches the given project ID.
 *
 * Match is on the stable ID companion (rename-safe), not the wikilink.
 * Chapters with empty `dbench-project-id` (orphan chapters that haven't
 * been attached to a project yet) are excluded.
 */
export function findChaptersInProject(app: App, projectId: DbenchId): ChapterNote[] {
	if (projectId === '') return [];
	return findChapters(app).filter(
		(chapter) => chapter.frontmatter['dbench-project-id'] === projectId
	);
}

/**
 * Find scenes whose `dbench-chapter-id` matches the given chapter ID.
 *
 * Match is on the stable ID companion (rename-safe), not the wikilink.
 * The field is optional on `SceneFrontmatter` (chapter-less scenes
 * don't carry it), so we read defensively from the underlying Record.
 */
export function findScenesInChapter(app: App, chapterId: DbenchId): SceneNote[] {
	if (chapterId === '') return [];
	return findScenes(app).filter((scene) => {
		const fm = scene.frontmatter as unknown as Record<string, unknown>;
		return fm['dbench-chapter-id'] === chapterId;
	});
}

/**
 * Find sub-scenes whose `dbench-project-id` matches the given project ID.
 *
 * Match is on the stable ID companion (rename-safe), not the wikilink.
 * Sub-scenes with empty `dbench-project-id` (orphan sub-scenes that
 * haven't been attached to a project yet) are excluded.
 *
 * Returns the flat list of all sub-scenes across all hierarchical scenes
 * in the project. Use `findSubScenesInScene` when you want the sub-scenes
 * of one specific parent scene.
 */
export function findSubScenesInProject(
	app: App,
	projectId: DbenchId
): SubSceneNote[] {
	if (projectId === '') return [];
	return findSubScenes(app).filter(
		(subScene) => subScene.frontmatter['dbench-project-id'] === projectId
	);
}

/**
 * Find sub-scenes whose `dbench-scene-id` matches the given scene ID.
 *
 * Match is on the stable ID companion (rename-safe), not the wikilink.
 * Sub-scenes with empty `dbench-scene-id` (orphan sub-scenes that haven't
 * been attached to a parent scene yet) are excluded.
 */
export function findSubScenesInScene(
	app: App,
	sceneId: DbenchId
): SubSceneNote[] {
	if (sceneId === '') return [];
	return findSubScenes(app).filter(
		(subScene) => subScene.frontmatter['dbench-scene-id'] === sceneId
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
 * Find sub-scene-level drafts whose `dbench-sub-scene-id` matches the
 * given sub-scene ID. Symmetric partner of `findDraftsOfScene` /
 * `findDraftsOfChapter` — sub-scene drafts carry `dbench-sub-scene` +
 * `dbench-sub-scene-id` instead of the scene/chapter refs. Per
 * [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md),
 * disambiguation is implicit: which parent ref is present tells the
 * draft target type.
 */
export function findDraftsOfSubScene(
	app: App,
	subSceneId: DbenchId
): DraftNote[] {
	if (subSceneId === '') return [];
	return findDrafts(app).filter((draft) => {
		const fm = draft.frontmatter as unknown as Record<string, unknown>;
		return fm['dbench-sub-scene-id'] === subSceneId;
	});
}

/**
 * Find chapter-level drafts whose `dbench-chapter-id` matches the given
 * chapter ID. Symmetric partner of `findDraftsOfScene` — chapter drafts
 * carry `dbench-chapter` + `dbench-chapter-id` instead of
 * `dbench-scene` + `dbench-scene-id`. Per
 * [chapter-type.md § 4](../../docs/planning/chapter-type.md),
 * disambiguation is implicit: which parent ref is present tells the
 * draft target type.
 */
export function findDraftsOfChapter(app: App, chapterId: DbenchId): DraftNote[] {
	if (chapterId === '') return [];
	return findDrafts(app).filter((draft) => {
		const fm = draft.frontmatter as unknown as Record<string, unknown>;
		return fm['dbench-chapter-id'] === chapterId;
	});
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
 * Find compile-preset notes whose `dbench-project-id` matches the given
 * project ID. The rename-safe ID companion lets presets follow their
 * project across renames without re-linking.
 */
export function findCompilePresetsOfProject(
	app: App,
	projectId: DbenchId
): CompilePresetNote[] {
	if (projectId === '') return [];
	return findCompilePresets(app).filter(
		(preset) => preset.frontmatter['dbench-project-id'] === projectId
	);
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
