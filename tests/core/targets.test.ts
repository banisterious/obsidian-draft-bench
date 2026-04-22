import { describe, expect, it } from 'vitest';
import { formatProgress, readTargetWords } from '../../src/core/targets';

describe('readTargetWords', () => {
	it('returns a positive integer as-is', () => {
		expect(readTargetWords({ 'dbench-target-words': 3000 })).toBe(3000);
	});

	it('returns null when the key is absent', () => {
		expect(readTargetWords({})).toBeNull();
	});

	it('returns null when frontmatter is undefined', () => {
		expect(readTargetWords(undefined)).toBeNull();
	});

	it('returns null when the value is null', () => {
		expect(readTargetWords({ 'dbench-target-words': null })).toBeNull();
	});

	it('returns null for a string value (no parsing)', () => {
		expect(readTargetWords({ 'dbench-target-words': '3000' })).toBeNull();
	});

	it('returns null for zero or negative numbers', () => {
		expect(readTargetWords({ 'dbench-target-words': 0 })).toBeNull();
		expect(readTargetWords({ 'dbench-target-words': -1 })).toBeNull();
	});

	it('returns null for non-integer numbers', () => {
		expect(readTargetWords({ 'dbench-target-words': 3000.5 })).toBeNull();
	});

	it('returns null for NaN and Infinity', () => {
		expect(readTargetWords({ 'dbench-target-words': NaN })).toBeNull();
		expect(readTargetWords({ 'dbench-target-words': Infinity })).toBeNull();
	});
});

describe('formatProgress', () => {
	it('formats a standard in-progress case', () => {
		const view = formatProgress(2500, 3000);
		expect(view.label).toBe('2,500 / 3,000 words (83%)');
		expect(view.percent).toBe(83);
		expect(view.rawPercent).toBe(83);
		expect(view.overage).toBe(false);
	});

	it('formats zero count cleanly', () => {
		const view = formatProgress(0, 3000);
		expect(view.percent).toBe(0);
		expect(view.label).toBe('0 / 3,000 words (0%)');
		expect(view.overage).toBe(false);
	});

	it('formats exactly-at-target as 100% without overage', () => {
		const view = formatProgress(3000, 3000);
		expect(view.percent).toBe(100);
		expect(view.rawPercent).toBe(100);
		expect(view.overage).toBe(false);
		expect(view.label).toBe('3,000 / 3,000 words (100%)');
	});

	it('clamps display percent at 100 when over target but reports raw in label', () => {
		const view = formatProgress(3200, 3000);
		expect(view.percent).toBe(100);
		expect(view.rawPercent).toBe(107);
		expect(view.overage).toBe(true);
		expect(view.label).toBe('3,200 / 3,000 words (107%)');
	});

	it('uses locale number formatting', () => {
		const view = formatProgress(123456, 200000);
		expect(view.label).toContain('123,456');
		expect(view.label).toContain('200,000');
	});

	it('degrades gracefully on a zero target (should not be called in practice)', () => {
		const view = formatProgress(500, 0);
		expect(view.percent).toBe(0);
		expect(view.rawPercent).toBe(0);
		expect(view.overage).toBe(false);
		expect(view.label).toBe('500 words');
	});
});
