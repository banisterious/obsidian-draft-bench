import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	type DraftBenchSettings,
} from '../../../src/model/settings';
import { DraftBenchLinker } from '../../../src/core/linker';
import { executeImportPlan } from '../../../src/import/scrivener/import-write';
import type { BinderItem, ScrivProject } from '../../../src/import/scrivener/scrivx-parser';
import type {
	ParsedBundle,
	ScrivenerImportFormData,
} from '../../../src/import/scrivener/import-wizard-modal';

/**
 * Tests for the Scrivener import write pass. Targets behavioral
 * correctness against the full pipeline: file creation, frontmatter
 * writes, body conversion, status mapping, custom metadata, error
 * collection. Uses the obsidian mock's vault adapter for `.scriv`
 * bundle internals (content.rtf, synopsis.txt) without a real
 * fixture — synthetic RTF strings are enough to verify the path.
 */

let nextId = 0;
function makeItem(args: {
	id?: string;
	type?: string;
	title?: string;
	statusId?: string | null;
	labelId?: string | null;
	keywords?: string[];
	customMetaData?: Map<string, string>;
	includeInCompile?: boolean;
	children?: BinderItem[];
} = {}): BinderItem {
	return {
		id: args.id ?? `auto-${++nextId}`,
		type: args.type ?? 'Text',
		title: args.title ?? '',
		keywords: args.keywords ?? [],
		statusId: args.statusId ?? null,
		labelId: args.labelId ?? null,
		includeInCompile: args.includeInCompile ?? true,
		customMetaData: args.customMetaData ?? new Map(),
		created: '',
		modified: '',
		children: args.children ?? [],
	};
}

function makeBundle(opts: Partial<ScrivProject>): ParsedBundle {
	const project: ScrivProject = {
		binder: opts.binder ?? [],
		labels: opts.labels ?? new Map(),
		statuses: opts.statuses ?? new Map(),
		keywords: opts.keywords ?? new Map(),
		customMetaDataFields: opts.customMetaDataFields ?? new Map(),
		warnings: [],
	};
	return {
		project,
		summary: {
			draftDocuments: 0,
			draftFolders: 0,
			researchItems: 0,
			trashItems: 0,
			customRootItems: 0,
			images: 0,
			pdfs: 0,
			totalItems: 0,
		},
		snapshotCount: 0,
	};
}

function makeFormData(args: {
	destinationName: string;
	bundle: ParsedBundle;
	hierarchyOverrides?: Map<string, ReturnType<typeof Object>>;
}): ScrivenerImportFormData {
	return {
		sourcePath: 'imports/test.scriv',
		destinationName: args.destinationName,
		parsedBundle: args.bundle,
		parseError: null,
		parsedSourcePath: 'imports/test.scriv',
		hierarchyOverrides: new Map(),
		metadataMapping: null,
		options: {
			importResearch: false,
			importSnapshots: false,
			snapshotCap: 3,
			snapshotFilenameTemplate: '{scene} - Draft {n} ({date_compact})',
			imageExtractionFolder: 'Research/Images/',
			createDefaultCompilePreset: false,
		},
	};
}

function setupApp(): { app: App; settings: DraftBenchSettings; linker: DraftBenchLinker; saveCount: { n: number } } {
	const app = new App();
	const settings: DraftBenchSettings = JSON.parse(
		JSON.stringify(DEFAULT_SETTINGS)
	);
	const linker = new DraftBenchLinker(app, () => settings);
	const saveCount = { n: 0 };
	return { app, settings, linker, saveCount };
}

