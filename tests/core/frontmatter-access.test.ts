import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import {
	adaptProcessFrontMatter,
	readArray,
	readBoolean,
	readNumber,
	readString,
	toGeneric,
} from '../../src/core/frontmatter-access';

describe('adaptProcessFrontMatter', () => {
	it('returns the same object reference (identity cast)', () => {
		const fm = { 'dbench-status': 'draft' };
		const out = adaptProcessFrontMatter(fm);
		expect(out).toBe(fm);
	});

	it('allows downstream reads to use bracket notation without ts-eslint complaints', () => {
		const fm = adaptProcessFrontMatter({ 'dbench-id': 'sc-test-001' });
		// The value is `unknown` at the type level; the caller narrows.
		expect(readString(fm['dbench-id'])).toBe('sc-test-001');
	});

	it('allows assignment through the adapted record', () => {
		const raw: Record<string, unknown> = {};
		const fm = adaptProcessFrontMatter(raw);
		fm['dbench-status'] = 'final';
		expect(raw['dbench-status']).toBe('final');
	});
});

describe('toGeneric', () => {
	it('preserves the file reference and exposes frontmatter as Record<string, unknown>', () => {
		const file = new TFile({
			path: 'Project.md',
			basename: 'Project',
			extension: 'md',
			stat: { mtime: 0, ctime: 0, size: 0 },
		});
		const typedNote = {
			file,
			frontmatter: { 'dbench-type': 'project', 'dbench-id': 'prj-1' },
		};
		const generic = toGeneric(typedNote);
		expect(generic.file).toBe(file);
		expect(generic.frontmatter['dbench-id']).toBe('prj-1');
	});

	it('does not deep-copy the frontmatter (mutations propagate)', () => {
		const file = new TFile({
			path: 'a.md',
			basename: 'a',
			extension: 'md',
			stat: { mtime: 0, ctime: 0, size: 0 },
		});
		const raw = { 'dbench-status': 'draft' };
		const generic = toGeneric({ file, frontmatter: raw });
		generic.frontmatter['dbench-status'] = 'revision';
		expect(raw['dbench-status']).toBe('revision');
	});
});

describe('readString', () => {
	it('returns the string when input is a string', () => {
		expect(readString('hello')).toBe('hello');
		expect(readString('')).toBe('');
	});

	it('returns "" for non-string inputs (matches integrity.ts convention)', () => {
		expect(readString(undefined)).toBe('');
		expect(readString(null)).toBe('');
		expect(readString(42)).toBe('');
		expect(readString(true)).toBe('');
		expect(readString({})).toBe('');
		expect(readString([])).toBe('');
	});
});

describe('readNumber', () => {
	it('returns the number when input is finite', () => {
		expect(readNumber(0)).toBe(0);
		expect(readNumber(1)).toBe(1);
		expect(readNumber(-3.14)).toBe(-3.14);
	});

	it('returns null for non-numeric inputs', () => {
		expect(readNumber(undefined)).toBeNull();
		expect(readNumber(null)).toBeNull();
		expect(readNumber('42')).toBeNull();
		expect(readNumber(true)).toBeNull();
		expect(readNumber({})).toBeNull();
	});

	it('rejects NaN defensively', () => {
		expect(readNumber(Number.NaN)).toBeNull();
	});

	it('accepts Infinity (a valid number, distinct from NaN)', () => {
		expect(readNumber(Infinity)).toBe(Infinity);
	});
});

describe('readBoolean', () => {
	it('returns the boolean when input is a boolean', () => {
		expect(readBoolean(true)).toBe(true);
		expect(readBoolean(false)).toBe(false);
	});

	it('returns null for non-boolean inputs', () => {
		expect(readBoolean(undefined)).toBeNull();
		expect(readBoolean(null)).toBeNull();
		expect(readBoolean(0)).toBeNull();
		expect(readBoolean(1)).toBeNull();
		expect(readBoolean('true')).toBeNull();
		expect(readBoolean([])).toBeNull();
	});
});

describe('readArray', () => {
	it('returns the array as-is when input is an array', () => {
		expect(readArray(['a', 'b'])).toEqual(['a', 'b']);
		expect(readArray([])).toEqual([]);
	});

	it('returns [] for non-array inputs (matches existing convention)', () => {
		expect(readArray(undefined)).toEqual([]);
		expect(readArray(null)).toEqual([]);
		expect(readArray('not-an-array')).toEqual([]);
		expect(readArray(42)).toEqual([]);
		expect(readArray({})).toEqual([]);
	});

	it('returns the actual reference (caller can mutate)', () => {
		const arr = ['x', 'y'];
		expect(readArray(arr)).toBe(arr);
	});
});
