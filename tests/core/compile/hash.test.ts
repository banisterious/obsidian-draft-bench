import { describe, expect, it } from 'vitest';
import { djb2, formatChapterHash } from '../../../src/core/compile/hash';

describe('djb2', () => {
	it('produces a fixed-length 8-character hex digest', () => {
		expect(djb2('hello')).toMatch(/^[0-9a-f]{8}$/);
		expect(djb2('')).toMatch(/^[0-9a-f]{8}$/);
		expect(djb2('a very long input '.repeat(100))).toMatch(/^[0-9a-f]{8}$/);
	});

	it('is deterministic', () => {
		expect(djb2('hello')).toBe(djb2('hello'));
		expect(djb2('The quick brown fox')).toBe(djb2('The quick brown fox'));
	});

	it('differs between distinct inputs', () => {
		expect(djb2('hello')).not.toBe(djb2('world'));
		expect(djb2('a')).not.toBe(djb2('b'));
		expect(djb2('ab')).not.toBe(djb2('ba'));
	});

	it('returns the canonical djb2 starting value for empty input', () => {
		// djb2 seed 5381 = 0x1505.
		expect(djb2('')).toBe('00001505');
	});

	it('handles Unicode content without throwing', () => {
		expect(djb2('café')).toMatch(/^[0-9a-f]{8}$/);
		expect(djb2('文字')).toMatch(/^[0-9a-f]{8}$/);
		expect(djb2('café')).not.toBe(djb2('cafe'));
	});
});

describe('formatChapterHash', () => {
	it('joins scene id and hash with a colon', () => {
		expect(formatChapterHash('sc-001-tst-001', 'a1b2c3d4')).toBe(
			'sc-001-tst-001:a1b2c3d4'
		);
	});

	it('preserves an empty hash (sentinel for unreadable scenes if callers choose)', () => {
		expect(formatChapterHash('sc-001', '')).toBe('sc-001:');
	});
});
