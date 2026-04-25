import { describe, expect, it } from 'vitest';
import {
	formatScenesChanged,
	formatTimestamp,
} from '../../src/ui/manuscript-builder/sections/last-compile';

describe('formatTimestamp', () => {
	it('formats valid ISO strings to a locale-formatted string', () => {
		const out = formatTimestamp('2026-04-23T10:00:00.000Z');
		expect(out).not.toBe('2026-04-23T10:00:00.000Z');
		expect(out.length).toBeGreaterThan(0);
	});

	it('falls back to the input on invalid timestamps', () => {
		expect(formatTimestamp('not a date')).toBe('not a date');
		expect(formatTimestamp('')).toBe('');
	});
});

describe('formatScenesChanged', () => {
	it('reports the never-compiled baseline when no hashes are stored', () => {
		expect(
			formatScenesChanged({
				storedHashCount: 0,
				scenesChanged: 0,
				totalCurrentScenes: 5,
			})
		).toBe('No baseline; never compiled.');
	});

	it('reports no changes when the baseline matches', () => {
		expect(
			formatScenesChanged({
				storedHashCount: 5,
				scenesChanged: 0,
				totalCurrentScenes: 5,
			})
		).toBe('No changes since last compile.');
	});

	it('uses singular "scene" for exactly one change', () => {
		expect(
			formatScenesChanged({
				storedHashCount: 5,
				scenesChanged: 1,
				totalCurrentScenes: 5,
			})
		).toBe('1 scene changed since last compile.');
	});

	it('uses plural "scenes" for multiple changes', () => {
		expect(
			formatScenesChanged({
				storedHashCount: 5,
				scenesChanged: 3,
				totalCurrentScenes: 5,
			})
		).toBe('3 scenes changed since last compile.');
	});
});
