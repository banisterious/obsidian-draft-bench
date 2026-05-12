import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import {
	CONTINUOUS_SYNTHETIC_PRESET_ID,
	buildContinuousPreset,
} from '../../../src/core/compile/continuous-preset';
import type { ProjectNote } from '../../../src/core/discovery';

function makeProject(basename: string, projectId: string): ProjectNote {
	const file = new TFile({
		path: `Projects/${basename}.md`,
		basename,
		extension: 'md',
		stat: { mtime: 0, ctime: 0, size: 0 },
	});
	return {
		file,
		frontmatter: {
			'dbench-type': 'project',
			'dbench-id': projectId,
			'dbench-project': `[[${basename}]]`,
			'dbench-project-id': projectId,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-compile-presets': [],
			'dbench-compile-preset-ids': [],
		},
	};
}

describe('buildContinuousPreset', () => {
	it('links the synthetic preset to the project by id and basename', () => {
		const project = makeProject('Salt Road', 'prj-saltroad');
		const preset = buildContinuousPreset(project);

		expect(preset.frontmatter['dbench-id']).toBe(CONTINUOUS_SYNTHETIC_PRESET_ID);
		expect(preset.frontmatter['dbench-project']).toBe('Salt Road');
		expect(preset.frontmatter['dbench-project-id']).toBe('prj-saltroad');
		expect(preset.file).toBe(project.file);
	});

	it('selects minimal-transform defaults aimed at full-body read-through', () => {
		const project = makeProject('Salt Road', 'prj-saltroad');
		const fm = buildContinuousPreset(project).frontmatter;

		// No status filtering; no scene exclusions.
		expect(fm['dbench-compile-scene-statuses']).toEqual([]);
		expect(fm['dbench-compile-scene-excludes']).toEqual([]);

		// Full-body scope so planning sections + Draft come through.
		expect(fm['dbench-compile-heading-scope']).toBe('full');

		// Frontmatter stripped (YAML doesn't render meaningfully).
		expect(fm['dbench-compile-frontmatter']).toBe('strip');

		// Wikilinks preserve-syntax so MarkdownRenderer makes them clickable.
		expect(fm['dbench-compile-wikilinks']).toBe('preserve-syntax');

		// No compile-style numbering, cover, or TOC injected.
		expect(fm['dbench-compile-chapter-numbering']).toBe('none');
		expect(fm['dbench-compile-include-cover']).toBe(false);
		expect(fm['dbench-compile-include-toc']).toBe(false);

		// Honor scene-level section breaks; preserve dinkuses.
		expect(fm['dbench-compile-include-section-breaks']).toBe(true);
		expect(fm['dbench-compile-dinkuses']).toBe('preserve');
	});

	it('declares md/vault as the format/output (no file is written; values must be valid)', () => {
		const project = makeProject('Salt Road', 'prj-saltroad');
		const fm = buildContinuousPreset(project).frontmatter;

		expect(fm['dbench-compile-format']).toBe('md');
		expect(fm['dbench-compile-output']).toBe('vault');
	});

	it('builds independently per call (no shared mutable state)', () => {
		const project = makeProject('Salt Road', 'prj-saltroad');
		const a = buildContinuousPreset(project);
		const b = buildContinuousPreset(project);

		expect(a).not.toBe(b);
		expect(a.frontmatter).not.toBe(b.frontmatter);
		expect(a.frontmatter).toEqual(b.frontmatter);
	});

	it('threads excludeBasenames into the scene-excludes field', () => {
		const project = makeProject('Salt Road', 'prj-saltroad');
		const fm = buildContinuousPreset(project, {
			excludeBasenames: ['Cut scene', 'Archived flashback'],
		}).frontmatter;
		expect(fm['dbench-compile-scene-excludes']).toEqual([
			'Cut scene',
			'Archived flashback',
		]);
	});

	it('defaults scene-excludes to empty when excludeBasenames is omitted', () => {
		const project = makeProject('Salt Road', 'prj-saltroad');
		const fm = buildContinuousPreset(project, {}).frontmatter;
		expect(fm['dbench-compile-scene-excludes']).toEqual([]);
	});
});
