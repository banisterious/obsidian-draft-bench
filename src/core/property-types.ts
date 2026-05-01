import type { App } from 'obsidian';

/**
 * Register Draft Bench's relationship properties with Obsidian's
 * metadata type manager so the Properties panel and YAML serializer
 * treat them consistently.
 *
 * Without registration, Obsidian's Properties panel auto-detects
 * wikilink-shaped values (`[[Some Scene]]`) on unregistered Text
 * properties and writes them as block-style nested-array YAML on
 * round-trips through `processFrontMatter` (issues #4 / #6 / #7). With
 * registration, the field is pinned to its declared type and the
 * round-trip stays in clean string form.
 *
 * Closes #8.
 *
 * Type assignments:
 *
 * - **Single-target wikilink fields** (`dbench-project`, `dbench-chapter`,
 *   `dbench-scene`) -> `text`. Wikilink syntax inside is auto-detected
 *   and rendered with a link badge in the Properties UI; the underlying
 *   storage stays a string.
 * - **Multi-target wikilink arrays** (`dbench-chapters`, `dbench-scenes`,
 *   `dbench-drafts`, `dbench-compile-presets`) -> `multitext`. List-of-
 *   strings, each rendered with link affordances.
 * - **ID companions** (`dbench-*-id`) -> `text`. Plain identifier
 *   strings; explicit registration prevents auto-detection from
 *   misclassifying them.
 * - **ID array companions** (`dbench-*-ids`) -> `multitext`. List of
 *   identifier strings.
 *
 * The 0.1.3 wikilink canonicalization in the linker stays as
 * defense-in-depth; this registration prevents the reshape at the
 * source, but the canonicalizer cleans up any data that pre-dates the
 * registration.
 */
export function registerPropertyTypes(app: App): void {
	const tm = app.metadataTypeManager;
	if (!tm || typeof tm.setType !== 'function') {
		// API surface isn't exposed (older Obsidian, future rename,
		// degraded environment). Skip silently — the linker
		// canonicalization handles the YAML reshape regardless.
		return;
	}

	try {
		// Single-target wikilink fields.
		tm.setType('dbench-project', 'text');
		tm.setType('dbench-chapter', 'text');
		tm.setType('dbench-scene', 'text');

		// Multi-target wikilink array fields (linker reverse arrays).
		tm.setType('dbench-chapters', 'multitext');
		tm.setType('dbench-scenes', 'multitext');
		tm.setType('dbench-drafts', 'multitext');
		tm.setType('dbench-compile-presets', 'multitext');

		// ID companions (single-target).
		tm.setType('dbench-project-id', 'text');
		tm.setType('dbench-chapter-id', 'text');
		tm.setType('dbench-scene-id', 'text');

		// ID array companions (reverse arrays).
		tm.setType('dbench-chapter-ids', 'multitext');
		tm.setType('dbench-scene-ids', 'multitext');
		tm.setType('dbench-draft-ids', 'multitext');
		tm.setType('dbench-compile-preset-ids', 'multitext');
	} catch (err) {
		// Defensive: the API isn't part of Obsidian's public typings,
		// so a future internal rename or removal could throw. Degrade
		// gracefully — the linker canonicalization handles the
		// affected fields regardless.
		console.warn(
			'[DraftBench] Failed to register property types via metadataTypeManager. ' +
				'YAML round-trip will fall back to the linker canonicalization workaround. ' +
				'Error:',
			err
		);
	}
}

// Module augmentation: `app.metadataTypeManager` and
// `MetadataTypeManager.setType` exist at runtime but aren't in the
// public Obsidian typings. Drop this when the typings catch up.
declare module 'obsidian' {
	interface App {
		metadataTypeManager: MetadataTypeManager;
	}

	interface MetadataTypeManager {
		setType(name: string, type: string): void;
	}
}
