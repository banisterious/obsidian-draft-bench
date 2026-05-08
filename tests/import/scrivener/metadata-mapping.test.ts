import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
	autoDetectCustomFieldMapping,
	autoDetectStatusMapping,
	countDocumentsByStatus,
	DEFAULT_LABEL_KEY,
	initialMetadataMapping,
} from '../../../src/import/scrivener/metadata-mapping';
import {
	parseScrivx,
	type BinderItem,
	type ScrivProject,
} from '../../../src/import/scrivener/scrivx-parser';

/**
 * Tests for the Metadata step's auto-detect helpers (status mapping,
 * custom field key mapping, document-by-status counting). Synthetic
 * projects exercise specific match-strategy rules; real-fixture tests
 * confirm behavior against the committed Novel-template bundle.
 */

let nextId = 0;
function makeItem(args: {
	statusId?: string | null;
	type?: string;
	children?: BinderItem[];
} = {}): BinderItem {
	return {
		id: `auto-${++nextId}`,
		type: args.type ?? 'Text',
		title: '',
		keywords: [],
		statusId: args.statusId ?? null,
		labelId: null,
		includeInCompile: true,
		customMetaData: new Map(),
		created: '',
		modified: '',
		children: args.children ?? [],
	};
}

function makeProject(opts: Partial<ScrivProject>): ScrivProject {
	return {
		binder: opts.binder ?? [],
		labels: opts.labels ?? new Map(),
		statuses: opts.statuses ?? new Map(),
		keywords: opts.keywords ?? new Map(),
		customMetaDataFields: opts.customMetaDataFields ?? new Map(),
		warnings: [],
	};
}

describe('autoDetectStatusMapping', () => {
	it('returns an empty map when the project has no statuses', () => {
		const result = autoDetectStatusMapping(makeProject({}), [
			'idea',
			'draft',
		]);
		expect(result.size).toBe(0);
	});

	it('exact case-sensitive matches reuse the existing DB status', () => {
		const project = makeProject({
			statuses: new Map([['1', 'draft']]),
		});
		const result = autoDetectStatusMapping(project, ['idea', 'draft']);
		expect(result.get('1')).toEqual({ kind: 'existing', dbStatus: 'draft' });
	});

	it('case-insensitive matches reuse the DB version with its own casing', () => {
		const project = makeProject({
			statuses: new Map([['2', 'First Draft']]),
		});
		const result = autoDetectStatusMapping(project, ['idea', 'first draft']);
		expect(result.get('2')).toEqual({
			kind: 'existing',
			dbStatus: 'first draft',
		});
	});

	it('unmatched statuses auto-add as new with the Scrivener title verbatim', () => {
		const project = makeProject({
			statuses: new Map([['3', 'Revised Draft']]),
		});
		const result = autoDetectStatusMapping(project, ['idea', 'draft']);
		expect(result.get('3')).toEqual({
			kind: 'new',
			statusName: 'Revised Draft',
		});
	});

	it('"No Status" sentinel maps to drop (case-insensitive)', () => {
		const project = makeProject({
			statuses: new Map([
				['-1', 'No Status'],
				['-2', 'no status'],
				['-3', 'NO STATUS'],
			]),
		});
		const result = autoDetectStatusMapping(project, ['idea']);
		expect(result.get('-1')).toEqual({ kind: 'drop' });
		expect(result.get('-2')).toEqual({ kind: 'drop' });
		expect(result.get('-3')).toEqual({ kind: 'drop' });
	});

	it('empty status titles map to drop', () => {
		const project = makeProject({
			statuses: new Map([['9', '   ']]),
		});
		const result = autoDetectStatusMapping(project, ['idea']);
		expect(result.get('9')).toEqual({ kind: 'drop' });
	});

	it('exact match takes precedence over case-insensitive match', () => {
		// Both "draft" and "Draft" exist in vocab; Scrivener title "Draft"
		// should pick the case-sensitive match, not the lowercase.
		const project = makeProject({
			statuses: new Map([['1', 'Draft']]),
		});
		const result = autoDetectStatusMapping(project, ['draft', 'Draft']);
		expect(result.get('1')).toEqual({ kind: 'existing', dbStatus: 'Draft' });
	});
});

