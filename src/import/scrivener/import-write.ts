import { type App, TFile } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import type { DraftBenchLinker } from '../../core/linker';
import { createProject } from '../../core/projects';
import { createChapter } from '../../core/chapters';
import { createScene } from '../../core/scenes';
import { createSubScene } from '../../core/sub-scenes';
import type {
	ChapterNote,
	ProjectNote,
	SceneNote,
} from '../../core/discovery';
import { rtfToMarkdown } from './rtf-to-markdown';
import {
	autoDetectHierarchy,
	effectiveTarget,
	type HierarchyMapping,
	type HierarchyTarget,
} from './hierarchy-mapping';
import type { BinderItem, ScrivProject } from './scrivx-parser';
import type { MetadataMapping, StatusTarget } from './metadata-mapping';
import type { ImportOptions } from './import-wizard-modal';
import type { ParsedBundle, ScrivenerImportFormData } from './import-wizard-modal';

/**
 * Scrivener import write pass (step 11 of [scrivener-import.md
 * § Implementation](../../../docs/planning/scrivener-import.md)).
 *
 * Executes the writer-confirmed import plan against the vault: creates
 * the project / chapters / scenes / sub-scenes, converts RTF bodies
 * via `rtfToMarkdown`, applies status / label / custom-metadata
 * mapping, preserves Scrivener provenance via `scrivener-*`
 * frontmatter, and (when toggled on) imports snapshots + extracts
 * binder image attachments.
 *
 * **Linker integration.** The whole pass runs inside
 * `linker.withSuspended(...)` so intermediate states (mid-import
 * frontmatter changes, parent reverse-array updates) don't trigger
 * sync. Each `createScene` / `createChapter` / `createSubScene` call
 * already updates parent reverse arrays via `processFrontMatter`,
 * which keeps order preservation in sync with binder order.
 *
 * **Error tolerance.** Per-item failures are collected into
 * `result.errors`; the import continues so a single bad item doesn't
 * abort the whole pass. Top-level failures (project creation, etc.)
 * abort and surface in the result.
 */

