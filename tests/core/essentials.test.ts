import { describe, expect, it } from 'vitest';
import {
	stampChapterEssentials,
	stampCompilePresetEssentials,
	stampDbenchId,
	stampDraftEssentials,
	stampProjectEssentials,
	stampSceneEssentials,
	stampSubSceneEssentials,
	type CompilePresetEssentialsContext,
	type EssentialsContext,
} from '../../src/core/essentials';
import { isValidDbenchId } from '../../src/core/id';

const ctx = (basename: string): EssentialsContext => ({ basename });

const presetCtx = (
	overrides: Partial<CompilePresetEssentialsContext> = {}
): CompilePresetEssentialsContext => ({
	basename: 'Workshop draft',
	projectWikilink: '[[My Novel]]',
	projectId: 'ppp-000-qqq-111',
	...overrides,
});

describe('stampProjectEssentials', () => {
	it('stamps all twelve project keys onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, ctx('My Novel'));

		expect(fm['dbench-type']).toBe('project');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('[[My Novel]]');
		expect(fm['dbench-project-id']).toBe(fm['dbench-id']);
		expect(fm['dbench-project-shape']).toBe('folder');
		expect(fm['dbench-status']).toBe('idea');
		expect(fm['dbench-scenes']).toEqual([]);
		expect(fm['dbench-scene-ids']).toEqual([]);
		expect(fm['dbench-chapters']).toEqual([]);
		expect(fm['dbench-chapter-ids']).toEqual([]);
		expect(fm['dbench-compile-presets']).toEqual([]);
		expect(fm['dbench-compile-preset-ids']).toEqual([]);
	});

	it('uses the basename in the self-link', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, ctx('A Salt-Worn Road'));
		expect(fm['dbench-project']).toBe('[[A Salt-Worn Road]]');
	});

	it('mirrors dbench-id into dbench-project-id', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['dbench-project-id']).toBe(fm['dbench-id']);
	});

	it('is idempotent: re-running produces the same frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, ctx('Project'));
		const snapshot = { ...fm };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves an existing dbench-id and uses it for project-id', () => {
		const fm: Record<string, unknown> = { 'dbench-id': 'aaa-111-bbb-222' };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['dbench-id']).toBe('aaa-111-bbb-222');
		expect(fm['dbench-project-id']).toBe('aaa-111-bbb-222');
	});

	it('preserves existing values across all stamped keys', () => {
		const fm: Record<string, unknown> = {
			'dbench-type': 'project',
			'dbench-id': 'aaa-111-bbb-222',
			'dbench-project': '[[Custom Link]]',
			'dbench-project-id': 'aaa-111-bbb-222',
			'dbench-project-shape': 'single',
			'dbench-status': 'revision',
			'dbench-scenes': ['[[Scene 1]]'],
			'dbench-scene-ids': ['xyz-789-abc-456'],
			'dbench-chapters': ['[[Chapter 1]]'],
			'dbench-chapter-ids': ['cha-111-222-333'],
			'dbench-compile-presets': ['[[Workshop]]'],
			'dbench-compile-preset-ids': ['prs-111-222-333'],
		};
		const snapshot = { ...fm };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves non-dbench properties already on the note', () => {
		const fm: Record<string, unknown> = {
			tags: ['fiction', 'novel'],
			created: '2026-04-20',
			author: 'John Banister',
		};
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['tags']).toEqual(['fiction', 'novel']);
		expect(fm['created']).toBe('2026-04-20');
		expect(fm['author']).toBe('John Banister');
	});

	it('treats null values as missing (YAML empty-value case)', () => {
		const fm: Record<string, unknown> = { 'dbench-status': null };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['dbench-status']).toBe('idea');
	});

	it('preserves an existing empty string (not the same as null)', () => {
		const fm: Record<string, unknown> = { 'dbench-project': '' };
		stampProjectEssentials(fm, ctx('Project'));
		expect(fm['dbench-project']).toBe('');
	});
});

