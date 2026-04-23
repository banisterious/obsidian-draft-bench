import { describe, expect, it } from 'vitest';
import {
	applyBodyScopeRule,
	applyContentRules,
	applyDinkusRule,
	applyFrontmatterRule,
	applyNoteEmbedRule,
	applyWikilinkRule,
	buildSceneHeading,
	shiftH1sInBody,
	stripBaseEmbeds,
	stripCalloutMarkers,
	stripComments,
	stripHighlights,
	stripImageEmbeds,
	stripTags,
	stripTaskCheckboxes,
	toRoman,
	transformOutsideCode,
	type RuleContext,
} from '../../../src/core/compile/content-rules';
import type { CompilePresetFrontmatter } from '../../../src/model/compile-preset';

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
}

// -- Rule 3: frontmatter ------------------------------------------------

describe('applyFrontmatterRule', () => {
	it('strips a leading YAML fence in strip mode', () => {
		const raw = '---\ntitle: X\n---\nBody.';
		expect(applyFrontmatterRule(raw, 'strip')).toBe('Body.');
	});

	it('passes content through unchanged in preserve mode', () => {
		const raw = '---\ntitle: X\n---\nBody.';
		expect(applyFrontmatterRule(raw, 'preserve')).toBe(raw);
	});

	it('returns input unchanged in strip mode if there is no fence', () => {
		expect(applyFrontmatterRule('Just body.', 'strip')).toBe('Just body.');
	});
});

// -- Rule 1: body scope -------------------------------------------------

describe('applyBodyScopeRule', () => {
	it('slices to below ## Draft in draft mode', () => {
		const body = '# Planning\nnotes\n## Draft\nThe prose.';
		expect(applyBodyScopeRule(body, 'draft')).toBe('The prose.');
	});

	it('returns the full body in full mode', () => {
		const body = '# Planning\nnotes\n## Draft\nThe prose.';
		expect(applyBodyScopeRule(body, 'full')).toBe(body);
	});

	it('falls back to the whole body when no Draft heading exists', () => {
		const body = 'Orphan prose with no heading.';
		expect(applyBodyScopeRule(body, 'draft')).toBe(body);
	});
});

// -- Rule 2: heading transformation ------------------------------------

describe('shiftH1sInBody', () => {
	it('shifts # to ##', () => {
		expect(shiftH1sInBody('# Old heading\nbody')).toBe('## Old heading\nbody');
	});

	it('leaves H2+ untouched', () => {
		expect(shiftH1sInBody('## Kept\n### Still kept')).toBe(
			'## Kept\n### Still kept'
		);
	});

	it('does not shift H1s inside fenced code blocks', () => {
		const body = '```md\n# Code heading\n```\n# Real heading';
		expect(shiftH1sInBody(body)).toBe('```md\n# Code heading\n```\n## Real heading');
	});
});

describe('buildSceneHeading', () => {
	it('emits `# Title` with numbering=none', () => {
		expect(buildSceneHeading('Opening', 1, makePresetFm())).toBe('# Opening');
	});

	it('prefixes a 1-based index with numeric numbering', () => {
		expect(
			buildSceneHeading('Opening', 3, makePresetFm({ 'dbench-compile-chapter-numbering': 'numeric' }))
		).toBe('# 3. Opening');
	});

	it('prefixes a Roman numeral with roman numbering', () => {
		expect(
			buildSceneHeading('Opening', 4, makePresetFm({ 'dbench-compile-chapter-numbering': 'roman' }))
		).toBe('# IV. Opening');
	});
});

describe('toRoman', () => {
	it('handles common values', () => {
		expect(toRoman(1)).toBe('I');
		expect(toRoman(4)).toBe('IV');
		expect(toRoman(9)).toBe('IX');
		expect(toRoman(40)).toBe('XL');
		expect(toRoman(90)).toBe('XC');
		expect(toRoman(2024)).toBe('MMXXIV');
	});

	it('falls back to decimal for out-of-range values', () => {
		expect(toRoman(0)).toBe('0');
		expect(toRoman(4000)).toBe('4000');
		expect(toRoman(-1)).toBe('-1');
	});
});

// -- Rule 10: callouts --------------------------------------------------

describe('stripCalloutMarkers', () => {
	it('drops the marker line and keeps the body', () => {
		const body = '> [!note] Title\n> Body line\nOther content.';
		expect(stripCalloutMarkers(body)).toBe('> Body line\nOther content.');
	});

	it('handles collapsed and expanded variants', () => {
		const body = '> [!warning]- Collapsed\n> Body\n> [!tip]+ Expanded\n> More';
		expect(stripCalloutMarkers(body)).toBe('> Body\n> More');
	});

	it('leaves plain blockquotes untouched', () => {
		const body = '> Just a quote\n> Not a callout';
		expect(stripCalloutMarkers(body)).toBe(body);
	});
});