const FILENAME_UNSAFE = /[\\/:*?"<>|]/g;

/** Maximum heading depth for nested extras-below collapse. Markdown
 *  caps at H6; we cap our nesting one level shallower so leftover
 *  depth still produces a heading. */
const MAX_NESTED_HEADING_DEPTH = 6;

export interface ImportError {
	/** Binder item ID, or empty string for top-level / cross-cutting errors. */
	binderItemId: string;
	/** Display title for the import error log. */
	itemTitle: string;
	message: string;
}

export interface ImportResult {
	/** Created project note's TFile, or null if project creation failed. */
	projectFile: TFile | null;
	/** Total vault files created (project / chapters / scenes / sub-scenes
	 *  / drafts / images). */
	filesCreated: number;
	/** Per-item errors encountered. The import didn't abort on these. */
	errors: ImportError[];
	/** Non-fatal warnings. */
	warnings: string[];
}

export interface ExecuteImportPlanInput {
	app: App;
	settings: DraftBenchSettings;
	linker: DraftBenchLinker;
	/** Persists settings mutations (status vocabulary additions, compile
	 *  preset stub). Called after successful mutation. */
	saveSettings: () => Promise<void>;
	bundle: ParsedBundle;
	bundleRootPath: string;
	formData: ScrivenerImportFormData;
	/** Optional progress hook for the wizard's Import step. */
	onProgress?: (message: string, current: number, total: number) => void;
}

/**
 * Execute the import plan. The big one. See module docstring for
 * scope; see `WriteContext` below for the threaded mutation state.
 */
export async function executeImportPlan(
	input: ExecuteImportPlanInput
): Promise<ImportResult> {
	const result: ImportResult = {
		projectFile: null,
		filesCreated: 0,
		errors: [],
		warnings: [],
	};

	return await input.linker.withSuspended(async () => {
		try {
			// Pass 0: status vocabulary mutation. New statuses must exist
			// before scenes that reference them are stamped.
			await mutateStatusVocabulary(input);

			// Pass 1: create project + binder structure.
			const project = await createProjectFromBundle(input, result);
			if (!project) return result;

			const draftRoot = input.bundle.project.binder.find(
				(b: BinderItem) => b.type === 'DraftFolder'
			);
			if (!draftRoot) {
				result.warnings.push(
					'No manuscript folder in source bundle; only the project note was created.'
				);
				return result;
			}

			const ctx: WriteContext = {
				input,
				result,
				project,
				auto: autoDetectHierarchy(draftRoot),
				uuidToPath: new Map(),
				partPath: [],
				totalItems: countMappedItems(draftRoot, input.formData),
				progressedItems: 0,
			};

			await walkDraftItems(draftRoot.children, ctx, null, null);

			// Pass 2: image extraction (binder Image items only; inline
			// RTF images are deferred to a future RTF parser update).
			await extractBinderImages(ctx);

			// Pass 3: deferred toggles. Surface warnings so the writer
			// knows the toggles didn't silently no-op.
			if (input.formData.options.importSnapshots) {
				result.warnings.push(
					'Snapshot import is not yet implemented; this toggle will work in a future release.'
				);
			}
			if (input.formData.options.createDefaultCompilePreset) {
				result.warnings.push(
					'Default compile preset stub is not yet implemented; create a preset manually after import.'
				);
			}

			// Pass 4: error log.
			if (result.errors.length > 0) {
				await writeErrorLog(input.app, project.file, result.errors);
				result.filesCreated += 1;
			}
		} catch (err) {
			result.errors.push({
				binderItemId: '',
				itemTitle: '(top-level)',
				message: err instanceof Error ? err.message : String(err),
			});
		}
		return result;
	});
}

// ---- Threaded write state -----------------------------------------------

interface WriteContext {
	input: ExecuteImportPlanInput;
	result: ImportResult;
	project: ProjectNote;
	auto: HierarchyMapping;
	/** Scrivener UUID -> created vault path. Built during pass 1; used
	 *  by future cross-doc-link rewriting. */
	uuidToPath: Map<string, string>;
	/** Stack of extras-above titles surrounding the current item.
	 *  Joined with ` / ` to form `scrivener-part` frontmatter for
	 *  enclosed chapters. */
	partPath: string[];
	totalItems: number;
	progressedItems: number;
}

// ---- Pass 0: status vocabulary mutation ---------------------------------

/**
 * Walk the metadata mapping, append any 'new' status names to
 * `settings.statusVocabulary` (deduped), persist via `saveSettings`.
 * Mutates settings in place because the existing core helpers read
 * `settings.statusVocabulary` directly when stamping scene status.
 */
async function mutateStatusVocabulary(
	input: ExecuteImportPlanInput
): Promise<void> {
	const mapping = input.formData.metadataMapping;
	if (!mapping) return;
	let mutated = false;
	for (const target of mapping.statuses.values()) {
		if (target.kind !== 'new') continue;
		const name = target.statusName.trim();
		if (name === '') continue;
		if (!input.settings.statusVocabulary.includes(name)) {
			input.settings.statusVocabulary.push(name);
			mutated = true;
		}
	}
	if (mutated) await input.saveSettings();
}

// ---- Project creation ---------------------------------------------------

async function createProjectFromBundle(
	input: ExecuteImportPlanInput,
	result: ImportResult
): Promise<ProjectNote | null> {
	const projectName = sanitize(input.formData.destinationName.trim());
	try {
		const { file } = await createProject(input.app, input.settings, {
			title: projectName,
			shape: 'folder',
		});
		result.projectFile = file;
		result.filesCreated += 1;

		// Project-level provenance: source bundle path.
		await input.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter['scrivener-source'] = input.bundleRootPath;
		});

		const note = readProjectNote(input.app, file);
		input.onProgress?.('Created project', 1, 100);
		return note;
	} catch (err) {
		result.errors.push({
			binderItemId: '',
			itemTitle: projectName,
			message: `Project creation failed: ${err instanceof Error ? err.message : String(err)}`,
		});
		return null;
	}
}

// ---- Pass 1: walk Draft items + create chapter/scene/sub-scene ---------

