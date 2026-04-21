import { describe, expect, it } from 'vitest';
import {
	countScene,
	countWords,
	sliceToDraft,
	stripFrontmatter,
	stripMarkup,
} from '../../src/core/word-count';

describe('countWords', () => {
	it('splits on whitespace and counts non-empty tokens', () => {
		expect(countWords('one two three')).toBe(3);
	});

	it('counts 0 for empty input', () => {
		expect(countWords('')).toBe(0);
	});

	it('counts 0 for whitespace-only input', () => {
		expect(countWords('   \n\t\n  ')).toBe(0);
	});

	it('counts contractions as one word', () => {
		expect(countWords("don't can't won't")).toBe(3);
	});

	it('counts hyphenated compounds as one word', () => {
		expect(countWords('state-of-the-art mother-in-law')).toBe(2);
	});

	it('counts numbers as words', () => {
		expect(countWords('404 3.14 2026')).toBe(3);
	});

	it('collapses runs of whitespace', () => {
		expect(countWords('one  two\n\nthree\t\tfour')).toBe(4);
	});

	it('counts a single word', () => {
		expect(countWords('solo')).toBe(1);
	});
});

describe('stripFrontmatter', () => {
	it('removes a leading frontmatter block', () => {
		const input = '---\ntitle: Scene\n---\nBody text here.\n';
		expect(stripFrontmatter(input)).toBe('Body text here.\n');
	});

	it('returns input unchanged when there is no frontmatter', () => {
		const input = 'Body text only.\n';
		expect(stripFrontmatter(input)).toBe(input);
	});

	it('returns input unchanged when it does not start with ---', () => {
		const input = 'Intro.\n\n---\ntitle: Not frontmatter\n---\n';
		expect(stripFrontmatter(input)).toBe(input);
	});

	it('treats unterminated frontmatter as all-frontmatter', () => {
		const input = '---\ntitle: Scene\nno closer\n';
		expect(stripFrontmatter(input)).toBe('');
	});

	it('accepts the `...` closing delimiter', () => {
		const input = '---\ntitle: Scene\n...\nBody\n';
		expect(stripFrontmatter(input)).toBe('Body\n');
	});

	it('preserves an empty body after frontmatter', () => {
		expect(stripFrontmatter('---\nkey: value\n---\n')).toBe('');
	});
});

describe('sliceToDraft', () => {
	it('returns everything after "## Draft"', () => {
		const input =
			'## Source passages\n\nNotes\n\n## Draft\n\nThe real prose here.\n';
		expect(sliceToDraft(input)).toBe('\nThe real prose here.\n');
	});

	it('returns input unchanged when "## Draft" is absent', () => {
		const input = '## Beat outline\n\nOnly planning.\n';
		expect(sliceToDraft(input)).toBe(input);
	});

	it('matches the first "## Draft" only', () => {
		const input = '## Draft\n\nFirst\n\n## Draft\n\nSecond\n';
		expect(sliceToDraft(input)).toBe('\nFirst\n\n## Draft\n\nSecond\n');
	});

	it('tolerates trailing whitespace on the heading line', () => {
		const input = '## Draft   \n\nProse\n';
		expect(sliceToDraft(input)).toBe('\nProse\n');
	});

	it('does not match headings at other levels', () => {
		const input = '### Draft\n\nSubheading prose\n';
		expect(sliceToDraft(input)).toBe(input);
	});

	it('does not match headings with different text', () => {
		const input = '## Prose\n\nRenamed heading\n';
		expect(sliceToDraft(input)).toBe(input);
	});

	it('is case-sensitive (## draft does not match)', () => {
		const input = '## draft\n\nLowercase heading\n';
		expect(sliceToDraft(input)).toBe(input);
	});

	it('returns empty string for a scene with only the Draft heading', () => {
		expect(sliceToDraft('## Draft\n')).toBe('');
	});

	it('does not match "## Draft" mid-line', () => {
		const input = 'This is ## Draft inline, not a heading.\n';
		expect(sliceToDraft(input)).toBe(input);
	});
});

