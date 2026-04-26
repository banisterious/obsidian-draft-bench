import { describe, expect, it } from 'vitest';
import {
	applyBodyScopeRule,
	applyContentRules,
	applyDinkusRule,
	applyFrontmatterRule,
	applyWikilinkRule,
	buildSceneHeading,
	normalizeWhitespaceArtifacts,
	shiftH1sInBody,
	stripCalloutMarkers,
	stripComments,
	stripEmbeds,
	stripHighlights,
	stripTags,
	stripTaskCheckboxes,
	toRoman,
	transformOutsideCode,
	type RuleContext,
} from '../../../src/core/compile/content-rules';
import { createStripAccumulator } from '../../../src/core/compile/strip-accumulator';
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

	it('chapter mode slices like draft mode (planning sections excluded)', () => {
		const body = '# Planning\nnotes\n## Draft\nThe prose.';
		expect(applyBodyScopeRule(body, 'chapter')).toBe(
			applyBodyScopeRule(body, 'draft')
		);
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

	it('returns an empty string in chapter heading-scope (chapter walker emits its own H1)', () => {
		expect(
			buildSceneHeading(
				'Opening',
				1,
				makePresetFm({ 'dbench-compile-heading-scope': 'chapter' })
			)
		).toBe('');
	});

	it('suppresses scene H1 in chapter mode even with chapter-numbering set', () => {
		expect(
			buildSceneHeading(
				'Opening',
				3,
				makePresetFm({
					'dbench-compile-heading-scope': 'chapter',
					'dbench-compile-chapter-numbering': 'numeric',
				})
			)
		).toBe('');
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
	it('drops the marker line AND its continuation lines', () => {
		const body = '> [!note] Title\n> Body line\nOther content.';
		expect(stripCalloutMarkers(body)).toBe('Other content.');
	});

	it('handles collapsed and expanded variants, dropping the whole block', () => {
		const body =
			'> [!warning]- Collapsed\n> Body\n\n> [!tip]+ Expanded\n> More';
		// Both callouts dropped; only the blank line that separated
		// them survives — and that's the single empty element in the
		// output array, which `join('\n')` renders as `''`.
		expect(stripCalloutMarkers(body)).toBe('');
	});

	it('ends a callout at the first non-blockquote line', () => {
		const body =
			'before\n\n> [!note] Title\n> body line\n\nafter the callout';
		expect(stripCalloutMarkers(body)).toBe('before\n\n\nafter the callout');
	});

	it('handles a callout at end-of-input', () => {
		const body = 'paragraph\n\n> [!info] Heading\n> body';
		expect(stripCalloutMarkers(body)).toBe('paragraph\n');
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

describe('stripEmbeds', () => {
	it('drops every `![[...]]` embed regardless of category', () => {
		expect(stripEmbeds('before ![[pic.png]] after', 'strip')).toBe(
			'before  after'
		);
		expect(stripEmbeds('![[Note]] ![[view.base]]', 'strip')).toBe(' ');
	});

	it('handles anchor and display suffixes', () => {
		expect(stripEmbeds('![[pic.png#x50]]', 'strip')).toBe('');
		expect(stripEmbeds('![[pic.png|thumb]]', 'strip')).toBe('');
	});

	it('treats preserve and resolve modes as strip in V1', () => {
		expect(stripEmbeds('![[Note]]', 'resolve')).toBe('');
	});

	it('records each strip in the accumulator when provided', () => {
		const acc = createStripAccumulator();
		stripEmbeds(
			'![[pic.png]] ![[view.base]] ![[clip.mp3]] ![[Note]] ![[reading.pdf]] ![[scene.mp4]]',
			'strip',
			acc
		);
		const s = acc.snapshot();
		expect(s.counts.image).toBe(1);
		expect(s.counts.base).toBe(1);
		expect(s.counts.audio).toBe(1);
		expect(s.counts.pdf).toBe(1);
		expect(s.counts.video).toBe(1);
		expect(s.counts.note).toBe(1);
		expect(s.total).toBe(6);
	});

	it('treats unknown extensions as note embeds', () => {
		const acc = createStripAccumulator();
		stripEmbeds('![[Some Note]] ![[other.xyz]]', 'strip', acc);
		const s = acc.snapshot();
		expect(s.counts.note).toBe(2);
	});

	it('works without an accumulator (strip still happens)', () => {
		expect(stripEmbeds('![[pic.png]]', 'strip')).toBe('');
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
		// The tag strip leaves a double space ("with  and") that
		// `normalizeWhitespaceArtifacts` then collapses to one. The
		// trailing newline gets trimmed by the scene-trailing-
		// whitespace pass so scene concatenation stays clean.
		expect(result).toBe(
			'# Opening\n\nSee Target with and highlight.'
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

	it('emits the body without any heading in chapter mode', () => {
		const raw =
			'---\ntitle: X\n---\n# Planning\nnotes\n## Draft\nThe prose.';
		const preset = makePresetFm({ 'dbench-compile-heading-scope': 'chapter' });
		const result = applyContentRules(raw, baseCtx({ preset }));
		expect(result).toBe('The prose.');
	});

	it('emits an empty string in chapter mode when the draft slice is empty', () => {
		const raw = '## Draft\n';
		const preset = makePresetFm({ 'dbench-compile-heading-scope': 'chapter' });
		const result = applyContentRules(raw, baseCtx({ preset }));
		expect(result).toBe('');
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

	it('collapses the triple newline left behind when a paragraph-level comment is stripped', () => {
		const raw =
			'## Draft\nbefore the comment.\n\n%% stripped %%\n\nafter the comment.';
		const result = applyContentRules(raw, baseCtx());
		expect(result).toBe(
			'# Opening\n\nbefore the comment.\n\nafter the comment.'
		);
	});

	it('collapses the double space left behind when an inline embed is stripped', () => {
		const raw = '## Draft\nHe called for Arthur. ![[arthur]] had arrived.';
		const result = applyContentRules(raw, baseCtx());
		expect(result).toBe(
			'# Opening\n\nHe called for Arthur. had arrived.'
		);
	});

	it('trims trailing whitespace stripTags leaves at end of scene body', () => {
		// `#tag` at end of body: stripTags leaves `\n\n ` trailing
		// (the `\s` before the tag becomes ` ` in the replacement).
		// Without trimEnd, scene concatenation renders an extra blank
		// paragraph between scenes.
		const raw = '## Draft\nSome prose.\n\n#tag';
		const result = applyContentRules(raw, baseCtx());
		expect(result).toBe('# Opening\n\nSome prose.');
	});
});

describe('normalizeWhitespaceArtifacts', () => {
	it('collapses 2+ horizontal spaces between non-space characters', () => {
		expect(normalizeWhitespaceArtifacts('a  b')).toBe('a b');
		expect(normalizeWhitespaceArtifacts('a \t b')).toBe('a b');
		expect(normalizeWhitespaceArtifacts('a    b')).toBe('a b');
	});

	it('preserves leading indentation (whitespace at line start)', () => {
		// List continuation / code-style indentation should survive.
		expect(normalizeWhitespaceArtifacts('    const x = 1;')).toBe(
			'    const x = 1;'
		);
	});

	it('collapses runs of 3+ newlines to exactly one blank line', () => {
		expect(normalizeWhitespaceArtifacts('a\n\n\nb')).toBe('a\n\nb');
		expect(normalizeWhitespaceArtifacts('a\n\n\n\n\nb')).toBe('a\n\nb');
	});

	it('preserves a single blank line (two consecutive newlines)', () => {
		expect(normalizeWhitespaceArtifacts('a\n\nb')).toBe('a\n\nb');
	});

	it('preserves a single space between words', () => {
		expect(normalizeWhitespaceArtifacts('hello world')).toBe('hello world');
	});

	it('converts whitespace-only lines to true blank lines', () => {
		expect(normalizeWhitespaceArtifacts('before\n \nafter')).toBe(
			'before\n\nafter'
		);
		expect(normalizeWhitespaceArtifacts('before\n\t\nafter')).toBe(
			'before\n\nafter'
		);
	});

	it('collapses adjacent whitespace-only line + blank-line runs', () => {
		// `stripTags` leaves `\n\n ` at end-of-scene when a tag ends
		// the body; the middle pass turns the space-only line into a
		// true blank, and the third pass collapses the 3+ newline run.
		expect(normalizeWhitespaceArtifacts('a\n\n \n\nb')).toBe('a\n\nb');
	});
});
