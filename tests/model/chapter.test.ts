import { describe, expect, it } from 'vitest';
import { isChapterFrontmatter } from '../../src/model/chapter';

describe('isChapterFrontmatter', () => {
	it('accepts a fully-stamped chapter frontmatter', () => {
		const fm = {
			'dbench-type': 'chapter',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[My Novel]]',
			'dbench-project-id': 'lmw-194-bxh-806',
			'dbench-order': 3,
			'dbench-status': 'revision',
			'dbench-scenes': ['[[Scene A]]', '[[Scene B]]'],
			'dbench-scene-ids': ['111-222-333-444', '555-666-777-888'],
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		};
		expect(isChapterFrontmatter(fm)).toBe(true);
	});

	it('accepts a chapter with optional target-words and synopsis', () => {
		const fm = {
			'dbench-type': 'chapter',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Novel]]',
			'dbench-target-words': 3000,
			'dbench-synopsis': 'Mara reaches the lighthouse for the first time in years.',
		};
		expect(isChapterFrontmatter(fm)).toBe(true);
	});

	it('accepts an orphan chapter (empty project link)', () => {
		expect(
			isChapterFrontmatter({
				'dbench-type': 'chapter',
				'dbench-id': 'abc-123-def-456',
				'dbench-project': '',
			})
		).toBe(true);
	});

	it('rejects when dbench-type is wrong', () => {
		expect(
			isChapterFrontmatter({
				'dbench-type': 'scene',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(false);
		expect(
			isChapterFrontmatter({
				'dbench-type': 'project',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(false);
	});

	it('rejects missing discriminator or id', () => {
		expect(isChapterFrontmatter({ 'dbench-id': 'abc-123-def-456' })).toBe(false);
		expect(isChapterFrontmatter({ 'dbench-type': 'chapter' })).toBe(false);
	});

	it('rejects null, non-objects, and arrays', () => {
		expect(isChapterFrontmatter(null)).toBe(false);
		expect(isChapterFrontmatter(undefined)).toBe(false);
		expect(isChapterFrontmatter('chapter')).toBe(false);
		expect(isChapterFrontmatter([])).toBe(false);
	});

	it('narrows the type when used as a guard', () => {
		const fm: unknown = {
			'dbench-type': 'chapter',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'lmw-194-bxh-806',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		};
		if (isChapterFrontmatter(fm)) {
			const _t: 'chapter' = fm['dbench-type'];
			const _order: number = fm['dbench-order'];
			expect(_t).toBe('chapter');
			expect(_order).toBe(1);
		} else {
			expect.fail('expected chapter frontmatter to pass the guard');
		}
	});
});
