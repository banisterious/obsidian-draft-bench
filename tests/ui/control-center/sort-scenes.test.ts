import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { sortScenesByOrder } from '../../../src/ui/control-center/tabs/sort-scenes';
import type { SceneNote } from '../../../src/core/discovery';
import type { SceneFrontmatter } from '../../../src/model/scene';

function makeScene(basename: string, order: number): SceneNote {
	const file = new TFile({
		path: `scenes/${basename}.md`,
		basename,
		extension: 'md',
	});
	const frontmatter: SceneFrontmatter = {
		'dbench-type': 'scene',
		'dbench-id': `id-${basename}`,
		'dbench-project': '[[Project]]',
		'dbench-project-id': 'project-id',
		'dbench-order': order,
		'dbench-status': 'idea',
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	};
	return { file, frontmatter };
}

describe('sortScenesByOrder', () => {
	it('sorts by dbench-order ascending', () => {
		const scenes = [
			makeScene('c', 3),
			makeScene('a', 1),
			makeScene('b', 2),
		];
		const sorted = sortScenesByOrder(scenes);
		expect(sorted.map((s) => s.file.basename)).toEqual(['a', 'b', 'c']);
	});

	it('returns a new array without mutating the input', () => {
		const scenes = [makeScene('c', 3), makeScene('a', 1), makeScene('b', 2)];
		const original = [...scenes];
		sortScenesByOrder(scenes);
		expect(scenes).toEqual(original);
	});

	it('returns an empty array for an empty input', () => {
		expect(sortScenesByOrder([])).toEqual([]);
	});

	it('keeps equal-order scenes in their input order', () => {
		const scenes = [
			makeScene('first', 1),
			makeScene('second', 1),
			makeScene('third', 1),
		];
		const sorted = sortScenesByOrder(scenes);
		expect(sorted.map((s) => s.file.basename)).toEqual([
			'first',
			'second',
			'third',
		]);
	});

	it('handles a single-scene list', () => {
		const scenes = [makeScene('only', 5)];
		expect(sortScenesByOrder(scenes)).toEqual(scenes);
	});
});
