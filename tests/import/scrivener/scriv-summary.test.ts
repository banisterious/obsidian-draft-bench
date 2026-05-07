import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { DataAdapter, ListedFiles } from 'obsidian';
import {
	parseScrivx,
	type BinderItem,
	type ScrivProject,
} from '../../../src/import/scrivener/scrivx-parser';
import {
	countSnapshots,
	summarizeProject,
} from '../../../src/import/scrivener/scriv-summary';

/**
 * Minimal `DataAdapter` stub with just the methods `countSnapshots`
 * actually calls (`exists` + `list`). Backed by a plain map of
 * vault-path -> children. Cast through `unknown` to satisfy the full
 * `DataAdapter` interface without implementing the rest.
 */
function fakeAdapter(map: Record<string, ListedFiles>): DataAdapter {
	return {
		exists: async (p: string) => Object.prototype.hasOwnProperty.call(map, p),
		list: async (p: string) => map[p] ?? { files: [], folders: [] },
	} as unknown as DataAdapter;
}

// ---- summarizeProject — synthetic shapes -------------------------------

function makeItem(
	type: string,
	children: BinderItem[] = []
): BinderItem {
	return {
		id: 'X',
		type,
		title: 'X',
		keywords: [],
		statusId: null,
		labelId: null,
		includeInCompile: true,
		customMetaData: new Map(),
		created: '',
		modified: '',
		children,
	};
}

function makeProject(binder: BinderItem[]): ScrivProject {
	return {
		binder,
		labels: new Map(),
		statuses: new Map(),
		keywords: new Map(),
		customMetaDataFields: new Map(),
		warnings: [],
	};
}

describe('summarizeProject — synthetic projects', () => {
	it('returns all-zero counts for an empty project', () => {
		const summary = summarizeProject(makeProject([]));
		expect(summary).toEqual({
			draftDocuments: 0,
			draftFolders: 0,
			researchItems: 0,
			trashItems: 0,
			customRootItems: 0,
			images: 0,
			pdfs: 0,
			totalItems: 0,
		});
	});

	it('counts Draft documents and folders by walking the DraftFolder root', () => {
		const draft = makeItem('DraftFolder', [
			makeItem('Folder', [
				makeItem('Folder', [
					makeItem('Text'),
					makeItem('Text'),
				]),
				makeItem('Folder', [makeItem('Text')]),
			]),
		]);
		const summary = summarizeProject(makeProject([draft]));
		expect(summary.draftDocuments).toBe(3);
		expect(summary.draftFolders).toBe(3);
		// DraftFolder root itself isn't tallied.
		expect(summary.totalItems).toBe(7);
	});

	it('counts Research items via the ResearchFolder root', () => {
		const research = makeItem('ResearchFolder', [
			makeItem('Folder', [
				makeItem('Text'),
				makeItem('PDF'),
			]),
		]);
		const summary = summarizeProject(makeProject([research]));
		expect(summary.researchItems).toBe(3);
		expect(summary.draftDocuments).toBe(0);
	});

	it('counts Trash items via the TrashFolder root', () => {
		const trash = makeItem('TrashFolder', [
			makeItem('Text'),
			makeItem('Text'),
		]);
		const summary = summarizeProject(makeProject([trash]));
		expect(summary.trashItems).toBe(2);
	});

	it('counts custom-root items including the root itself', () => {
		const characters = makeItem('Folder', [
			makeItem('Text'),
			makeItem('Text'),
		]);
		const summary = summarizeProject(makeProject([characters]));
		// 1 root + 2 children
		expect(summary.customRootItems).toBe(3);
	});

	it('tallies cross-cutting Image and PDF counts across all locations', () => {
		const project = makeProject([
			makeItem('DraftFolder', [
				makeItem('Folder', [makeItem('Image')]),
			]),
			makeItem('ResearchFolder', [
				makeItem('Image'),
				makeItem('PDF'),
				makeItem('PDF'),
			]),
		]);
		const summary = summarizeProject(project);
		expect(summary.images).toBe(2);
		expect(summary.pdfs).toBe(2);
	});
});

// ---- summarizeProject — real fixture ------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/scrivener');

function findFixtureScrivxFiles(): string[] {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(FIXTURES_DIR);
	} catch {
		return out;
	}
	for (const name of entries) {
		const p = path.join(FIXTURES_DIR, name);
		const s = statSync(p);
		if (s.isDirectory()) {
			for (const inner of readdirSync(p)) {
				if (inner.endsWith('.scrivx')) {
					out.push(path.join(p, inner));
				}
			}
		}
	}
	return out;
}

