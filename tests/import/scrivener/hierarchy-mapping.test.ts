import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
	autoDetectHierarchy,
	effectiveTarget,
	type HierarchyTarget,
} from '../../../src/import/scrivener/hierarchy-mapping';
import {
	parseScrivx,
	type BinderItem,
} from '../../../src/import/scrivener/scrivx-parser';

/**
 * Tests for the Hierarchy step's auto-detect heuristic and override
 * overlay. Synthetic projects pin specific shape -> target rules;
 * real-fixture tests assert the heuristic's output against a known
 * Scrivener Novel template.
 */

let nextId = 0;
function makeItem(
	type: string,
	children: BinderItem[] = [],
	idOverride?: string
): BinderItem {
	return {
		id: idOverride ?? `auto-${++nextId}`,
		type,
		title: '',
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

describe('autoDetectHierarchy — empty / minimal Draft trees', () => {
	it('returns sceneDepth 0 and all-skip mapping for an empty DraftFolder', () => {
		const draft = makeItem('DraftFolder', []);
		const result = autoDetectHierarchy(draft);
		expect(result.sceneDepth).toBe(0);
		expect(result.byId.size).toBe(0);
	});

	it('classifies a single Text leaf at depth 1 as a scene (chapter-less single)', () => {
		const scene = makeItem('Text', [], 'scene-1');
		const draft = makeItem('DraftFolder', [scene]);
		const result = autoDetectHierarchy(draft);
		expect(result.sceneDepth).toBe(1);
		expect(result.byId.get('scene-1')).toBe('scene');
		expect(result.counts.scene).toBe(1);
		expect(result.counts.chapter).toBe(0);
	});
});

describe('autoDetectHierarchy — chapter-based projects', () => {
	it('classifies Folder-with-Text-children as chapters, their Text children as scenes', () => {
		const draft = makeItem('DraftFolder', [
			makeItem('Folder', [
				makeItem('Text', [], 'a'),
				makeItem('Text', [], 'b'),
			], 'ch-1'),
			makeItem('Folder', [makeItem('Text', [], 'c')], 'ch-2'),
		]);
		const result = autoDetectHierarchy(draft);
		expect(result.sceneDepth).toBe(2);
		expect(result.byId.get('ch-1')).toBe('chapter');
		expect(result.byId.get('ch-2')).toBe('chapter');
		expect(result.byId.get('a')).toBe('scene');
		expect(result.byId.get('b')).toBe('scene');
		expect(result.byId.get('c')).toBe('scene');
		expect(result.counts.chapter).toBe(2);
		expect(result.counts.scene).toBe(3);
	});

	it('classifies Parts above chapters as extras-above', () => {
		const draft = makeItem('DraftFolder', [
			makeItem('Folder', [
				makeItem('Folder', [
					makeItem('Text', [], 'sc'),
				], 'ch'),
			], 'pt'),
		]);
		const result = autoDetectHierarchy(draft);
		expect(result.sceneDepth).toBe(3);
		expect(result.byId.get('pt')).toBe('extras-above');
		expect(result.byId.get('ch')).toBe('chapter');
		expect(result.byId.get('sc')).toBe('scene');
	});

	it('classifies multi-level Parts (Volume > Book > Part) as extras-above', () => {
		const draft = makeItem('DraftFolder', [
			makeItem('Folder', [
				makeItem('Folder', [
					makeItem('Folder', [
						makeItem('Folder', [
							makeItem('Text', [], 'leaf'),
						], 'ch'),
					], 'pt'),
				], 'bk'),
			], 'vol'),
		]);
		const result = autoDetectHierarchy(draft);
		expect(result.sceneDepth).toBe(5);
		expect(result.byId.get('vol')).toBe('extras-above');
		expect(result.byId.get('bk')).toBe('extras-above');
		expect(result.byId.get('pt')).toBe('extras-above');
		expect(result.byId.get('ch')).toBe('chapter');
		expect(result.byId.get('leaf')).toBe('scene');
	});
});

describe('autoDetectHierarchy — sub-scenes and extras-below', () => {
	it('classifies Text leaves below the scene level as sub-scenes', () => {
		// Two leaves at d=2 plus two at d=3. Tied counts; tie-break by
		// lower depth -> sceneDepth=2. Deeper leaves become sub-scenes.
		const draft = makeItem('DraftFolder', [
			makeItem('Folder', [
				makeItem('Text', [], 'flat-1'),
				makeItem('Text', [], 'flat-2'),
				makeItem('Folder', [
					makeItem('Text', [], 'deep-1'),
					makeItem('Text', [], 'deep-2'),
				], 'scene-folder'),
			], 'ch'),
		]);
		const result = autoDetectHierarchy(draft);
		expect(result.sceneDepth).toBe(2);
		expect(result.byId.get('ch')).toBe('chapter');
		expect(result.byId.get('flat-1')).toBe('scene');
		expect(result.byId.get('flat-2')).toBe('scene');
		expect(result.byId.get('scene-folder')).toBe('scene');
		expect(result.byId.get('deep-1')).toBe('sub-scene');
		expect(result.byId.get('deep-2')).toBe('sub-scene');
	});

	it('classifies items deeper than sub-scene level as extras-below', () => {
		// sceneDepth=2 (two flat leaves win the modal). A folder at
		// d=4 (= sceneDepth + 2) and a Text at d=5 are both deeper
		// than the sub-scene level, so both fall to extras-below.
		const draft = makeItem('DraftFolder', [
			makeItem('Folder', [
				makeItem('Text', [], 'flat-1'),
				makeItem('Text', [], 'flat-2'),
				makeItem('Folder', [
					makeItem('Folder', [
						makeItem('Folder', [
							makeItem('Text', [], 'too-deep'),
						], 'deep-fold'),
					], 'extras-fold'),
				], 'sub-fold'),
			], 'ch'),
		]);
		const result = autoDetectHierarchy(draft);
		expect(result.sceneDepth).toBe(2);
		expect(result.byId.get('sub-fold')).toBe('scene');
		expect(result.byId.get('extras-fold')).toBe('sub-scene');
		expect(result.byId.get('deep-fold')).toBe('extras-below');
		expect(result.byId.get('too-deep')).toBe('extras-below');
	});
});

describe('autoDetectHierarchy — non-Folder non-Text types', () => {
	it('classifies Image, PDF, and WebArchive items as skip', () => {
		const draft = makeItem('DraftFolder', [
			makeItem('Folder', [
				makeItem('Text', [], 'sc'),
				makeItem('Image', [], 'img'),
				makeItem('PDF', [], 'pdf'),
				makeItem('WebArchive', [], 'web'),
			], 'ch'),
		]);
		const result = autoDetectHierarchy(draft);
		expect(result.byId.get('img')).toBe('skip');
		expect(result.byId.get('pdf')).toBe('skip');
		expect(result.byId.get('web')).toBe('skip');
		expect(result.byId.get('sc')).toBe('scene');
		expect(result.byId.get('ch')).toBe('chapter');
	});
});

describe('autoDetectHierarchy — modal-depth tie-breaking', () => {
	it('prefers lower depth on ties so chapter-level leaves are preserved', () => {
		// Equal counts at depth 2 and depth 3: 2 leaves at each.
		// Lower depth wins -> sceneDepth = 2.
		const draft = makeItem('DraftFolder', [
			makeItem('Folder', [
				makeItem('Text', [], 'flat-1'),
				makeItem('Text', [], 'flat-2'),
				makeItem('Folder', [
					makeItem('Text', [], 'deep-1'),
					makeItem('Text', [], 'deep-2'),
				], 'scene-folder'),
			], 'ch'),
		]);
		const result = autoDetectHierarchy(draft);
		expect(result.sceneDepth).toBe(2);
		expect(result.byId.get('flat-1')).toBe('scene');
		expect(result.byId.get('scene-folder')).toBe('scene');
		expect(result.byId.get('deep-1')).toBe('sub-scene');
	});
});

describe('effectiveTarget', () => {
	it('returns the override when one is present', () => {
		const auto = autoDetectHierarchy(
			makeItem('DraftFolder', [makeItem('Folder', [makeItem('Text', [], 'x')], 'ch')])
		);
		const overrides = new Map<string, HierarchyTarget>([['x', 'sub-scene']]);
		expect(effectiveTarget('x', auto, overrides)).toBe('sub-scene');
	});

	it('returns the auto-detected target when no override is present', () => {
		const auto = autoDetectHierarchy(
			makeItem('DraftFolder', [makeItem('Folder', [makeItem('Text', [], 'x')], 'ch')])
		);
		expect(effectiveTarget('x', auto, new Map())).toBe('scene');
	});

	it('falls back to skip when neither map has an entry', () => {
		const auto = autoDetectHierarchy(makeItem('DraftFolder', []));
		expect(effectiveTarget('unknown', auto, new Map())).toBe('skip');
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
	'autoDetectHierarchy — real fixture: ScrivenerTesting.scriv',
	() => {
		const xml = readFileSync(novelFixture as string, 'utf-8');
		const project = parseScrivx(xml);
		const draftRoot = project.binder.find((b) => b.type === 'DraftFolder');
		expect(draftRoot).toBeDefined();
		const result = autoDetectHierarchy(draftRoot as BinderItem);

		it('detects scene depth 4 (Manuscript > Volume > Part > Chapter > Scene)', () => {
			expect(result.sceneDepth).toBe(4);
		});

		it('classifies the Volume and the two Parts as extras-above', () => {
			// Volume 1 wraps Part One: The Salt Road + Part Two: The Meridian Drift
			const volume = (draftRoot as BinderItem).children[0];
			const partOne = volume.children[0];
			const partTwo = volume.children[1];
			expect(result.byId.get(volume.id)).toBe('extras-above');
			expect(result.byId.get(partOne.id)).toBe('extras-above');
			expect(result.byId.get(partTwo.id)).toBe('extras-above');
		});

		it('classifies the four Chapters as chapters', () => {
			expect(result.counts.chapter).toBe(4);
		});

		it('classifies the leaves at scene depth as scenes', () => {
			// 6 Text leaves at scene-depth (01 Opening, 02 Argument,
			// Chapter 2's Scene, Chapter 3's Scene, Chapter 4's Scene,
			// Scene that's excluded) plus "Extra subfolder" — a Folder at
			// scene-depth that gets classified as a scene because it
			// holds prose-bearing children at sub-scene depth.
			expect(result.counts.scene).toBe(7);
		});

		it('classifies the Argument sub-scenes and the Extra subfolder leaf as sub-scenes', () => {
			// Sub-scene 1, Sub-scene 2 (under 02 - Argument) + Extra
			// something (under Extra subfolder) — three Text leaves at
			// scene-depth + 1.
			expect(result.counts['sub-scene']).toBe(3);
			expect(result.counts['extras-below']).toBe(0);
		});
	}
);
