import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { buildSectionBreak } from '../../../src/core/compile/section-breaks';
import type { SceneNote } from '../../../src/core/discovery';
import type { CompilePresetFrontmatter } from '../../../src/model/compile-preset';
import type { SceneFrontmatter } from '../../../src/model/scene';

function makeScene(
	breakFields: {
		'dbench-section-break-title'?: string;
		'dbench-section-break-style'?: 'visual' | 'page-break';
	} = {}
): SceneNote {
	const file = new TFile({
		path: 'Novel/Scene.md',
		basename: 'Scene',
		extension: 'md',
		stat: { mtime: 0, ctime: 0, size: 0 },
	});
	const frontmatter: SceneFrontmatter = {
		'dbench-type': 'scene',
		'dbench-id': 'sc-001',
		'dbench-project': '[[Novel]]',
		'dbench-project-id': 'prj-001',
		'dbench-order': 1,
		'dbench-status': 'draft',
		'dbench-drafts': [],
		'dbench-draft-ids': [],
		...breakFields,
	};
	return { file, frontmatter };
}

function makePreset(
	includeBreaks: boolean
): CompilePresetFrontmatter {
	return {
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
		'dbench-compile-format': 'md',
		'dbench-compile-output': 'vault',
		'dbench-compile-page-size': 'letter',
		'dbench-compile-include-cover': false,
		'dbench-compile-include-toc': false,
		'dbench-compile-chapter-numbering': 'none',
		'dbench-compile-include-section-breaks': includeBreaks,
		'dbench-compile-heading-scope': 'draft',
		'dbench-compile-frontmatter': 'strip',
		'dbench-compile-wikilinks': 'display-text',
		'dbench-compile-embeds': 'strip',
		'dbench-compile-dinkuses': 'preserve',
		'dbench-last-compiled-at': '',
		'dbench-last-output-path': '',
		'dbench-last-chapter-hashes': [],
	};
}

describe('buildSectionBreak', () => {
	it('returns null when the scene has no break title', () => {
		expect(buildSectionBreak(makeScene(), makePreset(true))).toBeNull();
	});

	it('returns null when the scene break title is whitespace-only', () => {
		expect(
			buildSectionBreak(
				makeScene({ 'dbench-section-break-title': '   ' }),
				makePreset(true)
			)
		).toBeNull();
	});

	it('returns null when preset suppresses section breaks', () => {
		expect(
			buildSectionBreak(
				makeScene({ 'dbench-section-break-title': 'Part II' }),
				makePreset(false)
			)
		).toBeNull();
	});

	it('emits a dinkus-framed title when the break is active (visual style)', () => {
		const result = buildSectionBreak(
			makeScene({
				'dbench-section-break-title': 'Part II',
				'dbench-section-break-style': 'visual',
			}),
			makePreset(true)
		);
		expect(result).toBe('* * *\n\n**Part II**\n\n* * *');
	});

	it('emits the same visible form for page-break style in the MD intermediate', () => {
		const result = buildSectionBreak(
			makeScene({
				'dbench-section-break-title': 'Part II',
				'dbench-section-break-style': 'page-break',
			}),
			makePreset(true)
		);
		expect(result).toBe('* * *\n\n**Part II**\n\n* * *');
	});

	it('trims surrounding whitespace from the title', () => {
		const result = buildSectionBreak(
			makeScene({ 'dbench-section-break-title': '   Part II   ' }),
			makePreset(true)
		);
		expect(result).toBe('* * *\n\n**Part II**\n\n* * *');
	});
});