const novelFixture = findFixtureScrivxFiles().find((f) =>
	f.includes('ScrivenerTesting.scriv')
);

describe.skipIf(novelFixture === undefined)(
	'summarizeProject — real fixture: ScrivenerTesting.scriv',
	() => {
		const xml = readFileSync(novelFixture as string, 'utf-8');
		const project = parseScrivx(xml);
		const summary = summarizeProject(project);

		it('tallies the Manuscript draft material', () => {
			// The fixture's Manuscript has:
			//   Part One: The Salt Road
			//     Chapter1: Departure   (2 scenes: 01 Opening, 02 Argument)
			//     Chapter 2: The Crossing  (1 scene)
			//   Part Two: The Meridian Drift
			//     Chapter (1 scene)
			// -> 4 scenes, 5 folders (2 parts + 3 chapters).
			expect(summary.draftDocuments).toBe(4);
			expect(summary.draftFolders).toBe(5);
		});

		it('tallies Research items', () => {
			// Research/Sample Output/{Standard Manuscript, Paperback Novel}
			expect(summary.researchItems).toBe(3);
		});

		it('tallies Trash items', () => {
			// One "Novel Format" template-info doc the writer trashed.
			expect(summary.trashItems).toBe(1);
		});

		it('tallies custom-root folders (Characters / Places / Front Matter / Notes / Template Sheets)', () => {
			// Counting roots + descendants:
			//   Characters (1)
			//   Places (1)
			//   Front Matter (1) + Manuscript Format (1) + Title Page (1)
			//                    + Paperback (1) + 4 docs
			//                    + Ebook (1) + 2 docs
			//   Notes (1)
			//   Template Sheets (1) + 2 docs
			// = 1 + 1 + 11 + 1 + 3 = 17
			expect(summary.customRootItems).toBe(17);
		});

		it('counts cross-cutting media (Image + PDF)', () => {
			// Cover.png in Front Matter/Ebook (Image type)
			// Standard Manuscript + Paperback Novel in Research/Sample Output (PDF type)
			expect(summary.images).toBe(1);
			expect(summary.pdfs).toBe(2);
		});
	}
);

// ---- countSnapshots ----------------------------------------------------

describe('countSnapshots', () => {
	it('returns 0 when the bundle has no Files/Data folder', async () => {
		const adapter = fakeAdapter({});
		expect(await countSnapshots(adapter, 'bundle.scriv')).toBe(0);
	});

	it('returns 0 when no UUID folder has a Snapshots subdirectory', async () => {
		const adapter = fakeAdapter({
			'bundle.scriv/Files/Data': {
				files: [],
				folders: ['bundle.scriv/Files/Data/UUID-A', 'bundle.scriv/Files/Data/UUID-B'],
			},
		});
		expect(await countSnapshots(adapter, 'bundle.scriv')).toBe(0);
	});

	it('counts .rtf files across multiple Snapshots subdirectories', async () => {
		const adapter = fakeAdapter({
			'bundle.scriv/Files/Data': {
				files: [],
				folders: [
					'bundle.scriv/Files/Data/UUID-A',
					'bundle.scriv/Files/Data/UUID-B',
					'bundle.scriv/Files/Data/UUID-C',
				],
			},
			'bundle.scriv/Files/Data/UUID-A/Snapshots': {
				files: [
					'bundle.scriv/Files/Data/UUID-A/Snapshots/2024-03-01.rtf',
					'bundle.scriv/Files/Data/UUID-A/Snapshots/2024-03-15.rtf',
				],
				folders: [],
			},
			'bundle.scriv/Files/Data/UUID-C/Snapshots': {
				files: [
					'bundle.scriv/Files/Data/UUID-C/Snapshots/2024-04-10.rtf',
				],
				folders: [],
			},
		});
		expect(await countSnapshots(adapter, 'bundle.scriv')).toBe(3);
	});

	it('ignores non-.rtf files in Snapshots folders', async () => {
		const adapter = fakeAdapter({
			'bundle.scriv/Files/Data': {
				files: [],
				folders: ['bundle.scriv/Files/Data/UUID-A'],
			},
			'bundle.scriv/Files/Data/UUID-A/Snapshots': {
				files: [
					'bundle.scriv/Files/Data/UUID-A/Snapshots/2024-03-01.rtf',
					'bundle.scriv/Files/Data/UUID-A/Snapshots/.DS_Store',
					'bundle.scriv/Files/Data/UUID-A/Snapshots/notes.txt',
				],
				folders: [],
			},
		});
		expect(await countSnapshots(adapter, 'bundle.scriv')).toBe(1);
	});
});
