import { describe, expect, it } from 'vitest';
import { isCompilePresetFrontmatter } from '../../src/model/compile-preset';

describe('isCompilePresetFrontmatter', () => {
	it('accepts a fully-stamped compile-preset frontmatter', () => {
		const fm = {
			'dbench-type': 'compile-preset',
			'dbench-id': 'abc-123-def-456',
			'dbench-project': '[[My Novel]]',
			'dbench-project-id': 'lmw-194-bxh-806',
			'dbench-schema-version': 1,
			'dbench-compile-format': 'md',
			'dbench-compile-output': 'vault',
			'dbench-compile-scene-source': 'auto',
			'dbench-compile-scene-statuses': [],
			'dbench-compile-scene-excludes': [],
			'dbench-compile-include-section-breaks': true,
			'dbench-compile-heading-scope': 'draft',
		};
		expect(isCompilePresetFrontmatter(fm)).toBe(true);
	});

	it('accepts a minimal preset with only type and id', () => {
		const fm = {
			'dbench-type': 'compile-preset',
			'dbench-id': 'abc-123-def-456',
		};
		expect(isCompilePresetFrontmatter(fm)).toBe(true);
	});

	it('rejects a frontmatter missing dbench-type', () => {
		const fm = { 'dbench-id': 'abc-123-def-456' };
		expect(isCompilePresetFrontmatter(fm)).toBe(false);
	});

	it('rejects a frontmatter with a different dbench-type', () => {
		const fm = {
			'dbench-type': 'scene',
			'dbench-id': 'abc-123-def-456',
		};
		expect(isCompilePresetFrontmatter(fm)).toBe(false);
	});

	it('rejects a frontmatter missing dbench-id', () => {
		const fm = { 'dbench-type': 'compile-preset' };
		expect(isCompilePresetFrontmatter(fm)).toBe(false);
	});

	it('rejects a frontmatter where dbench-id is non-string', () => {
		const fm = {
			'dbench-type': 'compile-preset',
			'dbench-id': 12345,
		};
		expect(isCompilePresetFrontmatter(fm)).toBe(false);
	});

	it('rejects null and non-object values', () => {
		expect(isCompilePresetFrontmatter(null)).toBe(false);
		expect(isCompilePresetFrontmatter(undefined)).toBe(false);
		expect(isCompilePresetFrontmatter('compile-preset')).toBe(false);
		expect(isCompilePresetFrontmatter(42)).toBe(false);
	});
});
