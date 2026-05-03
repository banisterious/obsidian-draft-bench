import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { sortReverseArraysByOrder } from '../../src/core/reverse-array-order';

/**
 * Focused unit tests for `sortReverseArraysByOrder`. The utility was
 * previously exercised only indirectly via integrity and linker tests;
 * the changes for #22 (length asymmetry guard, `knownOrders` overrides)
 * warrant direct coverage.
 */

describe('sortReverseArraysByOrder', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	function seedChild(path: string, id: string, order: number): void {
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		void app.vault.create(path, '').then((file) => {
			app.metadataCache._setFrontmatter(file, {
				'dbench-type': 'sub-scene',
				'dbench-id': id,
				'dbench-order': order,
			});
		});
	}

	async function seedChildSync(
		path: string,
		id: string,
		order: number
	): Promise<void> {
		const file = await app.vault.create(path, '');
		app.metadataCache._setFrontmatter(file, {
			'dbench-type': 'sub-scene',
			'dbench-id': id,
			'dbench-order': order,
		});
		void seedChild;
	}

	it('sorts by each child\'s dbench-order (cache-resolved)', async () => {
		await seedChildSync('A.md', 'a', 3);
		await seedChildSync('B.md', 'b', 1);
		await seedChildSync('C.md', 'c', 2);

		const result = sortReverseArraysByOrder(
			app,
			['[[A]]', '[[B]]', '[[C]]'],
			['a', 'b', 'c']
		);
		expect(result.changed).toBe(true);
		expect(result.wikilinks).toEqual(['[[B]]', '[[C]]', '[[A]]']);
		expect(result.ids).toEqual(['b', 'c', 'a']);
	});

	it('returns inputs unchanged when arrays are length-asymmetric (#22 guard)', () => {
		const result = sortReverseArraysByOrder(
			app,
			['[[A]]', '[[B]]', '[[C]]'],
			['a', 'b']
		);
		expect(result.changed).toBe(false);
		expect(result.wikilinks).toBe(result.wikilinks);
		// Specifically: no truncation. Pre-#22 behavior used Math.min and
		// silently dropped C from the wikilinks output.
		expect(result.wikilinks).toEqual(['[[A]]', '[[B]]', '[[C]]']);
		expect(result.ids).toEqual(['a', 'b']);
	});

	it("uses caller-provided knownOrders for the just-added child (#22)", async () => {
		// Simulates the cache-timing window in real Obsidian where the
		// just-modified file's frontmatter hasn't yet propagated to
		// `findNoteById`'s view of the cache. The linker passes the
		// child's order directly so the sort doesn't fall back to
		// `+Infinity` and shuffle the entry to the end.
		await seedChildSync('A.md', 'a', 1);
		await seedChildSync('B.md', 'b', 2);
		// 'c' is not in the metadataCache (lag scenario). Without
		// knownOrders it would resolve to +Infinity and sort to end.
		const knownOrders = new Map<string, number>([['c', 3]]);

		const result = sortReverseArraysByOrder(
			app,
			['[[B]]', '[[C]]', '[[A]]'],
			['b', 'c', 'a'],
			knownOrders
		);
		expect(result.changed).toBe(true);
		expect(result.wikilinks).toEqual(['[[A]]', '[[B]]', '[[C]]']);
		expect(result.ids).toEqual(['a', 'b', 'c']);
	});

	it('falls back to +Infinity for unknown ids without a knownOrders override', () => {
		// 'mystery' isn't in the cache and isn't in knownOrders. The
		// sort should treat it as +Infinity (sorts to end) without
		// throwing.
		const result = sortReverseArraysByOrder(
			app,
			['[[Mystery]]', '[[A]]'],
			['mystery', 'a']
		);
		// 'a' isn't in cache either, so both are +Infinity → stable
		// sort preserves order.
		expect(result.changed).toBe(false);
		expect(result.wikilinks).toEqual(['[[Mystery]]', '[[A]]']);
		expect(result.ids).toEqual(['mystery', 'a']);
	});

	it('returns inputs unchanged when already sorted (idempotent)', async () => {
		await seedChildSync('A.md', 'a', 1);
		await seedChildSync('B.md', 'b', 2);
		await seedChildSync('C.md', 'c', 3);

		const wikilinks = ['[[A]]', '[[B]]', '[[C]]'];
		const ids = ['a', 'b', 'c'];
		const result = sortReverseArraysByOrder(app, wikilinks, ids);
		expect(result.changed).toBe(false);
		// Same reference returned (caller can use as a change-detection
		// short-circuit).
		expect(result.wikilinks).toBe(wikilinks);
		expect(result.ids).toBe(ids);
	});
});
