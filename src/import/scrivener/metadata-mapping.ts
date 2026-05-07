import type { BinderItem, ScrivProject } from './scrivx-parser';

/**
 * Metadata mapping helpers for the wizard's Metadata step (step 8 of
 * [scrivener-import.md § Implementation](../../../docs/planning/scrivener-import.md);
 * design ratified in § 3).
 *
 * Three sub-mappings:
 *
 * 1. **Status mapping** — Scrivener status ID -> target DB status (an
 *    existing `settings.statusVocabulary` entry, a new status to add
 *    during the import write pass, or `<drop>`).
 * 2. **Label frontmatter key** — single string. Scrivener Label values
 *    are written to this frontmatter key on each scene at import time.
 *    Default `scrivener-label`.
 * 3. **Custom field key mapping** — Scrivener custom field ID -> target
 *    frontmatter key (or null for drop). Default key is
 *    `scrivener-<fieldId>`; writer can switch to `dbench-<fieldId>` or
 *    drop the field entirely (per § 3).
 *
 * All helpers are pure: no I/O, no DOM. The wizard step initializes
 * the mapping from auto-detect on first entry and stores the resolved
 * shape on `formData.metadataMapping`; subsequent edits mutate that
 * shape directly. Cache invalidates when `sourcePath` changes.
 */

/** Default frontmatter key for Scrivener Label values. */
export const DEFAULT_LABEL_KEY = 'scrivener-label';

/** Resolved mapping target for a single Scrivener status. */
export type StatusTarget =
	| { kind: 'existing'; dbStatus: string }
	| { kind: 'new'; statusName: string }
	| { kind: 'drop' };

/** Resolved frontmatter-key target for a single Scrivener custom
 *  metadata field. `null` means drop the field at import. */
export type CustomFieldTarget = string | null;

export interface MetadataMapping {
	/** Scrivener status ID -> target. Keyed by status ID strings as
	 *  they appear in `<StatusID>` (e.g., "2", "-1"). */
	statuses: Map<string, StatusTarget>;
	/** Frontmatter key written for `<Label>` values. */
	labelKey: string;
	/** Scrivener custom field ID -> target frontmatter key, or null
	 *  for drop. */
	customFields: Map<string, CustomFieldTarget>;
}

/**
 * Best-effort initial mapping for Scrivener statuses against the
 * writer's existing `dbench-status` vocabulary. Match strategy per
 * § 3:
 *
 * 1. Exact case-sensitive match -> use existing DB status
 * 2. Exact case-insensitive match -> use existing DB status (with
 *    DB's preferred casing)
 * 3. No match -> auto-add as new (`kind: 'new'`)
 *
 * Sentinel "No Status" / "No Label" entries (Scrivener uses ID -1)
 * default to drop rather than auto-adding "No Status" as a new DB
 * status — that would clutter the writer's vocab with a synonym for
 * the default. Matching is by Scrivener status title; ID -1 isn't
 * load-bearing.
 */
export function autoDetectStatusMapping(
	project: ScrivProject,
	dbStatusVocabulary: readonly string[]
): Map<string, StatusTarget> {
	const out = new Map<string, StatusTarget>();
	const exactMatch = new Map(
		dbStatusVocabulary.map((s) => [s, s] as const)
	);
	const ciMatch = new Map(
		dbStatusVocabulary.map((s) => [s.toLowerCase(), s] as const)
	);

	for (const [scrivId, scrivTitle] of project.statuses) {
		const trimmed = scrivTitle.trim();
		if (trimmed === '' || isNoStatusSentinel(trimmed)) {
			out.set(scrivId, { kind: 'drop' });
			continue;
		}
		const exact = exactMatch.get(trimmed);
		if (exact !== undefined) {
			out.set(scrivId, { kind: 'existing', dbStatus: exact });
			continue;
		}
		const ci = ciMatch.get(trimmed.toLowerCase());
		if (ci !== undefined) {
			out.set(scrivId, { kind: 'existing', dbStatus: ci });
			continue;
		}
		out.set(scrivId, { kind: 'new', statusName: trimmed });
	}

	return out;
}

/**
 * Default `customFieldId -> 'scrivener-<id>'` mapping for every
 * project custom-metadata field. Writer overrides per-field via the
 * wizard's dropdown.
 */
export function autoDetectCustomFieldMapping(
	project: ScrivProject
): Map<string, CustomFieldTarget> {
	const out = new Map<string, CustomFieldTarget>();
	for (const fieldId of project.customMetaDataFields.keys()) {
		out.set(fieldId, `scrivener-${fieldId}`);
	}
	return out;
}

/**
 * Walk the project binder and tally how many items reference each
 * Scrivener status ID. Items with no `statusId` (most items in a
 * fresh template) aren't counted; they default to
 * `settings.statusVocabulary[0]` at import.
 *
 * Used by the Metadata step's status table to show "(N documents)"
 * next to each row so the writer knows which mappings affect the
 * most material.
 */
export function countDocumentsByStatus(
	project: ScrivProject
): Map<string, number> {
	const counts = new Map<string, number>();
	walkAll(project.binder, (item) => {
		if (item.statusId === null) return;
		counts.set(item.statusId, (counts.get(item.statusId) ?? 0) + 1);
	});
	return counts;
}

/**
 * Initialize a complete `MetadataMapping` from the project + settings.
 * Called by the wizard's Metadata step on first entry; subsequent
 * mutations happen via the writer's dropdowns.
 */
export function initialMetadataMapping(
	project: ScrivProject,
	dbStatusVocabulary: readonly string[]
): MetadataMapping {
	return {
		statuses: autoDetectStatusMapping(project, dbStatusVocabulary),
		labelKey: DEFAULT_LABEL_KEY,
		customFields: autoDetectCustomFieldMapping(project),
	};
}

/** True when the title looks like Scrivener's "no status" sentinel
 *  (the default ID -1 entry). Case-insensitive; tolerates "No Status"
 *  / "No status" / "no status" variants and the parallel "No Label"
 *  sentinel for label vocabularies. */
function isNoStatusSentinel(title: string): boolean {
	const lower = title.toLowerCase();
	return lower === 'no status' || lower === 'no label';
}

function walkAll(
	items: BinderItem[],
	visit: (item: BinderItem) => void
): void {
	for (const item of items) {
		visit(item);
		walkAll(item.children, visit);
	}
}
