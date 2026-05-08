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

/**
 * Real-disk `DataAdapter` stub backed by Node's `fs`, for tests that
 * walk a fixture bundle on the local filesystem rather than a fake
 * vault map. Implements just `exists` + `list` (the surface
 * `countSnapshots` and the snapshot parser actually use).
 */
function nodeFsAdapter(): DataAdapter {
	return {
		exists: async (p: string) => {
			try {
				statSync(p);
				return true;
			} catch {
				return false;
			}
		},
		list: async (p: string) => {
			try {
				const entries = readdirSync(p);
				const files: string[] = [];
				const folders: string[] = [];
				for (const e of entries) {
					const full = `${p}/${e}`;
					if (statSync(full).isDirectory()) folders.push(full);
					else files.push(full);
				}
				return { files, folders };
			} catch {
				return { files: [], folders: [] };
			}
		},
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
			//   Volume 1
			//     Part One: The Salt Road
			//       Chapter 1: Departure
			//         01 - Opening
			//         02 - Argument (with Sub-scene 1, Sub-scene 2)
			//         Extra subfolder (with Extra something)
			//       Chapter 2: The Crossing
			//         Scene
			//     Part Two: The Meridian Drift
			//       Chapter 3: Midway
			//         Scene
			//       Chapter 4: Almost There
			//         Scene
			//         Scene that's excluded
			// -> 9 Text documents, 8 folders (Volume + 2 Parts + 4 Chapters
			//    + Extra subfolder).
			expect(summary.draftDocuments).toBe(9);
			expect(summary.draftFolders).toBe(8);
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
	it('returns 0 when the bundle has no top-level Snapshots folder', async () => {
		const adapter = fakeAdapter({});
		expect(await countSnapshots(adapter, 'bundle.scriv')).toBe(0);
	});

	it('returns 0 when the Snapshots folder has no <UUID>.snapshots subdirectories', async () => {
		const adapter = fakeAdapter({
			'bundle.scriv/Snapshots': {
				files: [],
				folders: [],
			},
		});
		expect(await countSnapshots(adapter, 'bundle.scriv')).toBe(0);
	});

	it('counts .rtf files across multiple <UUID>.snapshots subdirectories', async () => {
		const adapter = fakeAdapter({
			'bundle.scriv/Snapshots': {
				files: [],
				folders: [
					'bundle.scriv/Snapshots/UUID-A.snapshots',
					'bundle.scriv/Snapshots/UUID-B.snapshots',
					'bundle.scriv/Snapshots/UUID-C.snapshots',
				],
			},
			'bundle.scriv/Snapshots/UUID-A.snapshots': {
				files: [
					'bundle.scriv/Snapshots/UUID-A.snapshots/2024-03-01-12-00-00-0700.rtf',
					'bundle.scriv/Snapshots/UUID-A.snapshots/2024-03-15-12-00-00-0700.rtf',
				],
				folders: [],
			},
			'bundle.scriv/Snapshots/UUID-B.snapshots': {
				files: [],
				folders: [],
			},
			'bundle.scriv/Snapshots/UUID-C.snapshots': {
				files: [
					'bundle.scriv/Snapshots/UUID-C.snapshots/2024-04-10-12-00-00-0700.rtf',
				],
				folders: [],
			},
		});
		expect(await countSnapshots(adapter, 'bundle.scriv')).toBe(3);
	});

	it('ignores index.xml + snapshot.indexes (only .rtf files count as snapshots)', async () => {
		const adapter = fakeAdapter({
			'bundle.scriv/Snapshots': {
				files: [],
				folders: ['bundle.scriv/Snapshots/UUID-A.snapshots'],
			},
			'bundle.scriv/Snapshots/UUID-A.snapshots': {
				files: [
					'bundle.scriv/Snapshots/UUID-A.snapshots/2024-03-01-12-00-00-0700.rtf',
					'bundle.scriv/Snapshots/UUID-A.snapshots/index.xml',
					'bundle.scriv/Snapshots/UUID-A.snapshots/snapshot.indexes',
				],
				folders: [],
			},
		});
		expect(await countSnapshots(adapter, 'bundle.scriv')).toBe(1);
	});
});

describe.skipIf(novelFixture === undefined)(
	'countSnapshots — real fixture: ScrivenerTesting.scriv',
	() => {
		it('counts the 8 snapshots across the bundle\'s Snapshots/ directories', async () => {
			// Distribution: 5 documents have 1 snapshot each + 1 document
			// (01 - Opening / A9C97B44) has 3. Total 8.
			const fixtureBundle = path.dirname(novelFixture as string);
			const adapter = nodeFsAdapter();
			const count = await countSnapshots(adapter, fixtureBundle);
			expect(count).toBe(8);
		});
	}
);
