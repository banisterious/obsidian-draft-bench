import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_SETTINGS } from '../../../src/model/settings';
import { autoDetectHierarchy } from '../../../src/import/scrivener/hierarchy-mapping';
import { buildImportPlan } from '../../../src/import/scrivener/import-plan';
import { parseScrivx } from '../../../src/import/scrivener/scrivx-parser';
import type { ImportOptions } from '../../../src/import/scrivener/import-wizard-modal';
import type {
	BinderItem,
	ScrivProject,
} from '../../../src/import/scrivener/scrivx-parser';

/**
 * Tests for the import-plan builder. Synthetic shapes pin specific
 * path-resolution rules; the real-fixture test asserts the plan
 * against the committed Novel-template bundle end-to-end.
 */

const stubOptions: ImportOptions = {
	importResearch: false,
	importSnapshots: false,
	snapshotCap: 3,
	snapshotFilenameTemplate: '{scene} - Draft {n} ({date_compact})',
	imageExtractionFolder: 'Research/Images/',
	createDefaultCompilePreset: false,
};

let nextId = 0;
function makeItem(args: {
	type?: string;
	title?: string;
	children?: BinderItem[];
} = {}): BinderItem {
	return {
		id: `auto-${++nextId}`,
		type: args.type ?? 'Text',
		title: args.title ?? '',
		keywords: [],
		statusId: null,
		labelId: null,
		includeInCompile: true,
		customMetaData: new Map(),
		created: '',
		modified: '',
		children: args.children ?? [],
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

describe('buildImportPlan — minimal shapes', () => {
	it('emits project folder + project note for a destination', () => {
		const project = makeProject([makeItem({ type: 'DraftFolder', title: 'M' })]);
		const auto = autoDetectHierarchy(project.binder[0]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			stubOptions
		);
		expect(plan.entries[0]).toMatchObject({
			kind: 'folder',
			path: 'Draft Bench/My Novel',
		});
		expect(plan.entries[1]).toMatchObject({
			kind: 'project-note',
			path: 'Draft Bench/My Novel/My Novel.md',
		});
	});

	it('warns when destination name is empty', () => {
		const project = makeProject([]);
		const auto = autoDetectHierarchy(makeItem({ type: 'DraftFolder' }));
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'',
			DEFAULT_SETTINGS,
			stubOptions
		);
		expect(plan.entries).toEqual([]);
		expect(plan.warnings.some((w) => w.includes('empty'))).toBe(true);
	});

	it('warns when no DraftFolder is found', () => {
		const project = makeProject([
			makeItem({ type: 'ResearchFolder', title: 'Research' }),
		]);
		const auto = autoDetectHierarchy(makeItem({ type: 'DraftFolder' }));
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			stubOptions
		);
		expect(plan.warnings.some((w) => w.includes('No manuscript'))).toBe(
			true
		);
	});

	it('sanitizes filesystem-unsafe characters in the destination name', () => {
		const project = makeProject([makeItem({ type: 'DraftFolder' })]);
		const auto = autoDetectHierarchy(project.binder[0]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'Foo: Bar/Baz',
			DEFAULT_SETTINGS,
			stubOptions
		);
		// Colons get spaced (": " -> " - ") for readable filenames; `/`
		// still falls through to the unsafe-char hyphen rule.
		expect(plan.entries[0].path).toBe('Draft Bench/Foo - Bar-Baz');
	});
});

describe('buildImportPlan — chapter-based projects', () => {
	it('produces chapter notes + scene notes with auto-detected paths', () => {
		const draft = makeItem({
			type: 'DraftFolder',
			title: 'Manuscript',
			children: [
				makeItem({
					type: 'Folder',
					title: 'Chapter 1',
					children: [
						makeItem({ type: 'Text', title: '01 - Opening' }),
						makeItem({ type: 'Text', title: '02 - Argument' }),
					],
				}),
			],
		});
		const project = makeProject([draft]);
		const auto = autoDetectHierarchy(draft);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'Salt Road',
			DEFAULT_SETTINGS,
			stubOptions
		);
		expect(plan.counts.chapters).toBe(1);
		expect(plan.counts.scenes).toBe(2);
		const chapterPath = plan.entries.find((e) => e.kind === 'chapter-note')?.path;
		expect(chapterPath).toBe('Draft Bench/Salt Road/Chapter 1.md');
		const scenePaths = plan.entries
			.filter((e) => e.kind === 'scene-note')
			.map((e) => e.path);
		expect(scenePaths).toEqual([
			'Draft Bench/Salt Road/Chapter 1/01 - Opening.md',
			'Draft Bench/Salt Road/Chapter 1/02 - Argument.md',
		]);
	});

	it('counts extras-above and surfaces a warning when Parts are present', () => {
		const draft = makeItem({
			type: 'DraftFolder',
			title: 'M',
			children: [
				makeItem({
					type: 'Folder',
					title: 'Part One',
					children: [
						makeItem({
							type: 'Folder',
							title: 'Chapter 1',
							children: [makeItem({ type: 'Text', title: 'Scene' })],
						}),
					],
				}),
			],
		});
		const project = makeProject([draft]);
		const auto = autoDetectHierarchy(draft);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			stubOptions
		);
		expect(plan.counts.extrasAbove).toBe(1);
		expect(plan.warnings.some((w) => w.includes('scrivener-part'))).toBe(true);
	});
});

