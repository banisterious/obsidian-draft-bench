import { describe, expect, it } from 'vitest';
import { isSceneFrontmatter } from '../../src/model/scene';

describe('isSceneFrontmatter', () => {
	it('accepts a fully-stamped scene frontmatter', () => {
		const fm = {
			'dbench-type': 'scene',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[My Novel]]',
			'dbench-project-id': 'lmw-194-bxh-806',
			'dbench-order': 3,
			'dbench-status': 'revision',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		};
		expect(isSceneFrontmatter(fm)).toBe(true);
	});

	it('accepts an orphan scene (empty project link)', () => {
		expect(
			isSceneFrontmatter({
				'dbench-type': 'scene',
				'dbench-id': 'abc-123-def-456',
				'dbench-project': '',
			})
		).toBe(true);
	});

	it('rejects when dbench-type is wrong', () => {
		expect(
			isSceneFrontmatter({
				'dbench-type': 'project',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(false);
	});

	it('rejects missing discriminator or id', () => {
		expect(isSceneFrontmatter({ 'dbench-id': 'abc-123-def-456' })).toBe(false);
		expect(isSceneFrontmatter({ 'dbench-type': 'scene' })).toBe(false);
	});

	it('rejects null, non-objects, and arrays', () => {
		expect(isSceneFrontmatter(null)).toBe(false);
		expect(isSceneFrontmatter(undefined)).toBe(false);
		expect(isSceneFrontmatter('scene')).toBe(false);
		expect(isSceneFrontmatter([])).toBe(false);
	});

	it('narrows the type when used as a guard', () => {
		const fm: unknown = {
			'dbench-type': 'scene',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Test]]',
			'dbench-project-id': 'lmw-194-bxh-806',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		};
		if (isSceneFrontmatter(fm)) {
			const _t: 'scene' = fm['dbench-type'];
			const _order: number = fm['dbench-order'];
			expect(_t).toBe('scene');
			expect(_order).toBe(1);
		} else {
			expect.fail('expected scene frontmatter to pass the guard');
		}
	});
});
