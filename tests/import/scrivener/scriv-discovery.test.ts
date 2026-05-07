import { describe, expect, it } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { findScrivProjectFolders } from '../../../src/import/scrivener/import-wizard-modal';

/**
 * Helper: seed a `.scrivx` file into the mock vault at the given path,
 * with a corresponding TFolder parent at the bundle-root path. Both
 * are attached to the vault's files / folders maps so `getFiles()`
 * returns the file and its `.parent` resolves to the folder.
 */
function seedScrivFile(app: App, scrivxPath: string): TFolder {
	const slash = scrivxPath.lastIndexOf('/');
	const folderPath = slash < 0 ? '' : scrivxPath.slice(0, slash);
	const filename = scrivxPath.slice(slash + 1);
	const dotIdx = filename.lastIndexOf('.');

	const folder = new TFolder({
		path: folderPath,
		name: folderPath.split('/').pop() ?? folderPath,
	});
	app.vault.folders.set(folderPath, folder);

	const file = new TFile({
		path: scrivxPath,
		basename: filename.slice(0, dotIdx),
		extension: filename.slice(dotIdx + 1),
		parent: folder,
	});
	app.vault._addFile(file);

	return folder;
}

describe('findScrivProjectFolders', () => {
	it('returns an empty array when the vault has no .scrivx files', () => {
		const app = new App();
		expect(findScrivProjectFolders(app)).toEqual([]);
	});

	it('returns the parent folder of a single .scrivx file', () => {
		const app = new App();
		const folder = seedScrivFile(app, 'Imports/My Novel.scriv/My Novel.scrivx');

		const result = findScrivProjectFolders(app);
		expect(result).toHaveLength(1);
		expect(result[0]).toBe(folder);
		expect(result[0].path).toBe('Imports/My Novel.scriv');
	});

	it('returns multiple parent folders when the vault has multiple .scriv bundles', () => {
		const app = new App();
		seedScrivFile(app, 'Imports/Novel A.scriv/Novel A.scrivx');
		seedScrivFile(app, 'Imports/Novel B.scriv/Novel B.scrivx');
		seedScrivFile(app, 'Archive/Old Project.scriv/Old Project.scrivx');

		const result = findScrivProjectFolders(app);
		const paths = result.map((f) => f.path).sort();
		expect(paths).toEqual([
			'Archive/Old Project.scriv',
			'Imports/Novel A.scriv',
			'Imports/Novel B.scriv',
		]);
	});

	it('dedups when multiple .scrivx files share a parent (corrupted bundle)', () => {
		const app = new App();
		// Same parent folder; both files name-collide on extension only.
		const folder = new TFolder({
			path: 'Imports/Bundle.scriv',
			name: 'Bundle.scriv',
		});
		app.vault.folders.set(folder.path, folder);
		app.vault._addFile(
			new TFile({
				path: 'Imports/Bundle.scriv/Project.scrivx',
				basename: 'Project',
				extension: 'scrivx',
				parent: folder,
			})
		);
		app.vault._addFile(
			new TFile({
				path: 'Imports/Bundle.scriv/Backup.scrivx',
				basename: 'Backup',
				extension: 'scrivx',
				parent: folder,
			})
		);

		const result = findScrivProjectFolders(app);
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe('Imports/Bundle.scriv');
	});

	it('ignores non-.scrivx files', () => {
		const app = new App();
		seedScrivFile(app, 'Imports/Novel.scriv/Novel.scrivx');
		// Add a markdown file in a different folder; should not appear
		app.vault._addFile(
			new TFile({
				path: 'Notes/Some Note.md',
				basename: 'Some Note',
				extension: 'md',
				parent: new TFolder({ path: 'Notes', name: 'Notes' }),
			})
		);

		const result = findScrivProjectFolders(app);
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe('Imports/Novel.scriv');
	});

	it('returns folders sorted by path for stable suggester ordering', () => {
		const app = new App();
		seedScrivFile(app, 'Z/Project Z.scriv/Z.scrivx');
		seedScrivFile(app, 'A/Project A.scriv/A.scrivx');
		seedScrivFile(app, 'M/Project M.scriv/M.scrivx');

		const paths = findScrivProjectFolders(app).map((f) => f.path);
		expect(paths).toEqual([
			'A/Project A.scriv',
			'M/Project M.scriv',
			'Z/Project Z.scriv',
		]);
	});
});