async function walkDraftItems(
	items: BinderItem[],
	ctx: WriteContext,
	currentChapter: ChapterNote | null,
	currentScene: SceneNote | null
): Promise<void> {
	for (const item of items) {
		const target = effectiveTarget(
			item.id,
			ctx.auto,
			ctx.input.formData.hierarchyOverrides
		);

		try {
			switch (target) {
				case 'chapter': {
					const chapter = await createImportedChapter(item, ctx);
					if (chapter) {
						currentChapter = chapter;
						currentScene = null;
					}
					await walkDraftItems(item.children, ctx, currentChapter, currentScene);
					break;
				}
				case 'scene': {
					const scene = await createImportedScene(item, ctx, currentChapter);
					if (scene) currentScene = scene;
					await walkDraftItems(item.children, ctx, currentChapter, currentScene);
					break;
				}
				case 'sub-scene': {
					if (currentScene) {
						await createImportedSubScene(item, ctx, currentScene);
					} else {
						ctx.result.warnings.push(
							`Sub-scene "${item.title}" had no parent scene; skipped.`
						);
					}
					// Sub-scenes can have extras-below children which get
					// concatenated into the sub-scene body during creation.
					break;
				}
				case 'extras-above':
					ctx.partPath.push(item.title);
					await walkDraftItems(item.children, ctx, currentChapter, currentScene);
					ctx.partPath.pop();
					break;
				case 'extras-below':
					// Handled by the parent's body collection (see
					// collectExtrasBelow). No action here.
					break;
				case 'skip':
					break;
			}
		} catch (err) {
			ctx.result.errors.push({
				binderItemId: item.id,
				itemTitle: item.title,
				message: err instanceof Error ? err.message : String(err),
			});
		}

		ctx.progressedItems += 1;
		ctx.input.onProgress?.(
			`Imported ${ctx.progressedItems} of ${ctx.totalItems}`,
			ctx.progressedItems,
			ctx.totalItems
		);
	}
}

// ---- Chapter creation ---------------------------------------------------

async function createImportedChapter(
	item: BinderItem,
	ctx: WriteContext
): Promise<ChapterNote | null> {
	const title = sanitize(item.title || 'Untitled chapter');
	const file = await createChapter(ctx.input.app, ctx.input.settings, {
		project: ctx.project,
		title,
	});
	ctx.result.filesCreated += 1;
	ctx.uuidToPath.set(item.id, file.path);

	const body = await loadChapterBody(item, ctx);
	if (body !== null) await replaceBody(ctx.input.app, file, body);

	await applyScrivenerFrontmatter(file, item, ctx, 'chapter');
	return readChapterNote(ctx.input.app, file);
}

// ---- Scene creation -----------------------------------------------------

async function createImportedScene(
	item: BinderItem,
	ctx: WriteContext,
	chapter: ChapterNote | null
): Promise<SceneNote | null> {
	const title = sanitize(item.title || 'Untitled scene');
	const file = await createScene(ctx.input.app, ctx.input.settings, {
		project: ctx.project,
		chapter: chapter ?? undefined,
		title,
		status: resolveStatus(item, ctx),
	});
	ctx.result.filesCreated += 1;
	ctx.uuidToPath.set(item.id, file.path);

	const body = await loadSceneBody(item, ctx);
	if (body !== null) await replaceBody(ctx.input.app, file, body);

	await applyScrivenerFrontmatter(file, item, ctx, 'scene');
	return readSceneNote(ctx.input.app, file);
}

// ---- Sub-scene creation -------------------------------------------------

async function createImportedSubScene(
	item: BinderItem,
	ctx: WriteContext,
	parentScene: SceneNote
): Promise<void> {
	const title = sanitize(item.title || 'Untitled sub-scene');
	const file = await createSubScene(ctx.input.app, ctx.input.settings, {
		project: ctx.project,
		scene: parentScene,
		title,
		status: resolveStatus(item, ctx),
	});
	ctx.result.filesCreated += 1;
	ctx.uuidToPath.set(item.id, file.path);

	// Sub-scene body: own RTF + appended extras-below children as
	// nested headings.
	const own = await loadSceneBody(item, ctx);
	const extras = await collectExtrasBelow(item.children, ctx, 3);
	let body = own ?? '';
	if (extras !== '') {
		body = (body === '' ? '' : body + '\n\n') + extras;
	}
	if (body !== '') await replaceBody(ctx.input.app, file, body);

	await applyScrivenerFrontmatter(file, item, ctx, 'sub-scene');
}

/**
 * Recursively concatenate extras-below items as nested markdown
 * headings. Per § 2 of scrivener-import.md: "concatenated into the
 * parent sub-scene's body as nested markdown headings (`### Sub-sub-
 * scene title` followed by its prose)." The starting heading depth is
 * 3 (one level deeper than `## Notes` / `## Draft` section heads).
 */
