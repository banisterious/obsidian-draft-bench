import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { runCompile } from '../../../src/core/compile/run';
import type {
	CompilePresetNote,
	ProjectNote,
} from '../../../src/core/discovery';
import type { CompilePresetFrontmatter } from '../../../src/model/compile-preset';

/**
 * End-to-end tests for the dispatcher. Renderer internals are covered
 * by their own suites; these tests assert that the dispatcher:
 *
 * - Resolves the project via the preset's id companion and returns
 *   `no-project` when the lookup fails.
 * - Short-circuits to `empty` when `CompileService.generate` produces
 *   no scenes (without touching state or any renderer).
 * - Routes md/vault, md/disk, odt/disk, pdf/disk to the right renderer.
 * - Persists compile state only on a successful write.
 * - Surfaces user-cancel as `canceled` with state intact.
 * - Wraps thrown errors as `error` outcomes.
 */

interface SeedOptions {
	format?: CompilePresetFrontmatter['dbench-compile-format'];
	output?: CompilePresetFrontmatter['dbench-compile-output'];
	projectId?: string;
}

async function seedProject(
	app: App,
	basename: string,
	id: string
): Promise<ProjectNote> {
	const file = await app.vault.create(`Draft Bench/${basename}/${basename}.md`, '');
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'project',
		'dbench-id': id,
		'dbench-project': `[[${basename}]]`,
		'dbench-project-id': id,
		'dbench-project-shape': 'folder',
		'dbench-status': 'draft',
		'dbench-scenes': [],
		'dbench-scene-ids': [],
		'dbench-compile-presets': [],
		'dbench-compile-preset-ids': [],
	});
	const fm = app.metadataCache.getFileCache(file)!.frontmatter!;
	return { file, frontmatter: fm as unknown as ProjectNote['frontmatter'] };
}

async function seedScene(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		order: number;
		body: string;
		status?: string;
	}
): Promise<TFile> {
	const file = await app.vault.create(options.path, options.body);
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'scene',
		'dbench-id': options.id,
		'dbench-project': `[[${options.projectTitle}]]`,
		'dbench-project-id': options.projectId,
		'dbench-order': options.order,
		'dbench-status': options.status ?? 'draft',
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	});
	return file;
}

async function seedPreset(
	app: App,
	basename: string,
	options: SeedOptions = {}
): Promise<CompilePresetNote> {
	const path = `Draft Bench/Novel/Compile Presets/${basename}.md`;
	const file = await app.vault.create(path, '');
	const fm: CompilePresetFrontmatter = {
		'dbench-type': 'compile-preset',
		'dbench-id': `prs-${basename}-001`,
		'dbench-project': '[[Novel]]',
		'dbench-project-id': options.projectId ?? 'prj-001',
		'dbench-schema-version': 1,
		'dbench-compile-title': '',
		'dbench-compile-subtitle': '',
		'dbench-compile-author': '',
		'dbench-compile-date-format': 'iso',
		'dbench-compile-scene-source': 'auto',
		'dbench-compile-scene-statuses': [],
		'dbench-compile-scene-excludes': [],
		'dbench-compile-format': options.format ?? 'md',
		'dbench-compile-output': options.output ?? 'vault',
		'dbench-compile-page-size': 'letter',
		'dbench-compile-include-cover': false,
		'dbench-compile-include-toc': false,
		'dbench-compile-chapter-numbering': 'none',
		'dbench-compile-include-section-breaks': true,
		'dbench-compile-heading-scope': 'draft',
		'dbench-compile-frontmatter': 'strip',
		'dbench-compile-wikilinks': 'display-text',
		'dbench-compile-embeds': 'strip',
		'dbench-compile-dinkuses': 'preserve',
		'dbench-last-compiled-at': '',
		'dbench-last-output-path': '',
		'dbench-last-chapter-hashes': [],
	};
	app.metadataCache._setFrontmatter(file, fm as unknown as Record<string, unknown>);
	return {
		file,
		frontmatter: app.metadataCache.getFileCache(file)!
			.frontmatter! as unknown as CompilePresetFrontmatter,
	};
}

