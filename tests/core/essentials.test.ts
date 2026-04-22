import { describe, expect, it } from 'vitest';
import {
	stampDbenchId,
	stampDraftEssentials,
	stampProjectEssentials,
	stampSceneEssentials,
	type EssentialsContext,
} from '../../src/core/essentials';
import { isValidDbenchId } from '../../src/core/id';

const ctx = (basename: string): EssentialsContext => ({ basename });

describe('stampProjectEssentials', () => {
	it('stamps all eight project keys onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, ctx('My Novel'));

		expect(fm['dbench-type']).toBe('project');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('[[My Novel]]');
		expect(fm['dbench-project-id']).toBe(fm['dbench-id']);
		expect(fm['dbench-project-shape']).toBe('folder');
		expect(fm['dbench-status']).toBe('idea');
		expect(fm['dbench-scenes']).toEqual([]);
		expect(fm['dbench-scene-ids']).toEqual([]);
	});

	it('uses the basename in the self-link', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, ctx('A Salt-Worn Road'));
		expect(fm['dbench-project']).toBe('[[A Salt-Worn Road]]');
	});

	it('mirrors dbench-id into dbench-project-id', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['dbench-project-id']).toBe(fm['dbench-id']);
	});

	it('is idempotent: re-running produces the same frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, ctx('Project'));
		const snapshot = { ...fm };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves an existing dbench-id and uses it for project-id', () => {
		const fm: Record<string, unknown> = { 'dbench-id': 'aaa-111-bbb-222' };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['dbench-id']).toBe('aaa-111-bbb-222');
		expect(fm['dbench-project-id']).toBe('aaa-111-bbb-222');
	});

	it('preserves existing values across all stamped keys', () => {
		const fm: Record<string, unknown> = {
			'dbench-type': 'project',
			'dbench-id': 'aaa-111-bbb-222',
			'dbench-project': '[[Custom Link]]',
			'dbench-project-id': 'aaa-111-bbb-222',
			'dbench-project-shape': 'single',
			'dbench-status': 'revision',
			'dbench-scenes': ['[[Scene 1]]'],
			'dbench-scene-ids': ['xyz-789-abc-456'],
		};
		const snapshot = { ...fm };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves non-dbench properties already on the note', () => {
		const fm: Record<string, unknown> = {
			tags: ['fiction', 'novel'],
			created: '2026-04-20',
			author: 'John Banister',
		};
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['tags']).toEqual(['fiction', 'novel']);
		expect(fm['created']).toBe('2026-04-20');
		expect(fm['author']).toBe('John Banister');
	});

	it('treats null values as missing (YAML empty-value case)', () => {
		const fm: Record<string, unknown> = { 'dbench-status': null };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['dbench-status']).toBe('idea');
	});

	it('preserves an existing empty string (not the same as null)', () => {
		const fm: Record<string, unknown> = { 'dbench-project': '' };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['dbench-project']).toBe('');
	});
});

describe('stampSceneEssentials', () => {
	it('stamps all eight scene keys onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampSceneEssentials(fm, ctx('Chapter 1'));

		expect(fm['dbench-type']).toBe('scene');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('');
		expect(fm['dbench-project-id']).toBe('');
		expect(fm['dbench-order']).toBe(9999);
		expect(fm['dbench-status']).toBe('idea');
		expect(fm['dbench-drafts']).toEqual([]);
		expect(fm['dbench-draft-ids']).toEqual([]);
	});

	it('is idempotent', () => {
		const fm: Record<string, unknown> = {};
		stampSceneEssentials(fm, ctx('Scene'));
		const snapshot = { ...fm };
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves dbench-order: 0 (must not be replaced with default 9999)', () => {
		const fm: Record<string, unknown> = { 'dbench-order': 0 };
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm['dbench-order']).toBe(0);
	});

	it('preserves an existing project assignment', () => {
		const fm: Record<string, unknown> = {
			'dbench-project': '[[The Salt Road]]',
			'dbench-project-id': 'abc-123-def-456',
		};
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm['dbench-project']).toBe('[[The Salt Road]]');
		expect(fm['dbench-project-id']).toBe('abc-123-def-456');
	});

	it('preserves non-dbench properties', () => {
		const fm: Record<string, unknown> = { tags: ['draft'], wordcount: 1500 };
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm['tags']).toEqual(['draft']);
		expect(fm['wordcount']).toBe(1500);
	});
});

