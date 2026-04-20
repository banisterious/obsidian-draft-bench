import { describe, expect, it } from 'vitest';
import { isProjectFrontmatter } from '../../src/model/project';

describe('isProjectFrontmatter', () => {
	it('accepts a fully-stamped project frontmatter', () => {
		const fm = {
			'dbench-type': 'project',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[My Novel]]',
			'dbench-project-id': 'abc-123-def-456',
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		};
		expect(isProjectFrontmatter(fm)).toBe(true);
	});

	it('accepts a partial frontmatter as long as the discriminator and id are present', () => {
		// Reflects the V1 design: the guard is for filtering vault scans,
		// not for asserting completeness. Integrity service handles the rest.
		expect(
			isProjectFrontmatter({
				'dbench-type': 'project',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(true);
	});

	it('rejects when dbench-type is wrong', () => {
		expect(
			isProjectFrontmatter({
				'dbench-type': 'scene',
				'dbench-id': 'abc-123-def-456',
			})
		).toBe(false);
	});

	it('rejects when dbench-type is missing', () => {
		expect(isProjectFrontmatter({ 'dbench-id': 'abc-123-def-456' })).toBe(false);
	});

	it('rejects when dbench-id is missing', () => {
		expect(isProjectFrontmatter({ 'dbench-type': 'project' })).toBe(false);
	});

	it('rejects when dbench-id is not a string', () => {
		expect(
			isProjectFrontmatter({ 'dbench-type': 'project', 'dbench-id': 123 })
		).toBe(false);
		expect(
			isProjectFrontmatter({ 'dbench-type': 'project', 'dbench-id': null })
		).toBe(false);
	});

	it('rejects null and non-objects', () => {
		expect(isProjectFrontmatter(null)).toBe(false);
		expect(isProjectFrontmatter(undefined)).toBe(false);
		expect(isProjectFrontmatter('project')).toBe(false);
		expect(isProjectFrontmatter(42)).toBe(false);
		expect(isProjectFrontmatter([])).toBe(false);
	});

	it('narrows the type when used as a guard', () => {
		const fm: unknown = {
			'dbench-type': 'project',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Test]]',
			'dbench-project-id': 'abc-123-def-456',
			'dbench-project-shape': 'folder',
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		};
		if (isProjectFrontmatter(fm)) {
			// Compile-time check: typed as 'project' literal.
			const _t: 'project' = fm['dbench-type'];
			expect(_t).toBe('project');
		} else {
			expect.fail('expected project frontmatter to pass the guard');
		}
	});
});
