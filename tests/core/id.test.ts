import { describe, expect, it } from 'vitest';
import { generateDbenchId, isValidDbenchId } from '../../src/core/id';

describe('generateDbenchId', () => {
	it('produces an ID matching the documented format', () => {
		const id = generateDbenchId();
		expect(id).toMatch(/^[a-z]{3}-\d{3}-[a-z]{3}-\d{3}$/);
	});

	it('has length 15 and three hyphens', () => {
		const id = generateDbenchId();
		expect(id).toHaveLength(15);
		expect(id.split('-')).toHaveLength(4);
	});

	it('produces different IDs on successive calls', () => {
		const a = generateDbenchId();
		const b = generateDbenchId();
		expect(a).not.toBe(b);
	});

	it('produces unique IDs at scale (1000 generations, zero collisions)', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			seen.add(generateDbenchId());
		}
		expect(seen.size).toBe(1000);
	});

	it('every generated ID passes isValidDbenchId', () => {
		for (let i = 0; i < 50; i++) {
			expect(isValidDbenchId(generateDbenchId())).toBe(true);
		}
	});

	it('covers all letters over many generations (not locked to a subset)', () => {
		// Sanity check: the rejection-sampling implementation shouldn't
		// systematically skip any character. Over 500 generations we
		// expect to see at least 20 distinct lowercase letters across
		// the letter segments (26 total possible; budget some slack for
		// small runs).
		const letters = new Set<string>();
		for (let i = 0; i < 500; i++) {
			const id = generateDbenchId();
			for (const ch of id) {
				if (/[a-z]/.test(ch)) letters.add(ch);
			}
		}
		expect(letters.size).toBeGreaterThanOrEqual(20);
	});
});

describe('isValidDbenchId', () => {
	it('accepts valid example IDs', () => {
		expect(isValidDbenchId('abc-123-def-456')).toBe(true);
		expect(isValidDbenchId('aaa-000-zzz-999')).toBe(true);
		expect(isValidDbenchId('xyz-007-abc-123')).toBe(true);
	});

	it('rejects the empty string', () => {
		expect(isValidDbenchId('')).toBe(false);
	});

	it('rejects non-string values', () => {
		expect(isValidDbenchId(null)).toBe(false);
		expect(isValidDbenchId(undefined)).toBe(false);
		expect(isValidDbenchId(42)).toBe(false);
		expect(isValidDbenchId({})).toBe(false);
		expect(isValidDbenchId([])).toBe(false);
		expect(isValidDbenchId(true)).toBe(false);
	});

	it('rejects wrong segment count', () => {
		expect(isValidDbenchId('abc-123')).toBe(false);
		expect(isValidDbenchId('abc-123-def')).toBe(false);
		expect(isValidDbenchId('abc-123-def-456-ghi')).toBe(false);
	});

	it('rejects wrong segment length', () => {
		expect(isValidDbenchId('ab-123-def-456')).toBe(false);
		expect(isValidDbenchId('abcd-123-def-456')).toBe(false);
		expect(isValidDbenchId('abc-12-def-456')).toBe(false);
		expect(isValidDbenchId('abc-1234-def-456')).toBe(false);
	});

	it('rejects uppercase letters', () => {
		expect(isValidDbenchId('ABC-123-def-456')).toBe(false);
		expect(isValidDbenchId('Abc-123-def-456')).toBe(false);
		expect(isValidDbenchId('abc-123-DEF-456')).toBe(false);
	});

	it('rejects wrong character classes per segment', () => {
		expect(isValidDbenchId('123-abc-def-456')).toBe(false);
		expect(isValidDbenchId('abc-def-ghi-jkl')).toBe(false);
		expect(isValidDbenchId('a1c-123-def-456')).toBe(false);
		expect(isValidDbenchId('abc-1a3-def-456')).toBe(false);
	});

	it('rejects surrounding whitespace', () => {
		expect(isValidDbenchId(' abc-123-def-456')).toBe(false);
		expect(isValidDbenchId('abc-123-def-456 ')).toBe(false);
		expect(isValidDbenchId('abc-123-def-456\n')).toBe(false);
	});

	it('rejects wrong separator characters', () => {
		expect(isValidDbenchId('abc_123_def_456')).toBe(false);
		expect(isValidDbenchId('abc.123.def.456')).toBe(false);
		expect(isValidDbenchId('abc123def456')).toBe(false);
		expect(isValidDbenchId('abc 123 def 456')).toBe(false);
	});

	it('narrows the type when used as a guard', () => {
		const candidate: unknown = 'abc-123-def-456';
		if (isValidDbenchId(candidate)) {
			// Compile-time check: candidate is typed as string here.
			const _length: number = candidate.length;
			expect(_length).toBe(15);
		} else {
			expect.fail('expected valid ID to pass the guard');
		}
	});
});
