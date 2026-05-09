/**
 * Scrivener snapshot filename resolver.
 *
 * Pure-sync logic for the wizard's Options-step filename template,
 * locked in [scrivener-import.md § 4](../../../docs/planning/scrivener-import.md)
 * (snapshot import + 2026-05-06 amendment for templates).
 *
 * Two stages, separated for testability:
 *
 * - `applySnapshotFilenameTemplate(template, scene, snapshot, n)` does
 *   variable substitution + filesystem-safe sanitization. Returns the
 *   resolved name without extension or collision suffix.
 * - `disambiguateFilename(base, alreadyUsed)` appends ` 2`, ` 3`, ...
 *   to a name when an earlier snapshot already used it. Last-resort
 *   safety net: well-formed templates that include `{n}` or
 *   `{date_compact}` won't trigger it.
 *
 * Callers are responsible for adding the `.md` extension after these
 * functions complete.
 *
 * **Variables (per spec § 4):**
 *
 * | Variable | Resolves to |
 * |---|---|
 * | `{scene}` | Parent scene's basename |
 * | `{title}` | Scrivener snapshot title; `Untitled` when empty OR when literally `Untitled Snapshot` (Scrivener Windows's auto-name default per spec amendment 2026-05-08) |
 * | `{date}` | Snapshot creation date `YYYY-MM-DD` |
 * | `{date_compact}` | Snapshot creation date `YYYYMMDD` |
 * | `{time}` | Snapshot creation time `HHMM`, 24-hour |
 * | `{n}` | 1-based per-scene counter in chronological order |
 *
 * **Sanitization:** filesystem-unsafe characters (`/ \ : * ? " < > |`)
 * in the resolved name are replaced with `-`. Applies to both literal
 * template content and resolved variable values, so a Scrivener title
 * containing `/` and a writer-typed template that introduces a path
 * separator both get flattened.
 */

/** Default filename template — matches `resolveDraftFilename` for
 *  natively-created drafts so imported snapshots sit indistinguishably
 *  alongside drafts the writer creates after import. */
export const DEFAULT_SNAPSHOT_FILENAME_TEMPLATE =
	'{scene} - Draft {n} ({date_compact})';

/** Scrivener Windows's auto-name default when the writer takes a
 *  snapshot without typing a title. Treated as the empty-title
 *  sentinel for `{title}` substitution per spec § 4 amendment. */
const SCRIVENER_DEFAULT_UNTITLED = 'Untitled Snapshot';

/** What `{title}` resolves to when the snapshot title is empty or
 *  matches `SCRIVENER_DEFAULT_UNTITLED`. */
const TITLE_FALLBACK = 'Untitled';

/** Filesystem-unsafe characters per spec § 4 (Windows + cross-platform
 *  safe set). Each is replaced with `-` in the resolved filename. */
const UNSAFE_FS_CHARS = /[\/\\:*?"<>|]/g;

/** Inputs the filename resolver needs from the parent scene. */
export interface SnapshotFilenameSceneContext {
	basename: string;
}

/** Inputs the filename resolver needs from the snapshot itself. */
export interface SnapshotFilenameSnapshotContext {
	title: string;
	/** Verbatim Scrivener `<Date>` value: `YYYY-MM-DD HH:MM:SS [+-]HHMM`. */
	date: string;
}

/**
 * Apply the writer's filename template to one snapshot. Pure: no
 * collision detection, no extension. Returns the resolved name
 * after variable substitution + filesystem-safe sanitization.
 */
export function applySnapshotFilenameTemplate(
	template: string,
	scene: SnapshotFilenameSceneContext,
	snapshot: SnapshotFilenameSnapshotContext,
	n: number
): string {
	const datePieces = parseScrivenerDate(snapshot.date);
	const vars: Record<string, string> = {
		scene: scene.basename,
		title: resolveTitleVar(snapshot.title),
		date: datePieces.dateOnly,
		date_compact: datePieces.dateCompact,
		time: datePieces.timeOnly,
		n: String(n),
	};

	const substituted = template.replace(
		/\{([a-z_]+)\}/g,
		(match, name: string) =>
			Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match
	);

	return sanitizeFilename(substituted);
}

/**
 * Disambiguate a resolved filename against already-used names by
 * appending ` 2`, ` 3`, ... per spec § 4. The first occurrence keeps
 * its base name; the second collision becomes `${base} 2`, the third
 * `${base} 3`, etc. Skips numbers that are themselves already taken.
 *
 * Pure: doesn't mutate `alreadyUsed`. Callers add the returned name
 * to their seen-set before resolving the next snapshot.
 */
export function disambiguateFilename(
	base: string,
	alreadyUsed: ReadonlySet<string>
): string {
	if (!alreadyUsed.has(base)) return base;
	let i = 2;
	while (alreadyUsed.has(`${base} ${i}`)) i++;
	return `${base} ${i}`;
}

/** Resolve `{title}` per spec § 4 + amendment: empty string AND the
 *  literal "Untitled Snapshot" both fall back to "Untitled". */
function resolveTitleVar(title: string): string {
	if (title === '' || title === SCRIVENER_DEFAULT_UNTITLED) {
		return TITLE_FALLBACK;
	}
	return title;
}

/** Replace filesystem-unsafe characters with `-`. */
function sanitizeFilename(name: string): string {
	return name.replace(UNSAFE_FS_CHARS, '-');
}

/** Parsed components of a Scrivener `<Date>` value. */
interface ScrivenerDatePieces {
	dateOnly: string;
	dateCompact: string;
	timeOnly: string;
}

/**
 * Parse a Scrivener `<Date>` value (`YYYY-MM-DD HH:MM:SS [+-]HHMM`)
 * into the three formats the filename template variables need.
 *
 * Defensive on malformed input: returns the raw string for `dateOnly`
 * + `dateCompact` and a `0000` placeholder for `timeOnly` rather than
 * throwing. Real Scrivener output always matches the expected format;
 * this fallback only fires on corrupted bundles.
 */
function parseScrivenerDate(date: string): ScrivenerDatePieces {
	const match = date.match(
		/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/
	);
	if (match === null) {
		return { dateOnly: date, dateCompact: date, timeOnly: '0000' };
	}
	const [, yyyy, mm, dd, hh, min] = match;
	return {
		dateOnly: `${yyyy}-${mm}-${dd}`,
		dateCompact: `${yyyy}${mm}${dd}`,
		timeOnly: `${hh}${min}`,
	};
}