describe('stripMarkup', () => {
	it('strips fenced code blocks with ```', () => {
		const input = 'before\n```ts\nconst x = 1;\n```\nafter';
		expect(stripMarkup(input)).toBe('before\n\nafter');
	});

	it('strips fenced code blocks with ~~~', () => {
		const input = 'a\n~~~\ncode\n~~~\nb';
		expect(stripMarkup(input)).toBe('a\n\nb');
	});

	it('strips inline code', () => {
		expect(stripMarkup('plain `code` text')).toBe('plain  text');
	});

	it('strips Obsidian %% comments %%', () => {
		expect(stripMarkup('before %%hidden%% after')).toBe('before  after');
	});

	it('strips HTML <!-- comments -->', () => {
		expect(stripMarkup('visible <!-- invisible --> rest')).toBe(
			'visible  rest'
		);
	});

	it('unwraps wikilinks without alias', () => {
		expect(stripMarkup('see [[Target Note]] for more')).toBe(
			'see Target Note for more'
		);
	});

	it('unwraps wikilinks with alias (keeps display)', () => {
		expect(stripMarkup('visit [[Target Note|the target]] now')).toBe(
			'visit the target now'
		);
	});

	it('unwraps markdown links (keeps display)', () => {
		expect(stripMarkup('read [the post](https://example.com) today')).toBe(
			'read the post today'
		);
	});

	it('leaves regular prose untouched', () => {
		const input = 'Quick brown fox jumps over the lazy dog.';
		expect(stripMarkup(input)).toBe(input);
	});

	it('applies all rules in one pass', () => {
		const input =
			'`inline` prose with [[link]], %%aside%%, and ```\ncode\n``` finish.';
		expect(stripMarkup(input)).toBe(
			' prose with link, , and  finish.'
		);
	});
});

describe('countScene', () => {
	it('runs the full pipeline on a V1-template scene', () => {
		const markdown = [
			'---',
			'dbench-type: scene',
			'dbench-id: abc',
			'---',
			'## Source passages',
			'',
			'Lorem ipsum planning notes.',
			'',
			'## Beat outline',
			'',
			'- Beat one',
			'- Beat two',
			'',
			'## Open questions',
			'',
			'Does this belong here?',
			'',
			'## Draft',
			'',
			'The quick brown fox jumps over the lazy dog.',
			'',
			'Another sentence with five words here.',
			'',
		].join('\n');

		expect(countScene(markdown)).toBe(9 + 6); // 15 — only content below "## Draft"
	});

	it('falls back to whole-body counting when "## Draft" is absent', () => {
		const markdown = [
			'---',
			'dbench-type: scene',
			'---',
			'',
			'Free-form scene body with ten tokens, no heading structure at all.',
			'',
		].join('\n');
		expect(countScene(markdown)).toBe(11);
	});

	it('ignores code blocks below the Draft heading', () => {
		const markdown = [
			'---',
			'key: value',
			'---',
			'## Draft',
			'',
			'Visible prose here.',
			'',
			'```ts',
			'const counted = false;',
			'```',
			'',
			'Tail prose.',
			'',
		].join('\n');
		expect(countScene(markdown)).toBe(3 + 2); // 5
	});

	it('unwraps wikilinks and counts their display text', () => {
		const markdown =
			'---\ntitle: s\n---\n## Draft\n\nRefers to [[Other Note|the other one]] directly.\n';
		expect(countScene(markdown)).toBe(6);
	});

	it('returns 0 for a scene with only frontmatter and a Draft heading', () => {
		const markdown = '---\nkey: v\n---\n## Draft\n';
		expect(countScene(markdown)).toBe(0);
	});

	it('returns 0 for an empty string', () => {
		expect(countScene('')).toBe(0);
	});

	it('returns 0 for frontmatter-only input', () => {
		expect(countScene('---\nkey: value\n---\n')).toBe(0);
	});

	it('counts a template-free scene from first character', () => {
		expect(countScene('One two three four five.')).toBe(5);
	});

	it('strips inline comments around real prose', () => {
		const markdown =
			'## Draft\n\nReal %%todo: revise%% prose with <!-- hidden --> content.\n';
		// "Real prose with content." = 4 words (tokens: Real, prose, with, content.)
		expect(countScene(markdown)).toBe(4);
	});
});
