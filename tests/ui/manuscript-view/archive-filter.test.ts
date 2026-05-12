import { describe, expect, it } from 'vitest';
import { filterArchivedScenes } from '../../../src/ui/manuscript-view/sections/manuscript-list-section';

interface FakeScene {
	frontmatter: { 'dbench-status': string };
}

function scene(status: string): FakeScene {
	return { frontmatter: { 'dbench-status': status } };
}

describe('filterArchivedScenes', () => {
	it('drops scenes whose status is in hiddenStatuses when showArchived is off', () => {
		const scenes = [scene('draft'), scene('archived'), scene('final')];
		const filtered = filterArchivedScenes(scenes, {
			hiddenStatuses: ['archived'],
			showArchived: false,
		});
		expect(filtered).toEqual([scene('draft'), scene('final')]);
	});

	it('returns all scenes when showArchived is on', () => {
		const scenes = [scene('draft'), scene('archived'), scene('final')];
		const filtered = filterArchivedScenes(scenes, {
			hiddenStatuses: ['archived'],
			showArchived: true,
		});
		expect(filtered).toEqual(scenes);
	});

	it('treats hiddenStatuses as a set (multiple hidden statuses honored)', () => {
		const scenes = [scene('draft'), scene('cut'), scene('archived')];
		const filtered = filterArchivedScenes(scenes, {
			hiddenStatuses: ['archived', 'cut'],
			showArchived: false,
		});
		expect(filtered).toEqual([scene('draft')]);
	});

	it('returns a fresh array (safe to sort / mutate)', () => {
		const scenes = [scene('draft')];
		const filtered = filterArchivedScenes(scenes, {
			hiddenStatuses: ['archived'],
			showArchived: true,
		});
		expect(filtered).not.toBe(scenes);
	});

	it('treats an empty hiddenStatuses list as "nothing hidden"', () => {
		const scenes = [scene('draft'), scene('archived')];
		const filtered = filterArchivedScenes(scenes, {
			hiddenStatuses: [],
			showArchived: false,
		});
		expect(filtered).toEqual(scenes);
	});
});