describe('stampDraftEssentials', () => {
	it('stamps all six draft keys onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampDraftEssentials(fm, ctx('Scene - Draft 1 (20260415)'));

		expect(fm['dbench-type']).toBe('draft');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('');
		expect(fm['dbench-scene']).toBe('');
		expect(fm['dbench-scene-id']).toBe('');
		expect(fm['dbench-draft-number']).toBe(1);
	});

	it('does not stamp scene-only or project-only keys', () => {
		const fm: Record<string, unknown> = {};
		stampDraftEssentials(fm, ctx('Draft'));
		expect(fm).not.toHaveProperty('dbench-order');
		expect(fm).not.toHaveProperty('dbench-status');
		expect(fm).not.toHaveProperty('dbench-scenes');
		expect(fm).not.toHaveProperty('dbench-drafts');
		expect(fm).not.toHaveProperty('dbench-project-shape');
	});

	it('is idempotent', () => {
		const fm: Record<string, unknown> = {};
		stampDraftEssentials(fm, ctx('Draft'));
		const snapshot = { ...fm };
		stampDraftEssentials(fm, ctx('Draft'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves existing draft number on retrofit', () => {
		const fm: Record<string, unknown> = { 'dbench-draft-number': 3 };
		stampDraftEssentials(fm, ctx('Draft'));
		expect(fm['dbench-draft-number']).toBe(3);
	});

	it('preserves an existing scene assignment', () => {
		const fm: Record<string, unknown> = {
			'dbench-scene': '[[Tempting Waters]]',
			'dbench-scene-id': 'abc-123-def-456',
		};
		stampDraftEssentials(fm, ctx('Draft'));
		expect(fm['dbench-scene']).toBe('[[Tempting Waters]]');
		expect(fm['dbench-scene-id']).toBe('abc-123-def-456');
	});
});

describe('stampDbenchId', () => {
	it('adds dbench-id to an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampDbenchId(fm);
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
	});

	it('adds nothing else', () => {
		const fm: Record<string, unknown> = {};
		stampDbenchId(fm);
		expect(Object.keys(fm)).toEqual(['dbench-id']);
	});

	it('preserves an existing dbench-id', () => {
		const fm: Record<string, unknown> = { 'dbench-id': 'aaa-111-bbb-222' };
		stampDbenchId(fm);
		expect(fm['dbench-id']).toBe('aaa-111-bbb-222');
	});

	it('preserves all other frontmatter', () => {
		const fm: Record<string, unknown> = {
			'dbench-type': 'scene',
			tags: ['fiction'],
		};
		stampDbenchId(fm);
		expect(fm['dbench-type']).toBe('scene');
		expect(fm['tags']).toEqual(['fiction']);
	});

	it('is idempotent', () => {
		const fm: Record<string, unknown> = {};
		stampDbenchId(fm);
		const id = fm['dbench-id'];
		stampDbenchId(fm);
		expect(fm['dbench-id']).toBe(id);
	});
});

describe('defaultStatus in context', () => {
	it('stampProjectEssentials uses context.defaultStatus when provided', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, {
			basename: 'My Novel',
			defaultStatus: 'brainstorm',
		});
		expect(fm['dbench-status']).toBe('brainstorm');
	});

	it('stampSceneEssentials uses context.defaultStatus when provided', () => {
		const fm: Record<string, unknown> = {};
		stampSceneEssentials(fm, {
			basename: 'Scene',
			defaultStatus: 'wip',
		});
		expect(fm['dbench-status']).toBe('wip');
	});

	it('falls back to the built-in default when defaultStatus is omitted', () => {
		const fm: Record<string, unknown> = {};
		stampSceneEssentials(fm, { basename: 'Scene' });
		expect(fm['dbench-status']).toBe('idea');
	});
});

describe('cross-helper interaction', () => {
	it('stampDbenchId followed by stampSceneEssentials uses the existing id', () => {
		const fm: Record<string, unknown> = {};
		stampDbenchId(fm);
		const id = fm['dbench-id'];
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm['dbench-id']).toBe(id);
		expect(fm['dbench-type']).toBe('scene');
	});

	it('"Complete essential properties" pattern: partially-typed scene gets missing fields filled', () => {
		// User has manually typed a scene but only stamped type and id.
		const fm: Record<string, unknown> = {
			'dbench-type': 'scene',
			'dbench-id': 'aaa-111-bbb-222',
		};
		stampSceneEssentials(fm, ctx('Scene'));

		// Existing values preserved
		expect(fm['dbench-type']).toBe('scene');
		expect(fm['dbench-id']).toBe('aaa-111-bbb-222');

		// Missing values filled
		expect(fm['dbench-project']).toBe('');
		expect(fm['dbench-order']).toBe(9999);
		expect(fm['dbench-status']).toBe('idea');
		expect(fm['dbench-drafts']).toEqual([]);
	});
});