// -- Rule 11: tasks -----------------------------------------------------

describe('stripTaskCheckboxes', () => {
	it('strips `[ ]` and `[x]` leaving the bullet', () => {
		expect(stripTaskCheckboxes('- [ ] Todo\n- [x] Done')).toBe('- Todo\n- Done');
	});

	it('respects list indent and other bullet markers', () => {
		expect(stripTaskCheckboxes('  - [ ] Nested\n* [X] Star\n+ [/] Plus')).toBe(
			'  - Nested\n* Star\n+ Plus'
		);
	});

	it('leaves non-task list items alone', () => {
		expect(stripTaskCheckboxes('- Regular item')).toBe('- Regular item');
	});
});

// -- Rules 8a / 8b / 8c: embeds ----------------------------------------

describe('stripImageEmbeds', () => {
	it('drops image embeds by extension', () => {
		expect(stripImageEmbeds('before ![[pic.png]] after')).toBe('before  after');
		expect(stripImageEmbeds('![[photo.jpeg]]')).toBe('');
	});

	it('leaves non-image embeds untouched', () => {
		expect(stripImageEmbeds('![[Note]]')).toBe('![[Note]]');
		expect(stripImageEmbeds('![[view.base]]')).toBe('![[view.base]]');
	});

	it('handles anchor / display suffixes', () => {
		expect(stripImageEmbeds('![[pic.png#x50]]')).toBe('');
		expect(stripImageEmbeds('![[pic.png|thumb]]')).toBe('');
	});
});

describe('stripBaseEmbeds', () => {
	it('drops .base embeds', () => {
		expect(stripBaseEmbeds('![[view.base]]')).toBe('');
	});

	it('leaves other embeds untouched', () => {
		expect(stripBaseEmbeds('![[Note]] and ![[pic.png]]')).toBe(
			'![[Note]] and ![[pic.png]]'
		);
	});
});

describe('applyNoteEmbedRule', () => {
	it('strips all remaining embeds in V1 (strip mode)', () => {
		expect(applyNoteEmbedRule('![[Some Note]] text', 'strip')).toBe(' text');
	});

	it('also strips in resolve mode for V1 (reserved for post-V1)', () => {
		expect(applyNoteEmbedRule('![[Some Note]] text', 'resolve')).toBe(' text');
	});
});

// -- Rule 9: wikilinks -------------------------------------------------

describe('applyWikilinkRule', () => {
	it('keeps display text for [[target]]', () => {
		expect(applyWikilinkRule('See [[Opening]].', 'display-text')).toBe(
			'See Opening.'
		);
	});

	it('keeps display text for [[target|Display]]', () => {
		expect(applyWikilinkRule('See [[Opening|the start]].', 'display-text')).toBe(
			'See the start.'
		);
	});

	it('trims anchor fragments when no pipe is present', () => {
		expect(applyWikilinkRule('See [[Opening#Scene 1]].', 'display-text')).toBe(
			'See Opening.'
		);
	});

	it('strips entirely in strip mode', () => {
		expect(applyWikilinkRule('See [[Opening]] now.', 'strip')).toBe('See  now.');
	});

	it('preserves the syntax in preserve-syntax mode', () => {
		expect(applyWikilinkRule('See [[Opening]].', 'preserve-syntax')).toBe(
			'See [[Opening]].'
		);
	});
});

// -- Rule 12: tags -----------------------------------------------------

describe('stripTags', () => {
	it('strips inline tags from body lines', () => {
		expect(stripTags('A sentence with #foo and #bar/baz.')).toBe(
			'A sentence with  and .'
		);
	});

	it('preserves heading lines', () => {
		expect(stripTags('# Heading with #tag inside')).toBe(
			'# Heading with #tag inside'
		);
	});

	it('does not touch mid-word `#` (hex colors, URLs)', () => {
		expect(stripTags('color #abc is a tag')).toBe('color  is a tag');
		// #abc is a valid tag; stripped. Acceptable V1 behavior.
	});
});

// -- Rule 14: comments -------------------------------------------------

describe('stripComments', () => {
	it('strips inline comments', () => {
		expect(stripComments('before %%hidden%% after')).toBe('before  after');
	});

	it('strips multi-line comments', () => {
		const body = 'before\n%%\nhidden\nlines\n%%\nafter';
		expect(stripComments(body)).toBe('before\n\nafter');
	});
});

// -- Rule 15: highlights -----------------------------------------------

describe('stripHighlights', () => {
	it('strips marks and keeps text', () => {
		expect(stripHighlights('A ==bold== word.')).toBe('A bold word.');
	});

	it('handles multiple highlights on one line', () => {
		expect(stripHighlights('==one== and ==two==')).toBe('one and two');
	});
});

