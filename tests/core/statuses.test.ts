import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	countStatusUsage,
	filesWithStatus,
	renameStatus,
} from '../../src/core/statuses';

async function seedNote(
	app: App,
	path: string,
	frontmatter: Record<string, unknown>
): Promise<TFile> {
	const file = await app.vault.create(path, '');
	app.metadataCache._setFrontmatter(file, { ...frontmatter });
	return file;
}

describe('filesWithStatus', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns paths of notes that match the status', async () => {
		await seedNote(app, 'a.md', { 'dbench-status': 'idea' });
		await seedNote(app, 'b.md', { 'dbench-status': 'idea' });
		await seedNote(app, 'c.md', { 'dbench-status': 'final' });

		const ideas = filesWithStatus(app, 'idea');
		expect(ideas.sort()).toEqual(['a.md', 'b.md']);
	});

	it('returns an empty list when no notes match', async () => {
		await seedNote(app, 'a.md', { 'dbench-status': 'idea' });
		expect(filesWithStatus(app, 'nonexistent')).toEqual([]);
	});

	it('ignores notes without a string dbench-status', async () => {
		await seedNote(app, 'a.md', { 'dbench-status': 'idea' });
		await seedNote(app, 'b.md', { 'dbench-status': null });
		await seedNote(app, 'c.md', { 'dbench-status': 42 });
		await seedNote(app, 'd.md', { tags: ['foo'] });

		expect(filesWithStatus(app, 'idea')).toEqual(['a.md']);
	});

	it('is case-sensitive (distinct casings are separate buckets)', async () => {
		await seedNote(app, 'a.md', { 'dbench-status': 'Idea' });
		await seedNote(app, 'b.md', { 'dbench-status': 'idea' });

		expect(filesWithStatus(app, 'idea')).toEqual(['b.md']);
		expect(filesWithStatus(app, 'Idea')).toEqual(['a.md']);
	});
});

describe('countStatusUsage', () => {
	it('returns the count of matching notes', async () => {
		const app = new App();
		await seedNote(app, 'a.md', { 'dbench-status': 'idea' });
		await seedNote(app, 'b.md', { 'dbench-status': 'idea' });
		await seedNote(app, 'c.md', { 'dbench-status': 'final' });

		expect(countStatusUsage(app, 'idea')).toBe(2);
		expect(countStatusUsage(app, 'final')).toBe(1);
		expect(countStatusUsage(app, 'missing')).toBe(0);
	});
});

describe('renameStatus', () => {
	it('rewrites dbench-status on every matching note and reports the count', async () => {
		const app = new App();
		await seedNote(app, 'a.md', { 'dbench-status': 'revision' });
		await seedNote(app, 'b.md', { 'dbench-status': 'revision' });
		await seedNote(app, 'c.md', { 'dbench-status': 'final' });

		const changed = await renameStatus(app, 'revision', 'editing');
		expect(changed).toBe(2);

		expect(countStatusUsage(app, 'revision')).toBe(0);
		expect(countStatusUsage(app, 'editing')).toBe(2);
		expect(countStatusUsage(app, 'final')).toBe(1);
	});

	it('is a no-op when no notes match', async () => {
		const app = new App();
		await seedNote(app, 'a.md', { 'dbench-status': 'idea' });
		const changed = await renameStatus(app, 'ghost', 'idea');
		expect(changed).toBe(0);
	});

	it('leaves non-matching notes untouched', async () => {
		const app = new App();
		await seedNote(app, 'a.md', { 'dbench-status': 'draft', tags: ['keep'] });
		await seedNote(app, 'b.md', { 'dbench-status': 'final' });

		await renameStatus(app, 'draft', 'wip');

		const a = app.metadataCache.getFileCache(
			app.vault.getAbstractFileByPath('a.md') as TFile
		)?.frontmatter;
		const b = app.metadataCache.getFileCache(
			app.vault.getAbstractFileByPath('b.md') as TFile
		)?.frontmatter;
		expect(a?.['dbench-status']).toBe('wip');
		expect(a?.tags).toEqual(['keep']);
		expect(b?.['dbench-status']).toBe('final');
	});
});
