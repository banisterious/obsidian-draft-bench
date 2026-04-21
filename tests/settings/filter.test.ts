import { describe, expect, it } from 'vitest';
import { filterFolders } from '../../src/settings/suggesters/filter';

describe('filterFolders', () => {
	const folders = [
		'Draft Bench',
		'Draft Bench/Templates',
		'My Novel',
		'My Novel/Drafts',
		'Notes',
		'notes/research',
	];

	it('returns all folders, sorted, for an empty query', () => {
		expect(filterFolders(folders, '')).toEqual([
			'Draft Bench',
			'Draft Bench/Templates',
			'My Novel',
			'My Novel/Drafts',
			'Notes',
			'notes/research',
		]);
	});

	it('does case-insensitive substring matching', () => {
		expect(filterFolders(folders, 'draft')).toEqual([
			'Draft Bench',
			'Draft Bench/Templates',
			'My Novel/Drafts',
		]);
	});

	it('matches on subpath segments', () => {
		expect(filterFolders(folders, 'templates')).toEqual([
			'Draft Bench/Templates',
		]);
	});

	it('returns an empty list when nothing matches', () => {
		expect(filterFolders(folders, 'xyz')).toEqual([]);
	});

	it('matches across case boundaries', () => {
		// "notes" lowercase matches both "Notes" and "notes/research".
		expect(filterFolders(folders, 'notes')).toEqual([
			'Notes',
			'notes/research',
		]);
	});

	it('does not mutate the input array', () => {
		const original = folders.slice();
		filterFolders(folders, '');
		expect(folders).toEqual(original);
	});
});
