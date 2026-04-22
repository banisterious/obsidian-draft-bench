import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	isTemplaterEnabled,
	renderTemplateThroughTemplater,
} from '../../src/core/templater';

/**
 * Construct a minimal Templater-plugin stub. `parsed` is the string
 * `read_and_parse_template` resolves to; pass a function to make it
 * throw instead.
 */
function stubTemplater(parsed: string | (() => never)): {
	templater: {
		create_running_config: (...args: unknown[]) => unknown;
		read_and_parse_template: (...args: unknown[]) => Promise<string>;
	};
	create_running_config: ReturnType<typeof vi.fn>;
	read_and_parse_template: ReturnType<typeof vi.fn>;
} {
	const create_running_config = vi.fn((template, target, runMode) => ({
		template,
		target,
		runMode,
	}));
	const read_and_parse_template = vi.fn(async () => {
		if (typeof parsed === 'function') parsed();
		return parsed as string;
	});
	return {
		templater: {
			create_running_config,
			read_and_parse_template,
		},
		create_running_config,
		read_and_parse_template,
	};
}

function makeFile(path: string): TFile {
	const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
	return new TFile({
		path,
		basename,
		extension: 'md',
	});
}

describe('isTemplaterEnabled', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns false when the plugin is not registered', () => {
		expect(isTemplaterEnabled(app)).toBe(false);
	});

	it('returns true when templater-obsidian is registered', () => {
		app.plugins._register('templater-obsidian', stubTemplater('ignored'));
		expect(isTemplaterEnabled(app)).toBe(true);
	});

	it('returns false for a different plugin id', () => {
		app.plugins._register('some-other-plugin', {});
		expect(isTemplaterEnabled(app)).toBe(false);
	});
});

describe('renderTemplateThroughTemplater', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it('returns null when Templater is not installed', async () => {
		const result = await renderTemplateThroughTemplater(
			app,
			makeFile('Templates/scene.md'),
			makeFile('Novel/One.md')
		);
		expect(result).toBeNull();
	});

	it('calls create_running_config + read_and_parse_template and returns the parsed string', async () => {
		const stub = stubTemplater('Parsed body with <%= evaluated %>');
		app.plugins._register('templater-obsidian', stub);

		const template = makeFile('Templates/scene.md');
		const target = makeFile('Novel/One.md');
		const result = await renderTemplateThroughTemplater(app, template, target);

		expect(result).toBe('Parsed body with <%= evaluated %>');
		expect(stub.create_running_config).toHaveBeenCalledWith(template, target, 0);
		expect(stub.read_and_parse_template).toHaveBeenCalledTimes(1);
	});

	it('returns null when Templater throws', async () => {
		app.plugins._register(
			'templater-obsidian',
			stubTemplater(() => {
				throw new Error('parse failure');
			})
		);
		const result = await renderTemplateThroughTemplater(
			app,
			makeFile('Templates/scene.md'),
			makeFile('Novel/One.md')
		);
		expect(result).toBeNull();
	});

	it('returns null when the plugin returns a non-string', async () => {
		const stub = {
			templater: {
				create_running_config: () => ({}),
				read_and_parse_template: async () => 42,
			},
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		app.plugins._register('templater-obsidian', stub as any);
		const result = await renderTemplateThroughTemplater(
			app,
			makeFile('Templates/scene.md'),
			makeFile('Novel/One.md')
		);
		expect(result).toBeNull();
	});
});
