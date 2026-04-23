import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	createCompilePreset,
	duplicateCompilePreset,
	resolveCompilePresetPaths,
} from '../../src/core/compile-presets';
import {
	findCompilePresets,
	findCompilePresetsOfProject,
	type CompilePresetNote,
	type ProjectNote,
} from '../../src/core/discovery';
import { createProject } from '../../src/core/projects';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';
import { isValidDbenchId } from '../../src/core/id';

/**
 * Build a project and return its ProjectNote shape. Wraps the common
 * create + re-fetch dance required because `createProject` returns a
 * raw TFile + id; discovery + integrity want the typed ProjectNote.
 */
async function seedProject(
	app: App,
	settings: DraftBenchSettings,
	title: string
): Promise<ProjectNote> {
	const { file } = await createProject(app, settings, { title, shape: 'folder' });
	const fm = app.metadataCache.getFileCache(file)!.frontmatter!;
	return { file, frontmatter: fm as unknown as ProjectNote['frontmatter'] };
}

describe('resolveCompilePresetPaths', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('places the preset under <project folder>/Compile Presets/ for a folder project', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const paths = resolveCompilePresetPaths(project, 'Workshop');
		expect(paths.folderPath).toBe('Draft Bench/My Novel/Compile Presets');
		expect(paths.filePath).toBe(
			'Draft Bench/My Novel/Compile Presets/Workshop.md'
		);
	});

	it('trims leading and trailing whitespace from the preset name', async () => {
		const project = await seedProject(app, settings, 'Novel');
		const paths = resolveCompilePresetPaths(project, '  Final manuscript  ');
		expect(paths.filePath).toBe(
			'Draft Bench/Novel/Compile Presets/Final manuscript.md'
		);
	});

	it('rejects an empty preset name', async () => {
		const project = await seedProject(app, settings, 'Novel');
		expect(() => resolveCompilePresetPaths(project, '')).toThrow(/empty/i);
		expect(() => resolveCompilePresetPaths(project, '   ')).toThrow(/empty/i);
	});

	it('rejects preset names with forbidden filename characters', async () => {
		const project = await seedProject(app, settings, 'Novel');
		expect(() => resolveCompilePresetPaths(project, 'Bad/Name')).toThrow(
			/not allowed/i
		);
		expect(() => resolveCompilePresetPaths(project, 'Has:Colon')).toThrow(
			/not allowed/i
		);
	});
});

describe('createCompilePreset', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('creates a preset note with all defaults stamped', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const { file, presetId } = await createCompilePreset(app, {
			project,
			name: 'Workshop',
		});

		expect(file.path).toBe(
			'Draft Bench/My Novel/Compile Presets/Workshop.md'
		);
		expect(isValidDbenchId(presetId)).toBe(true);
		expect(
			app.vault.getAbstractFileByPath('Draft Bench/My Novel/Compile Presets')
		).not.toBeNull();

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('compile-preset');
		expect(fm?.['dbench-id']).toBe(presetId);
		expect(fm?.['dbench-project']).toBe('[[My Novel]]');
		expect(fm?.['dbench-project-id']).toBe(
			project.frontmatter['dbench-id']
		);
		expect(fm?.['dbench-schema-version']).toBe(1);
		expect(fm?.['dbench-compile-format']).toBe('md');
		expect(fm?.['dbench-compile-output']).toBe('vault');
		expect(fm?.['dbench-compile-scene-source']).toBe('auto');
		expect(fm?.['dbench-compile-heading-scope']).toBe('draft');
		expect(fm?.['dbench-compile-include-section-breaks']).toBe(true);
		expect(fm?.['dbench-compile-scene-statuses']).toEqual([]);
		expect(fm?.['dbench-last-compiled-at']).toBe('');
		expect(fm?.['dbench-last-chapter-hashes']).toEqual([]);
	});

	it('applies the caller format override', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const { file } = await createCompilePreset(app, {
			project,
			name: 'Submission',
			format: 'pdf',
		});
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-compile-format']).toBe('pdf');
	});

	it('refuses to overwrite an existing preset with the same name', async () => {
		const project = await seedProject(app, settings, 'Novel');
		await createCompilePreset(app, { project, name: 'Workshop' });

		await expect(
			createCompilePreset(app, { project, name: 'Workshop' })
		).rejects.toThrow(/already exists/i);
	});

	it('propagates resolveCompilePresetPaths errors', async () => {
		const project = await seedProject(app, settings, 'Novel');
		await expect(
			createCompilePreset(app, { project, name: '' })
		).rejects.toThrow(/empty/i);
		await expect(
			createCompilePreset(app, { project, name: 'Bad/Name' })
		).rejects.toThrow(/not allowed/i);
	});

	it('creates a discoverable preset (findCompilePresets sees it after creation)', async () => {
		const project = await seedProject(app, settings, 'Novel');
		expect(findCompilePresets(app)).toEqual([]);
		await createCompilePreset(app, { project, name: 'Workshop' });
		const presets = findCompilePresets(app);
		expect(presets).toHaveLength(1);
		expect(presets[0].file.basename).toBe('Workshop');
	});

	it('filters by project via findCompilePresetsOfProject', async () => {
		const novel = await seedProject(app, settings, 'Novel');
		const collection = await seedProject(app, settings, 'Collection');

		await createCompilePreset(app, { project: novel, name: 'Workshop' });
		await createCompilePreset(app, { project: novel, name: 'Final' });
		await createCompilePreset(app, { project: collection, name: 'Sample' });

		const novelPresets = findCompilePresetsOfProject(
			app,
			novel.frontmatter['dbench-id']
		);
		expect(novelPresets.map((p) => p.file.basename).sort()).toEqual([
			'Final',
			'Workshop',
		]);

		const collectionPresets = findCompilePresetsOfProject(
			app,
			collection.frontmatter['dbench-id']
		);
		expect(collectionPresets).toHaveLength(1);
		expect(collectionPresets[0].file.basename).toBe('Sample');
	});

	it('returns [] from findCompilePresetsOfProject for an empty project id', async () => {
		expect(findCompilePresetsOfProject(app, '')).toEqual([]);
	});
});

