import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import {
	addDbenchId,
	applyToFiles,
	collectMarkdownFiles,
	completeEssentials,
	hasMissingEssentials,
	hasMissingId,
	listMissingKeys,
	readDbenchType,
	setAsChapter,
	setAsDraft,
	setAsProject,
	setAsScene,
	setAsSubScene,
} from '../../src/core/retrofit';
import { isValidDbenchId } from '../../src/core/id';
import { DEFAULT_SETTINGS } from '../../src/model/settings';

const settings = DEFAULT_SETTINGS;

/**
 * Test helper: create an untyped markdown file directly in the mock
 * vault. Frontmatter argument is optional; pass {} for a truly blank
 * file, omit for "no frontmatter at all."
 */
async function seedFile(
	app: App,
	path: string,
	frontmatter?: Record<string, unknown>
): Promise<TFile> {
	const file = await app.vault.create(path, '');
	if (frontmatter) {
		// Seed via the mock's cache so readDbenchType / listMissingKeys see it.
		app.metadataCache._setFrontmatter(file, { ...frontmatter });
	}
	return file;
}

describe('readDbenchType', () => {
	it('returns null for an untyped note', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md');
		expect(readDbenchType(app, file)).toBeNull();
	});

	it('returns the type string when set', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', { 'dbench-type': 'scene' });
		expect(readDbenchType(app, file)).toBe('scene');
	});

	it('returns null when dbench-type is not a string', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', { 'dbench-type': 123 });
		expect(readDbenchType(app, file)).toBeNull();
	});
});

describe('listMissingKeys', () => {
	it('returns all required project keys for a blank project frontmatter', () => {
		const missing = listMissingKeys({ 'dbench-type': 'project' }, 'project');
		expect(missing).toContain('dbench-id');
		expect(missing).toContain('dbench-project-shape');
	});

	it('treats empty strings and empty arrays as present (not missing)', () => {
		const fm = {
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '',
			'dbench-project-id': '',
			'dbench-project-shape': 'folder',
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		};
		expect(listMissingKeys(fm, 'project')).toEqual([]);
	});

	it('treats null and undefined as missing', () => {
		const fm = {
			'dbench-id': null,
			'dbench-project': undefined,
		};
		const missing = listMissingKeys(fm, 'project');
		expect(missing).toContain('dbench-id');
		expect(missing).toContain('dbench-project');
	});

	it('returns [] for an unknown type', () => {
		expect(listMissingKeys({}, 'nonsense')).toEqual([]);
	});
});

describe('setAsProject', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('stamps project essentials on an untyped note', async () => {
		const file = await seedFile(app, 'My Novel.md');
		const result = await setAsProject(app, settings,file);

		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('project');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-project']).toBe('[[My Novel]]');
		expect(fm?.['dbench-project-id']).toBe(fm?.['dbench-id']);
		expect(fm?.['dbench-project-shape']).toBe('folder');
		expect(fm?.['dbench-scenes']).toEqual([]);
	});

	it('skips when the note is already typed', async () => {
		const file = await seedFile(app, 'note.md', { 'dbench-type': 'scene' });
		const result = await setAsProject(app, settings,file);
		expect(result.outcome).toBe('skipped');
		expect(result.reason).toContain('scene');
	});

	it('preserves existing non-dbench frontmatter', async () => {
		const file = await seedFile(app, 'note.md', { title: 'Existing' });
		const result = await setAsProject(app, settings,file);
		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['title']).toBe('Existing');
		expect(fm?.['dbench-type']).toBe('project');
	});
});

describe('setAsScene', () => {
	it('stamps scene essentials on an untyped note', async () => {
		const app = new App();
		const file = await seedFile(app, 'Opening.md');
		const result = await setAsScene(app, settings,file);

		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('scene');
		expect(fm?.['dbench-project']).toBe('');
		expect(fm?.['dbench-order']).toBe(9999);
		expect(fm?.['dbench-drafts']).toEqual([]);
	});

	it('skips when the note is already a project', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', {
			'dbench-type': 'project',
		});
		const result = await setAsScene(app, settings,file);
		expect(result.outcome).toBe('skipped');
		expect(result.reason).toMatch(/already a project/i);
	});
});

