import { describe, expect, it } from 'vitest';
import { filterFiles } from '../../src/settings/suggesters/file-filter';

describe('filterFiles', () => {
	const paths = [
		'Draft Bench/Templates/scene-template.md',
		'Draft Bench/Templates/chapter-template.md',
		'Notes/journal.md',
		'Notes/research.md',
		'My Novel/Chapter 1.md',
		'ReadMe.md',
	];

	it('returns all paths, sorted, for an empty query', () => {
		expect(filterFiles(paths, '')).toEqual([
			'Draft Bench/Templates/chapter-template.md',
			'Draft Bench/Templates/scene-template.md',
			'My Novel/Chapter 1.md',
			'Notes/journal.md',
			'Notes/research.md',
			'ReadMe.md',
		]);
	});

	it('does case-insensitive substring matching', () => {
		expect(filterFiles(paths, 'template')).toEqual([
			'Draft Bench/Templates/chapter-template.md',
			'Draft Bench/Templates/scene-template.md',
		]);
	});

	it('matches on filename fragments', () => {
		expect(filterFiles(paths, 'scene')).toEqual([
			'Draft Bench/Templates/scene-template.md',
		]);
	});

	it('returns an empty list when nothing matches', () => {
		expect(filterFiles(paths, 'xyz-no-such-thing')).toEqual([]);
	});

	it('does not mutate the input array', () => {
		const original = paths.slice();
		filterFiles(paths, '');
		expect(paths).toEqual(original);
	});
});