describe('executeImportPlan — happy path', () => {
	it('creates project, chapter, and scene with sane defaults', async () => {
		const { app, settings, linker, saveCount } = setupApp();

		const sceneItem = makeItem({
			id: 'scn-1',
			type: 'Text',
			title: '01 - Opening',
		});
		const chapterItem = makeItem({
			id: 'ch-1',
			type: 'Folder',
			title: 'Chapter 1',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'draft',
			type: 'DraftFolder',
			title: 'Manuscript',
			children: [chapterItem],
		});
		const bundle = makeBundle({ binder: [draftFolder] });

		// Seed RTF + synopsis for the scene
		app.vault._addAdapterFile(
			'imports/test.scriv/Files/Data/scn-1/content.rtf',
			'{\\rtf1\\ansi The opening line.}'
		);
		app.vault._addAdapterFile(
			'imports/test.scriv/Files/Data/scn-1/synopsis.txt',
			'Alice meets Bob.'
		);

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {
				saveCount.n += 1;
			},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData: makeFormData({
				destinationName: 'Salt Road',
				bundle,
			}),
		});

		expect(result.errors).toEqual([]);
		expect(result.projectFile).not.toBeNull();
		// project + chapter + scene = 3 files at minimum (folder
		// auto-creation may add more; counts only files created via
		// vault.create).
		expect(result.filesCreated).toBeGreaterThanOrEqual(3);

		const projectPath = result.projectFile!.path;
		expect(projectPath).toBe('Draft Bench/Salt Road/Salt Road.md');

		const chapterFile = app.vault.getFileByPath(
			'Draft Bench/Salt Road/Chapter 1.md'
		);
		expect(chapterFile).not.toBeNull();

		const sceneFile = app.vault.getFileByPath(
			'Draft Bench/Salt Road/Chapter 1/01 - Opening.md'
		);
		expect(sceneFile).not.toBeNull();
	});

	it('writes RTF body content + synopsis frontmatter on imported scenes', async () => {
		const { app, settings, linker } = setupApp();
		const sceneItem = makeItem({
			id: 'scn',
			type: 'Text',
			title: 'Scene',
		});
		const chapterItem = makeItem({
			id: 'ch',
			type: 'Folder',
			title: 'Chapter',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'draft',
			type: 'DraftFolder',
			children: [chapterItem],
		});
		const bundle = makeBundle({ binder: [draftFolder] });
		app.vault._addAdapterFile(
			'imports/test.scriv/Files/Data/scn/content.rtf',
			'{\\rtf1\\ansi Hello world.}'
		);
		app.vault._addAdapterFile(
			'imports/test.scriv/Files/Data/scn/synopsis.txt',
			'Quick exchange.'
		);

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData: makeFormData({
				destinationName: 'X',
				bundle,
			}),
		});
		expect(result.errors).toEqual([]);

		const sceneFile = app.vault.getFileByPath(
			'Draft Bench/X/Chapter/Scene.md'
		);
		expect(sceneFile).not.toBeNull();
		const sceneContent = await app.vault.read(sceneFile!);
		expect(sceneContent).toContain('Hello world.');

		const sceneFm = app.metadataCache.getFileCache(sceneFile!)?.frontmatter;
		expect(sceneFm?.['dbench-synopsis']).toBe('Quick exchange.');
		expect(sceneFm?.['scrivener-uuid']).toBe('scn');
	});
});

