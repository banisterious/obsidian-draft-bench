import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import {
	renderPdfToDisk,
	type PdfDiskDeps,
} from '../../../src/core/compile/render-pdf';
import type { CompileResult } from '../../../src/core/compile-service';
import type { CompilePresetNote } from '../../../src/core/discovery';

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
			'dbench-compile-format': 'pdf',
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
	};
}

describe('renderPdfToDisk', () => {
	let preset: CompilePresetNote;
	const fakeBytes = new Uint8Array([37, 80, 68, 70, 45]); // "%PDF-"

	beforeEach(() => {
		preset = makePreset('Compile Presets/Workshop.md');
	});

	it('picks a path, builds bytes, writes, and returns the path', async () => {
		const deps: PdfDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/tmp/out.pdf'),
			writeFile: vi.fn().mockResolvedValue(undefined),
			buildBytes: vi.fn().mockResolvedValue(fakeBytes),
		};

		const result = await renderPdfToDisk(
			preset,
			makeResult('# Body\n\nText.'),
			deps
		);

		expect(result).toEqual({ kind: 'written', path: '/tmp/out.pdf' });
		expect(deps.pickPath).toHaveBeenCalledWith({ defaultName: 'Workshop.pdf' });
		expect(deps.buildBytes).toHaveBeenCalledWith(
			'# Body\n\nText.',
			preset.frontmatter
		);
		expect(deps.writeFile).toHaveBeenCalledWith('/tmp/out.pdf', fakeBytes);
	});

	it('skips the build step when the user cancels the save dialog', async () => {
		const buildBytes = vi.fn();
		const writeFile = vi.fn();
		const deps: PdfDiskDeps = {
			pickPath: vi.fn().mockResolvedValue(null),
			writeFile,
			buildBytes,
		};

		const result = await renderPdfToDisk(preset, makeResult('body'), deps);

		expect(result).toEqual({ kind: 'canceled' });
		expect(buildBytes).not.toHaveBeenCalled();
		expect(writeFile).not.toHaveBeenCalled();
	});

	it('propagates buildBytes errors to the caller', async () => {
		const deps: PdfDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/tmp/out.pdf'),
			writeFile: vi.fn(),
			buildBytes: vi
				.fn()
				.mockRejectedValue(new Error('pdfmake: font not registered')),
		};

		await expect(
			renderPdfToDisk(preset, makeResult('body'), deps)
		).rejects.toThrow('pdfmake');
	});

	it('propagates writeFile errors to the caller', async () => {
		const deps: PdfDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/read-only/out.pdf'),
			writeFile: vi.fn().mockRejectedValue(new Error('EACCES')),
			buildBytes: vi.fn().mockResolvedValue(fakeBytes),
		};

		await expect(
			renderPdfToDisk(preset, makeResult('body'), deps)
		).rejects.toThrow('EACCES');
	});

	it('uses the preset basename with .pdf extension as the default filename', async () => {
		const fancy = makePreset('Compile Presets/Final Manuscript.md');
		const deps: PdfDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/out.pdf'),
			writeFile: vi.fn().mockResolvedValue(undefined),
			buildBytes: vi.fn().mockResolvedValue(fakeBytes),
		};

		await renderPdfToDisk(fancy, makeResult('x'), deps);

		expect(deps.pickPath).toHaveBeenCalledWith({
			defaultName: 'Final Manuscript.pdf',
		});
	});
});
