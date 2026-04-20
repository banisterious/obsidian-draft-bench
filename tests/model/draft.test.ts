import { describe, expect, it } from 'vitest';
import { isDraftFrontmatter } from '../../src/model/draft';

describe('isDraftFrontmatter', () => {
	it('accepts a fully-stamped draft frontmatter for a folder-project scene', () => {
		const fm = {
			'dbench-type': 'draft',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[My Novel]]',
			'dbench-scene': '[[Tempting Waters]]',
			'dbench-scene-id': 'lmw-194-bxh-806',
			'dbench-draft-number': 2,
		};
		expect(isDraftFrontmatter(fm)).toBe(true);
	});

	it('accepts a draft of a single-scene project (empty scene fields)', () => {
		expect(
			isDraftFrontmatter({
				'dbench-type': 'draft',
				'dbench-id': 'abc-123-def-456',
				'dbench-project': '[[A Small Thing]]',
				'dbench-scene': '',
				'dbench-scene-id': '',
				'dbench-draft-number': 1,
			})
		).toBe(true);
	});

	it('rejects when dbench-type is wrong', () => {
		expect(
			isDraftFrontmatter({
				'dbench-type': 'scene',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(false);
	});

	it('rejects missing discriminator or id', () => {
		expect(isDraftFrontmatter({ 'dbench-id': 'abc-123-def-456' })).toBe(false);
		expect(isDraftFrontmatter({ 'dbench-type': 'draft' })).toBe(false);
	});

	it('rejects null, non-objects, and primitives', () => {
		expect(isDraftFrontmatter(null)).toBe(false);
		expect(isDraftFrontmatter(undefined)).toBe(false);
		expect(isDraftFrontmatter('draft')).toBe(false);
		expect(isDraftFrontmatter(0)).toBe(false);
	});

	it('narrows the type when used as a guard', () => {
		const fm: unknown = {
			'dbench-type': 'draft',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Test]]',
			'dbench-scene': '[[Scene]]',
			'dbench-scene-id': 'lmw-194-bxh-806',
			'dbench-draft-number': 1,
		};
		if (isDraftFrontmatter(fm)) {
			const _t: 'draft' = fm['dbench-type'];
			const _n: number = fm['dbench-draft-number'];
			expect(_t).toBe('draft');
			expect(_n).toBe(1);
		} else {
			expect.fail('expected draft frontmatter to pass the guard');
		}
	});
});
