import { describe, expect, it } from 'vitest';
import { BASE_TEMPLATES } from '../../src/core/bases-templates';

describe('BASE_TEMPLATES', () => {
	it('ships three templates: projects, scenes, drafts', () => {
		expect(BASE_TEMPLATES.map((t) => t.filename)).toEqual([
			'projects',
			'scenes',
			'drafts',
		]);
	});

	it('every template has non-empty metadata and content', () => {
		for (const tpl of BASE_TEMPLATES) {
			expect(tpl.filename).not.toBe('');
			expect(tpl.displayName).not.toBe('');
			expect(tpl.description).not.toBe('');
			expect(tpl.content).not.toBe('');
		}
	});

	it('every template filters on dbench-type', () => {
		for (const tpl of BASE_TEMPLATES) {
			expect(tpl.content).toMatch(/note\["dbench-type"\] ==/);
		}
	});

	it('templates scope to the correct entity type', () => {
		const byFilename = Object.fromEntries(
			BASE_TEMPLATES.map((t) => [t.filename, t.content])
		);
		expect(byFilename.projects).toMatch(/dbench-type"\] == "project"/);
		expect(byFilename.scenes).toMatch(/dbench-type"\] == "scene"/);
		expect(byFilename.drafts).toMatch(/dbench-type"\] == "draft"/);
	});

	it('every template declares at least one view', () => {
		for (const tpl of BASE_TEMPLATES) {
			expect(tpl.content).toMatch(/^views:/m);
			expect(tpl.content).toMatch(/- type: (table|cards|list|map)/);
		}
	});

	it('scene template uses this["dbench-id"] for embedded-context filters', () => {
		const scenes = BASE_TEMPLATES.find((t) => t.filename === 'scenes');
		expect(scenes?.content).toMatch(
			/note\["dbench-project-id"\] == this\["dbench-id"\]/
		);
	});

	it('draft template uses this["dbench-id"] for embedded-context filters', () => {
		const drafts = BASE_TEMPLATES.find((t) => t.filename === 'drafts');
		expect(drafts?.content).toMatch(
			/note\["dbench-scene-id"\] == this\["dbench-id"\]/
		);
	});

	it('filenames are unique', () => {
		const names = BASE_TEMPLATES.map((t) => t.filename);
		expect(new Set(names).size).toBe(names.length);
	});
});
