import { describe, expect, it } from 'vitest';
import { classesForDbenchType } from '../../src/ui/leaf-styles';

describe('classesForDbenchType', () => {
	it('maps project to short + long-form pair', () => {
		expect(classesForDbenchType('project')).toEqual([
			'dbench-project',
			'draft-bench-project',
		]);
	});

	it('maps scene to short + long-form pair', () => {
		expect(classesForDbenchType('scene')).toEqual([
			'dbench-scene',
			'draft-bench-scene',
		]);
	});

	it('maps draft to short + long-form pair', () => {
		expect(classesForDbenchType('draft')).toEqual([
			'dbench-draft',
			'draft-bench-draft',
		]);
	});

	it('returns [] for null', () => {
		expect(classesForDbenchType(null)).toEqual([]);
	});

	it('returns [] for undefined', () => {
		expect(classesForDbenchType(undefined)).toEqual([]);
	});

	it('returns [] for an unknown type', () => {
		expect(classesForDbenchType('chapter')).toEqual([]); // post-V1 type
		expect(classesForDbenchType('nonsense')).toEqual([]);
	});

	it('returns a fresh array each call (safe to mutate)', () => {
		const a = classesForDbenchType('scene');
		a.push('extra');
		expect(classesForDbenchType('scene')).toEqual([
			'dbench-scene',
			'draft-bench-scene',
		]);
	});
});
