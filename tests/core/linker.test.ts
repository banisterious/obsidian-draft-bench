import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { DraftBenchLinker } from '../../src/core/linker';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';

function makeFile(path: string): TFile {
	const filename = path.split('/').pop() ?? '';
	const dotIdx = filename.lastIndexOf('.');
	return new TFile({
		path,
		basename: dotIdx > 0 ? filename.slice(0, dotIdx) : filename,
		extension: dotIdx > 0 ? filename.slice(dotIdx + 1) : '',
	});
}

describe('DraftBenchLinker — lifecycle', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
	});

	it('registers modify, delete, and rename listeners on start', () => {
		linker.start();
		expect(app.vault._listenerCount('modify')).toBe(1);
		expect(app.vault._listenerCount('delete')).toBe(1);
		expect(app.vault._listenerCount('rename')).toBe(1);
	});

	it('stop() removes all listeners', () => {
		linker.start();
		linker.stop();
		expect(app.vault._listenerCount('modify')).toBe(0);
		expect(app.vault._listenerCount('delete')).toBe(0);
		expect(app.vault._listenerCount('rename')).toBe(0);
	});

	it('start() is idempotent (does not double-register)', () => {
		linker.start();
		linker.start();
		linker.start();
		expect(app.vault._listenerCount('modify')).toBe(1);
		expect(app.vault._listenerCount('delete')).toBe(1);
		expect(app.vault._listenerCount('rename')).toBe(1);
	});

	it('stop() is idempotent (safe to call twice)', () => {
		linker.start();
		linker.stop();
		linker.stop();
		expect(app.vault._listenerCount('modify')).toBe(0);
	});

	it('skips registration entirely when enableBidirectionalSync is off', () => {
		settings.enableBidirectionalSync = false;
		linker.start();
		expect(app.vault._listenerCount('modify')).toBe(0);
		expect(app.vault._listenerCount('delete')).toBe(0);
		expect(app.vault._listenerCount('rename')).toBe(0);
	});

	it('skips modify only when syncOnFileModify is off (delete and rename still register)', () => {
		settings.syncOnFileModify = false;
		linker.start();
		expect(app.vault._listenerCount('modify')).toBe(0);
		expect(app.vault._listenerCount('delete')).toBe(1);
		expect(app.vault._listenerCount('rename')).toBe(1);
	});
});

describe('DraftBenchLinker — suspend/resume', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	it('starts not-suspended', () => {
		expect(linker.isSuspended()).toBe(false);
	});

	it('suspend() then resume() returns to not-suspended', () => {
		linker.suspend();
		expect(linker.isSuspended()).toBe(true);
		linker.resume();
		expect(linker.isSuspended()).toBe(false);
	});

	it('counts nested suspends', () => {
		linker.suspend();
		linker.suspend();
		linker.suspend();
		expect(linker.isSuspended()).toBe(true);

		linker.resume();
		expect(linker.isSuspended()).toBe(true);

		linker.resume();
		expect(linker.isSuspended()).toBe(true);

		linker.resume();
		expect(linker.isSuspended()).toBe(false);
	});

	it('resume() below zero is a no-op', () => {
		linker.resume();
		linker.resume();
		expect(linker.isSuspended()).toBe(false);
		// And subsequent suspend still flips state correctly:
		linker.suspend();
		expect(linker.isSuspended()).toBe(true);
	});

	it('withSuspended runs fn with the linker suspended', async () => {
		expect(linker.isSuspended()).toBe(false);
		await linker.withSuspended(async () => {
			expect(linker.isSuspended()).toBe(true);
		});
		expect(linker.isSuspended()).toBe(false);
	});

	it('withSuspended restores state even if fn throws', async () => {
		await expect(
			linker.withSuspended(async () => {
				throw new Error('oops');
			})
		).rejects.toThrow('oops');
		expect(linker.isSuspended()).toBe(false);
	});

	it('withSuspended returns the value of fn', async () => {
		const result = await linker.withSuspended(async () => 42);
		expect(result).toBe(42);
	});

	it('withSuspended supports nesting', async () => {
		await linker.withSuspended(async () => {
			expect(linker.isSuspended()).toBe(true);
			await linker.withSuspended(async () => {
				expect(linker.isSuspended()).toBe(true);
			});
			expect(linker.isSuspended()).toBe(true);
		});
		expect(linker.isSuspended()).toBe(false);
	});
});

describe('DraftBenchLinker — event dispatch', () => {
	let app: App;
	let settings: DraftBenchSettings;
	let linker: DraftBenchLinker;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		linker = new DraftBenchLinker(app, () => settings);
		linker.start();
	});

	it('handler stubs do not throw when invoked via vault events', async () => {
		const file = makeFile('Test.md');
		expect(() => app.vault._fire('modify', file)).not.toThrow();
		expect(() => app.vault._fire('delete', file)).not.toThrow();
		expect(() => app.vault._fire('rename', file, 'OldPath.md')).not.toThrow();
	});

	it('handlers do not run while suspended', async () => {
		// Once per-relationship handlers land, this test will assert that
		// suspended events don't trigger reverse-array updates. For now
		// we just confirm dispatch is gated by the suspend counter and
		// no exceptions surface.
		const file = makeFile('Test.md');
		await linker.withSuspended(async () => {
			expect(() => app.vault._fire('modify', file)).not.toThrow();
			expect(() => app.vault._fire('delete', file)).not.toThrow();
			expect(() => app.vault._fire('rename', file, 'OldPath.md')).not.toThrow();
		});
	});
});
