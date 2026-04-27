import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { TFile } from 'obsidian';
import {
	buildDocxBytes,
	renderDocxToDisk,
	type DocxDiskDeps,
} from '../../../src/core/compile/render-docx';
import type { CompileResult } from '../../../src/core/compile-service';
import type { CompilePresetNote } from '../../../src/core/discovery';

function makePreset(
	path: string,
	overrides: Partial<CompilePresetNote['frontmatter']> = {}
): CompilePresetNote {
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
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-001',
			'dbench-schema-version': 1,
			'dbench-compile-title': '',
			'dbench-compile-subtitle': '',
			'dbench-compile-author': '',
			'dbench-compile-date-format': 'iso',
			'dbench-compile-scene-source': 'auto',
			'dbench-compile-scene-statuses': [],
			'dbench-compile-scene-excludes': [],
			'dbench-compile-format': 'docx',
			'dbench-compile-output': 'disk',
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
			...overrides,
		},
	};
}

function makeResult(markdown: string): CompileResult {
	return {
		markdown,
		scenesCompiled: 1,
		scenesSkipped: 0,
		warnings: [],
		errors: [],
		chapterHashes: [],
	} as CompileResult;
}

describe('renderDocxToDisk', () => {
	let preset: CompilePresetNote;
	const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP magic

	beforeEach(() => {
		preset = makePreset('Compile Presets/Workshop.md');
	});

	it('picks a path, builds bytes, writes, and returns the path', async () => {
		const deps: DocxDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/tmp/out.docx'),
			writeFile: vi.fn().mockResolvedValue(undefined),
			buildBytes: vi.fn().mockResolvedValue(fakeBytes),
		};

		const result = await renderDocxToDisk(
			preset,
			makeResult('# Body\n\nText.'),
			deps
		);

		expect(result).toEqual({ kind: 'written', path: '/tmp/out.docx' });
		expect(deps.pickPath).toHaveBeenCalledWith({ defaultName: 'Workshop.docx' });
		expect(deps.buildBytes).toHaveBeenCalledWith(
			'# Body\n\nText.',
			preset.frontmatter
		);
		expect(deps.writeFile).toHaveBeenCalledWith('/tmp/out.docx', fakeBytes);
	});

	it('skips the build step when the user cancels the save dialog', async () => {
		const buildBytes = vi.fn();
		const writeFile = vi.fn();
		const deps: DocxDiskDeps = {
			pickPath: vi.fn().mockResolvedValue(null),
			writeFile,
			buildBytes,
		};

		const result = await renderDocxToDisk(preset, makeResult('body'), deps);

		expect(result).toEqual({ kind: 'canceled' });
		expect(buildBytes).not.toHaveBeenCalled();
		expect(writeFile).not.toHaveBeenCalled();
	});

	it('propagates buildBytes errors to the caller', async () => {
		const deps: DocxDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/tmp/out.docx'),
			writeFile: vi.fn(),
			buildBytes: vi.fn().mockRejectedValue(new Error('docx: pack failed')),
		};

		await expect(
			renderDocxToDisk(preset, makeResult('body'), deps)
		).rejects.toThrow('docx: pack failed');
	});

	it('propagates writeFile errors to the caller', async () => {
		const deps: DocxDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/read-only/out.docx'),
			writeFile: vi.fn().mockRejectedValue(new Error('EACCES')),
			buildBytes: vi.fn().mockResolvedValue(fakeBytes),
		};

		await expect(
			renderDocxToDisk(preset, makeResult('body'), deps)
		).rejects.toThrow('EACCES');
	});

	it('uses the preset basename with .docx extension as the default filename', async () => {
		const fancy = makePreset('Compile Presets/Final Manuscript.md');
		const deps: DocxDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/out.docx'),
			writeFile: vi.fn().mockResolvedValue(undefined),
			buildBytes: vi.fn().mockResolvedValue(fakeBytes),
		};

		await renderDocxToDisk(fancy, makeResult('x'), deps);

		expect(deps.pickPath).toHaveBeenCalledWith({
			defaultName: 'Final Manuscript.docx',
		});
	});
});

describe('buildDocxBytes', () => {
	it('produces a non-empty ZIP archive (DOCX is OOXML, ZIP-shaped)', async () => {
		const preset = makePreset('Compile Presets/Workshop.md');
		const bytes = await buildDocxBytes('# Heading\n\nProse.', preset.frontmatter);
		expect(bytes.length).toBeGreaterThan(0);
		// PK header (ZIP magic): 0x50 0x4b 0x03 0x04.
		expect(bytes[0]).toBe(0x50);
		expect(bytes[1]).toBe(0x4b);
	});

	it('roundtrips through JSZip and contains the expected content', async () => {
		const preset = makePreset('Compile Presets/Workshop.md');
		const bytes = await buildDocxBytes(
			'# Chapter\n\nA *short* paragraph.',
			preset.frontmatter
		);
		const zip = await JSZip.loadAsync(bytes);
		const documentXml = await zip.file('word/document.xml')?.async('string');
		expect(documentXml).toBeDefined();
		expect(documentXml).toContain('Chapter');
		expect(documentXml).toContain('paragraph');
		// Italic run from the *short* markdown.
		expect(documentXml).toMatch(/<w:i\b/);
	});

	it('honors the preset page size when set to A4', async () => {
		const preset = makePreset('Compile Presets/Workshop.md', {
			'dbench-compile-page-size': 'a4',
		});
		const bytes = await buildDocxBytes('Body.', preset.frontmatter);
		const zip = await JSZip.loadAsync(bytes);
		const documentXml = await zip.file('word/document.xml')?.async('string');
		expect(documentXml).toMatch(/<w:pgSz[^/]*w:w="11906"[^/]*w:h="16838"/);
	});

	it('defaults to LETTER when the page size is letter (or absent)', async () => {
		const preset = makePreset('Compile Presets/Workshop.md');
		const bytes = await buildDocxBytes('Body.', preset.frontmatter);
		const zip = await JSZip.loadAsync(bytes);
		const documentXml = await zip.file('word/document.xml')?.async('string');
		expect(documentXml).toMatch(/<w:pgSz[^/]*w:w="12240"[^/]*w:h="15840"/);
	});
});
