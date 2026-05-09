import type { DataAdapter } from 'obsidian';

/**
 * Scrivener snapshot loader.
 *
 * Walks the bundle's `Snapshots/<UUID>.snapshots/` directories and
 * surfaces per-document snapshot metadata: title, creation date, and
 * the bundle-internal path to the snapshot's RTF body.
 *
 * Companion to the cheap `countSnapshots` in [scriv-summary.ts](./scriv-summary.ts):
 * countSnapshots is for the Parse-step summary card (just a number);
 * `loadSnapshots` is for the actual snapshot import in the Plan and
 * Write passes (per [scrivener-import.md § 4](../../../docs/planning/scrivener-import.md)).
 *
 * **On-disk format (Scrivener 3 Windows):**
 *
 * ```
 * <bundleRoot>/Snapshots/<UUID>.snapshots/
 *   index.xml                              # snapshot metadata
 *   YYYY-MM-DD-HH-MM-SS-TZHM.rtf           # one RTF body per snapshot
 *   snapshot.indexes                       # binary; ignored
 * ```
 *
 * `<UUID>` matches a binder document's UUID. `index.xml` schema:
 *
 * ```xml
 * <Snapshots Version="1.0">
 *     <Snapshot>
 *         <Title>Workshop draft</Title>
 *         <Date>2026-05-08 16:04:16 -0700</Date>
 *     </Snapshot>
 *     ...
 * </Snapshots>
 * ```
 *
 * The RTF filename mirrors the `<Date>` value with non-digit characters
 * collapsed to dashes (so `2026-05-08 16:04:16 -0700` -> `2026-05-08-16-04-16-0700.rtf`).
 *
 * Best-effort: malformed `index.xml`, missing RTF bodies, and absent
 * `Snapshots/` folders all surface as warnings rather than throwing —
 * a single corrupted snapshot directory shouldn't break the whole import.
 */

/** Per-snapshot metadata extracted from `<UUID>.snapshots/index.xml`. */
export interface SnapshotMetadata {
	/** Verbatim from `<Title>`. Scrivener writes "Untitled Snapshot"
	 *  literally when the writer takes a snapshot without typing a
	 *  title; consumers should treat that string as the empty-title
	 *  sentinel for filename-template substitution (per spec § 4
	 *  amendment). Empty `<Title>` (rare) is also possible. */
	title: string;
	/** Verbatim from `<Date>`. Scrivener emits the format
	 *  `YYYY-MM-DD HH:MM:SS [+-]HHMM` (e.g., `2026-05-08 16:04:16 -0700`).
	 *  Consumers convert to ISO `YYYY-MM-DD` for `dbench-created-at` at
	 *  write time. */
	date: string;
	/** Bundle-internal path to the snapshot's RTF body. Resolved against
	 *  the date via `dateToFilenameFragment` and verified to exist on
	 *  disk before being recorded. Consumers read via
	 *  `app.vault.adapter.read(rtfPath)` to access the body. */
	rtfPath: string;
}

/** Result of `loadSnapshots`: per-UUID metadata plus best-effort warnings. */
export interface LoadSnapshotsResult {
	/** Map of binder UUID -> snapshot metadata list, in the order
	 *  `index.xml` lists them (Scrivener writes chronologically). UUIDs
	 *  without a `.snapshots/` directory don't appear in the map. */
	snapshotsByUuid: Map<string, SnapshotMetadata[]>;
	/** Non-fatal observations: malformed index.xml entries, missing RTF
	 *  bodies, etc. Surfaced to the writer in the import error log. */
	warnings: string[];
}

/**
 * Walk a Scrivener bundle's `Snapshots/` tree and load per-document
 * snapshot metadata. Returns an empty map (and no warnings) when the
 * bundle has no `Snapshots/` folder at all — the common case for
 * projects that have never taken a snapshot.
 */
