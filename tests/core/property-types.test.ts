import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { registerPropertyTypes } from '../../src/core/property-types';

/**
 * Tests for `registerPropertyTypes` (#8). Verifies that the full set of
 * relationship + ID-companion properties is registered with the right
 * types via Obsidian's `metadataTypeManager`. Without registration, the
 * Properties panel auto-detects wikilink-shaped values and writes them
 * as block-style nested-array YAML on round-trips through
 * `processFrontMatter` (issues #4 / #6 / #7).
 */
describe('registerPropertyTypes — type assignments', () => {
	it('registers single-target wikilink fields as text', () => {
		const app = new App();
		registerPropertyTypes(app);

		expect(app.metadataTypeManager._getType('dbench-project')).toBe('text');
		expect(app.metadataTypeManager._getType('dbench-chapter')).toBe('text');
		expect(app.metadataTypeManager._getType('dbench-scene')).toBe('text');
	});

	it('registers reverse-array wikilink fields as multitext', () => {
		const app = new App();
		registerPropertyTypes(app);

		expect(app.metadataTypeManager._getType('dbench-chapters')).toBe(
			'multitext'
		);
		expect(app.metadataTypeManager._getType('dbench-scenes')).toBe(
			'multitext'
		);
		expect(app.metadataTypeManager._getType('dbench-drafts')).toBe(
			'multitext'
		);
		expect(app.metadataTypeManager._getType('dbench-compile-presets')).toBe(
			'multitext'
		);
	});

	it('registers single-target ID companions as text', () => {
		const app = new App();
		registerPropertyTypes(app);

		expect(app.metadataTypeManager._getType('dbench-project-id')).toBe(
			'text'
		);
		expect(app.metadataTypeManager._getType('dbench-chapter-id')).toBe(
			'text'
		);
		expect(app.metadataTypeManager._getType('dbench-scene-id')).toBe('text');
	});

	it('registers reverse-array ID companions as multitext', () => {
		const app = new App();
		registerPropertyTypes(app);

		expect(app.metadataTypeManager._getType('dbench-chapter-ids')).toBe(
			'multitext'
		);
		expect(app.metadataTypeManager._getType('dbench-scene-ids')).toBe(
			'multitext'
		);
		expect(app.metadataTypeManager._getType('dbench-draft-ids')).toBe(
			'multitext'
		);
		expect(
			app.metadataTypeManager._getType('dbench-compile-preset-ids')
		).toBe('multitext');
	});

	it('registers exactly the 14 expected dbench-* properties (no more, no less)', () => {
		const app = new App();
		registerPropertyTypes(app);

		const registered = app.metadataTypeManager._allTypes();
		const keys = Object.keys(registered).sort();

		expect(keys).toEqual([
			'dbench-chapter',
			'dbench-chapter-id',
			'dbench-chapter-ids',
			'dbench-chapters',
			'dbench-compile-preset-ids',
			'dbench-compile-presets',
			'dbench-draft-ids',
			'dbench-drafts',
			'dbench-project',
			'dbench-project-id',
			'dbench-scene',
			'dbench-scene-id',
			'dbench-scene-ids',
			'dbench-scenes',
		]);
	});

	it('degrades gracefully when metadataTypeManager is missing', () => {
		// Simulate older Obsidian / different runtime where the API
		// surface isn't exposed. Should not throw.
		const app = new App();
		// Override to undefined to simulate missing API.
		(app as unknown as { metadataTypeManager: undefined }).metadataTypeManager =
			undefined;

		expect(() => registerPropertyTypes(app)).not.toThrow();
	});

	it('degrades gracefully when setType is not a function', () => {
		const app = new App();
		// Replace with an object missing the expected method.
		(app as unknown as { metadataTypeManager: object }).metadataTypeManager =
			{};

		expect(() => registerPropertyTypes(app)).not.toThrow();
	});
});
