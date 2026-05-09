import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { DataAdapter, ListedFiles } from 'obsidian';
import {
	dateToFilenameFragment,
	loadSnapshots,
} from '../../../src/import/scrivener/snapshots';

/**
 * Tests for the snapshot-loader. Synthetic fakeAdapter cases pin the
 * specific tolerance / format-handling rules; real-fixture test asserts
 * against the committed Scrivener 3 Windows project.
 */

/**
 * Dual-mode fakeAdapter: one map for directory listings (`list`), one
 * map for file contents (`read`). Cast through `unknown` to satisfy
 * the full `DataAdapter` interface without implementing the rest.
 */
function fakeAdapter(opts: {
	listings?: Record<string, ListedFiles>;
	files?: Record<string, string>;
}): DataAdapter {
	const listings = opts.listings ?? {};
	const files = opts.files ?? {};
	return {
		exists: async (p: string) =>
			Object.prototype.hasOwnProperty.call(listings, p) ||
			Object.prototype.hasOwnProperty.call(files, p),
		list: async (p: string) =>
			listings[p] ?? { files: [], folders: [] },
		read: async (p: string) => files[p] ?? '',
	} as unknown as DataAdapter;
}

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
		read: async (p: string) => {
			const fs = await import('node:fs/promises');
			return fs.readFile(p, 'utf-8');
		},
	} as unknown as DataAdapter;
}

// ---- dateToFilenameFragment --------------------------------------------

describe('dateToFilenameFragment', () => {
	it('converts a negative-TZ Scrivener date to Scrivener filename format', () => {
		expect(dateToFilenameFragment('2026-05-08 16:04:16 -0700')).toBe(
			'2026-05-08-16-04-16-0700'
		);
	});

	it('converts a positive-TZ Scrivener date with the same rule (sign drops)', () => {
		expect(dateToFilenameFragment('2026-05-08 16:04:16 +0900')).toBe(
			'2026-05-08-16-04-16-0900'
		);
	});

	it('collapses consecutive non-digit runs to a single dash', () => {
		expect(dateToFilenameFragment('2026   05   08')).toBe('2026-05-08');
	});

	it('strips leading and trailing dashes', () => {
		expect(dateToFilenameFragment(' 2026-05-08 ')).toBe('2026-05-08');
	});
});

// ---- loadSnapshots — synthetic shapes ----------------------------------

describe('loadSnapshots — empty / minimal bundles', () => {
	it('returns an empty map and no warnings when the bundle has no Snapshots/ folder', async () => {
		const adapter = fakeAdapter({});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		expect(result.snapshotsByUuid.size).toBe(0);
		expect(result.warnings).toEqual([]);
	});

	it('returns an empty map when Snapshots/ exists but holds no .snapshots/ subdirectories', async () => {
		const adapter = fakeAdapter({
			listings: {
				'bundle.scriv/Snapshots': { files: [], folders: [] },
			},
		});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		expect(result.snapshotsByUuid.size).toBe(0);
		expect(result.warnings).toEqual([]);
	});
});

