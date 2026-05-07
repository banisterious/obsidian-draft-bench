import { describe, expect, it } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../src/model/settings';
import {
	defaultDestinationName,
	validateDestinationName,
} from '../../../src/import/scrivener/import-wizard-modal';

/**
 * Tests for the Parse-step helpers exported from the wizard module:
 * `defaultDestinationName` (pure string transform) and
 * `validateDestinationName` (vault-existence + filename-format check).
 *
 * Wizard rendering itself isn't covered here; the existing test pattern
 * exercises pure helpers and skips Modal/DOM assertions.
 */

describe('defaultDestinationName', () => {
	it('strips the .scriv suffix from the bundle folder name', () => {
		expect(defaultDestinationName('Imports/My Novel.scriv')).toBe(
			'My Novel'
		);
	});

	it('handles a top-level bundle path (no parent folder)', () => {
		expect(defaultDestinationName('My Novel.scriv')).toBe('My Novel');
	});

	it('returns the bundle folder name verbatim if no .scriv suffix', () => {
		expect(defaultDestinationName('Imports/My Novel')).toBe('My Novel');
	});

	it('returns empty string for an empty input', () => {
		expect(defaultDestinationName('')).toBe('');
	});

	it('preserves spaces and Unicode in the bundle name', () => {
		expect(defaultDestinationName('Imports/Salt Road – v2.scriv')).toBe(
			'Salt Road – v2'
		);
	});
});

describe('validateDestinationName', () => {
	function appWithExistingProject(folderPath: string, filePath: string): App {
		const app = new App();
		const folder = new TFolder({
			path: folderPath,
			name: folderPath.split('/').pop() ?? folderPath,
		});
		app.vault.folders.set(folderPath, folder);
		app.vault._addFile(
			new TFile({
				path: filePath,
				basename: filePath.split('/').pop()?.replace(/\.md$/, '') ?? '',
				extension: 'md',
				parent: folder,
			})
		);
		return app;
	}

	const settings = DEFAULT_SETTINGS;

	it('rejects an empty name', () => {
		const result = validateDestinationName(new App(), settings, '');
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/empty/i);
	});

	it('rejects a whitespace-only name', () => {
		const result = validateDestinationName(new App(), settings, '   ');
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/empty/i);
	});

	it('rejects names containing forbidden filesystem characters', () => {
		const result = validateDestinationName(new App(), settings, 'Foo/Bar');
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/not allowed/i);
	});

	it('rejects names that collide with an existing folder at the resolved path', () => {
		// DEFAULT_SETTINGS.projectsFolder is "Draft Bench/{project}/" so
		// "My Novel" resolves to folder "Draft Bench/My Novel".
		const app = appWithExistingProject(
			'Draft Bench/My Novel',
			'Draft Bench/My Novel/My Novel.md'
		);
		const result = validateDestinationName(app, settings, 'My Novel');
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/already exists/i);
	});

	it('rejects names that collide with an existing project file', () => {
		const app = new App();
		// Seed only the file (no folder), as if a single-shape project
		// already exists under Draft Bench.
		app.vault._addFile(
			new TFile({
				path: 'Draft Bench/My Novel/My Novel.md',
				basename: 'My Novel',
				extension: 'md',
				parent: null,
			})
		);
		const result = validateDestinationName(app, settings, 'My Novel');
		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/already exists/i);
	});

	it('accepts a clean name that resolves to a non-conflicting path', () => {
		const result = validateDestinationName(
			new App(),
			settings,
			'My Novel'
		);
		expect(result.ok).toBe(true);
		expect(result.message).toMatch(/Will create at/);
		expect(result.message).toContain('Draft Bench/My Novel');
	});

	it('trims surrounding whitespace before resolving', () => {
		const result = validateDestinationName(
			new App(),
			settings,
			'  My Novel  '
		);
		expect(result.ok).toBe(true);
		// Trimmed name is what gets resolved; no whitespace in the path.
		expect(result.message).toContain('Draft Bench/My Novel');
	});
});
