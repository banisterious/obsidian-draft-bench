import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	compiledFolderFor,
	writeCompiledFile,
} from '../../../src/core/compile/vault-output';
import type {
	CompilePresetNote,
	ProjectNote,
} from '../../../src/core/discovery';

function makeProject(path: string): ProjectNote {
	const slash = path.lastIndexOf('/');
	const basename = slash < 0
		? path.replace(/\.md$/, '')
		: path.slice(slash + 1).replace(/\.md$/, '');
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
			'dbench-compile-format': 'pdf',
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

describe('compiledFolderFor (vault-output)', () => {
	it('returns Compiled at the vault root for root-level project notes', () => {
		expect(compiledFolderFor(makeProject('Flash.md'))).toBe('Compiled');
	});

	it('appends Compiled to a nested project note\'s parent folder', () => {
		expect(
			compiledFolderFor(makeProject('Draft Bench/My Novel/My Novel.md'))
		).toBe('Draft Bench/My Novel/Compiled');
	});
});

describe('writeCompiledFile (string content)', () => {
	let app: App;
	let project: ProjectNote;
	let preset: CompilePresetNote;

	beforeEach(() => {
		app = new App();
		project = makeProject('Draft Bench/My Novel/My Novel.md');
		preset = makePreset('Draft Bench/My Novel/Compile Presets/Workshop.md');
	});

	it('creates the Compiled folder and writes string content on first call', async () => {
		const r = await writeCompiledFile(app, project, preset, 'md', '# Body');

		expect(r.path).toBe('Draft Bench/My Novel/Compiled/Workshop.md');
		expect(r.overwritten).toBe(false);
		const written = app.vault.getAbstractFileByPath(r.path);
		expect(written).toBeInstanceOf(TFile);
		expect(await app.vault.read(written as TFile)).toBe('# Body');
	});

	it('overwrites an existing string file on re-write', async () => {
		await writeCompiledFile(app, project, preset, 'md', 'first');
		const r = await writeCompiledFile(app, project, preset, 'md', 'second');

		expect(r.overwritten).toBe(true);
		expect(
			await app.vault.read(app.vault.getAbstractFileByPath(r.path) as TFile)
		).toBe('second');
	});
});

describe('writeCompiledFile (binary content)', () => {
	let app: App;
	let project: ProjectNote;
	let preset: CompilePresetNote;

	beforeEach(() => {
		app = new App();
		project = makeProject('Draft Bench/My Novel/My Novel.md');
		preset = makePreset('Draft Bench/My Novel/Compile Presets/Workshop.md');
	});

	it('writes Uint8Array content via createBinary on first call', async () => {
		const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF" magic
		const r = await writeCompiledFile(app, project, preset, 'pdf', bytes);

		expect(r.path).toBe('Draft Bench/My Novel/Compiled/Workshop.pdf');
		expect(r.overwritten).toBe(false);
		const written = app.vault.getAbstractFileByPath(r.path);
		expect(written).toBeInstanceOf(TFile);
		const readBack = new Uint8Array(
			await app.vault.readBinary(written as TFile)
		);
		expect(Array.from(readBack)).toEqual([0x25, 0x50, 0x44, 0x46]);
	});

	it('writes ArrayBuffer content directly without re-slicing', async () => {
		const buf = new Uint8Array([0x50, 0x4b]).buffer; // "PK" zip magic
		const r = await writeCompiledFile(app, project, preset, 'odt', buf);

		expect(r.path).toBe('Draft Bench/My Novel/Compiled/Workshop.odt');
		const readBack = new Uint8Array(
			await app.vault.readBinary(
				app.vault.getAbstractFileByPath(r.path) as TFile
			)
		);
		expect(Array.from(readBack)).toEqual([0x50, 0x4b]);
	});

	it('overwrites an existing binary file on re-write', async () => {
		await writeCompiledFile(
			app,
			project,
			preset,
			'pdf',
			new Uint8Array([0x01, 0x02])
		);
		const r = await writeCompiledFile(
			app,
			project,
			preset,
			'pdf',
			new Uint8Array([0x03, 0x04, 0x05])
		);

		expect(r.overwritten).toBe(true);
		const readBack = new Uint8Array(
			await app.vault.readBinary(
				app.vault.getAbstractFileByPath(r.path) as TFile
			)
		);
		expect(Array.from(readBack)).toEqual([0x03, 0x04, 0x05]);
	});

	it('normalizes a Uint8Array view to its bytes (offset/length)', async () => {
		const backing = new Uint8Array([0xff, 0xff, 0xaa, 0xbb, 0xcc, 0xff]);
		const view = new Uint8Array(backing.buffer, 2, 3); // [0xaa, 0xbb, 0xcc]

		const r = await writeCompiledFile(app, project, preset, 'docx', view);
		const readBack = new Uint8Array(
			await app.vault.readBinary(
				app.vault.getAbstractFileByPath(r.path) as TFile
			)
		);
		expect(Array.from(readBack)).toEqual([0xaa, 0xbb, 0xcc]);
	});
});
