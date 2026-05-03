import { describe, expect, it } from 'vitest';
import { isSubSceneFrontmatter } from '../../src/model/sub-scene';

describe('isSubSceneFrontmatter', () => {
	it('accepts a fully-stamped sub-scene frontmatter', () => {
		const fm = {
			'dbench-type': 'sub-scene',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Meridian Drift]]',
			'dbench-project-id': 'lmw-194-bxh-806',
			'dbench-scene': '[[The auction]]',
			'dbench-scene-id': 'rkn-482-pvt-739',
			'dbench-order': 2,
			'dbench-status': 'draft',
			'dbench-drafts': ['[[The auction - Lot 47 - Draft 1 (20260502)]]'],
			'dbench-draft-ids': ['drf-555-666-777'],
		};
		expect(isSubSceneFrontmatter(fm)).toBe(true);
	});

	it('accepts a sub-scene with optional target-words, subtitle, synopsis, and section-break', () => {
		const fm = {
			'dbench-type': 'sub-scene',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Novel]]',
			'dbench-target-words': 800,
			'dbench-subtitle': 'POV shift to Mara',
			'dbench-synopsis': "the lot's provenance falls apart",
			'dbench-section-break-title': 'Three days later',
			'dbench-section-break-style': 'visual',
		};
		expect(isSubSceneFrontmatter(fm)).toBe(true);
	});

	it('accepts an orphan sub-scene (empty project + scene refs)', () => {
		expect(
			isSubSceneFrontmatter({
				'dbench-type': 'sub-scene',
				'dbench-id': 'abc-123-def-456',
				'dbench-project': '',
				'dbench-scene': '',
			})
		).toBe(true);
	});

	it('rejects when dbench-type is wrong', () => {
		expect(
			isSubSceneFrontmatter({
				'dbench-type': 'scene',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(false);
		expect(
			isSubSceneFrontmatter({
				'dbench-type': 'chapter',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(false);
		expect(
			isSubSceneFrontmatter({
				'dbench-type': 'project',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(false);
	});

	it('rejects missing discriminator or id', () => {
		expect(isSubSceneFrontmatter({ 'dbench-id': 'abc-123-def-456' })).toBe(false);
		expect(isSubSceneFrontmatter({ 'dbench-type': 'sub-scene' })).toBe(false);
	});

	it('rejects null, non-objects, and arrays', () => {
		expect(isSubSceneFrontmatter(null)).toBe(false);
		expect(isSubSceneFrontmatter(undefined)).toBe(false);
		expect(isSubSceneFrontmatter('sub-scene')).toBe(false);
		expect(isSubSceneFrontmatter([])).toBe(false);
	});

	it('narrows the type when used as a guard', () => {
		const fm: unknown = {
			'dbench-type': 'sub-scene',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'lmw-194-bxh-806',
			'dbench-scene': '[[The auction]]',
			'dbench-scene-id': 'rkn-482-pvt-739',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		};
		if (isSubSceneFrontmatter(fm)) {
			const _t: 'sub-scene' = fm['dbench-type'];
			const _order: number = fm['dbench-order'];
			const _scene: string = fm['dbench-scene'];
			expect(_t).toBe('sub-scene');
			expect(_order).toBe(1);
			expect(_scene).toBe('[[The auction]]');
		} else {
			expect.fail('expected sub-scene frontmatter to pass the guard');
		}
	});
});
