import { TFile, TFolder, type App } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import { findNoteById, findScenes, findSubScenes } from '../discovery';
import { readString } from './readers';

/**
 * Folder-auto-rename helpers. When a scene or chapter file is renamed
 * AND the configured scenes/sub-scenes folder template references the
 * renamed file's basename via `{scene}` or `{chapter}`, the
 * corresponding folder needs to follow the rename so children stay
 * inside their parent's named folder. Called from `lifecycle.ts`'s
 * rename handler.
 */

/**
 * § 10 auto-rename: keep the sub-scene folder name in sync with its
 * parent scene's basename when the writer renames the scene file.
 *
 * Skipped when:
 * - The configured `subScenesFolder` template doesn't include
 *   `{scene}` (flat opt-out or any template that doesn't depend on
 *   the parent-scene basename).
 * - The scene's project ref is empty / unresolvable.
 * - The expected old folder doesn't exist (writer manually renamed
 *   it to something else, or no sub-scenes have been created yet).
 * - The folder doesn't contain at least one sub-scene that references
 *   this scene's id (defends against renaming an unrelated folder
 *   that happens to share the old basename).
 * - The new folder path is already occupied (some other folder
 *   exists at the target name); we skip rather than overwrite.
 */
export async function renameSubSceneFolderIfNeeded(
	app: App,
	settings: DraftBenchSettings,
	sceneFile: TFile,
	sceneFm: Record<string, unknown>,
	oldSceneBasename: string
): Promise<void> {
	const sceneId = readString(sceneFm['dbench-id']);
	if (sceneId === '') return;

	if (!settings.subScenesFolder.includes('{scene}')) return;

	const projectId = readString(sceneFm['dbench-project-id']);
	if (projectId === '') return;
	const project = findNoteById(app, projectId);
	if (!project) return;

	// Per #12: sub-scene folders are joined to the scene's parent
	// folder, not the project's. The scene's parent folder is
	// invariant across a basename rename, so both old and new paths
	// share the same scene folder; only the leaf basename differs.
	const sceneFolder = parentPath(sceneFile.path);
	const oldFolderPath = computeSubSceneFolderPath(
		settings.subScenesFolder,
		project.file.basename,
		sceneFolder,
		oldSceneBasename
	);
	const newFolderPath = computeSubSceneFolderPath(
		settings.subScenesFolder,
		project.file.basename,
		sceneFolder,
		sceneFile.basename
	);

	if (oldFolderPath === newFolderPath) return;

	const oldFolder = app.vault.getAbstractFileByPath(oldFolderPath);
	if (!oldFolder || !(oldFolder instanceof TFolder)) return;

	// Defend against renaming an unrelated folder that happens to
	// share the old basename: only rename when the folder contains
	// at least one sub-scene whose `dbench-scene-id` matches.
	const subSceneInFolder = findSubScenes(app).some(
		(s) =>
			s.file.path.startsWith(`${oldFolderPath}/`) &&
			s.frontmatter['dbench-scene-id'] === sceneId
	);
	if (!subSceneInFolder) return;

	// Skip if the new folder path is already occupied; let integrity
	// surface the conflict rather than silently overwriting.
	if (app.vault.getAbstractFileByPath(newFolderPath) !== null) {
		return;
	}

	await app.fileManager.renameFile(oldFolder, newFolderPath);
}

/**
 * Issue #11 auto-rename: keep the chapter-aware scenes folder name
 * in sync with its parent chapter's basename when the writer renames
 * the chapter file. Mirrors `renameSubSceneFolderIfNeeded` one level
 * up.
 *
 * Skipped when:
 * - The configured `scenesFolder` template doesn't include
 *   `{chapter}` (flat opt-out or any template that doesn't depend on
 *   the chapter basename).
 * - The chapter's project ref is empty / unresolvable.
 * - The expected old folder doesn't exist (writer manually renamed
 *   it to something else, or no scenes have been created in this
 *   chapter yet).
 * - The folder doesn't contain at least one scene that references
 *   this chapter's id (defends against renaming an unrelated folder
 *   that happens to share the old basename).
 * - The new folder path is already occupied; we skip rather than
 *   overwrite.
 */
export async function renameChapterScenesFolderIfNeeded(
	app: App,
	settings: DraftBenchSettings,
	chapterFile: TFile,
	chapterFm: Record<string, unknown>,
	oldChapterBasename: string
): Promise<void> {
	const chapterId = readString(chapterFm['dbench-id']);
	if (chapterId === '') return;

	if (!settings.scenesFolder.includes('{chapter}')) return;

	const projectId = readString(chapterFm['dbench-project-id']);
	if (projectId === '') return;
	const project = findNoteById(app, projectId);
	if (!project) return;

	const oldFolderPath = computeChapterScenesFolderPath(
		settings.scenesFolder,
		project.file,
		oldChapterBasename
	);
	const newFolderPath = computeChapterScenesFolderPath(
		settings.scenesFolder,
		project.file,
		chapterFile.basename
	);

	if (oldFolderPath === newFolderPath) return;

	const oldFolder = app.vault.getAbstractFileByPath(oldFolderPath);
	if (!oldFolder || !(oldFolder instanceof TFolder)) return;

	const sceneInFolder = findScenes(app).some(
		(s) =>
			s.file.path.startsWith(`${oldFolderPath}/`) &&
			s.frontmatter['dbench-chapter-id'] === chapterId
	);
	if (!sceneInFolder) return;

	if (app.vault.getAbstractFileByPath(newFolderPath) !== null) {
		return;
	}

	await app.fileManager.renameFile(oldFolder, newFolderPath);
}

/**
 * Return the parent-folder portion of a path (everything before the
 * final slash). Returns `''` for vault-root files. Mirrors the helper
 * used in scenes.ts / chapters.ts / sub-scenes.ts.
 */
function parentPath(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return '';
	return filePath.slice(0, idx);
}

/**
 * Compute the on-disk folder path for sub-scenes of a given parent scene,
 * applying `{project}` and `{scene}` token expansion against
 * `settings.subScenesFolder`. Mirrors `resolveSubScenePaths` in
 * sub-scenes.ts but takes the scene's folder + basename as separate
 * arguments, so the linker can reconstruct the OLD path during rename
 * handling. The relative template is joined to `sceneFolder` (per #12)
 * rather than the project folder so chapter-aware scene placements
 * carry their sub-scenes along automatically.
 */
function computeSubSceneFolderPath(
	template: string,
	projectBasename: string,
	sceneFolder: string,
	sceneBasename: string
): string {
	const relative = template
		.replace(/\{project\}/g, projectBasename)
		.replace(/\{scene\}/g, sceneBasename)
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	return relative === ''
		? sceneFolder
		: sceneFolder === ''
			? relative
			: `${sceneFolder}/${relative}`;
}

/**
 * Compute the on-disk folder path for scenes of a given parent chapter,
 * applying `{project}` and `{chapter}` token expansion against
 * `settings.scenesFolder`. Mirrors `resolveScenePaths` in scenes.ts but
 * takes a bare chapter basename instead of a `ChapterNote`, so the linker
 * can reconstruct the OLD path during rename handling. Issue #11.
 */
function computeChapterScenesFolderPath(
	template: string,
	projectFile: TFile,
	chapterBasename: string
): string {
	const relative = template
		.replace(/\{project\}/g, projectFile.basename)
		.replace(/\{chapter\}/g, chapterBasename)
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	const projectFolder = parentPath(projectFile.path);
	return relative === ''
		? projectFolder
		: projectFolder === ''
			? relative
			: `${projectFolder}/${relative}`;
}