// -- Rule 5: dinkuses --------------------------------------------------

describe('applyDinkusRule', () => {
	it('normalizes `***` to `* * *`', () => {
		expect(applyDinkusRule('line\n***\nline', 'normalize')).toBe(
			'line\n* * *\nline'
		);
	});

	it('normalizes `* * *` with extra whitespace', () => {
		expect(applyDinkusRule('   *   *   *   ', 'normalize')).toBe('* * *');
	});

	it('normalizes asterism `⁂` and fullwidth asterisks', () => {
		expect(applyDinkusRule('⁂', 'normalize')).toBe('* * *');
		expect(applyDinkusRule('＊＊＊', 'normalize')).toBe('* * *');
	});

	it('leaves dinkuses untouched in preserve mode', () => {
		expect(applyDinkusRule('***', 'preserve')).toBe('***');
	});

	it('does not mangle lines with fewer than 3 asterisks', () => {
		expect(applyDinkusRule('*', 'normalize')).toBe('*');
		expect(applyDinkusRule('**', 'normalize')).toBe('**');
	});
});

// -- Code-fence protection ---------------------------------------------

describe('transformOutsideCode', () => {
	it('applies fn outside fenced code blocks', () => {
		const body = 'before\n```\ninside\n```\nafter';
		const result = transformOutsideCode(body, (t) => t.toUpperCase());
		expect(result).toBe('BEFORE\n```\ninside\n```\nAFTER');
	});

	it('handles multiple fenced blocks', () => {
		const body = 'a\n```\nc\n```\nd\n~~~\ne\n~~~\nf';
		const result = transformOutsideCode(body, (t) => t.toUpperCase());
		expect(result).toBe('A\n```\nc\n```\nD\n~~~\ne\n~~~\nF');
	});

	it('preserves fenced content verbatim even when fn would rewrite it', () => {
		const body = '```\n# heading in code\n==highlight==\n```';
		const result = transformOutsideCode(body, (t) => t.toUpperCase());
		expect(result).toBe(body);
	});
});

// -- Orchestrator end-to-end -------------------------------------------

describe('applyContentRules', () => {
	const baseCtx = (overrides: Partial<RuleContext> = {}): RuleContext => ({
		preset: makePresetFm(),
		sceneTitle: 'Opening',
		compileIndex: 1,
		...overrides,
	});

	it('strips frontmatter, slices to draft, prepends heading, applies inline rules', () => {
		const raw =
			'---\ntitle: X\n---\n' +
			'# Planning\nnotes above\n## Draft\n' +
			'See [[Target]] with #tag and ==highlight==.\n%%comment%%';
		const result = applyContentRules(raw, baseCtx());
		expect(result).toBe(
			'# Opening\n\nSee Target with  and highlight.\n'
		);
	});

	it('respects full heading scope when overridden', () => {
		const raw = '---\ntitle: X\n---\n# In body\nbefore\n## Draft\nafter';
		const preset = makePresetFm({ 'dbench-compile-heading-scope': 'full' });
		const result = applyContentRules(raw, baseCtx({ preset }));
		// Full scope keeps everything post-frontmatter; in-body # shifts to ##
		expect(result).toBe(
			'# Opening\n\n## In body\nbefore\n## Draft\nafter'
		);
	});

	it('emits a numbered chapter heading with numeric numbering', () => {
		const raw = '## Draft\nThe prose.';
		const preset = makePresetFm({
			'dbench-compile-chapter-numbering': 'numeric',
		});
		const result = applyContentRules(
			raw,
			baseCtx({ preset, compileIndex: 7, sceneTitle: 'Chapter Seven' })
		);
		expect(result).toBe('# 7. Chapter Seven\n\nThe prose.');
	});

	it('emits the heading alone when the body slice is empty', () => {
		const raw = '---\ntitle: X\n---\n## Draft\n';
		const result = applyContentRules(raw, baseCtx());
		expect(result).toBe('# Opening');
	});

	it('leaves fenced code blocks verbatim', () => {
		const raw = '## Draft\n```js\nconst x = [[notlink]];\n// #nottag\n```\n';
		const result = applyContentRules(raw, baseCtx());
		expect(result).toBe(
			'# Opening\n\n```js\nconst x = [[notlink]];\n// #nottag\n```'
		);
	});

	it('applies dinkus normalization when requested', () => {
		const raw = '## Draft\nfirst\n***\nsecond';
		const preset = makePresetFm({ 'dbench-compile-dinkuses': 'normalize' });
		const result = applyContentRules(raw, baseCtx({ preset }));
		expect(result).toBe('# Opening\n\nfirst\n* * *\nsecond');
	});
});
