import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	createBaseFile,
	isBasesEnabledInPlugins,
	resolveBasePath,
} from '../../src/core/bases';
import {
	DEFAULT_SETTINGS,
	type DraftBenchSettings,
} from '../../src/model/settings';

describe('isBasesEnabledInPlugins', () => {
	it('returns true when bases plugin is present and enabled', () => {
		expect(isBasesEnabledInPlugins({ bases: { enabled: true } })).toBe(true);
	});

	it('returns false when bases plugin is explicitly disabled', () => {
		expect(isBasesEnabledInPlugins({ bases: { enabled: false } })).toBe(
			false
		);
	});

	it('returns false when bases key is missing', () => {
		expect(isBasesEnabledInPlugins({ other: { enabled: true } })).toBe(false);
	});

	it('returns false when bases entry has no enabled field', () => {
		expect(isBasesEnabledInPlugins({ bases: {} })).toBe(false);
	});

	it('returns false for null input', () => {
		expect(isBasesEnabledInPlugins(null)).toBe(false);
	});

	it('returns false for undefined input', () => {
		expect(isBasesEnabledInPlugins(undefined)).toBe(false);
	});

	it('returns false for an empty record', () => {
		expect(isBasesEnabledInPlugins({})).toBe(false);
	});
});

describe('resolveBasePath', () => {
	function withFolder(basesFolder: string): DraftBenchSettings {
		return { ...DEFAULT_SETTINGS, basesFolder };
	}

	it('joins folder and filename, appending .base', () => {
		expect(resolveBasePath(withFolder('Bases'), 'all-projects')).toBe(
			'Bases/all-projects.base'
		);
	});

	it('tolerates a trailing slash on the folder', () => {
		expect(resolveBasePath(withFolder('Bases/'), 'all-projects')).toBe(
			'Bases/all-projects.base'
		);
	});

	it('strips leading slashes on the folder', () => {
		expect(resolveBasePath(withFolder('/Bases/'), 'all-projects')).toBe(
			'Bases/all-projects.base'
		);
	});

	it('respects an existing .base extension on the filename', () => {
		expect(
			resolveBasePath(withFolder('Bases'), 'existing.base')
		).toBe('Bases/existing.base');
	});

	it('places the file at vault root when folder is empty', () => {
		expect(resolveBasePath(withFolder(''), 'all')).toBe('all.base');
	});

	it('places the file at vault root when folder is only slashes', () => {
		expect(resolveBasePath(withFolder('/'), 'all')).toBe('all.base');
	});

	it('handles nested folder paths', () => {
		expect(
			resolveBasePath(withFolder('Draft Bench/Bases'), 'scenes')
		).toBe('Draft Bench/Bases/scenes.base');
	});
});

describe('createBaseFile', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('creates the file at the target path', async () => {
		const result = await createBaseFile(
			app,
			'Bases/all.base',
			'filters: []\n'
		);

		expect(result.status).toBe('created');
		const created = app.vault.getAbstractFileByPath('Bases/all.base');
		expect(created).not.toBeNull();
		expect(await app.vault.read(created as never)).toBe('filters: []\n');
	});

	it('creates the parent folder on demand', async () => {
		await createBaseFile(app, 'Bases/Sub/all.base', 'x: 1\n');

		expect(app.vault.getAbstractFileByPath('Bases/Sub')).not.toBeNull();
	});

	it('skips when a file already exists at the path', async () => {
		await app.vault.createFolder('Bases');
		await app.vault.create('Bases/all.base', 'pre-existing\n');

		const result = await createBaseFile(
			app,
			'Bases/all.base',
			'would-overwrite\n'
		);

		expect(result.status).toBe('already-exists');
		const existing = app.vault.getAbstractFileByPath('Bases/all.base');
		expect(await app.vault.read(existing as never)).toBe('pre-existing\n');
	});

	it('handles vault-root paths (no folder)', async () => {
		const result = await createBaseFile(app, 'root.base', 'a: 1\n');

		expect(result.status).toBe('created');
		expect(app.vault.getAbstractFileByPath('root.base')).not.toBeNull();
	});
});