describe('stampChapterEssentials', () => {
	it('stamps all ten chapter keys onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampChapterEssentials(fm, ctx('Chapter 1'));

		expect(fm['dbench-type']).toBe('chapter');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('');
		expect(fm['dbench-project-id']).toBe('');
		expect(fm['dbench-order']).toBe(9999);
		expect(fm['dbench-status']).toBe('idea');
		expect(fm['dbench-scenes']).toEqual([]);
		expect(fm['dbench-scene-ids']).toEqual([]);
		expect(fm['dbench-drafts']).toEqual([]);
		expect(fm['dbench-draft-ids']).toEqual([]);
	});

	it('does not stamp optional target-words or synopsis', () => {
		const fm: Record<string, unknown> = {};
		stampChapterEssentials(fm, ctx('Chapter 1'));
		expect(fm['dbench-target-words']).toBeUndefined();
		expect(fm['dbench-synopsis']).toBeUndefined();
	});

	it('is idempotent', () => {
		const fm: Record<string, unknown> = {};
		stampChapterEssentials(fm, ctx('Chapter'));
		const snapshot = { ...fm };
		stampChapterEssentials(fm, ctx('Chapter'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves dbench-order: 0 (must not be replaced with default 9999)', () => {
		const fm: Record<string, unknown> = { 'dbench-order': 0 };
		stampChapterEssentials(fm, ctx('Chapter'));
		expect(fm['dbench-order']).toBe(0);
	});

	it('preserves an existing project assignment', () => {
		const fm: Record<string, unknown> = {
			'dbench-project': '[[The Salt Road]]',
			'dbench-project-id': 'abc-123-def-456',
		};
		stampChapterEssentials(fm, ctx('Chapter'));
		expect(fm['dbench-project']).toBe('[[The Salt Road]]');
		expect(fm['dbench-project-id']).toBe('abc-123-def-456');
	});

	it('preserves writer-set target-words and synopsis', () => {
		const fm: Record<string, unknown> = {
			'dbench-target-words': 3000,
			'dbench-synopsis': 'Mara reaches the lighthouse.',
		};
		stampChapterEssentials(fm, ctx('Chapter'));
		expect(fm['dbench-target-words']).toBe(3000);
		expect(fm['dbench-synopsis']).toBe('Mara reaches the lighthouse.');
	});

	it('preserves existing reverse arrays', () => {
		const fm: Record<string, unknown> = {
			'dbench-scenes': ['[[Existing Scene]]'],
			'dbench-scene-ids': ['ppp-000-qqq-111'],
		};
		stampChapterEssentials(fm, ctx('Chapter'));
		expect(fm['dbench-scenes']).toEqual(['[[Existing Scene]]']);
		expect(fm['dbench-scene-ids']).toEqual(['ppp-000-qqq-111']);
	});

	it('preserves non-dbench properties', () => {
		const fm: Record<string, unknown> = { tags: ['novel-chapter'], pov: 'Mara' };
		stampChapterEssentials(fm, ctx('Chapter'));
		expect(fm['tags']).toEqual(['novel-chapter']);
		expect(fm['pov']).toBe('Mara');
	});

	it('uses context.defaultStatus when provided', () => {
		const fm: Record<string, unknown> = {};
		stampChapterEssentials(fm, { basename: 'Chapter', defaultStatus: 'in-progress' });
		expect(fm['dbench-status']).toBe('in-progress');
	});
});

describe('stampSceneEssentials', () => {
	it('stamps all eight scene keys onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampSceneEssentials(fm, ctx('Chapter 1'));

		expect(fm['dbench-type']).toBe('scene');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('');
		expect(fm['dbench-project-id']).toBe('');
		expect(fm['dbench-order']).toBe(9999);
		expect(fm['dbench-status']).toBe('idea');
		expect(fm['dbench-drafts']).toEqual([]);
		expect(fm['dbench-draft-ids']).toEqual([]);
	});

	it('is idempotent', () => {
		const fm: Record<string, unknown> = {};
		stampSceneEssentials(fm, ctx('Scene'));
		const snapshot = { ...fm };
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves dbench-order: 0 (must not be replaced with default 9999)', () => {
		const fm: Record<string, unknown> = { 'dbench-order': 0 };
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm['dbench-order']).toBe(0);
	});

	it('preserves an existing project assignment', () => {
		const fm: Record<string, unknown> = {
			'dbench-project': '[[The Salt Road]]',
			'dbench-project-id': 'abc-123-def-456',
		};
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm['dbench-project']).toBe('[[The Salt Road]]');
		expect(fm['dbench-project-id']).toBe('abc-123-def-456');
	});

	it('preserves non-dbench properties', () => {
		const fm: Record<string, unknown> = { tags: ['draft'], wordcount: 1500 };
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm['tags']).toEqual(['draft']);
		expect(fm['wordcount']).toBe(1500);
	});
});