function readFm(app: App, file: TFile): Record<string, unknown> {
	return (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<
		string,
		unknown
	>;
}

describe('runCompile: project resolution', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns no-project when the preset has an empty project id', async () => {
		const preset = await seedPreset(app, 'Orphan', { projectId: '' });

		const outcome = await runCompile(app, preset);

		expect(outcome.kind).toBe('no-project');
	});

	it('returns no-project when the project id points at nothing', async () => {
		const preset = await seedPreset(app, 'Dangling', {
			projectId: 'prj-does-not-exist',
		});

		const outcome = await runCompile(app, preset);

		expect(outcome.kind).toBe('no-project');
	});

	it('returns no-project when the id resolves to a non-project note', async () => {
		// Seed a scene under the same id the preset will use.
		await seedScene(app, {
			path: 'Novel/Scene.md',
			id: 'prj-wrong-type',
			projectId: 'prj-whatever',
			projectTitle: 'Novel',
			order: 1,
			body: 'body',
		});
		const preset = await seedPreset(app, 'Mistyped', {
			projectId: 'prj-wrong-type',
		});

		const outcome = await runCompile(app, preset);

		expect(outcome.kind).toBe('no-project');
	});
});

describe('runCompile: empty result short-circuit', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns empty when the project has no scenes, without touching state', async () => {
		const project = await seedProject(app, 'Novel', 'prj-001');
		const preset = await seedPreset(app, 'Workshop', {
			projectId: project.frontmatter['dbench-id'],
		});

		const outcome = await runCompile(app, preset);

		expect(outcome.kind).toBe('empty');
		expect(readFm(app, preset.file)['dbench-last-compiled-at']).toBe('');
		expect(readFm(app, preset.file)['dbench-last-output-path']).toBe('');
	});

	it('returns empty when all scenes are filtered out', async () => {
		const project = await seedProject(app, 'Novel', 'prj-002');
		await seedScene(app, {
			path: 'Draft Bench/Novel/A.md',
			id: 'sc-a',
			projectId: 'prj-002',
			projectTitle: 'Novel',
			order: 1,
			body: 'one',
			status: 'draft',
		});
		const preset = await seedPreset(app, 'FinalOnly', {
			projectId: project.frontmatter['dbench-id'],
		});
		// Mutate in place so the cached frontmatter reference the runner
		// reads reflects the filter.
		(preset.frontmatter as unknown as Record<string, unknown>)[
			'dbench-compile-scene-statuses'
		] = ['final'];

		const outcome = await runCompile(app, preset);

		expect(outcome.kind).toBe('empty');
	});
});

describe('runCompile: md + vault', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('writes to <project folder>/Compiled and persists state', async () => {
		const project = await seedProject(app, 'Novel', 'prj-md-vault');
		await seedScene(app, {
			path: 'Draft Bench/Novel/Opening.md',
			id: 'sc-open',
			projectId: 'prj-md-vault',
			projectTitle: 'Novel',
			order: 1,
			body: 'Opening prose.',
		});
		const preset = await seedPreset(app, 'Workshop', {
			projectId: project.frontmatter['dbench-id'],
			format: 'md',
			output: 'vault',
		});

		const outcome = await runCompile(app, preset, {
			now: new Date('2026-04-23T12:00:00.000Z'),
		});

		expect(outcome.kind).toBe('success');
		if (outcome.kind !== 'success') return;
		expect(outcome.outputPath).toBe(
			'Draft Bench/Novel/Compiled/Workshop.md'
		);
		expect(outcome.scenesCompiled).toBe(1);
		expect(outcome.stripSummary.total).toBe(0);

		const written = app.vault.getAbstractFileByPath(outcome.outputPath);
		expect(written).not.toBeNull();

		const fm = readFm(app, preset.file);
		expect(fm['dbench-last-compiled-at']).toBe('2026-04-23T12:00:00.000Z');
		expect(fm['dbench-last-output-path']).toBe(outcome.outputPath);
		expect(Array.isArray(fm['dbench-last-chapter-hashes'])).toBe(true);
		expect((fm['dbench-last-chapter-hashes'] as string[]).length).toBe(1);
	});

	it('surfaces stripSummary on success when embeds were stripped', async () => {
		const project = await seedProject(app, 'Novel', 'prj-strip');
		await seedScene(app, {
			path: 'Draft Bench/Novel/A.md',
			id: 'sc-a',
			projectId: 'prj-strip',
			projectTitle: 'Novel',
			order: 1,
			body: 'Scene with ![[pic.png]] and ![[view.base]] and ![[Some Note]].',
		});
		const preset = await seedPreset(app, 'Workshop', {
			projectId: project.frontmatter['dbench-id'],
			format: 'md',
			output: 'vault',
		});

		const outcome = await runCompile(app, preset);

		expect(outcome.kind).toBe('success');
		if (outcome.kind !== 'success') return;
		expect(outcome.stripSummary.counts.image).toBe(1);
		expect(outcome.stripSummary.counts.base).toBe(1);
		expect(outcome.stripSummary.counts.note).toBe(1);
		expect(outcome.stripSummary.total).toBe(3);
	});
});

