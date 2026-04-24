import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	computeLastCompileStatus,
	parseStoredHashes,
} from '../../../src/core/compile/last-compile-status';
import { djb2, formatChapterHash } from '../../../src/core/compile/hash';
import type { CompilePresetNote } from '../../../src/core/discovery';

async function seedScene(
	app: App,
	options: {
		path: string;
		id: string;
		projectId: string;
		order: number;
		body: string;
	}
): Promise<void> {
	const file = await app.vault.create(options.path, options.body);
	app.metadataCache._setFrontmatter(file, {
		'dbench-type': 'scene',
		'dbench-id': options.id,
		'dbench-project': '[[Novel]]',
		'dbench-project-id': options.projectId,
		'dbench-order': options.order,
		'dbench-status': 'draft',
		'dbench-drafts': [],
		'dbench-draft-ids': [],
	});
}

function makePreset(
	projectId: string,
	overrides: Partial<CompilePresetNote['frontmatter']> = {}
): CompilePresetNote {
	const fm: CompilePresetNote['frontmatter'] = {
		'dbench-type': 'compile-preset',
		'dbench-id': 'prs-001',
		'dbench-project': '[[Novel]]',
		'dbench-project-id': projectId,
		'dbench-schema-version': 1,
		'dbench-compile-title': '',
		'dbench-compile-subtitle': '',
		'dbench-compile-author': '',
		'dbench-compile-date-format': 'iso',
		'dbench-compile-scene-source': 'auto',
		'dbench-compile-scene-statuses': [],
		'dbench-compile-scene-excludes': [],
		'dbench-compile-format': 'md',
		'dbench-compile-output': 'vault',
		'dbench-compile-page-size': 'letter',
		'dbench-compile-include-cover': false,
		'dbench-compile-include-toc': false,
		'dbench-compile-chapter-numbering': 'none',
		'dbench-compile-include-section-breaks': true,
		'dbench-compile-heading-scope': 'draft',
		'dbench-compile-frontmatter': 'strip',
		'dbench-compile-wikilinks': 'display-text',
		'dbench-compile-embeds': 'strip',
		'dbench-compile-dinkuses': 'preserve',
		'dbench-last-compiled-at': '',
		'dbench-last-output-path': '',
		'dbench-last-chapter-hashes': [],
		...overrides,
	};
	return {
		file: { basename: 'Workshop' } as never,
		frontmatter: fm,
	};
}

describe('parseStoredHashes', () => {
	it('parses well-formed entries into a map', () => {
		const map = parseStoredHashes(['sc-a:deadbeef', 'sc-b:cafebabe']);
		expect(map.get('sc-a')).toBe('deadbeef');
		expect(map.get('sc-b')).toBe('cafebabe');
		expect(map.size).toBe(2);
	});

	it('drops malformed entries without throwing', () => {
		const map = parseStoredHashes([
			'good-id:abc',
			'no-colon-here',
			':leading-colon',
			'',
			'sc-x:',
		]);
		expect(map.get('good-id')).toBe('abc');
		expect(map.get('sc-x')).toBe(''); // valid id with empty hash kept
		expect(map.size).toBe(2);
	});

	it('returns an empty map for empty input', () => {
		expect(parseStoredHashes([]).size).toBe(0);
	});
});

describe('computeLastCompileStatus', () => {
	let app: App;
	const projectId = 'prj-001';

	beforeEach(() => {
		app = new App();
	});

	it('reports null compiledAt + zero scenesChanged when never compiled', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a',
			projectId,
			order: 1,
			body: 'A.',
		});
		const preset = makePreset(projectId);
		const status = await computeLastCompileStatus(app, preset);
		expect(status.compiledAt).toBeNull();
		expect(status.outputPath).toBeNull();
		expect(status.storedHashCount).toBe(0);
		expect(status.scenesChanged).toBe(0);
		expect(status.totalCurrentScenes).toBe(1);
	});

	it('reports zero changes when stored hashes match current content', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a',
			projectId,
			order: 1,
			body: 'A.',
		});
		const preset = makePreset(projectId, {
			'dbench-last-compiled-at': '2026-04-23T10:00:00.000Z',
			'dbench-last-output-path': 'Novel/Compiled/Workshop.md',
			'dbench-last-chapter-hashes': [formatChapterHash('sc-a', djb2('A.'))],
		});
		const status = await computeLastCompileStatus(app, preset);
		expect(status.compiledAt).toBe('2026-04-23T10:00:00.000Z');
		expect(status.outputPath).toBe('Novel/Compiled/Workshop.md');
		expect(status.storedHashCount).toBe(1);
		expect(status.scenesChanged).toBe(0);
	});

	it('counts scenes whose current content has been edited', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a',
			projectId,
			order: 1,
			body: 'edited prose',
		});
		// Stored hash matches the OLD body, not the current.
		const preset = makePreset(projectId, {
			'dbench-last-chapter-hashes': [
				formatChapterHash('sc-a', djb2('original prose')),
			],
		});
		const status = await computeLastCompileStatus(app, preset);
		expect(status.scenesChanged).toBe(1);
	});

	it('counts new scenes added since last compile', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a',
			projectId,
			order: 1,
			body: 'A.',
		});
		await seedScene(app, {
			path: 'Novel/B.md',
			id: 'sc-b',
			projectId,
			order: 2,
			body: 'B (new).',
		});
		const preset = makePreset(projectId, {
			'dbench-last-chapter-hashes': [formatChapterHash('sc-a', djb2('A.'))],
		});
		const status = await computeLastCompileStatus(app, preset);
		// sc-b is new (no stored hash) -> +1
		expect(status.scenesChanged).toBe(1);
		expect(status.totalCurrentScenes).toBe(2);
	});

	it('counts scenes that have been removed since last compile', async () => {
		await seedScene(app, {
			path: 'Novel/A.md',
			id: 'sc-a',
			projectId,
			order: 1,
			body: 'A.',
		});
		const preset = makePreset(projectId, {
			'dbench-last-chapter-hashes': [
				formatChapterHash('sc-a', djb2('A.')),
				formatChapterHash('sc-removed', '11111111'),
			],
		});
		const status = await computeLastCompileStatus(app, preset);
		// sc-removed exists in stored but not in current -> +1
		expect(status.scenesChanged).toBe(1);
	});
});