describe('stampSubSceneEssentials', () => {
	it('stamps all ten sub-scene keys onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampSubSceneEssentials(fm, ctx('Lot 47'));

		expect(fm['dbench-type']).toBe('sub-scene');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('');
		expect(fm['dbench-project-id']).toBe('');
		expect(fm['dbench-scene']).toBe('');
		expect(fm['dbench-scene-id']).toBe('');
		expect(fm['dbench-order']).toBe(9999);
		expect(fm['dbench-status']).toBe('idea');
		expect(fm['dbench-drafts']).toEqual([]);
		expect(fm['dbench-draft-ids']).toEqual([]);
	});

	it('does not stamp optional target-words, subtitle, synopsis, or section-break', () => {
		const fm: Record<string, unknown> = {};
		stampSubSceneEssentials(fm, ctx('Lot 47'));
		expect(fm['dbench-target-words']).toBeUndefined();
		expect(fm['dbench-subtitle']).toBeUndefined();
		expect(fm['dbench-synopsis']).toBeUndefined();
		expect(fm['dbench-section-break-title']).toBeUndefined();
		expect(fm['dbench-section-break-style']).toBeUndefined();
	});

	it('is idempotent', () => {
		const fm: Record<string, unknown> = {};
		stampSubSceneEssentials(fm, ctx('Lot 47'));
		const snapshot = { ...fm };
		stampSubSceneEssentials(fm, ctx('Lot 47'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves dbench-order: 0 (must not be replaced with default 9999)', () => {
		const fm: Record<string, unknown> = { 'dbench-order': 0 };
		stampSubSceneEssentials(fm, ctx('Lot 47'));
		expect(fm['dbench-order']).toBe(0);
	});

	it('preserves an existing project + scene assignment', () => {
		const fm: Record<string, unknown> = {
			'dbench-project': '[[Meridian Drift]]',
			'dbench-project-id': 'abc-123-def-456',
			'dbench-scene': '[[The auction]]',
			'dbench-scene-id': 'ghi-789-jkl-012',
		};
		stampSubSceneEssentials(fm, ctx('Lot 47'));
		expect(fm['dbench-project']).toBe('[[Meridian Drift]]');
		expect(fm['dbench-project-id']).toBe('abc-123-def-456');
		expect(fm['dbench-scene']).toBe('[[The auction]]');
		expect(fm['dbench-scene-id']).toBe('ghi-789-jkl-012');
	});

	it('preserves writer-set target-words, subtitle, synopsis, and section-break', () => {
		const fm: Record<string, unknown> = {
			'dbench-target-words': 800,
			'dbench-subtitle': 'POV shift to Mara',
			'dbench-synopsis': "the lot's provenance falls apart",
			'dbench-section-break-title': 'Three days later',
			'dbench-section-break-style': 'visual',
		};
		stampSubSceneEssentials(fm, ctx('Lot 47'));
		expect(fm['dbench-target-words']).toBe(800);
		expect(fm['dbench-subtitle']).toBe('POV shift to Mara');
		expect(fm['dbench-synopsis']).toBe("the lot's provenance falls apart");
		expect(fm['dbench-section-break-title']).toBe('Three days later');
		expect(fm['dbench-section-break-style']).toBe('visual');
	});

	it('preserves existing reverse arrays', () => {
		const fm: Record<string, unknown> = {
			'dbench-drafts': ['[[Lot 47 - Draft 1 (20260502)]]'],
			'dbench-draft-ids': ['drf-555-666-777'],
		};
		stampSubSceneEssentials(fm, ctx('Lot 47'));
		expect(fm['dbench-drafts']).toEqual(['[[Lot 47 - Draft 1 (20260502)]]']);
		expect(fm['dbench-draft-ids']).toEqual(['drf-555-666-777']);
	});

	it('preserves non-dbench properties', () => {
		const fm: Record<string, unknown> = { tags: ['sub-scene'], pov: 'Mara' };
		stampSubSceneEssentials(fm, ctx('Lot 47'));
		expect(fm['tags']).toEqual(['sub-scene']);
		expect(fm['pov']).toBe('Mara');
	});

	it('uses context.defaultStatus when provided', () => {
		const fm: Record<string, unknown> = {};
		stampSubSceneEssentials(fm, { basename: 'Lot 47', defaultStatus: 'in-progress' });
		expect(fm['dbench-status']).toBe('in-progress');
	});
});

describe('stampDraftEssentials', () => {
	it('stamps all six draft keys onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampDraftEssentials(fm, ctx('Scene - Draft 1 (20260415)'));

		expect(fm['dbench-type']).toBe('draft');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('');
		expect(fm['dbench-scene']).toBe('');
		expect(fm['dbench-scene-id']).toBe('');
		expect(fm['dbench-draft-number']).toBe(1);
	});

	it('does not stamp scene-only or project-only keys', () => {
		const fm: Record<string, unknown> = {};
		stampDraftEssentials(fm, ctx('Draft'));
		expect(fm).not.toHaveProperty('dbench-order');
		expect(fm).not.toHaveProperty('dbench-status');
		expect(fm).not.toHaveProperty('dbench-scenes');
		expect(fm).not.toHaveProperty('dbench-drafts');
		expect(fm).not.toHaveProperty('dbench-project-shape');
	});

	it('is idempotent', () => {
		const fm: Record<string, unknown> = {};
		stampDraftEssentials(fm, ctx('Draft'));
		const snapshot = { ...fm };
		stampDraftEssentials(fm, ctx('Draft'));
		expect(fm).toEqual(snapshot);
	});

	it('preserves existing draft number on retrofit', () => {
		const fm: Record<string, unknown> = { 'dbench-draft-number': 3 };
		stampDraftEssentials(fm, ctx('Draft'));
		expect(fm['dbench-draft-number']).toBe(3);
	});

	it('preserves an existing scene assignment', () => {
		const fm: Record<string, unknown> = {
			'dbench-scene': '[[Tempting Waters]]',
			'dbench-scene-id': 'abc-123-def-456',
		};
		stampDraftEssentials(fm, ctx('Draft'));
		expect(fm['dbench-scene']).toBe('[[Tempting Waters]]');
		expect(fm['dbench-scene-id']).toBe('abc-123-def-456');
	});
});

