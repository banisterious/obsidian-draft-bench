import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { CompileService } from '../../src/core/compile-service';
import type { CompilePresetNote } from '../../src/core/discovery';
import type { CompilePresetFrontmatter } from '../../src/model/compile-preset';
import type { DbenchStatus } from '../../src/model/types';

/**
 * Seed a scene into the mock vault: stores the body content on the
 * file and populates the metadata cache with a fully-hydrated
 * SceneFrontmatter shape. Order and status default to sensible values
 * so individual tests only name what they care about.
 */
async function seedScene(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		projectTitle: string;
		order: number;
		body: string;
		status?: DbenchStatus;
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

/**
 * Build a preset note with all-defaults frontmatter, letting the
 * caller override specific inclusion fields. The preset file itself
 * isn't written to the mock vault — `CompileService` only reads
 * `preset.frontmatter`, not `preset.file`, so the TFile stub is
 * sufficient.
 */
function makePreset(
	overrides: Partial<CompilePresetFrontmatter> & {
		name?: string;
		projectId: string;
	}
): CompilePresetNote {
	const name = overrides.name ?? 'Workshop';
	const file = new TFile({
		path: `Compile Presets/${name}.md`,
		basename: name,
		extension: 'md',
		stat: { mtime: 0, ctime: 0, size: 0 },
	});
	const frontmatter: CompilePresetFrontmatter = {
		'dbench-type': 'compile-preset',
		'dbench-id': 'prs-001-tst-001',
		'dbench-project': '[[Novel]]',
		'dbench-project-id': overrides.projectId,
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
		...overrides,
	};
	return { file, frontmatter };
}

describe('CompileService.generate', () => {
	let app: App;
	let service: CompileService;
	const projectId = 'prj-001-tst-001';

	beforeEach(() => {
		app = new App();
		service = new CompileService(app);
	});

	it('concatenates scene bodies in dbench-order with a blank line between them', async () => {
		await seedScene(app, {
			path: 'Novel/Opening.md',
			id: 'sc1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Opening prose.',
		});
		await seedScene(app, {
			path: 'Novel/Middle.md',
			id: 'sc2-002-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Middle prose.',
		});
		await seedScene(app, {
			path: 'Novel/Closing.md',
			id: 'sc3-003-tst-003',
			projectId,
			projectTitle: 'Novel',
			order: 3,
			body: 'Closing prose.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# Opening\n\nOpening prose.\n\n' +
				'# Middle\n\nMiddle prose.\n\n' +
				'# Closing\n\nClosing prose.'
		);
		expect(result.scenesCompiled).toBe(3);
		expect(result.scenesSkipped).toBe(0);
		expect(result.warnings).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('orders by dbench-order regardless of creation order', async () => {
		await seedScene(app, {
			path: 'Novel/C.md',
			id: 'sc-c-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 3,
			body: 'Third.',
		});
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'First.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-003',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Second.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe(
			'# A\n\nFirst.\n\n# B\n\nSecond.\n\n# C\n\nThird.'
		);
	});

	it('strips YAML frontmatter from scene bodies before concatenation', async () => {
		await seedScene(app, {
			path: 'Novel/Opening.md',
			id: 'sc1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: '---\ndbench-type: scene\ndbench-order: 1\n---\n\nProse after the fence.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# Opening\n\nProse after the fence.');
		expect(result.scenesCompiled).toBe(1);
	});

	it('warns and returns empty markdown when the preset has no project link', async () => {
		const preset = makePreset({ projectId: '' });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('');
		expect(result.scenesCompiled).toBe(0);
		expect(result.scenesSkipped).toBe(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/no project link/);
	});

	it('warns and returns empty markdown when the project has no scenes', async () => {
		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('');
		expect(result.scenesCompiled).toBe(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/no scenes/);
	});

	it('applies a non-empty status filter, keeping only matching scenes', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Final A.',
			status: 'final',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Draft B.',
			status: 'draft',
		});
		await seedScene(app, {
			path: 'Novel/C.md',
			id: 'sc-c-tst-003',
			projectId,
			projectTitle: 'Novel',
			order: 3,
			body: 'Final C.',
			status: 'final',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-statuses': ['final'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nFinal A.\n\n# C\n\nFinal C.');
		expect(result.scenesCompiled).toBe(2);
		expect(result.scenesSkipped).toBe(1);
	});

	it('excludes scenes with missing or empty status when the filter is active (strict match)', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Final A.',
			status: 'final',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'No status B.',
			status: '',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-statuses': ['final'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nFinal A.');
		expect(result.scenesCompiled).toBe(1);
		expect(result.scenesSkipped).toBe(1);
	});

	it('drops scenes named in the exclude list (wikilink form)', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'B.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-excludes': ['[[B]]'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nA.');
		expect(result.scenesSkipped).toBe(1);
	});

	it('drops scenes named in the exclude list (bare basename form)', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'B.',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-excludes': ['B'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nA.');
		expect(result.scenesSkipped).toBe(1);
	});

	it('warns when filters eliminate every scene', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'A.',
			status: 'draft',
		});

		const preset = makePreset({
			projectId,
			'dbench-compile-scene-statuses': ['final'],
		});
		const result = await service.generate(preset);

		expect(result.markdown).toBe('');
		expect(result.scenesCompiled).toBe(0);
		expect(result.scenesSkipped).toBe(1);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/filtered out all/);
	});

	it('only includes scenes from the preset\'s project, ignoring other projects', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Novel scene.',
		});
		await seedScene(app, {
			path: 'Other/X.md',
			id: 'sc-x-tst-002',
			projectId: 'prj-other-tst-999',
			projectTitle: 'Other',
			order: 1,
			body: 'Other-project scene.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# A\n\nNovel scene.');
		expect(result.scenesCompiled).toBe(1);
	});

	it('renumbers footnotes continuously across scenes', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body: 'Scene A[^1] mentions[^2].\n\n[^1]: First.\n[^2]: Second.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b-tst-002',
			projectId,
			projectTitle: 'Novel',
			order: 2,
			body: 'Scene B[^1] stands alone.\n\n[^1]: B-only.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		// A's [^1] / [^2] -> [^1] / [^2]; B's [^1] -> [^3] (continues
		// from A's offset).
		expect(result.markdown).toContain('Scene A[^1] mentions[^2].');
		expect(result.markdown).toContain('[^1]: First.');
		expect(result.markdown).toContain('[^2]: Second.');
		expect(result.markdown).toContain('Scene B[^3] stands alone.');
		expect(result.markdown).toContain('[^3]: B-only.');
	});

	it('slices scene bodies to the draft section by default (rule 1 integration)', async () => {
		await seedScene(app, {
			path: 'Novel/Opening.md',
			id: 'sc1-001-tst-001',
			projectId,
			projectTitle: 'Novel',
			order: 1,
			body:
				'# Source passages\nplanning notes\n' +
				'# Beat outline\nmore planning\n' +
				'## Draft\nThe actual prose.',
		});

		const preset = makePreset({ projectId });
		const result = await service.generate(preset);

		expect(result.markdown).toBe('# Opening\n\nThe actual prose.');
	});
});