describe('setAsChapter', () => {
	it('stamps chapter essentials on an untyped note', async () => {
		const app = new App();
		const file = await seedFile(app, 'The Departure.md');
		const result = await setAsChapter(app, settings, file);

		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('chapter');
		expect(fm?.['dbench-project']).toBe('');
		expect(fm?.['dbench-project-id']).toBe('');
		expect(fm?.['dbench-order']).toBe(9999);
		expect(fm?.['dbench-status']).toBe(settings.statusVocabulary[0]);
		expect(fm?.['dbench-scenes']).toEqual([]);
		expect(fm?.['dbench-scene-ids']).toEqual([]);
		expect(fm?.['dbench-drafts']).toEqual([]);
		expect(fm?.['dbench-draft-ids']).toEqual([]);
	});

	it('skips when the note is already a scene', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', {
			'dbench-type': 'scene',
		});
		const result = await setAsChapter(app, settings, file);
		expect(result.outcome).toBe('skipped');
		expect(result.reason).toMatch(/already a scene/i);
	});

	it('infers the parent project + chapter order when the chapter sits in the project folder', async () => {
		const app = new App();
		// Project note seeded with a known id so the inference + order
		// math is observable.
		await seedFile(app, 'My Novel/My Novel.md', {
			'dbench-type': 'project',
			'dbench-id': 'prj-test-001',
			'dbench-project': '[[My Novel]]',
			'dbench-project-id': 'prj-test-001',
			'dbench-project-shape': 'folder',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
		});
		// Existing chapter at order 2 to verify nextChapterOrder picks 3.
		await seedFile(app, 'My Novel/Existing Chapter.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chp-existing-001',
			'dbench-project': '[[My Novel]]',
			'dbench-project-id': 'prj-test-001',
			'dbench-order': 2,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		const file = await seedFile(app, 'My Novel/New Chapter.md');
		const result = await setAsChapter(app, settings, file);

		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('[[My Novel]]');
		expect(fm?.['dbench-project-id']).toBe('prj-test-001');
		expect(fm?.['dbench-order']).toBe(3);
	});

	it('refuses with an error when the inferred project has direct (chapter-less) scenes (mixed-children rule)', async () => {
		const app = new App();
		await seedFile(app, 'Flat/Flat.md', {
			'dbench-type': 'project',
			'dbench-id': 'prj-flat-001',
			'dbench-project': '[[Flat]]',
			'dbench-project-id': 'prj-flat-001',
			'dbench-project-shape': 'folder',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
		});
		// A direct scene (no chapter parent) — mixed-children rule
		// blocks adding chapters until this scene is moved.
		await seedFile(app, 'Flat/Direct Scene.md', {
			'dbench-type': 'scene',
			'dbench-id': 'sc-direct-001',
			'dbench-project': '[[Flat]]',
			'dbench-project-id': 'prj-flat-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		const file = await seedFile(app, 'Flat/New Chapter.md');
		const result = await setAsChapter(app, settings, file);

		expect(result.outcome).toBe('error');
		expect(result.reason).toMatch(/direct scene/i);
		// The note must remain untyped — we refused before stamping.
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBeUndefined();
	});
});

describe('setAsSubScene', () => {
	it('stamps sub-scene essentials on an untyped note', async () => {
		const app = new App();
		const file = await seedFile(app, 'Lot 47.md');
		const result = await setAsSubScene(app, settings, file);

		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('sub-scene');
		expect(fm?.['dbench-project']).toBe('');
		expect(fm?.['dbench-project-id']).toBe('');
		expect(fm?.['dbench-scene']).toBe('');
		expect(fm?.['dbench-scene-id']).toBe('');
		expect(fm?.['dbench-order']).toBe(9999);
		expect(fm?.['dbench-status']).toBe(settings.statusVocabulary[0]);
		expect(fm?.['dbench-drafts']).toEqual([]);
		expect(fm?.['dbench-draft-ids']).toEqual([]);
	});

	it('skips when the note is already a scene', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', {
			'dbench-type': 'scene',
		});
		const result = await setAsSubScene(app, settings, file);
		expect(result.outcome).toBe('skipped');
		expect(result.reason).toMatch(/already a scene/i);
	});

	it('infers parent scene + project + order from the § 10 nested layout (#21)', async () => {
		const app = new App();
		// Project at root.
		await seedFile(app, 'Drift/Drift.md', {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		// Parent scene at <project>/<scene>.md, sibling of the folder
		// holding its sub-scenes. This is the post-#11/#12 default for
		// chapter-less projects.
		await seedFile(app, 'Drift/The auction.md', {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		// Existing sub-scene at order 1 -> next should be 2.
		await seedFile(app, 'Drift/The auction/Existing.md', {
			'dbench-type': 'sub-scene',
			'dbench-id': 'sub-existing-001',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-scene-id': 'sc1-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		// New untyped sub-scene candidate inside the scene's folder.
		// Inference's first stage looks for a scene file at
		// `${parentFolder}.md` (i.e., `Drift/The auction.md`) — match.
		const file = await seedFile(app, 'Drift/The auction/Lot 47.md');

		const result = await setAsSubScene(app, settings, file);
		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('sub-scene');
		expect(fm?.['dbench-scene']).toBe('[[The auction]]');
		expect(fm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
		expect(fm?.['dbench-project']).toBe('[[Drift]]');
		expect(fm?.['dbench-project-id']).toBe('prj-001-tst-001');
		expect(fm?.['dbench-order']).toBe(2);
	});

	it('infers parent scene under chapter-aware nested layout (#21)', async () => {
		const app = new App();
		// Chapter-aware project: scene lives at <project>/<chapter>/<scene>.md
		// post-#11. Sub-scene at <project>/<chapter>/<scene>/<sub-scene>.md
		// per #12. Inference's first stage matches `${parentFolder}.md`.
		await seedFile(app, 'Drift/Drift.md', {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'idea',
			'dbench-chapters': [],
			'dbench-chapter-ids': [],
		});
		await seedFile(app, 'Drift/Ch01/Ch01.md', {
			'dbench-type': 'chapter',
			'dbench-id': 'chp-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
		});
		await seedFile(app, 'Drift/Ch01/The auction.md', {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-chapter': '[[Ch01]]',
			'dbench-chapter-id': 'chp-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		const file = await seedFile(app, 'Drift/Ch01/The auction/Lot 47.md');

		const result = await setAsSubScene(app, settings, file);
		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-scene']).toBe('[[The auction]]');
		expect(fm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
		expect(fm?.['dbench-project']).toBe('[[Drift]]');
		expect(fm?.['dbench-project-id']).toBe('prj-001-tst-001');
		expect(fm?.['dbench-order']).toBe(1);
	});

	it('infers parent scene when the sub-scene shares a folder with the scene file', async () => {
		const app = new App();
		// A flat layout (subScenesFolder: '') has both scene and
		// sub-scenes alongside the project note. Inference can resolve
		// the parent scene from the shared folder when there's exactly
		// one scene there.
		await seedFile(app, 'Drift/Drift.md', {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		await seedFile(app, 'Drift/The auction.md', {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		const file = await seedFile(app, 'Drift/The auction - Lot 47.md');
		const result = await setAsSubScene(app, settings, file);

		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-scene']).toBe('[[The auction]]');
		expect(fm?.['dbench-scene-id']).toBe('sc1-001-tst-001');
		expect(fm?.['dbench-project']).toBe('[[Drift]]');
		expect(fm?.['dbench-project-id']).toBe('prj-001-tst-001');
		expect(fm?.['dbench-order']).toBe(1);
	});

	it('surfaces a transition notice when the inferred parent scene has whole-scene drafts', async () => {
		const app = new App();
		await seedFile(app, 'Drift/Drift.md', {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		// Parent scene already has whole-scene drafts.
		await seedFile(app, 'Drift/The auction.md', {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [
				'[[The auction - Draft 1 (20260501)]]',
				'[[The auction - Draft 2 (20260502)]]',
			],
			'dbench-draft-ids': ['drf-001-tst-001', 'drf-002-tst-002'],
		});

		const file = await seedFile(app, 'Drift/The auction - Lot 47.md');
		const result = await setAsSubScene(app, settings, file);

		expect(result.outcome).toBe('updated');
		expect(result.notice).toBeDefined();
		expect(result.notice).toMatch(/whole-scene draft/i);
		expect(result.notice).toMatch(/2 existing/);
	});

	it('omits the transition notice when the parent scene has no whole-scene drafts', async () => {
		const app = new App();
		await seedFile(app, 'Drift/Drift.md', {
			'dbench-type': 'project',
			'dbench-id': 'prj-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-project-shape': 'folder',
			'dbench-status': 'idea',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		await seedFile(app, 'Drift/The auction.md', {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-001-tst-001',
			'dbench-project': '[[Drift]]',
			'dbench-project-id': 'prj-001-tst-001',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		const file = await seedFile(app, 'Drift/The auction - Lot 47.md');
		const result = await setAsSubScene(app, settings, file);

		expect(result.outcome).toBe('updated');
		expect(result.notice).toBeUndefined();
	});
});

describe('setAsDraft', () => {
	it('stamps draft essentials with draft-number 1 by default', async () => {
		const app = new App();
		const file = await seedFile(app, 'Opening.md');
		const result = await setAsDraft(app, settings,file);

		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('draft');
		expect(fm?.['dbench-draft-number']).toBe(1);
	});

	it('infers draft-number from a "Draft N" pattern in the filename', async () => {
		const app = new App();
		const file = await seedFile(
			app,
			'Opening - Draft 3 (20260420).md'
		);
		const result = await setAsDraft(app, settings,file);

		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-draft-number']).toBe(3);
	});

	it('falls back to 1 when filename has no Draft pattern', async () => {
		const app = new App();
		const file = await seedFile(app, 'Untitled draft file.md');
		const result = await setAsDraft(app, settings,file);
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-draft-number']).toBe(1);
	});
});

describe('completeEssentials', () => {
	it('skips an untyped note', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md');
		const result = await completeEssentials(app, settings,file);
		expect(result.outcome).toBe('skipped');
		expect(result.reason).toMatch(/no dbench-type/i);
	});

	it('skips a fully-stamped note', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md');
		await setAsScene(app, settings,file);
		const result = await completeEssentials(app, settings,file);
		expect(result.outcome).toBe('skipped');
		expect(result.reason).toMatch(/already complete/i);
	});

	it('fills in missing essentials on a partial scene', async () => {
		const app = new App();
		const file = await seedFile(app, 'Opening.md', {
			'dbench-type': 'scene',
			'dbench-id': 'abc-123-def-456',
			// Missing: project, project-id, order, status, drafts, draft-ids
		});
		const result = await completeEssentials(app, settings,file);
		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-id']).toBe('abc-123-def-456'); // preserved
		expect(fm?.['dbench-order']).toBe(9999);
		expect(fm?.['dbench-status']).toBe('idea');
		expect(fm?.['dbench-drafts']).toEqual([]);
	});

	it('dispatches based on existing dbench-type (project)', async () => {
		const app = new App();
		const file = await seedFile(app, 'Novel.md', {
			'dbench-type': 'project',
		});
		const result = await completeEssentials(app, settings,file);
		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-project-shape']).toBe('folder');
	});
});

describe('addDbenchId', () => {
	it('stamps an id on a typed note missing one', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', {
			'dbench-type': 'scene',
		});
		const result = await addDbenchId(app, settings,file);
		expect(result.outcome).toBe('updated');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
	});

	it('skips when an id is already present', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', {
			'dbench-type': 'scene',
			'dbench-id': 'abc-123-def-456',
		});
		const result = await addDbenchId(app, settings,file);
		expect(result.outcome).toBe('skipped');
	});

	it('still stamps on an untyped note (spec allows standalone use)', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md');
		const result = await addDbenchId(app, settings,file);
		expect(result.outcome).toBe('updated');
	});
});

describe('hasMissingEssentials / hasMissingId', () => {
	it('returns false for an untyped note (hasMissingEssentials)', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md');
		expect(hasMissingEssentials(app, file)).toBe(false);
	});

	it('returns true for a partial scene (hasMissingEssentials)', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', {
			'dbench-type': 'scene',
		});
		expect(hasMissingEssentials(app, file)).toBe(true);
	});

	it('returns true when typed but id is missing (hasMissingId)', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', {
			'dbench-type': 'scene',
		});
		expect(hasMissingId(app, file)).toBe(true);
	});

	it('returns false when id is present (hasMissingId)', async () => {
		const app = new App();
		const file = await seedFile(app, 'note.md', {
			'dbench-type': 'scene',
			'dbench-id': 'abc-123-def-456',
		});
		expect(hasMissingId(app, file)).toBe(false);
	});
});

describe('applyToFiles', () => {
	it('aggregates updated / skipped / error counts', async () => {
		const app = new App();
		const a = await seedFile(app, 'a.md'); // untyped → updated
		const b = await seedFile(app, 'b.md', { 'dbench-type': 'project' }); // already typed → skipped
		const c = await seedFile(app, 'c.md'); // untyped → updated

		const result = await applyToFiles(app, settings,[a, b, c], setAsScene);
		expect(result.updated).toBe(2);
		expect(result.skipped).toBe(1);
		expect(result.errors).toBe(0);
	});

	it('handles an empty file list', async () => {
		const app = new App();
		const result = await applyToFiles(app, settings,[], setAsScene);
		expect(result).toEqual({ updated: 0, skipped: 0, errors: 0 });
	});
});

describe('collectMarkdownFiles', () => {
	it('returns every markdown file under the given folder path', async () => {
		const app = new App();
		await seedFile(app, 'Novel/One.md');
		await seedFile(app, 'Novel/Two.md');
		await seedFile(app, 'Novel/Subfolder/Three.md');
		await seedFile(app, 'Outside.md');

		// Register the folder by path so vault.getAbstractFileByPath works,
		// but collectMarkdownFiles only needs folder.path from the arg.
		const folder = new TFolder({ path: 'Novel', name: 'Novel' });
		const files = collectMarkdownFiles(app, folder);
		const paths = files.map((f) => f.path).sort();
		expect(paths).toEqual([
			'Novel/One.md',
			'Novel/Subfolder/Three.md',
			'Novel/Two.md',
		]);
	});

	it('handles the vault root (empty path)', async () => {
		const app = new App();
		await seedFile(app, 'A.md');
		await seedFile(app, 'Sub/B.md');

		const root = new TFolder({ path: '', name: '' });
		const files = collectMarkdownFiles(app, root);
		expect(files).toHaveLength(2);
	});
});

describe('setAsScene with folder inference', () => {
	async function seedProjectNote(
		app: App,
		path: string,
		id: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${file.basename}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		return file;
	}

	it('fills project refs + order when the parent folder has exactly one project note', async () => {
		const app = new App();
		await seedProjectNote(app, 'Novel/Novel.md', 'prj-001-tst-001');
		const untyped = await seedFile(app, 'Novel/Opening.md');

		const result = await setAsScene(app, settings,untyped);
		expect(result.outcome).toBe('updated');

		const fm = app.metadataCache.getFileCache(untyped)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('[[Novel]]');
		expect(fm?.['dbench-project-id']).toBe('prj-001-tst-001');
		expect(fm?.['dbench-order']).toBe(1);
	});

	it('computes order = max+1 when the project has existing scenes', async () => {
		const app = new App();
		await seedProjectNote(app, 'Novel/Novel.md', 'prj-002-tst-002');

		// Pre-seed two existing scenes at orders 1 and 2.
		const s1 = await app.vault.create('Novel/Chapter 1.md', '');
		app.metadataCache._setFrontmatter(s1, {
			'dbench-type': 'scene',
			'dbench-id': 'sc1-000-tst-001',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-002-tst-002',
			'dbench-order': 1,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});
		const s2 = await app.vault.create('Novel/Chapter 2.md', '');
		app.metadataCache._setFrontmatter(s2, {
			'dbench-type': 'scene',
			'dbench-id': 'sc2-000-tst-002',
			'dbench-project': '[[Novel]]',
			'dbench-project-id': 'prj-002-tst-002',
			'dbench-order': 2,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		const untyped = await seedFile(app, 'Novel/Chapter 3.md');
		const result = await setAsScene(app, settings,untyped);
		expect(result.outcome).toBe('updated');

		const fm = app.metadataCache.getFileCache(untyped)?.frontmatter;
		expect(fm?.['dbench-order']).toBe(3);
	});

	it('falls back to empty placeholders when the folder has no project', async () => {
		const app = new App();
		const untyped = await seedFile(app, 'Loose/Orphan.md');
		const result = await setAsScene(app, settings,untyped);
		expect(result.outcome).toBe('updated');

		const fm = app.metadataCache.getFileCache(untyped)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('');
		expect(fm?.['dbench-project-id']).toBe('');
		expect(fm?.['dbench-order']).toBe(9999);
	});

	it('falls back to empty placeholders when the folder has multiple projects (ambiguous)', async () => {
		const app = new App();
		await seedProjectNote(app, 'Shared/First.md', 'prj-001-tst-001');
		await seedProjectNote(app, 'Shared/Second.md', 'prj-002-tst-002');
		const untyped = await seedFile(app, 'Shared/Orphan.md');

		const result = await setAsScene(app, settings,untyped);
		expect(result.outcome).toBe('updated');

		const fm = app.metadataCache.getFileCache(untyped)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('');
		expect(fm?.['dbench-project-id']).toBe('');
	});
});

describe('setAsDraft with folder inference', () => {
	async function seedProjectNote(
		app: App,
		path: string,
		id: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${file.basename}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		return file;
	}

	it('walks up from Drafts/ to find the project in the parent folder', async () => {
		const app = new App();
		await seedProjectNote(app, 'Novel/Novel.md', 'prj-001-tst-001');
		const untyped = await seedFile(
			app,
			'Novel/Drafts/Opening - Draft 1 (20260420).md'
		);

		const result = await setAsDraft(app, settings,untyped);
		expect(result.outcome).toBe('updated');

		const fm = app.metadataCache.getFileCache(untyped)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('[[Novel]]');
		expect(fm?.['dbench-project-id']).toBe('prj-001-tst-001');
		expect(fm?.['dbench-draft-number']).toBe(1);
	});

	it('always sets dbench-project-id (empty when inference fails)', async () => {
		const app = new App();
		const untyped = await seedFile(app, 'Loose/Orphan draft.md');
		const result = await setAsDraft(app, settings,untyped);
		expect(result.outcome).toBe('updated');

		const fm = app.metadataCache.getFileCache(untyped)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('');
		expect(fm?.['dbench-project-id']).toBe('');
	});

	it('stops at the first ambiguous level (multiple projects)', async () => {
		const app = new App();
		await seedProjectNote(app, 'Shared/A.md', 'prj-001-tst-001');
		await seedProjectNote(app, 'Shared/B.md', 'prj-002-tst-002');
		const untyped = await seedFile(app, 'Shared/Drafts/orphan.md');

		const result = await setAsDraft(app, settings,untyped);
		expect(result.outcome).toBe('updated');

		const fm = app.metadataCache.getFileCache(untyped)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('');
		expect(fm?.['dbench-project-id']).toBe('');
	});
});

describe('completeEssentials with folder inference', () => {
	async function seedProjectNote(
		app: App,
		path: string,
		id: string
	): Promise<TFile> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'project',
			'dbench-id': id,
			'dbench-project': `[[${file.basename}]]`,
			'dbench-project-id': id,
			'dbench-project-shape': 'folder',
			'dbench-status': 'draft',
			'dbench-scenes': [],
			'dbench-scene-ids': [],
		});
		return file;
	}

	it('upgrades empty project refs on an orphan scene', async () => {
		const app = new App();
		await seedProjectNote(app, 'Novel/Novel.md', 'prj-001-tst-001');
		// Scene retrofitted under the old (no-inference) behavior: all
		// essentials present, but project refs empty and order at 9999.
		const scene = await seedFile(app, 'Novel/Opening.md', {
			'dbench-type': 'scene',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '',
			'dbench-project-id': '',
			'dbench-order': 9999,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		const result = await completeEssentials(app, settings,scene);
		expect(result.outcome).toBe('updated');

		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('[[Novel]]');
		expect(fm?.['dbench-project-id']).toBe('prj-001-tst-001');
		expect(fm?.['dbench-order']).toBe(1);
		expect(fm?.['dbench-id']).toBe('abc-123-def-456'); // preserved
	});

	it('does not overwrite non-empty project refs', async () => {
		const app = new App();
		await seedProjectNote(app, 'Novel/Novel.md', 'prj-001-tst-001');
		const scene = await seedFile(app, 'Novel/Opening.md', {
			'dbench-type': 'scene',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[Other Novel]]',
			'dbench-project-id': 'other-project-id',
			'dbench-order': 5,
			'dbench-status': 'idea',
			'dbench-drafts': [],
			'dbench-draft-ids': [],
		});

		const result = await completeEssentials(app, settings,scene);
		// All required keys present AND existing values are non-empty.
		// No upgrade opportunities, so skip.
		expect(result.outcome).toBe('skipped');

		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('[[Other Novel]]');
		expect(fm?.['dbench-project-id']).toBe('other-project-id');
		expect(fm?.['dbench-order']).toBe(5);
	});
});