describe('stampDbenchId', () => {
	it('adds dbench-id to an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampDbenchId(fm);
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
	});

	it('adds nothing else', () => {
		const fm: Record<string, unknown> = {};
		stampDbenchId(fm);
		expect(Object.keys(fm)).toEqual(['dbench-id']);
	});

	it('preserves an existing dbench-id', () => {
		const fm: Record<string, unknown> = { 'dbench-id': 'aaa-111-bbb-222' };
		stampDbenchId(fm);
		expect(fm['dbench-id']).toBe('aaa-111-bbb-222');
	});

	it('preserves all other frontmatter', () => {
		const fm: Record<string, unknown> = {
			'dbench-type': 'scene',
			tags: ['fiction'],
		};
		stampDbenchId(fm);
		expect(fm['dbench-type']).toBe('scene');
		expect(fm['tags']).toEqual(['fiction']);
	});

	it('is idempotent', () => {
		const fm: Record<string, unknown> = {};
		stampDbenchId(fm);
		const id = fm['dbench-id'];
		stampDbenchId(fm);
		expect(fm['dbench-id']).toBe(id);
	});
});

describe('defaultStatus in context', () => {
	it('stampProjectEssentials uses context.defaultStatus when provided', () => {
		const fm: Record<string, unknown> = {};
		stampProjectEssentials(fm, {
			basename: 'My Novel',
			defaultStatus: 'brainstorm',
		});
		expect(fm['dbench-status']).toBe('brainstorm');
	});

	it('stampSceneEssentials uses context.defaultStatus when provided', () => {
		const fm: Record<string, unknown> = {};
		stampSceneEssentials(fm, {
			basename: 'Scene',
			defaultStatus: 'wip',
		});
		expect(fm['dbench-status']).toBe('wip');
	});

	it('falls back to the built-in default when defaultStatus is omitted', () => {
		const fm: Record<string, unknown> = {};
		stampSceneEssentials(fm, { basename: 'Scene' });
		expect(fm['dbench-status']).toBe('idea');
	});
});