describe('executeImportPlan — frontmatter mappings', () => {
	it('maps Scrivener status via metadataMapping (existing -> use, new -> add to vocab)', async () => {
		const { app, settings, linker, saveCount } = setupApp();
		const sceneItem = makeItem({
			id: 's1',
			type: 'Text',
			title: 'Scene',
			statusId: '99',
		});
		const chapterItem = makeItem({
			id: 'c',
			type: 'Folder',
			title: 'Chapter',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'd',
			type: 'DraftFolder',
			children: [chapterItem],
		});
		const bundle = makeBundle({
			binder: [draftFolder],
			statuses: new Map([['99', 'First Draft']]),
		});

		const formData = makeFormData({ destinationName: 'X', bundle });
		formData.metadataMapping = {
			statuses: new Map([
				['99', { kind: 'new' as const, statusName: 'First Draft' }],
			]),
			labelKey: 'scrivener-label',
			customFields: new Map(),
		};

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {
				saveCount.n += 1;
			},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData,
		});

		expect(result.errors).toEqual([]);
		// New status got appended to vocab + saved.
		expect(settings.statusVocabulary).toContain('First Draft');
		expect(saveCount.n).toBe(1);

		const sceneFile = app.vault.getFileByPath('Draft Bench/X/Chapter/Scene.md');
		const sceneFm = app.metadataCache.getFileCache(sceneFile!)?.frontmatter;
		expect(sceneFm?.['dbench-status']).toBe('First Draft');
	});

	it('writes resolved keywords as tags + label under the configured label key', async () => {
		const { app, settings, linker } = setupApp();
		const sceneItem = makeItem({
			id: 's',
			type: 'Text',
			title: 'Scene',
			keywords: ['POV: Alice', 'Flashback'],
			labelId: '7',
		});
		const chapterItem = makeItem({
			id: 'c',
			type: 'Folder',
			title: 'Chapter',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'd',
			type: 'DraftFolder',
			children: [chapterItem],
		});
		const bundle = makeBundle({
			binder: [draftFolder],
			labels: new Map([['7', 'Red']]),
		});
		const formData = makeFormData({ destinationName: 'X', bundle });
		formData.metadataMapping = {
			statuses: new Map(),
			labelKey: 'scrivener-pov',
			customFields: new Map(),
		};

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData,
		});

		expect(result.errors).toEqual([]);
		const sceneFile = app.vault.getFileByPath('Draft Bench/X/Chapter/Scene.md');
		const fm = app.metadataCache.getFileCache(sceneFile!)?.frontmatter;
		expect(fm?.['tags']).toEqual(['POV: Alice', 'Flashback']);
		expect(fm?.['scrivener-pov']).toBe('Red');
	});

	it('writes custom metadata under the configured target keys, dropping when null', async () => {
		const { app, settings, linker } = setupApp();
		const sceneItem = makeItem({
			id: 's',
			type: 'Text',
			title: 'Scene',
			customMetaData: new Map([
				['povcharacter', 'Alice'],
				['mood', 'tense'],
			]),
		});
		const chapterItem = makeItem({
			id: 'c',
			type: 'Folder',
			title: 'Chapter',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'd',
			type: 'DraftFolder',
			children: [chapterItem],
		});
		const bundle = makeBundle({
			binder: [draftFolder],
			customMetaDataFields: new Map([
				[
					'povcharacter',
					{
						id: 'povcharacter',
						title: 'POV',
						fieldType: 'Text',
						listOptions: new Map(),
					},
				],
				[
					'mood',
					{
						id: 'mood',
						title: 'Mood',
						fieldType: 'Text',
						listOptions: new Map(),
					},
				],
			]),
		});
		const formData = makeFormData({ destinationName: 'X', bundle });
		formData.metadataMapping = {
			statuses: new Map(),
			labelKey: 'scrivener-label',
			customFields: new Map<string, string | null>([
				['povcharacter', 'scrivener-povcharacter'],
				['mood', null],
			]),
		};

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData,
		});
		expect(result.errors).toEqual([]);

		const fm = app.metadataCache.getFileCache(
			app.vault.getFileByPath('Draft Bench/X/Chapter/Scene.md')!
		)?.frontmatter;
		expect(fm?.['scrivener-povcharacter']).toBe('Alice');
		expect(fm?.['mood']).toBeUndefined();
	});

	it('coerces Checkbox custom fields to YAML booleans (Yes/No -> true/false)', async () => {
		const { app, settings, linker } = setupApp();
		const sceneItem = makeItem({
			id: 's',
			type: 'Text',
			title: 'Scene',
			customMetaData: new Map([['reviewed', 'Yes']]),
		});
		const chapterItem = makeItem({
			id: 'c',
			type: 'Folder',
			title: 'Chapter',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'd',
			type: 'DraftFolder',
			children: [chapterItem],
		});
		const bundle = makeBundle({
			binder: [draftFolder],
			customMetaDataFields: new Map([
				[
					'reviewed',
					{
						id: 'reviewed',
						title: 'Reviewed',
						fieldType: 'Checkbox',
						listOptions: new Map(),
					},
				],
			]),
		});
		const formData = makeFormData({ destinationName: 'X', bundle });
		formData.metadataMapping = {
			statuses: new Map(),
			labelKey: 'scrivener-label',
			customFields: new Map<string, string | null>([
				['reviewed', 'scrivener-reviewed'],
			]),
		};

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData,
		});
		expect(result.errors).toEqual([]);

		const fm = app.metadataCache.getFileCache(
			app.vault.getFileByPath('Draft Bench/X/Chapter/Scene.md')!
		)?.frontmatter;
		expect(fm?.['scrivener-reviewed']).toBe(true);
	});

	it('resolves List custom fields via field.listOptions to the option title', async () => {
		const { app, settings, linker } = setupApp();
		const sceneItem = makeItem({
			id: 's',
			type: 'Text',
			title: 'Scene',
			customMetaData: new Map([['povmode', '2']]),
		});
		const chapterItem = makeItem({
			id: 'c',
			type: 'Folder',
			title: 'Chapter',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'd',
			type: 'DraftFolder',
			children: [chapterItem],
		});
		const bundle = makeBundle({
			binder: [draftFolder],
			customMetaDataFields: new Map([
				[
					'povmode',
					{
						id: 'povmode',
						title: 'POV mode',
						fieldType: 'List',
						listOptions: new Map([
							['1', 'First'],
							['2', 'Third limited'],
							['3', 'Omniscient'],
						]),
					},
				],
			]),
		});
		const formData = makeFormData({ destinationName: 'X', bundle });
		formData.metadataMapping = {
			statuses: new Map(),
			labelKey: 'scrivener-label',
			customFields: new Map<string, string | null>([
				['povmode', 'scrivener-povmode'],
			]),
		};

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData,
		});
		expect(result.errors).toEqual([]);

		const fm = app.metadataCache.getFileCache(
			app.vault.getFileByPath('Draft Bench/X/Chapter/Scene.md')!
		)?.frontmatter;
		expect(fm?.['scrivener-povmode']).toBe('Third limited');
	});

	it('coerces Date custom fields to ISO YYYY-MM-DD when parseable', async () => {
		const { app, settings, linker } = setupApp();
		const sceneItem = makeItem({
			id: 's',
			type: 'Text',
			title: 'Scene',
			customMetaData: new Map([
				['lastrevised', '2026-05-05 00:00:00 -0700'],
			]),
		});
		const chapterItem = makeItem({
			id: 'c',
			type: 'Folder',
			title: 'Chapter',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'd',
			type: 'DraftFolder',
			children: [chapterItem],
		});
		const bundle = makeBundle({
			binder: [draftFolder],
			customMetaDataFields: new Map([
				[
					'lastrevised',
					{
						id: 'lastrevised',
						title: 'Last revised',
						fieldType: 'Date',
						listOptions: new Map(),
					},
				],
			]),
		});
		const formData = makeFormData({ destinationName: 'X', bundle });
		formData.metadataMapping = {
			statuses: new Map(),
			labelKey: 'scrivener-label',
			customFields: new Map<string, string | null>([
				['lastrevised', 'scrivener-lastrevised'],
			]),
		};

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData,
		});
		expect(result.errors).toEqual([]);

		const fm = app.metadataCache.getFileCache(
			app.vault.getFileByPath('Draft Bench/X/Chapter/Scene.md')!
		)?.frontmatter;
		// Scrivener's date is 2026-05-05 00:00:00 -0700 -> midnight
		// Pacific = 07:00 UTC same day, so ISO date is 2026-05-05.
		expect(fm?.['scrivener-lastrevised']).toBe('2026-05-05');
	});

	it('writes scrivener-include-in-compile: false when the source flag was off', async () => {
		const { app, settings, linker } = setupApp();
		const sceneItem = makeItem({
			id: 's',
			type: 'Text',
			title: 'Scene',
			includeInCompile: false,
		});
		const chapterItem = makeItem({
			id: 'c',
			type: 'Folder',
			title: 'Chapter',
			children: [sceneItem],
		});
		const draftFolder = makeItem({
			id: 'd',
			type: 'DraftFolder',
			children: [chapterItem],
		});
		const bundle = makeBundle({ binder: [draftFolder] });

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData: makeFormData({ destinationName: 'X', bundle }),
		});
		expect(result.errors).toEqual([]);

		const fm = app.metadataCache.getFileCache(
			app.vault.getFileByPath('Draft Bench/X/Chapter/Scene.md')!
		)?.frontmatter;
		expect(fm?.['scrivener-include-in-compile']).toBe(false);
	});
});

describe('executeImportPlan — extras-above and extras-below', () => {
	it('writes scrivener-part frontmatter on chapters under extras-above', async () => {
		const { app, settings, linker } = setupApp();
		const draftFolder = makeItem({
			id: 'd',
			type: 'DraftFolder',
			children: [
				makeItem({
					id: 'p1',
					type: 'Folder',
					title: 'Part One',
					children: [
						makeItem({
							id: 'c',
							type: 'Folder',
							title: 'Chapter 1',
							children: [makeItem({ id: 's', type: 'Text', title: 'Scene' })],
						}),
					],
				}),
			],
		});
		const bundle = makeBundle({ binder: [draftFolder] });

		const result = await executeImportPlan({
			app,
			settings,
			linker,
			saveSettings: async () => {},
			bundle,
			bundleRootPath: 'imports/test.scriv',
			formData: makeFormData({ destinationName: 'X', bundle }),
		});
		expect(result.errors).toEqual([]);

		const chapterFile = app.vault.getFileByPath(
			'Draft Bench/X/Chapter 1.md'
		);
		const chapterFm = app.metadataCache.getFileCache(chapterFile!)?.frontmatter;
		expect(chapterFm?.['scrivener-part']).toBe('Part One');
	});
});
