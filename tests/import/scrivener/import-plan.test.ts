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

describe('buildImportPlan — snapshot drafts', () => {
	const optionsWithSnapshots: ImportOptions = {
		...stubOptions,
		importSnapshots: true,
		snapshotCap: 3,
		snapshotFilenameTemplate: '{scene} - Draft {n} ({date_compact})',
	};

	function buildSceneFixture(): {
		project: ReturnType<typeof makeProject>;
		auto: ReturnType<typeof autoDetectHierarchy>;
		sceneId: string;
	} {
		const scene = makeItem({ type: 'Text', title: '01 - Opening' });
		const draft = makeItem({
			type: 'DraftFolder',
			children: [
				makeItem({ type: 'Folder', title: 'Chapter 1', children: [scene] }),
			],
		});
		const project = makeProject([draft]);
		const auto = autoDetectHierarchy(draft);
		return { project, auto, sceneId: scene.id };
	}

	it('emits no snapshot-draft entries when importSnapshots is off (even with snapshots present)', () => {
		const { project, auto, sceneId } = buildSceneFixture();
		const snapshots = new Map([
			[
				sceneId,
				[
					{
						title: 'Workshop',
						date: '2024-01-01 10:00:00 -0700',
						rtfPath: 'unused.rtf',
					},
				],
			],
		]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			stubOptions, // importSnapshots: false
			snapshots
		);
		expect(plan.entries.some((e) => e.kind === 'snapshot-draft')).toBe(false);
		expect(plan.counts.snapshots).toBe(0);
	});

	it('emits one snapshot-draft entry per kept snapshot in chronological order', () => {
		const { project, auto, sceneId } = buildSceneFixture();
		const snapshots = new Map([
			[
				sceneId,
				[
					{
						title: 'Third',
						date: '2024-03-01 10:00:00 -0700',
						rtfPath: 'third.rtf',
					},
					{
						title: 'First',
						date: '2024-01-01 10:00:00 -0700',
						rtfPath: 'first.rtf',
					},
					{
						title: 'Second',
						date: '2024-02-01 10:00:00 -0700',
						rtfPath: 'second.rtf',
					},
				],
			],
		]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			optionsWithSnapshots,
			snapshots
		);
		const drafts = plan.entries.filter((e) => e.kind === 'snapshot-draft');
		expect(drafts.map((d) => d.sourceTitle)).toEqual([
			'First',
			'Second',
			'Third',
		]);
		expect(plan.counts.snapshots).toBe(3);
		expect(plan.counts.snapshotsCapped).toBe(0);
	});

	it('respects the per-scene cap and counts dropped snapshots', () => {
		const { project, auto, sceneId } = buildSceneFixture();
		const snapshots = new Map([
			[
				sceneId,
				[
					{ title: 'A', date: '2024-01-01 10:00:00 -0700', rtfPath: 'a.rtf' },
					{ title: 'B', date: '2024-02-01 10:00:00 -0700', rtfPath: 'b.rtf' },
					{ title: 'C', date: '2024-03-01 10:00:00 -0700', rtfPath: 'c.rtf' },
					{ title: 'D', date: '2024-04-01 10:00:00 -0700', rtfPath: 'd.rtf' },
					{ title: 'E', date: '2024-05-01 10:00:00 -0700', rtfPath: 'e.rtf' },
				],
			],
		]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			{ ...optionsWithSnapshots, snapshotCap: 3 },
			snapshots
		);
		const drafts = plan.entries.filter((e) => e.kind === 'snapshot-draft');
		// Most recent 3 kept (C, D, E); A and B dropped.
		expect(drafts.map((d) => d.sourceTitle)).toEqual(['C', 'D', 'E']);
		expect(plan.counts.snapshots).toBe(3);
		expect(plan.counts.snapshotsCapped).toBe(2);
		expect(
			plan.warnings.some((w) =>
				w.includes('2 snapshots will be skipped')
			)
		).toBe(true);
	});

	it('keeps all snapshots when cap is "all"', () => {
		const { project, auto, sceneId } = buildSceneFixture();
		const snapshots = new Map([
			[
				sceneId,
				[
					{ title: 'A', date: '2024-01-01 10:00:00 -0700', rtfPath: 'a.rtf' },
					{ title: 'B', date: '2024-02-01 10:00:00 -0700', rtfPath: 'b.rtf' },
					{ title: 'C', date: '2024-03-01 10:00:00 -0700', rtfPath: 'c.rtf' },
					{ title: 'D', date: '2024-04-01 10:00:00 -0700', rtfPath: 'd.rtf' },
					{ title: 'E', date: '2024-05-01 10:00:00 -0700', rtfPath: 'e.rtf' },
				],
			],
		]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			{ ...optionsWithSnapshots, snapshotCap: 'all' },
			snapshots
		);
		expect(plan.counts.snapshots).toBe(5);
		expect(plan.counts.snapshotsCapped).toBe(0);
	});

	it('applies the filename template with substituted variables and {n} per-scene counter', () => {
		const { project, auto, sceneId } = buildSceneFixture();
		const snapshots = new Map([
			[
				sceneId,
				[
					{ title: 'A', date: '2024-01-01 10:00:00 -0700', rtfPath: 'a.rtf' },
					{ title: 'B', date: '2024-02-01 10:00:00 -0700', rtfPath: 'b.rtf' },
				],
			],
		]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			optionsWithSnapshots,
			snapshots
		);
		const drafts = plan.entries.filter((e) => e.kind === 'snapshot-draft');
		expect(drafts[0].path.endsWith('01 - Opening - Draft 1 (20240101).md')).toBe(
			true
		);
		expect(drafts[1].path.endsWith('01 - Opening - Draft 2 (20240201).md')).toBe(
			true
		);
	});

	it('disambiguates collisions when the template is bare {title}', () => {
		const { project, auto, sceneId } = buildSceneFixture();
		const snapshots = new Map([
			[
				sceneId,
				[
					{
						title: 'Untitled Snapshot',
						date: '2024-01-01 10:00:00 -0700',
						rtfPath: 'a.rtf',
					},
					{
						title: 'Untitled Snapshot',
						date: '2024-02-01 10:00:00 -0700',
						rtfPath: 'b.rtf',
					},
				],
			],
		]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			{ ...optionsWithSnapshots, snapshotFilenameTemplate: '{title}' },
			snapshots
		);
		const drafts = plan.entries.filter((e) => e.kind === 'snapshot-draft');
		// Both resolve via "Untitled Snapshot" -> "Untitled" sentinel,
		// then the second collides and gets " 2" appended.
		expect(drafts.map((d) => d.path.split('/').pop())).toEqual([
			'Untitled.md',
			'Untitled 2.md',
		]);
	});

	it('emits a Drafts/ folder entry alongside the snapshot drafts', () => {
		const { project, auto, sceneId } = buildSceneFixture();
		const snapshots = new Map([
			[
				sceneId,
				[
					{ title: 'A', date: '2024-01-01 10:00:00 -0700', rtfPath: 'a.rtf' },
				],
			],
		]);
		const plan = buildImportPlan(
			project,
			auto,
			new Map(),
			'My Novel',
			DEFAULT_SETTINGS,
			optionsWithSnapshots,
			snapshots
		);
		const folders = plan.entries.filter(
			(e) => e.kind === 'folder' && e.path.endsWith('/Drafts')
		);
		expect(folders).toHaveLength(1);
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