describe('cross-helper interaction', () => {
	it('stampDbenchId followed by stampSceneEssentials uses the existing id', () => {
		const fm: Record<string, unknown> = {};
		stampDbenchId(fm);
		const id = fm['dbench-id'];
		stampSceneEssentials(fm, ctx('Scene'));
		expect(fm['dbench-id']).toBe(id);
		expect(fm['dbench-type']).toBe('scene');
	});

	it('"Complete essential properties" pattern: partially-typed scene gets missing fields filled', () => {
		// User has manually typed a scene but only stamped type and id.
		const fm: Record<string, unknown> = {
			'dbench-type': 'scene',
			'dbench-id': 'aaa-111-bbb-222',
		};
		stampSceneEssentials(fm, ctx('Scene'));

		// Existing values preserved
		expect(fm['dbench-type']).toBe('scene');
		expect(fm['dbench-id']).toBe('aaa-111-bbb-222');

		// Missing values filled
		expect(fm['dbench-project']).toBe('');
		expect(fm['dbench-order']).toBe(9999);
		expect(fm['dbench-status']).toBe('idea');
		expect(fm['dbench-drafts']).toEqual([]);
	});
});

describe('stampCompilePresetEssentials', () => {
	it('stamps identity, linkage, and all default values onto an empty frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampCompilePresetEssentials(fm, presetCtx());

		expect(fm['dbench-type']).toBe('compile-preset');
		expect(isValidDbenchId(fm['dbench-id'])).toBe(true);
		expect(fm['dbench-project']).toBe('[[My Novel]]');
		expect(fm['dbench-project-id']).toBe('ppp-000-qqq-111');
		expect(fm['dbench-schema-version']).toBe(1);
		expect(fm['dbench-compile-format']).toBe('md');
		expect(fm['dbench-compile-output']).toBe('vault');
		expect(fm['dbench-compile-scene-source']).toBe('auto');
		expect(fm['dbench-compile-scene-statuses']).toEqual([]);
		expect(fm['dbench-compile-scene-excludes']).toEqual([]);
		expect(fm['dbench-compile-include-section-breaks']).toBe(true);
		expect(fm['dbench-compile-heading-scope']).toBe('draft');
		expect(fm['dbench-compile-frontmatter']).toBe('strip');
		expect(fm['dbench-compile-wikilinks']).toBe('display-text');
		expect(fm['dbench-compile-embeds']).toBe('strip');
		expect(fm['dbench-compile-dinkuses']).toBe('preserve');
		expect(fm['dbench-last-compiled-at']).toBe('');
		expect(fm['dbench-last-output-path']).toBe('');
		expect(fm['dbench-last-chapter-hashes']).toEqual([]);
	});

	it('applies the format override on a fresh frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampCompilePresetEssentials(fm, presetCtx({ format: 'pdf' }));
		expect(fm['dbench-compile-format']).toBe('pdf');
	});

	it('preserves a writer-set format when re-stamping with a different format override', () => {
		const fm: Record<string, unknown> = { 'dbench-compile-format': 'odt' };
		stampCompilePresetEssentials(fm, presetCtx({ format: 'pdf' }));
		expect(fm['dbench-compile-format']).toBe('odt');
	});

	it('is idempotent: re-running produces the same frontmatter', () => {
		const fm: Record<string, unknown> = {};
		stampCompilePresetEssentials(fm, presetCtx());
		const snapshot = JSON.parse(JSON.stringify(fm));
		stampCompilePresetEssentials(fm, presetCtx());
		expect(fm).toEqual(snapshot);
	});

	it('preserves writer-tuned values across all stamped keys', () => {
		const fm: Record<string, unknown> = {
			'dbench-type': 'compile-preset',
			'dbench-id': 'aaa-111-bbb-222',
			'dbench-project': '[[Custom]]',
			'dbench-project-id': 'zzz-999-yyy-888',
			'dbench-compile-title': 'Things That Transpired',
			'dbench-compile-author': 'Jane Writer',
			'dbench-compile-scene-statuses': ['final'],
			'dbench-compile-include-cover': true,
			'dbench-compile-wikilinks': 'strip',
		};
		stampCompilePresetEssentials(fm, presetCtx());

		expect(fm['dbench-id']).toBe('aaa-111-bbb-222');
		expect(fm['dbench-project']).toBe('[[Custom]]');
		expect(fm['dbench-project-id']).toBe('zzz-999-yyy-888');
		expect(fm['dbench-compile-title']).toBe('Things That Transpired');
		expect(fm['dbench-compile-author']).toBe('Jane Writer');
		expect(fm['dbench-compile-scene-statuses']).toEqual(['final']);
		expect(fm['dbench-compile-include-cover']).toBe(true);
		expect(fm['dbench-compile-wikilinks']).toBe('strip');
	});

	it('clones array defaults so later mutation does not leak across stamps', () => {
		const fm1: Record<string, unknown> = {};
		const fm2: Record<string, unknown> = {};
		stampCompilePresetEssentials(fm1, presetCtx());
		stampCompilePresetEssentials(fm2, presetCtx());

		(fm1['dbench-compile-scene-statuses'] as string[]).push('final');

		expect(fm1['dbench-compile-scene-statuses']).toEqual(['final']);
		expect(fm2['dbench-compile-scene-statuses']).toEqual([]);
	});

	it('mirrors the project wikilink and id from the context', () => {
		const fm: Record<string, unknown> = {};
		stampCompilePresetEssentials(
			fm,
			presetCtx({
				projectWikilink: '[[A Salt-Worn Road]]',
				projectId: 'xyz-111-abc-222',
			})
		);
		expect(fm['dbench-project']).toBe('[[A Salt-Worn Road]]');
		expect(fm['dbench-project-id']).toBe('xyz-111-abc-222');
	});

	it("applies the headingScope override (e.g., 'chapter' for chapter-aware projects)", () => {
		const fm: Record<string, unknown> = {};
		stampCompilePresetEssentials(fm, presetCtx({ headingScope: 'chapter' }));
		expect(fm['dbench-compile-heading-scope']).toBe('chapter');
	});

	it('preserves a writer-set heading-scope when re-stamping with a different override', () => {
		const fm: Record<string, unknown> = {
			'dbench-compile-heading-scope': 'full',
		};
		stampCompilePresetEssentials(fm, presetCtx({ headingScope: 'chapter' }));
		expect(fm['dbench-compile-heading-scope']).toBe('full');
	});

	it("falls back to the default ('draft') when no headingScope override is supplied", () => {
		const fm: Record<string, unknown> = {};
		stampCompilePresetEssentials(fm, presetCtx());
		expect(fm['dbench-compile-heading-scope']).toBe('draft');
	});
});