describe('buildImportPlan — extras-below warning', () => {
	it('counts extras-below items and surfaces the merge warning', () => {
		// Create a shape that auto-detects extras-below: lots of leaves
		// at d=2 and one path that's deeper than sub-scene level.
		const draft = makeItem({
			type: 'DraftFolder',
			children: [
				makeItem({
					type: 'Folder',
					title: 'Ch',
					children: [
						makeItem({ type: 'Text', title: 'A' }),
						makeItem({ type: 'Text', title: 'B' }),
						makeItem({
							type: 'Folder',
							title: 'Big Scene',
							children: [
								makeItem({
									type: 'Folder',
									title: 'Sub',
									children: [
										makeItem({
											type: 'Folder',
											title: 'Way Deep',
											children: [
												makeItem({ type: 'Text', title: 'Bottom' }),
											],
										}),
									],
								}),
							],
						}),
					],
				}),
			],
		});
		const project = makeProject([draft]);
		const auto = autoDetectHierarchy(draft);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'X',
			DEFAULT_SETTINGS,
			stubOptions
		);
		expect(plan.counts.extrasBelow).toBeGreaterThan(0);
		expect(plan.warnings.some((w) => w.includes('merge'))).toBe(true);
	});
});

describe('buildImportPlan — image counting', () => {
	it('tallies binder items typed Image across all locations', () => {
		const project = makeProject([
			makeItem({
				type: 'DraftFolder',
				children: [makeItem({ type: 'Image' })],
			}),
			makeItem({
				type: 'Folder',
				children: [makeItem({ type: 'Image' }), makeItem({ type: 'Image' })],
			}),
		]);
		const auto = autoDetectHierarchy(project.binder[0]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'X',
			DEFAULT_SETTINGS,
			stubOptions
		);
		expect(plan.counts.images).toBe(3);
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
	'buildImportPlan — real fixture: ScrivenerTesting.scriv',
	() => {
		const xml = readFileSync(novelFixture as string, 'utf-8');
		const project = parseScrivx(xml);
		const draftRoot = project.binder.find((b) => b.type === 'DraftFolder');
		const auto = autoDetectHierarchy(draftRoot as BinderItem);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'Salt Road',
			DEFAULT_SETTINGS,
			stubOptions
		);

		it('plans 4 chapters and 7 scenes from the manuscript', () => {
			expect(plan.counts.chapters).toBe(4);
			expect(plan.counts.scenes).toBe(7);
		});

		it('counts the Volume and two Parts as extras-above', () => {
			expect(plan.counts.extrasAbove).toBe(3);
		});

		it('produces the expected chapter paths', () => {
			const chapterPaths = plan.entries
				.filter((e) => e.kind === 'chapter-note')
				.map((e) => e.path);
			expect(chapterPaths).toEqual([
				'Draft Bench/Salt Road/Chapter 1 - Departure.md',
				'Draft Bench/Salt Road/Chapter 2 - The Crossing.md',
				'Draft Bench/Salt Road/Chapter 3 - Midway.md',
				'Draft Bench/Salt Road/Chapter 4 - Almost There.md',
			]);
		});

		it('produces scene paths nested under their chapter folders (default scenesFolder template)', () => {
			const scenePaths = plan.entries
				.filter((e) => e.kind === 'scene-note')
				.map((e) => e.path);
			expect(scenePaths[0]).toBe(
				'Draft Bench/Salt Road/Chapter 1 - Departure/01 - Opening.md'
			);
			expect(scenePaths[1]).toBe(
				'Draft Bench/Salt Road/Chapter 1 - Departure/02 - Argument.md'
			);
		});

		it('counts the cover Image as a media asset', () => {
			expect(plan.counts.images).toBe(1);
		});

		it('warns about the two extras-above items (Parts)', () => {
			expect(plan.warnings.some((w) => w.includes('scrivener-part'))).toBe(
				true
			);
		});
	}
);