async function collectExtrasBelow(
	items: BinderItem[],
	ctx: WriteContext,
	headingDepth: number
): Promise<string> {
	let buf = '';
	const cappedDepth = Math.min(headingDepth, MAX_NESTED_HEADING_DEPTH);
	const hashes = '#'.repeat(cappedDepth);
	for (const item of items) {
		const target = effectiveTarget(
			item.id,
			ctx.auto,
			ctx.input.formData.hierarchyOverrides
		);
		if (target !== 'extras-below') {
			// extras-below subtree may include non-extras-below items
			// (e.g., a Folder marked as extras-below containing Text
			// children also marked extras-below). Recurse defensively.
			if (item.children.length > 0) {
				const nested = await collectExtrasBelow(
					item.children,
					ctx,
					headingDepth + 1
				);
				if (nested !== '') buf += (buf ? '\n\n' : '') + nested;
			}
			continue;
		}
		const body = await loadSceneBody(item, ctx);
		const titleLine = `${hashes} ${item.title || 'Untitled'}`;
		const fragment = body !== null && body !== ''
			? `${titleLine}\n\n${body}`
			: titleLine;
		buf += (buf ? '\n\n' : '') + fragment;
		if (item.children.length > 0) {
			const nested = await collectExtrasBelow(
				item.children,
				ctx,
				headingDepth + 1
			);
			if (nested !== '') buf += '\n\n' + nested;
		}
	}
	return buf;
}

// ---- Body loading -------------------------------------------------------

/**
 * Load + convert a scene body from `Files/Data/<UUID>/content.rtf`.
 * Returns null when no content file exists. Notes (notes.rtf) get
 * appended as a `## Notes` section.
 */
async function loadSceneBody(
	item: BinderItem,
	ctx: WriteContext
): Promise<string | null> {
	const adapter = ctx.input.app.vault.adapter;
	const dataPath = `${ctx.input.bundleRootPath}/Files/Data/${item.id}`;
	let body = '';

	const contentPath = `${dataPath}/content.rtf`;
	if (await adapter.exists(contentPath)) {
		const rtf = await adapter.read(contentPath);
		const converted = rtfToMarkdown(rtf);
		for (const w of converted.warnings) {
			ctx.result.warnings.push(`${item.title}: ${w}`);
		}
		body = converted.markdown;
	}

	const notesPath = `${dataPath}/notes.rtf`;
	if (await adapter.exists(notesPath)) {
		const rtf = await adapter.read(notesPath);
		const converted = rtfToMarkdown(rtf);
		for (const w of converted.warnings) {
			ctx.result.warnings.push(`${item.title} (notes): ${w}`);
		}
		if (converted.markdown.trim() !== '') {
			body =
				(body === '' ? '' : body + '\n\n') +
				`## Notes\n\n${converted.markdown}`;
		}
	}

	return body === '' ? null : body;
}

/** Chapters typically have no body content in Scrivener (they're
 *  containers); we still try in case the writer authored intro text
 *  on the chapter folder itself. Same loading rules as scenes. */
async function loadChapterBody(
	item: BinderItem,
	ctx: WriteContext
): Promise<string | null> {
	return loadSceneBody(item, ctx);
}

// ---- Frontmatter writes -------------------------------------------------

type ItemKind = 'chapter' | 'scene' | 'sub-scene';

/**
 * Apply Scrivener-derived frontmatter on top of what `createChapter` /
 * `createScene` / `createSubScene` already stamped. Adds:
 *
 * - `dbench-synopsis` from `Files/Data/<UUID>/synopsis.txt`
 * - `tags` (array) from resolved keyword titles
 * - `<labelKey>` from resolved Scrivener Label
 * - custom-metadata frontmatter per the field-key mapping
 * - `scrivener-include-in-compile: false` when the source flag was off
 * - `scrivener-part` (joined extras-above stack) on chapters
 * - `scrivener-uuid` for cross-import provenance
 */