export async function loadSnapshots(
	adapter: DataAdapter,
	bundleRoot: string
): Promise<LoadSnapshotsResult> {
	const snapshotsByUuid = new Map<string, SnapshotMetadata[]>();
	const warnings: string[] = [];

	const snapshotsRoot = `${bundleRoot}/Snapshots`;
	if (!(await adapter.exists(snapshotsRoot))) {
		return { snapshotsByUuid, warnings };
	}

	const rootListing = await adapter.list(snapshotsRoot);
	for (const docSnapshotsFolder of rootListing.folders) {
		const uuid = extractUuidFromSnapshotsFolder(docSnapshotsFolder);
		if (uuid === null) {
			warnings.push(
				`Skipped snapshots folder with unexpected name: ${docSnapshotsFolder} (expected "<UUID>.snapshots")`
			);
			continue;
		}

		const indexPath = `${docSnapshotsFolder}/index.xml`;
		if (!(await adapter.exists(indexPath))) {
			warnings.push(
				`Skipped ${docSnapshotsFolder}: missing index.xml`
			);
			continue;
		}

		let indexXml: string;
		try {
			indexXml = await adapter.read(indexPath);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			warnings.push(`Could not read ${indexPath}: ${msg}`);
			continue;
		}

		const entries = parseSnapshotsIndex(indexXml);
		if (entries === null) {
			warnings.push(`Could not parse ${indexPath}: malformed XML`);
			continue;
		}

		const metadata: SnapshotMetadata[] = [];
		for (const entry of entries) {
			const rtfFilename = `${dateToFilenameFragment(entry.date)}.rtf`;
			const rtfPath = `${docSnapshotsFolder}/${rtfFilename}`;
			if (!(await adapter.exists(rtfPath))) {
				warnings.push(
					`Snapshot RTF missing: ${rtfPath} (referenced in ${indexPath})`
				);
				continue;
			}
			metadata.push({
				title: entry.title,
				date: entry.date,
				rtfPath,
			});
		}

		if (metadata.length > 0) {
			snapshotsByUuid.set(uuid, metadata);
		}
	}

	return { snapshotsByUuid, warnings };
}

/**
 * Convert a Scrivener `<Date>` value to the filename fragment Scrivener
 * uses for the corresponding `.rtf` file in the same `.snapshots/`
 * directory.
 *
 * Scrivener date format: `YYYY-MM-DD HH:MM:SS [+-]HHMM`
 * Scrivener filename format: `YYYY-MM-DD-HH-MM-SS-HHMM` (sign dropped)
 *
 * Rule: replace every non-digit character with `-`, then collapse
 * consecutive dashes to one. Handles both `+` and `-` TZ signs the same
 * way. The TZ sign info is lost; this matches what Scrivener does when
 * naming the file (the sign is always rendered as a dash).
 */
export function dateToFilenameFragment(date: string): string {
	return date.replace(/[^0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Extract the UUID from a `Snapshots/<UUID>.snapshots` folder path.
 *  Returns null when the folder name doesn't match the expected pattern. */
function extractUuidFromSnapshotsFolder(folderPath: string): string | null {
	const slash = folderPath.lastIndexOf('/');
	const base = slash < 0 ? folderPath : folderPath.slice(slash + 1);
	const suffix = '.snapshots';
	if (!base.endsWith(suffix)) return null;
	const uuid = base.slice(0, -suffix.length);
	return uuid === '' ? null : uuid;
}

interface RawSnapshotEntry {
	title: string;
	date: string;
}

/**
 * Parse a `<UUID>.snapshots/index.xml` file. Returns the list of
 * snapshot entries, in document order, or `null` on malformed XML.
 *
 * Tolerant of missing `<Title>` / `<Date>` children: those default to
 * empty strings (the caller may filter or surface as warnings).
 */
function parseSnapshotsIndex(xml: string): RawSnapshotEntry[] | null {
	let doc: Document;
	try {
		const parser = new DOMParser();
		doc = parser.parseFromString(xml, 'application/xml');
	} catch {
		return null;
	}

	// `application/xml` returns a document with a `<parsererror>` root
	// on malformed input rather than throwing. Detect that here.
	const errorEl = doc.getElementsByTagName('parsererror')[0];
	if (errorEl !== undefined) return null;

	const root = doc.getElementsByTagName('Snapshots')[0];
	if (root === undefined) return null;

	const entries: RawSnapshotEntry[] = [];
	const snapshotEls = root.getElementsByTagName('Snapshot');
	for (let i = 0; i < snapshotEls.length; i++) {
		const el = snapshotEls[i];
		const title = el.getElementsByTagName('Title')[0]?.textContent ?? '';
		const date = el.getElementsByTagName('Date')[0]?.textContent ?? '';
		entries.push({ title, date });
	}

	return entries;
}
