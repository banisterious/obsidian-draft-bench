import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import JSZip from 'jszip';
import {
	buildOdtArchive,
	renderOdtToDisk,
	type OdtDiskDeps,
} from '../../../src/core/compile/render-odt';
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
			'dbench-compile-format': 'odt',
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

describe('buildOdtArchive', () => {
	it('produces a non-empty Uint8Array', async () => {
		const bytes = await buildOdtArchive('# Heading\n\nProse.');
		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(bytes.byteLength).toBeGreaterThan(0);
	});

	it('builds a valid zip containing mimetype, manifest, styles, content', async () => {
		const bytes = await buildOdtArchive('# Heading\n\nProse.');
		const reopened = await JSZip.loadAsync(bytes);

		expect(reopened.file('mimetype')).not.toBeNull();
		expect(reopened.file('META-INF/manifest.xml')).not.toBeNull();
		expect(reopened.file('styles.xml')).not.toBeNull();
		expect(reopened.file('content.xml')).not.toBeNull();
	});

	it('stores the mimetype file with the correct media type string', async () => {
		const bytes = await buildOdtArchive('any');
		const reopened = await JSZip.loadAsync(bytes);
		const mime = await reopened.file('mimetype')!.async('string');
		expect(mime).toBe('application/vnd.oasis.opendocument.text');
	});

	it("embeds the compile markdown's structure in content.xml", async () => {
		const md = '# Chapter One\n\nThe prose starts here.\n\n## Scene Break\n\n- item A\n- item B';
		const bytes = await buildOdtArchive(md);
		const reopened = await JSZip.loadAsync(bytes);
		const content = await reopened.file('content.xml')!.async('string');

		expect(content).toContain('Chapter One');
		expect(content).toContain('The prose starts here.');
		expect(content).toContain('Scene Break');
		expect(content).toContain('item A');
		expect(content).toContain('item B');
		expect(content).toContain('text:style-name="Heading_20_1"');
		expect(content).toContain('text:style-name="Heading_20_2"');
		expect(content).toContain('text:style-name="BulletList"');
	});

	it('produces a well-formed archive even for empty markdown', async () => {
		const bytes = await buildOdtArchive('');
		const reopened = await JSZip.loadAsync(bytes);
		expect(reopened.file('content.xml')).not.toBeNull();
	});
});

describe('renderOdtToDisk', () => {
	let preset: CompilePresetNote;

	beforeEach(() => {
		preset = makePreset('Compile Presets/Workshop.md');
	});

	it('writes the ODT bytes to the chosen path', async () => {
		const writeFile = vi.fn().mockResolvedValue(undefined);
		const deps: OdtDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/tmp/out.odt'),
			writeFile,
		};

		const result = await renderOdtToDisk(
			preset,
			makeResult('# Body\n\nText.'),
			deps
		);

		expect(result).toEqual({ kind: 'written', path: '/tmp/out.odt' });
		expect(deps.pickPath).toHaveBeenCalledWith({ defaultName: 'Workshop.odt' });
		expect(writeFile).toHaveBeenCalledTimes(1);
		const [path, bytes] = writeFile.mock.calls[0];
		expect(path).toBe('/tmp/out.odt');
		expect(bytes).toBeInstanceOf(Uint8Array);
		expect((bytes as Uint8Array).byteLength).toBeGreaterThan(0);
	});

	it('returns kind=canceled when the user dismisses the save dialog', async () => {
		const writeFile = vi.fn();
		const deps: OdtDiskDeps = {
			pickPath: vi.fn().mockResolvedValue(null),
			writeFile,
		};

		const result = await renderOdtToDisk(preset, makeResult('body'), deps);

		expect(result).toEqual({ kind: 'canceled' });
		expect(writeFile).not.toHaveBeenCalled();
	});

	it('propagates write errors to the caller', async () => {
		const deps: OdtDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/read-only/out.odt'),
			writeFile: vi.fn().mockRejectedValue(new Error('EACCES')),
		};

		await expect(
			renderOdtToDisk(preset, makeResult('body'), deps)
		).rejects.toThrow('EACCES');
	});

	it('uses the preset basename with .odt extension as the default filename', async () => {
		const fancy = makePreset('Compile Presets/Final Manuscript.md');
		const deps: OdtDiskDeps = {
			pickPath: vi.fn().mockResolvedValue('/out.odt'),
			writeFile: vi.fn().mockResolvedValue(undefined),
		};

		await renderOdtToDisk(fancy, makeResult('x'), deps);

		expect(deps.pickPath).toHaveBeenCalledWith({
			defaultName: 'Final Manuscript.odt',
		});
	});
});