async function applyScrivenerFrontmatter(
	file: TFile,
	item: BinderItem,
	ctx: WriteContext,
	kind: ItemKind
): Promise<void> {
	const synopsis = await loadSynopsis(item, ctx);
	const labelTitle = resolveLabel(item, ctx);
	const labelKey = ctx.input.formData.metadataMapping?.labelKey;
	const customFields = ctx.input.formData.metadataMapping?.customFields;
	const projectFields = ctx.input.bundle.project.customMetaDataFields;

	await ctx.input.app.fileManager.processFrontMatter(file, (frontmatter) => {
		if (synopsis !== null) frontmatter['dbench-synopsis'] = synopsis;
		if (item.keywords.length > 0) frontmatter['tags'] = [...item.keywords];
		if (labelKey && labelTitle !== null) {
			frontmatter[labelKey] = labelTitle;
		}
		if (customFields !== undefined) {
			for (const [fieldId, value] of item.customMetaData) {
				const targetKey = customFields.get(fieldId);
				if (targetKey === undefined || targetKey === null) continue;
				frontmatter[targetKey] = value;
				// Also surface the field's display title via a "*-title"
				// key when the project defines one — useful provenance.
				const def = projectFields.get(fieldId);
				if (def && def.fieldType !== '') {
					// Don't write extra keys; the title is already
					// embedded in the field name when scrivener-prefixed.
				}
			}
		}
		if (item.includeInCompile === false) {
			frontmatter['scrivener-include-in-compile'] = false;
		}
		if (kind === 'chapter' && ctx.partPath.length > 0) {
			frontmatter['scrivener-part'] = ctx.partPath.join(' / ');
		}
		if (item.id !== '') frontmatter['scrivener-uuid'] = item.id;
	});
}

async function loadSynopsis(
	item: BinderItem,
	ctx: WriteContext
): Promise<string | null> {
	const path = `${ctx.input.bundleRootPath}/Files/Data/${item.id}/synopsis.txt`;
	if (!(await ctx.input.app.vault.adapter.exists(path))) return null;
	const text = (await ctx.input.app.vault.adapter.read(path)).trim();
	return text === '' ? null : text;
}

function resolveStatus(
	item: BinderItem,
	ctx: WriteContext
): string | undefined {
	if (item.statusId === null) return undefined;
	const target: StatusTarget | undefined =
		ctx.input.formData.metadataMapping?.statuses.get(item.statusId);
	if (!target) return undefined;
	if (target.kind === 'existing') return target.dbStatus;
	if (target.kind === 'new') return target.statusName;
	return undefined; // drop -> use core helpers' default
}

function resolveLabel(item: BinderItem, ctx: WriteContext): string | null {
	if (item.labelId === null) return null;
	const title = ctx.input.bundle.project.labels.get(item.labelId);
	if (!title || title === '' || title === 'No Label') return null;
	return title;
}

// ---- Image extraction ---------------------------------------------------

/**
 * For binder items typed `Image`, copy `Files/Data/<UUID>/content.<ext>`
 * to the configured image extraction folder. Inline images embedded
 * inside RTF bodies are out of scope for V1 — the RTF parser doesn't
 * extract them (a warning is emitted from the parser when it skips a
 * `\pict` group).
 */
async function extractBinderImages(ctx: WriteContext): Promise<void> {
	const folder = computeImageFolder(ctx);
	if (folder === null) return;

	const images: BinderItem[] = [];
	walkAll(ctx.input.bundle.project.binder, (item) => {
		if (item.type === 'Image') images.push(item);
	});
	if (images.length === 0) return;

	if (
		ctx.input.app.vault.getAbstractFileByPath(folder) === null
	) {
		try {
			await ctx.input.app.vault.createFolder(folder);
		} catch {
			// Race: another step (or async) created it. Ignore.
		}
	}

	for (const img of images) {
		try {
			const ext = await guessImageExtension(img, ctx);
			if (!ext) continue;
			const sourcePath = `${ctx.input.bundleRootPath}/Files/Data/${img.id}/content.${ext}`;
			if (!(await ctx.input.app.vault.adapter.exists(sourcePath))) continue;
			const bytes = await ctx.input.app.vault.adapter.readBinary(sourcePath);
			const destBasename = sanitize(img.title || img.id);
			const destPath = `${folder}/${destBasename}.${ext}`;
			if (
				ctx.input.app.vault.getAbstractFileByPath(destPath) === null
			) {
				await ctx.input.app.vault.createBinary(destPath, bytes);
				ctx.result.filesCreated += 1;
			}
		} catch (err) {
			ctx.result.errors.push({
				binderItemId: img.id,
				itemTitle: img.title || '(image)',
				message: err instanceof Error ? err.message : String(err),
			});
		}
	}
}

