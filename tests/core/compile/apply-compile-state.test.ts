import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { applyCompileState } from '../../../src/core/compile/apply-compile-state';
import type { CompilePresetNote } from '../../../src/core/discovery';

async function seedPreset(app: App): Promise<CompilePresetNote> {
	const file = await app.vault.create(
		'Draft Bench/Novel/Compile Presets/Workshop.md',
		''
	);
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'compile-preset',
		'dbench-id': 'prs-001',
		'dbench-project': '[[Novel]]',
		'dbench-project-id': 'prj-001',
		'dbench-schema-version': 1,
		'dbench-compile-format': 'md',
		'dbench-compile-output': 'vault',
		'dbench-last-compiled-at': '',
		'dbench-last-output-path': '',
		'dbench-last-chapter-hashes': [],
	});
	return {
		file,
		frontmatter: app.metadataCache.getFileCache(file)!
			.frontmatter! as unknown as CompilePresetNote['frontmatter'],
	};
}

function readFm(app: App, file: TFile): Record<string, unknown> {
	return (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<
		string,
		unknown
	>;
}

describe('applyCompileState', () => {
	let app: App;
	let preset: CompilePresetNote;

	beforeEach(async () => {
		app = new App();
		preset = await seedPreset(app);
	});

	it('writes all three last-compile fields in one processFrontMatter call', async () => {
		await applyCompileState(app, preset, {
			outputPath: 'Draft Bench/Novel/Compiled/Workshop.md',
			chapterHashes: ['sc-a:deadbeef', 'sc-b:cafebabe'],
			now: new Date('2026-04-23T10:00:00.000Z'),
		});

		const fm = readFm(app, preset.file);
		expect(fm['dbench-last-compiled-at']).toBe('2026-04-23T10:00:00.000Z');
		expect(fm['dbench-last-output-path']).toBe(
			'Draft Bench/Novel/Compiled/Workshop.md'
		);
		expect(fm['dbench-last-chapter-hashes']).toEqual([
			'sc-a:deadbeef',
			'sc-b:cafebabe',
		]);
	});

	it('overwrites any prior compile state', async () => {
		await applyCompileState(app, preset, {
			outputPath: '/Users/w/old.md',
			chapterHashes: ['sc-a:aaaaaaaa'],
			now: new Date('2026-04-01T00:00:00.000Z'),
		});

		await applyCompileState(app, preset, {
			outputPath: '/Users/w/new.md',
			chapterHashes: ['sc-a:bbbbbbbb', 'sc-b:cccccccc'],
			now: new Date('2026-04-23T12:00:00.000Z'),
		});

		const fm = readFm(app, preset.file);
		expect(fm['dbench-last-compiled-at']).toBe('2026-04-23T12:00:00.000Z');
		expect(fm['dbench-last-output-path']).toBe('/Users/w/new.md');
		expect(fm['dbench-last-chapter-hashes']).toEqual([
			'sc-a:bbbbbbbb',
			'sc-b:cccccccc',
		]);
	});

	it('preserves non-state preset fields', async () => {
		const before = readFm(app, preset.file);

		await applyCompileState(app, preset, {
			outputPath: 'out.md',
			chapterHashes: [],
			now: new Date('2026-04-23T10:00:00.000Z'),
		});

		const after = readFm(app, preset.file);
		expect(after['dbench-id']).toBe(before['dbench-id']);
		expect(after['dbench-project']).toBe(before['dbench-project']);
		expect(after['dbench-project-id']).toBe(before['dbench-project-id']);
		expect(after['dbench-compile-format']).toBe(before['dbench-compile-format']);
	});

	it('defaults `now` to the real current time when omitted', async () => {
		const before = Date.now();
		await applyCompileState(app, preset, {
			outputPath: 'out.md',
			chapterHashes: [],
		});
		const after = Date.now();

		const stamped = readFm(app, preset.file)['dbench-last-compiled-at'] as string;
		const stampedMs = Date.parse(stamped);
		expect(stampedMs).toBeGreaterThanOrEqual(before);
		expect(stampedMs).toBeLessThanOrEqual(after);
	});

	it('writes an empty chapterHashes array unchanged', async () => {
		await applyCompileState(app, preset, {
			outputPath: 'out.md',
			chapterHashes: [],
			now: new Date('2026-04-23T10:00:00.000Z'),
		});

		const fm = readFm(app, preset.file);
		expect(fm['dbench-last-chapter-hashes']).toEqual([]);
	});
});
