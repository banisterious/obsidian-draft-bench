import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	compiledFolderFor,
	renderMdToDisk,
	renderMdToVault,
	type MdDiskDeps,
} from '../../../src/core/compile/render-md';
import type { CompileResult } from '../../../src/core/compile-service';
import type {
	CompilePresetNote,
	ProjectNote,
} from '../../../src/core/discovery';

function makeProject(path: string): ProjectNote {
	const slash = path.lastIndexOf('/');
	const basename = slash < 0 ? path.replace(/\.md$/, '') : path.slice(slash + 1).replace(/\.md$/, '');
	const file = new TFile({
		path,
		basename,
		extension: 'md',
		stat: { mtime: 0, ctime: 0, size: 0 },
	});
	return {
		file,
		frontmatter: {
			'dbench-type': 'project',
			'dbench-id': 'prj-001',
			'dbench-project': `[[${basename}]]`,
			'dbench-project-id': 'prj-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-compile-presets': [],
			'dbench-compile-preset-ids': [],
		},
	};
}

function makePreset(path: string): CompilePresetNote {
	const basename = path.split('/').pop()!.replace(/\.md$/, '');
	const file = new TFile({
		path,
		basename,
		extension: 'md',
		stat: { mtime: 0, ctime: 0, size: 0 },
	});
	return {
		file,
		// Minimal fields used by the renderer; the full shape is
		// exercised elsewhere.
		frontmatter: {
			'dbench-type': 'compile-preset',
			'dbench-id': 'prs-001',
			'dbench-project': '[[My Novel]]',
			'dbench-project-id': 'prj-001',
			'dbench-schema-version': 1,
			'dbench-compile-title': '',
			'dbench-compile-subtitle': '',
			'dbench-compile-author': '',
			'dbench-compile-date-format': 'iso',
			'dbench-compile-scene-source': 'auto',
			'dbench-compile-scene-statuses': [],
			'dbench-compile-scene-excludes': [],
			'dbench-compile-format': 'md',
			'dbench-compile-output': 'vault',
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
		},
	};
}

function makeResult(markdown: string): CompileResult {
	return {
		markdown,
		scenesCompiled: markdown.length > 0 ? 1 : 0,
		scenesSkipped: 0,
		warnings: [],
		errors: [],
		chapterHashes: [],
	};
}

describe('compiledFolderFor', () => {
	it('returns `Compiled` at the vault root for root-level project notes', () => {
		const project = makeProject('Flash.md');
		expect(compiledFolderFor(project)).toBe('Compiled');
	});

	it('appends `Compiled` to the project note\'s parent folder', () => {
		const project = makeProject('Draft Bench/My Novel/My Novel.md');
		expect(compiledFolderFor(project)).toBe(
			'Draft Bench/My Novel/Compiled'
		);
	});

	it('handles deeply nested project notes', () => {
		const project = makeProject(
			'Writing/Fiction/Novellas/The Salt Road/The Salt Road.md'
		);
		expect(compiledFolderFor(project)).toBe(
			'Writing/Fiction/Novellas/The Salt Road/Compiled'
		);
	});
});

describe('renderMdToVault', () => {
	let app: App;
	let project: ProjectNote;
	let preset: CompilePresetNote;

	beforeEach(() => {
		app = new App();
		project = makeProject('Draft Bench/My Novel/My Novel.md');
		preset = makePreset(
			'Draft Bench/My Novel/Compile Presets/Workshop.md'
		);
	});

	it('creates the Compiled folder on first compile and writes the file', async () => {
		const result = await renderMdToVault(
			app,
			project,
			preset,
			makeResult('# My Novel\n\nProse.')
		);

		expect(result.path).toBe('Draft Bench/My Novel/Compiled/Workshop.md');
		expect(result.overwritten).toBe(false);
		const written = app.vault.getAbstractFileByPath(result.path);
		expect(written).toBeInstanceOf(TFile);
		expect(await app.vault.read(written as TFile)).toBe('# My Novel\n\nProse.');
	});

	it('overwrites an existing compiled file on re-compile', async () => {
		await renderMdToVault(app, project, preset, makeResult('first'));
		const second = await renderMdToVault(
			app,
			project,
			preset,
			makeResult('second')
		);

		expect(second.overwritten).toBe(true);
		const written = app.vault.getAbstractFileByPath(second.path);
		expect(await app.vault.read(written as TFile)).toBe('second');
	});

	it('writes an empty file when compile produced no markdown', async () => {
		const result = await renderMdToVault(app, project, preset, makeResult(''));
		const written = app.vault.getAbstractFileByPath(result.path);
		expect(await app.vault.read(written as TFile)).toBe('');
	});

	it('writes to Compiled/ at the vault root for single-scene projects at the root', async () => {
		const flashProject = makeProject('Flash.md');
		const flashPreset = makePreset('Compile Presets/Submission.md');
		const result = await renderMdToVault(
			app,
			flashProject,
			flashPreset,
			makeResult('# Flash\n\nShort.')
		);
		expect(result.path).toBe('Compiled/Submission.md');
		const written = app.vault.getAbstractFileByPath(result.path);
		expect(await app.vault.read(written as TFile)).toBe('# Flash\n\nShort.');
	});

	it('reuses an existing Compiled folder without re-creating it', async () => {
		// Pre-seed the folder; the renderer should not throw.
		await app.vault.createFolder('Draft Bench/My Novel/Compiled');
		const result = await renderMdToVault(
			app,
			project,
			preset,
			makeResult('content')
		);
		expect(result.path).toBe('Draft Bench/My Novel/Compiled/Workshop.md');
	});
});

describe('renderMdToDisk', () => {
	let preset: CompilePresetNote;

	beforeEach(() => {
		preset = makePreset('Compile Presets/Workshop.md');
	});

	it('writes to the chosen path and returns it', async () => {
		const writeFile = vi.fn().mockResolvedValue(undefined);
		const deps: MdDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/tmp/out.md'),
			writeFile,
		};

		const result = await renderMdToDisk(
			preset,
			makeResult('# Manuscript\n\nBody.'),
			deps
		);

		expect(result).toEqual({ kind: 'written', path: '/tmp/out.md' });
		expect(deps.pickPath).toHaveBeenCalledWith({ defaultName: 'Workshop.md' });
		expect(writeFile).toHaveBeenCalledWith('/tmp/out.md', '# Manuscript\n\nBody.');
	});

	it('returns kind=canceled when the user dismisses the save dialog', async () => {
		const writeFile = vi.fn();
		const deps: MdDiskDeps = {
			pickPath: vi.fn().mockResolvedValue(null),
			writeFile,
		};

		const result = await renderMdToDisk(preset, makeResult('body'), deps);

		expect(result).toEqual({ kind: 'canceled' });
		expect(writeFile).not.toHaveBeenCalled();
	});

	it('propagates write errors to the caller', async () => {
		const deps: MdDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/read-only/out.md'),
			writeFile: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
		};

		await expect(
			renderMdToDisk(preset, makeResult('body'), deps)
		).rejects.toThrow('EACCES');
	});

	it('passes the preset basename with .md extension as the default filename', async () => {
		const fancyPreset = makePreset('Compile Presets/Submission Manuscript.md');
		const deps: MdDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/out.md'),
			writeFile: vi.fn().mockResolvedValue(undefined),
		};

		await renderMdToDisk(fancyPreset, makeResult('x'), deps);

		expect(deps.pickPath).toHaveBeenCalledWith({
			defaultName: 'Submission Manuscript.md',
		});
	});
});