function computeImageFolder(ctx: WriteContext): string | null {
	const projectFolder = parentPath(ctx.project.file.path);
	const relative = ctx.input.formData.options.imageExtractionFolder
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	if (relative === '') return null;
	return projectFolder === '' ? relative : `${projectFolder}/${relative}`;
}

async function guessImageExtension(
	item: BinderItem,
	ctx: WriteContext
): Promise<string | null> {
	// Scrivener stores image extension hints in <FileExtension> inside
	// MetaData; our parser doesn't surface those today. Probe common
	// extensions in priority order.
	const candidates = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
	const adapter = ctx.input.app.vault.adapter;
	for (const ext of candidates) {
		const p = `${ctx.input.bundleRootPath}/Files/Data/${item.id}/content.${ext}`;
		if (await adapter.exists(p)) return ext;
	}
	return null;
}

// ---- Error log ----------------------------------------------------------

async function writeErrorLog(
	app: App,
	projectFile: TFile,
	errors: ImportError[]
): Promise<void> {
	const logPath = `${parentPath(projectFile.path)}/Import errors.md`;
	const lines: string[] = [
		'# Import errors',
		'',
		`The Scrivener import encountered ${errors.length} error${errors.length === 1 ? '' : 's'}. Details below.`,
		'',
	];
	for (const err of errors) {
		lines.push(`## ${err.itemTitle}`);
		if (err.binderItemId !== '') {
			lines.push('');
			lines.push(`- Binder UUID: \`${err.binderItemId}\``);
		}
		lines.push('');
		lines.push(err.message);
		lines.push('');
	}
	if (app.vault.getAbstractFileByPath(logPath) === null) {
		await app.vault.create(logPath, lines.join('\n'));
	}
}

// ---- Helpers ------------------------------------------------------------

async function replaceBody(
	app: App,
	file: TFile,
	body: string
): Promise<void> {
	const current = await app.vault.read(file);
	const match = current.match(/^---\n[\s\S]*?\n---\n?/);
	const frontmatter = match ? match[0] : '';
	await app.vault.modify(file, frontmatter + body);
}

function readProjectNote(app: App, file: TFile): ProjectNote {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) {
		throw new Error(
			`Could not read frontmatter for project "${file.basename}".`
		);
	}
	return { file, frontmatter: fm as ProjectNote['frontmatter'] };
}

function readChapterNote(app: App, file: TFile): ChapterNote {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) {
		throw new Error(
			`Could not read frontmatter for chapter "${file.basename}".`
		);
	}
	return { file, frontmatter: fm as ChapterNote['frontmatter'] };
}

function readSceneNote(app: App, file: TFile): SceneNote {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) {
		throw new Error(
			`Could not read frontmatter for scene "${file.basename}".`
		);
	}
	return { file, frontmatter: fm as SceneNote['frontmatter'] };
}

function parentPath(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return '';
	return filePath.slice(0, idx);
}

function sanitize(name: string): string {
	const trimmed = name.trim();
	const cleaned = trimmed.replace(FILENAME_UNSAFE, '-');
	return cleaned === '' ? 'Untitled' : cleaned;
}

function walkAll(
	items: BinderItem[],
	visit: (item: BinderItem) => void
): void {
	for (const item of items) {
		visit(item);
		walkAll(item.children, visit);
	}
}

function countMappedItems(
	draftRoot: BinderItem,
	formData: ScrivenerImportFormData
): number {
	const auto = autoDetectHierarchy(draftRoot);
	let count = 0;
	walkAll(draftRoot.children, (item) => {
		const t = effectiveTarget(item.id, auto, formData.hierarchyOverrides);
		if (t === 'chapter' || t === 'scene' || t === 'sub-scene') count += 1;
	});
	return count;
}

// Suppress unused-import warning on HierarchyTarget — exported types
// aren't used internally but the file's domain owns the union.
type _Unused = HierarchyTarget;
type _UnusedScriv = ScrivProject;
type _UnusedOpt = ImportOptions;
type _UnusedMeta = MetadataMapping;