describe('autoDetectCustomFieldMapping', () => {
	it('returns an empty map when there are no custom fields', () => {
		const result = autoDetectCustomFieldMapping(makeProject({}));
		expect(result.size).toBe(0);
	});

	it('defaults each custom field to scrivener-<id>', () => {
		const project = makeProject({
			customMetaDataFields: new Map([
				[
					'povcharacter',
					{
						id: 'povcharacter',
						title: 'POV Character',
						fieldType: 'Text',
						listOptions: new Map(),
					},
				],
				[
					'reviewed',
					{
						id: 'reviewed',
						title: 'Reviewed',
						fieldType: 'Checkbox',
						listOptions: new Map(),
					},
				],
			]),
		});
		const result = autoDetectCustomFieldMapping(project);
		expect(result.get('povcharacter')).toBe('scrivener-povcharacter');
		expect(result.get('reviewed')).toBe('scrivener-reviewed');
	});
});

describe('countDocumentsByStatus', () => {
	it('returns an empty map when no items have statusId set', () => {
		const project = makeProject({
			binder: [makeItem(), makeItem(), makeItem()],
		});
		expect(countDocumentsByStatus(project).size).toBe(0);
	});

	it('counts items by statusId across nested binder structure', () => {
		const project = makeProject({
			binder: [
				makeItem({
					children: [
						makeItem({ statusId: '2' }),
						makeItem({ statusId: '2' }),
						makeItem({
							children: [
								makeItem({ statusId: '3' }),
								makeItem({ statusId: '2' }),
							],
						}),
					],
				}),
			],
		});
		const counts = countDocumentsByStatus(project);
		expect(counts.get('2')).toBe(3);
		expect(counts.get('3')).toBe(1);
	});

	it('does not count items with null statusId', () => {
		const project = makeProject({
			binder: [
				makeItem({ statusId: '1' }),
				makeItem({ statusId: null }),
				makeItem({ statusId: '1' }),
			],
		});
		expect(countDocumentsByStatus(project).get('1')).toBe(2);
	});
});

describe('initialMetadataMapping', () => {
	it('combines status mapping + default label key + custom field mapping', () => {
		const project = makeProject({
			statuses: new Map([['1', 'Draft']]),
			customMetaDataFields: new Map([
				[
					'pov',
					{
						id: 'pov',
						title: 'POV',
						fieldType: 'Text',
						listOptions: new Map(),
					},
				],
			]),
		});
		const result = initialMetadataMapping(project, ['draft']);
		expect(result.statuses.get('1')).toEqual({
			kind: 'existing',
			dbStatus: 'draft',
		});
		expect(result.labelKey).toBe(DEFAULT_LABEL_KEY);
		expect(result.customFields.get('pov')).toBe('scrivener-pov');
	});
});

// ---- Real-fixture test --------------------------------------------------

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
		if (statSync(p).isDirectory()) {
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
	'metadata mapping — real fixture: ScrivenerTesting.scriv',
	() => {
		const xml = readFileSync(novelFixture as string, 'utf-8');
		const project = parseScrivx(xml);

		it('countDocumentsByStatus reflects the seeded scenes', () => {
			// 01 - Opening: statusId=2 (First Draft)
			// 02 - Argument: statusId=3 (Revised Draft)
			const counts = countDocumentsByStatus(project);
			expect(counts.get('2')).toBe(1);
			expect(counts.get('3')).toBe(1);
		});

		it('autoDetectStatusMapping drops No Status and adds the rest as new', () => {
			// DB default vocab: ['idea', 'draft', 'revision', 'final']
			// Scrivener vocab includes "No Status", "To Do", "In Progress",
			// "First Draft", "Revised Draft", "Final Draft", "Done".
			const mapping = autoDetectStatusMapping(project, [
				'idea',
				'draft',
				'revision',
				'final',
			]);
			expect(mapping.get('-1')).toEqual({ kind: 'drop' });
			// None of the Scrivener names exact-match the DB vocab even
			// case-insensitively, so all map to new.
			expect(mapping.get('1')).toEqual({
				kind: 'new',
				statusName: 'To Do',
			});
			expect(mapping.get('2')).toEqual({
				kind: 'new',
				statusName: 'First Draft',
			});
			expect(mapping.get('3')).toEqual({
				kind: 'new',
				statusName: 'Revised Draft',
			});
		});

		it('autoDetectCustomFieldMapping defaults POV Character to scrivener-povcharacter', () => {
			const mapping = autoDetectCustomFieldMapping(project);
			expect(mapping.get('povcharacter')).toBe('scrivener-povcharacter');
		});
	}
);