describe('duplicateCompilePreset', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	async function seedPreset(name: string): Promise<CompilePresetNote> {
		const project = await seedProject(app, settings, 'Novel');
		const { file } = await createCompilePreset(app, {
			project,
			name,
			format: 'pdf',
		});
		const fm = app.metadataCache.getFileCache(file)!.frontmatter!;
		return { file, frontmatter: fm as CompilePresetNote['frontmatter'] };
	}

	it('names the duplicate "<source> (copy)" on first duplicate', async () => {
		const source = await seedPreset('Workshop');
		const duplicate = await duplicateCompilePreset(app, source);
		expect(duplicate.basename).toBe('Workshop (copy)');
		expect(duplicate.parent?.path).toBe(source.file.parent?.path);
	});

	it('bumps the counter on successive duplicates', async () => {
		const source = await seedPreset('Workshop');
		const first = await duplicateCompilePreset(app, source);
		// Re-read the duplicated preset as a CompilePresetNote so we can
		// duplicate it (or the source again).
		const firstFm = app.metadataCache.getFileCache(first)!.frontmatter!;
		const firstNote: CompilePresetNote = {
			file: first,
			frontmatter: firstFm as CompilePresetNote['frontmatter'],
		};

		const second = await duplicateCompilePreset(app, source);
		const third = await duplicateCompilePreset(app, firstNote);

		expect(second.basename).toBe('Workshop (copy 2)');
		expect(third.basename).toBe('Workshop (copy) (copy)');
	});

	it('regenerates dbench-id while preserving compile-* config', async () => {
		const source = await seedPreset('Workshop');
		const originalId = source.frontmatter['dbench-id'];
		const originalFormat = source.frontmatter['dbench-compile-format'];

		const dup = await duplicateCompilePreset(app, source);
		const dupFm = app.metadataCache.getFileCache(dup)?.frontmatter;

		expect(dupFm?.['dbench-id']).not.toBe(originalId);
		expect(isValidDbenchId(dupFm?.['dbench-id'])).toBe(true);
		expect(dupFm?.['dbench-compile-format']).toBe(originalFormat);
		expect(dupFm?.['dbench-project-id']).toBe(
			source.frontmatter['dbench-project-id']
		);
	});

	it('clears compile state on the duplicate', async () => {
		const source = await seedPreset('Workshop');
		// Simulate a previously-run compile on the source.
		await app.fileManager.processFrontMatter(source.file, (fm) => {
			fm['dbench-last-compiled-at'] = '2026-04-23T12:00:00.000Z';
			fm['dbench-last-output-path'] = '/tmp/Workshop.pdf';
			fm['dbench-last-chapter-hashes'] = ['abc:deadbeef'];
		});
		const refreshedFm = app.metadataCache.getFileCache(source.file)!
			.frontmatter!;
		const refreshedSource: CompilePresetNote = {
			file: source.file,
			frontmatter: refreshedFm as CompilePresetNote['frontmatter'],
		};

		const dup = await duplicateCompilePreset(app, refreshedSource);
		const dupFm = app.metadataCache.getFileCache(dup)?.frontmatter;

		expect(dupFm?.['dbench-last-compiled-at']).toBe('');
		expect(dupFm?.['dbench-last-output-path']).toBe('');
		expect(dupFm?.['dbench-last-chapter-hashes']).toEqual([]);
	});

	it('produces a discoverable preset (findCompilePresets picks up both)', async () => {
		const source = await seedPreset('Workshop');
		await duplicateCompilePreset(app, source);
		const presets = findCompilePresets(app);
		expect(presets).toHaveLength(2);
		const names = presets.map((p) => p.file.basename).sort();
		expect(names).toEqual(['Workshop', 'Workshop (copy)']);
	});
});
