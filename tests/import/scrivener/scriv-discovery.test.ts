import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { findScrivProjectFolders } from '../../../src/import/scrivener/import-wizard-modal';

/**
 * Helper: seed a `.scrivx` file at the given path via the adapter
 * layer (NOT the indexed-cache layer). Parent folders auto-register so
 * `adapter.list(...)` walks down to it. Modeling the adapter path
 * matters for #35: discovery now uses `adapter.list` directly so
 * externally-copied bundles surface without an app reload, and tests
 * should exercise that path rather than the cached `getFiles()` path.
 */
function seedScrivFile(app: App, scrivxPath: string): string {
	app.vault._addAdapterFile(scrivxPath, '<ScrivenerProject/>');
	const slash = scrivxPath.lastIndexOf('/');
	return slash < 0 ? '' : scrivxPath.slice(0, slash);
}

describe('findScrivProjectFolders', () => {
	it('returns an empty array when the vault has no .scrivx files', async () => {
		const app = new App();
		expect(await findScrivProjectFolders(app)).toEqual([]);
	});

	it('returns the parent folder path of a single .scrivx file', async () => {
		const app = new App();
		const folderPath = seedScrivFile(
			app,
			'Imports/My Novel.scriv/My Novel.scrivx'
		);

		const result = await findScrivProjectFolders(app);
		expect(result).toEqual([folderPath]);
		expect(result[0]).toBe('Imports/My Novel.scriv');
	});

	it('returns multiple parent folders when the vault has multiple .scriv bundles', async () => {
		const app = new App();
		seedScrivFile(app, 'Imports/Novel A.scriv/Novel A.scrivx');
		seedScrivFile(app, 'Imports/Novel B.scriv/Novel B.scrivx');
		seedScrivFile(app, 'Archive/Old Project.scriv/Old Project.scrivx');

		const result = await findScrivProjectFolders(app);
		expect(result).toEqual([
			'Archive/Old Project.scriv',
			'Imports/Novel A.scriv',
			'Imports/Novel B.scriv',
		]);
	});

	it('dedups when multiple .scrivx files share a parent (corrupted bundle)', async () => {
		const app = new App();
		app.vault._addAdapterFile(
			'Imports/Bundle.scriv/Project.scrivx',
			'<ScrivenerProject/>'
		);
		app.vault._addAdapterFile(
			'Imports/Bundle.scriv/Backup.scrivx',
			'<ScrivenerProject/>'
		);

		const result = await findScrivProjectFolders(app);
		expect(result).toEqual(['Imports/Bundle.scriv']);
	});

	it('ignores non-.scrivx files', async () => {
		const app = new App();
		seedScrivFile(app, 'Imports/Novel.scriv/Novel.scrivx');
		app.vault._addAdapterFile('Notes/Some Note.md', '# Hello');

		const result = await findScrivProjectFolders(app);
		expect(result).toEqual(['Imports/Novel.scriv']);
	});

	it('returns folders sorted by path for stable suggester ordering', async () => {
		const app = new App();
		seedScrivFile(app, 'Z/Project Z.scriv/Z.scrivx');
		seedScrivFile(app, 'A/Project A.scriv/A.scrivx');
		seedScrivFile(app, 'M/Project M.scriv/M.scrivx');

		const result = await findScrivProjectFolders(app);
		expect(result).toEqual([
			'A/Project A.scriv',
			'M/Project M.scriv',
			'Z/Project Z.scriv',
		]);
	});

	/**
	 * Regression test for #35: a `.scriv` bundle copied externally (e.g.,
	 * via Android's file manager) lands in the vault folder but doesn't
	 * enter Obsidian's indexed cache (`vault.getFiles()`) until the next
	 * cache rebuild. Discovery must read live adapter state so the
	 * bundle surfaces without an app reload.
	 *
	 * The seeding here uses ONLY the adapter layer — no entry in
	 * `vault.files` — modeling the post-external-copy state. Pre-#35
	 * code that walked `vault.getFiles()` would return [] here.
	 */
	it('surfaces externally-copied bundles without an indexed-cache rebuild', async () => {
		const app = new App();
		// File exists on disk (adapter sees it) but not in the indexed
		// cache (vault.getFiles returns empty).
		app.vault._addAdapterFile(
			'Imports/Externally Copied.scriv/Project.scrivx',
			'<ScrivenerProject/>'
		);
		expect(app.vault.getFiles()).toEqual([]);

		const result = await findScrivProjectFolders(app);
		expect(result).toEqual(['Imports/Externally Copied.scriv']);
	});

	it('skips dot-prefixed top-level folders to avoid scanning .obsidian / .trash', async () => {
		const app = new App();
		seedScrivFile(app, 'Imports/Novel.scriv/Novel.scrivx');
		// A `.scrivx` placed under `.trash` (Obsidian's trash folder)
		// shouldn't surface — it's been deleted from the writer's
		// perspective and walking dot-prefixed system folders is
		// wasteful.
		app.vault._addAdapterFile(
			'.trash/Old Novel.scriv/Old.scrivx',
			'<ScrivenerProject/>'
		);

		const result = await findScrivProjectFolders(app);
		expect(result).toEqual(['Imports/Novel.scriv']);
	});

	it('does not descend into bundle internals once a .scrivx is found', async () => {
		const app = new App();
		// A bundle's `Files/` subdirectory containing a stray `.scrivx`
		// (rare; would be a corrupted bundle). Discovery should stop at
		// the outer bundle root rather than reporting the nested one.
		app.vault._addAdapterFile(
			'Imports/Novel.scriv/Novel.scrivx',
			'<ScrivenerProject/>'
		);
		app.vault._addAdapterFile(
			'Imports/Novel.scriv/Files/Stray.scrivx',
			'<ScrivenerProject/>'
		);

		const result = await findScrivProjectFolders(app);
		expect(result).toEqual(['Imports/Novel.scriv']);
	});
});
