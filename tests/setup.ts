/**
 * Vitest setup file. Polyfills browser globals that Obsidian's renderer
 * provides but vitest's `node` test environment doesn't, so production
 * code can use them without test-only branches.
 *
 * Currently: `DOMParser` from `@xmldom/xmldom`. Used by the Scrivener
 * `.scrivx` parser; native browser DOMParser is the production path on
 * every Obsidian platform. The xmldom implementation is a pure-JS
 * standards-tracking shim — close enough that production-shaped
 * DOMParser usage in src/ runs unmodified in tests.
 */

import { DOMParser } from '@xmldom/xmldom';

(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser =
	DOMParser;