describe('loadSnapshots — well-formed projects', () => {
	it('loads metadata for a single document with a single snapshot', async () => {
		const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<Snapshots Version="1.0">
    <Snapshot>
        <Title>Workshop draft</Title>
        <Date>2026-05-08 16:04:16 -0700</Date>
    </Snapshot>
</Snapshots>`;
		const adapter = fakeAdapter({
			listings: {
				'bundle.scriv/Snapshots': {
					files: [],
					folders: ['bundle.scriv/Snapshots/UUID-A.snapshots'],
				},
			},
			files: {
				'bundle.scriv/Snapshots/UUID-A.snapshots/index.xml': indexXml,
				'bundle.scriv/Snapshots/UUID-A.snapshots/2026-05-08-16-04-16-0700.rtf':
					'(rtf body)',
			},
		});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		expect(result.warnings).toEqual([]);
		const metadata = result.snapshotsByUuid.get('UUID-A');
		expect(metadata).toEqual([
			{
				title: 'Workshop draft',
				date: '2026-05-08 16:04:16 -0700',
				rtfPath:
					'bundle.scriv/Snapshots/UUID-A.snapshots/2026-05-08-16-04-16-0700.rtf',
			},
		]);
	});

	it('preserves index.xml document order across multiple snapshots', async () => {
		const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<Snapshots Version="1.0">
    <Snapshot>
        <Title>First</Title>
        <Date>2026-05-08 16:04:16 -0700</Date>
    </Snapshot>
    <Snapshot>
        <Title>Second</Title>
        <Date>2026-05-08 16:06:01 -0700</Date>
    </Snapshot>
    <Snapshot>
        <Title>Third</Title>
        <Date>2026-05-08 16:06:22 -0700</Date>
    </Snapshot>
</Snapshots>`;
		const adapter = fakeAdapter({
			listings: {
				'bundle.scriv/Snapshots': {
					files: [],
					folders: ['bundle.scriv/Snapshots/UUID-A.snapshots'],
				},
			},
			files: {
				'bundle.scriv/Snapshots/UUID-A.snapshots/index.xml': indexXml,
				'bundle.scriv/Snapshots/UUID-A.snapshots/2026-05-08-16-04-16-0700.rtf':
					'(rtf 1)',
				'bundle.scriv/Snapshots/UUID-A.snapshots/2026-05-08-16-06-01-0700.rtf':
					'(rtf 2)',
				'bundle.scriv/Snapshots/UUID-A.snapshots/2026-05-08-16-06-22-0700.rtf':
					'(rtf 3)',
			},
		});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		const titles = result.snapshotsByUuid
			.get('UUID-A')
			?.map((s) => s.title);
		expect(titles).toEqual(['First', 'Second', 'Third']);
	});

	it('preserves the Scrivener literal "Untitled Snapshot" title', async () => {
		const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<Snapshots Version="1.0">
    <Snapshot>
        <Title>Untitled Snapshot</Title>
        <Date>2026-05-08 16:04:16 -0700</Date>
    </Snapshot>
</Snapshots>`;
		const adapter = fakeAdapter({
			listings: {
				'bundle.scriv/Snapshots': {
					files: [],
					folders: ['bundle.scriv/Snapshots/UUID-A.snapshots'],
				},
			},
			files: {
				'bundle.scriv/Snapshots/UUID-A.snapshots/index.xml': indexXml,
				'bundle.scriv/Snapshots/UUID-A.snapshots/2026-05-08-16-04-16-0700.rtf':
					'(rtf body)',
			},
		});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		// The filename-template resolver downstream is responsible for
		// substituting "Untitled" when it sees this literal; the loader
		// preserves what Scrivener wrote.
		expect(result.snapshotsByUuid.get('UUID-A')?.[0]?.title).toBe(
			'Untitled Snapshot'
		);
	});
});

// ---- loadSnapshots — best-effort error handling ------------------------

describe('loadSnapshots — best-effort tolerance', () => {
	it('warns and skips a folder without an index.xml', async () => {
		const adapter = fakeAdapter({
			listings: {
				'bundle.scriv/Snapshots': {
					files: [],
					folders: ['bundle.scriv/Snapshots/UUID-A.snapshots'],
				},
			},
			files: {},
		});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		expect(result.snapshotsByUuid.size).toBe(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('missing index.xml');
	});

	it('warns and skips a folder with malformed index.xml', async () => {
		const adapter = fakeAdapter({
			listings: {
				'bundle.scriv/Snapshots': {
					files: [],
					folders: ['bundle.scriv/Snapshots/UUID-A.snapshots'],
				},
			},
			files: {
				'bundle.scriv/Snapshots/UUID-A.snapshots/index.xml':
					'<not really xml',
			},
		});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		expect(result.snapshotsByUuid.size).toBe(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('malformed XML');
	});

	it('warns and skips an index entry whose RTF body is missing', async () => {
		const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<Snapshots Version="1.0">
    <Snapshot>
        <Title>Present</Title>
        <Date>2026-05-08 16:04:16 -0700</Date>
    </Snapshot>
    <Snapshot>
        <Title>Orphaned</Title>
        <Date>2026-05-08 16:06:01 -0700</Date>
    </Snapshot>
</Snapshots>`;
		const adapter = fakeAdapter({
			listings: {
				'bundle.scriv/Snapshots': {
					files: [],
					folders: ['bundle.scriv/Snapshots/UUID-A.snapshots'],
				},
			},
			files: {
				'bundle.scriv/Snapshots/UUID-A.snapshots/index.xml': indexXml,
				// Only the first .rtf exists; the second is absent.
				'bundle.scriv/Snapshots/UUID-A.snapshots/2026-05-08-16-04-16-0700.rtf':
					'(present)',
			},
		});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		expect(result.snapshotsByUuid.get('UUID-A')?.map((s) => s.title)).toEqual(
			['Present']
		);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('Snapshot RTF missing');
	});

	it('warns and skips a folder with an unexpected name (no .snapshots suffix)', async () => {
		const adapter = fakeAdapter({
			listings: {
				'bundle.scriv/Snapshots': {
					files: [],
					folders: ['bundle.scriv/Snapshots/random-folder'],
				},
			},
			files: {},
		});
		const result = await loadSnapshots(adapter, 'bundle.scriv');
		expect(result.snapshotsByUuid.size).toBe(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('unexpected name');
	});
});

// ---- loadSnapshots — real fixture --------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/scrivener');

function findFixtureBundle(): string | undefined {
	let entries: string[];
	try {
		entries = readdirSync(FIXTURES_DIR);
	} catch {
		return undefined;
	}
	for (const name of entries) {
		const p = path.join(FIXTURES_DIR, name);
		if (statSync(p).isDirectory() && name.endsWith('.scriv')) {
			return p;
		}
	}
	return undefined;
}

const fixtureBundle = findFixtureBundle();

describe.skipIf(fixtureBundle === undefined)(
	'loadSnapshots — real fixture: ScrivenerTesting.scriv',
	() => {
		it('loads metadata for the 6 documents that have snapshots', async () => {
			const adapter = nodeFsAdapter();
			const result = await loadSnapshots(adapter, fixtureBundle as string);

			expect(result.warnings).toEqual([]);
			expect(result.snapshotsByUuid.size).toBe(6);

			// Total count matches the per-doc breakdown captured in the
			// fixture-refresh commit (5 docs x 1 + 1 doc x 3 = 8).
			const total = Array.from(result.snapshotsByUuid.values()).reduce(
				(sum, list) => sum + list.length,
				0
			);
			expect(total).toBe(8);
		});

		it('exposes title + date + rtfPath for one of the seeded snapshots', async () => {
			const adapter = nodeFsAdapter();
			const result = await loadSnapshots(adapter, fixtureBundle as string);

			// 01 - Opening (UUID A9C97B44...) has 3 snapshots.
			const opening = result.snapshotsByUuid.get(
				'A9C97B44-46C8-4CA8-8F28-B8C0606A58EF'
			);
			expect(opening).toBeDefined();
			expect(opening).toHaveLength(3);

			const first = opening?.[0];
			expect(first?.title).toBe('Workshop draft');
			expect(first?.date).toMatch(
				/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [-+]\d{4}$/
			);
			expect(first?.rtfPath).toContain(
				'A9C97B44-46C8-4CA8-8F28-B8C0606A58EF.snapshots/'
			);
			expect(first?.rtfPath.endsWith('.rtf')).toBe(true);
		});

		it('preserves the Scrivener "Untitled Snapshot" literal title for untitled captures', async () => {
			const adapter = nodeFsAdapter();
			const result = await loadSnapshots(adapter, fixtureBundle as string);

			// At least one of the seeded snapshots is untitled — it
			// shows up with the literal "Untitled Snapshot" Scrivener
			// auto-name. Find any document whose first snapshot uses
			// that string and assert the loader preserves it.
			const allTitles = Array.from(result.snapshotsByUuid.values())
				.flat()
				.map((s) => s.title);
			expect(allTitles).toContain('Untitled Snapshot');
		});
	}
);
