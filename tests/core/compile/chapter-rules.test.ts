import { describe, expect, it } from 'vitest';
import { buildChapterHeading } from '../../../src/core/compile/chapter-rules';
import type {
	CompileChapterNumbering,
	CompilePresetFrontmatter,
} from '../../../src/model/compile-preset';

function makePresetFm(
	overrides: Partial<CompilePresetFrontmatter> = {}
): CompilePresetFrontmatter {
	return {
		'dbench-type': 'compile-preset',
		'dbench-id': 'prs-001-tst-001',
		'dbench-project': '[[Novel]]',
		'dbench-project-id': 'prj-001-tst-001',
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
		'dbench-compile-chapter-numbering': 'none' as CompileChapterNumbering,
		'dbench-compile-include-section-breaks': true,
		'dbench-compile-heading-scope': 'chapter',
		'dbench-compile-frontmatter': 'strip',
		'dbench-compile-wikilinks': 'display-text',
		'dbench-compile-embeds': 'strip',
		'dbench-compile-dinkuses': 'preserve',
		'dbench-last-compiled-at': '',
		'dbench-last-output-path': '',
		'dbench-last-chapter-hashes': [],
		...overrides,
	};
}

describe('buildChapterHeading', () => {
	it('emits `# Title` with numbering=none', () => {
		expect(buildChapterHeading('The Salt Road', 1, makePresetFm())).toBe(
			'# The Salt Road'
		);
	});

	it('prefixes the index with numeric numbering', () => {
		expect(
			buildChapterHeading(
				'Eastward',
				3,
				makePresetFm({ 'dbench-compile-chapter-numbering': 'numeric' })
			)
		).toBe('# 3. Eastward');
	});

	it('prefixes a Roman numeral with roman numbering', () => {
		expect(
			buildChapterHeading(
				'The Crossing',
				4,
				makePresetFm({ 'dbench-compile-chapter-numbering': 'roman' })
			)
		).toBe('# IV. The Crossing');
	});

	it('falls back to a decimal index for out-of-range Roman input', () => {
		// toRoman returns the decimal string for n outside 1..3999.
		expect(
			buildChapterHeading(
				'Far Future',
				5000,
				makePresetFm({ 'dbench-compile-chapter-numbering': 'roman' })
			)
		).toBe('# 5000. Far Future');
	});

	it('always emits a non-empty heading regardless of heading-scope mode', () => {
		// Unlike buildSceneHeading, the chapter heading is never
		// suppressed — the whole point of chapter mode is that one H1
		// per chapter is always emitted.
		expect(
			buildChapterHeading(
				'Forced',
				1,
				makePresetFm({ 'dbench-compile-heading-scope': 'draft' })
			)
		).toBe('# Forced');
	});
});