describe('runCompile: md + disk', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('writes via injected deps and persists state on success', async () => {
		const project = await seedProject(app, 'Novel', 'prj-md-disk');
		await seedScene(app, {
			path: 'Draft Bench/Novel/Opening.md',
			id: 'sc-open',
			projectId: 'prj-md-disk',
			projectTitle: 'Novel',
			order: 1,
			body: 'Opening.',
		});
		const preset = await seedPreset(app, 'Export', {
			projectId: 'prj-md-disk',
			format: 'md',
			output: 'disk',
		});

		const pickPath = vi.fn(async () => '/tmp/manuscript.md');
		const writeFile = vi.fn(async () => {});

		const outcome = await runCompile(app, preset, {
			mdDiskDeps: { pickPath, writeFile },
			now: new Date('2026-04-23T13:00:00.000Z'),
		});

		expect(outcome.kind).toBe('success');
		if (outcome.kind !== 'success') return;
		expect(outcome.outputPath).toBe('/tmp/manuscript.md');
		expect(writeFile).toHaveBeenCalledWith('/tmp/manuscript.md', expect.any(String));
		expect(readFm(app, preset.file)['dbench-last-output-path']).toBe(
			'/tmp/manuscript.md'
		);
	});

	it('returns canceled and leaves state untouched when pickPath returns null', async () => {
		const project = await seedProject(app, 'Novel', 'prj-md-cancel');
		await seedScene(app, {
			path: 'Draft Bench/Novel/A.md',
			id: 'sc-a',
			projectId: 'prj-md-cancel',
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		const preset = await seedPreset(app, 'Export', {
			projectId: 'prj-md-cancel',
			format: 'md',
			output: 'disk',
		});
		// Pre-seed a prior successful run.
		await app.fileManager.processFrontMatter(preset.file, (fm) => {
			fm['dbench-last-compiled-at'] = '2026-04-01T00:00:00.000Z';
			fm['dbench-last-output-path'] = '/tmp/previous.md';
		});

		const writeFile = vi.fn(async () => {});
		const outcome = await runCompile(app, preset, {
			mdDiskDeps: {
				pickPath: async () => null,
				writeFile,
			},
		});

		expect(outcome.kind).toBe('canceled');
		expect(writeFile).not.toHaveBeenCalled();
		const fm = readFm(app, preset.file);
		expect(fm['dbench-last-compiled-at']).toBe('2026-04-01T00:00:00.000Z');
		expect(fm['dbench-last-output-path']).toBe('/tmp/previous.md');
	});
});

describe('runCompile: odt + disk', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('routes to the ODT renderer and persists state on success', async () => {
		const project = await seedProject(app, 'Novel', 'prj-odt');
		await seedScene(app, {
			path: 'Draft Bench/Novel/A.md',
			id: 'sc-a',
			projectId: 'prj-odt',
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		const preset = await seedPreset(app, 'ODT', {
			projectId: 'prj-odt',
			format: 'odt',
			output: 'disk',
		});

		const writeFile = vi.fn(async () => {});
		const outcome = await runCompile(app, preset, {
			odtDiskDeps: {
				pickPath: async () => '/tmp/manuscript.odt',
				writeFile,
			},
			now: new Date('2026-04-23T14:00:00.000Z'),
		});

		expect(outcome.kind).toBe('success');
		if (outcome.kind !== 'success') return;
		expect(outcome.outputPath).toBe('/tmp/manuscript.odt');
		expect(writeFile).toHaveBeenCalledWith(
			'/tmp/manuscript.odt',
			expect.any(Uint8Array)
		);
	});

	it('returns canceled on ODT picker dismissal', async () => {
		const project = await seedProject(app, 'Novel', 'prj-odt-cancel');
		await seedScene(app, {
			path: 'Draft Bench/Novel/A.md',
			id: 'sc-a',
			projectId: 'prj-odt-cancel',
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		const preset = await seedPreset(app, 'ODT', {
			projectId: 'prj-odt-cancel',
			format: 'odt',
			output: 'disk',
		});

		const writeFile = vi.fn(async () => {});
		const outcome = await runCompile(app, preset, {
			odtDiskDeps: { pickPath: async () => null, writeFile },
		});

		expect(outcome.kind).toBe('canceled');
		expect(writeFile).not.toHaveBeenCalled();
	});
});

describe('runCompile: pdf + disk', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('routes to the PDF renderer via injected buildBytes', async () => {
		const project = await seedProject(app, 'Novel', 'prj-pdf');
		await seedScene(app, {
			path: 'Draft Bench/Novel/A.md',
			id: 'sc-a',
			projectId: 'prj-pdf',
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		const preset = await seedPreset(app, 'PDF', {
			projectId: 'prj-pdf',
			format: 'pdf',
			output: 'disk',
		});

		const buildBytes = vi.fn(async () => new Uint8Array([1, 2, 3]));
		const writeFile = vi.fn(async () => {});
		const outcome = await runCompile(app, preset, {
			pdfDiskDeps: {
				pickPath: async () => '/tmp/book.pdf',
				writeFile,
				buildBytes,
			},
			now: new Date('2026-04-23T15:00:00.000Z'),
		});

		expect(outcome.kind).toBe('success');
		expect(buildBytes).toHaveBeenCalledOnce();
		expect(writeFile).toHaveBeenCalledWith(
			'/tmp/book.pdf',
			expect.any(Uint8Array)
		);
		expect(readFm(app, preset.file)['dbench-last-output-path']).toBe(
			'/tmp/book.pdf'
		);
	});

	it('ignores output:vault for pdf (D-06 says pdf is disk-only)', async () => {
		const project = await seedProject(app, 'Novel', 'prj-pdf-vault');
		await seedScene(app, {
			path: 'Draft Bench/Novel/A.md',
			id: 'sc-a',
			projectId: 'prj-pdf-vault',
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		const preset = await seedPreset(app, 'PDF', {
			projectId: 'prj-pdf-vault',
			format: 'pdf',
			output: 'vault',
		});

		const pickPath = vi.fn(async () => '/tmp/book.pdf');
		const outcome = await runCompile(app, preset, {
			pdfDiskDeps: {
				pickPath,
				writeFile: async () => {},
				buildBytes: async () => new Uint8Array([1]),
			},
		});

		expect(outcome.kind).toBe('success');
		expect(pickPath).toHaveBeenCalled();
	});
});

describe('runCompile: error handling', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('wraps renderer exceptions as error outcomes without touching state', async () => {
		const project = await seedProject(app, 'Novel', 'prj-err');
		await seedScene(app, {
			path: 'Draft Bench/Novel/A.md',
			id: 'sc-a',
			projectId: 'prj-err',
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		const preset = await seedPreset(app, 'Export', {
			projectId: 'prj-err',
			format: 'md',
			output: 'disk',
		});

		const outcome = await runCompile(app, preset, {
			mdDiskDeps: {
				pickPath: async () => '/tmp/a.md',
				writeFile: async () => {
					throw new Error('disk is full');
				},
			},
		});

		expect(outcome.kind).toBe('error');
		if (outcome.kind !== 'error') return;
		expect(outcome.message).toContain('disk is full');
		expect(readFm(app, preset.file)['dbench-last-output-path']).toBe('');
	});
});
