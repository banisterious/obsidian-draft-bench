import type { DataAdapter } from 'obsidian';
import type { BinderItem, ScrivProject } from './scrivx-parser';

/**
 * Project-level summarization helpers for the Scrivener import wizard's
 * Parse step. Two concerns split into pure / async:
 *
 * - `summarizeProject(project)` walks the parsed binder tree and
 *   produces category counts the wizard renders as a "what's here"
 *   summary. Pure; no I/O.
 * - `countSnapshots(adapter, bundleRoot)` walks the bundle's
 *   `Files/Data/<UUID>/Snapshots/` directories and counts snapshot
 *   files. Async; uses the vault adapter (cross-platform per the
 *   2026-05-06 expansion).
 */

/**
 * Category counts produced by `summarizeProject`. Categories are
 * non-overlapping in the Draft / Research / Trash tally (a binder
 * item belongs to exactly one of those buckets, determined by the
 * top-level binder root that contains it). Media counts (`images`,
 * `pdfs`) are cross-cutting tallies of binder-item types and so may
 * overlap with the bucket counts.
 */
export interface ProjectSummary {
	/** Count of all `Text` leaves under the DraftFolder root. The
	 *  importer's primary target — these become DB scenes. */
	draftDocuments: number;
	/** Count of `Folder` items under the DraftFolder root (any depth).
	 *  These map to DB chapters / parts depending on the Hierarchy
	 *  step's mapping. */
	draftFolders: number;
	/** Count of all binder items (folders + leaves, any type) under
	 *  the ResearchFolder root. Optional in import (per § 7) — toggle
	 *  in the Options step. */
	researchItems: number;
	/** Count of binder items under the TrashFolder root. Always
	 *  skipped at import per § 7; surfaced so writers know what won't
	 *  be carried over. */
	trashItems: number;
	/** Count of binder items under custom top-level folders (anything
	 *  that isn't DraftFolder / ResearchFolder / TrashFolder). The
	 *  Novel-with-Parts template ships several: Characters, Places,
	 *  Front Matter, Notes, Template Sheets. Optional in import per
	 *  § 7's "Other top-level folders" rule. */
	customRootItems: number;
	/** Cross-cutting: total binder items typed `Image` anywhere in
	 *  the project. Surfaced because they affect the Research/Images
	 *  output folder size estimate. */
	images: number;
	/** Cross-cutting: total binder items typed `PDF`. Same rationale. */
	pdfs: number;
	/** Total binder items, all types, all locations. Sanity check. */
	totalItems: number;
}

/**
 * Walk a parsed `ScrivProject` and produce a `ProjectSummary`. Pure;
 * synchronous. Categorizes every binder item into exactly one of
 * Draft / Research / Trash / Custom-root buckets via its top-level
 * ancestor's `Type`, and tallies media types as a cross-cutting pass.
 */
export function summarizeProject(project: ScrivProject): ProjectSummary {
	const summary: ProjectSummary = {
		draftDocuments: 0,
		draftFolders: 0,
		researchItems: 0,
		trashItems: 0,
		customRootItems: 0,
		images: 0,
		pdfs: 0,
		totalItems: 0,
	};

	for (const root of project.binder) {
		switch (root.type) {
			case 'DraftFolder':
				walkDraftSubtree(root, summary);
				break;
			case 'ResearchFolder':
				summary.researchItems += countSubtree(root);
				break;
			case 'TrashFolder':
				summary.trashItems += countSubtree(root);
				break;
			default:
				// Custom top-level folder (Characters / Places / etc.).
				// The root itself counts plus its descendants.
				summary.customRootItems += 1 + countSubtree(root);
				break;
		}
	}

	// Cross-cutting media tally + grand total.
	walkAll(project.binder, (item) => {
		summary.totalItems += 1;
		if (item.type === 'Image') summary.images += 1;
		else if (item.type === 'PDF') summary.pdfs += 1;
	});

	return summary;
}

/** Walk a DraftFolder subtree, accumulating folder/document counts.
 *  The DraftFolder root itself is a folder but the wizard summary
 *  treats it as a container, not a counted folder; its descendants
 *  are the manuscript material. */
function walkDraftSubtree(root: BinderItem, summary: ProjectSummary): void {
	for (const child of root.children) {
		walkDraftRecursive(child, summary);
	}
}

function walkDraftRecursive(
	item: BinderItem,
	summary: ProjectSummary
): void {
	if (item.type === 'Text') summary.draftDocuments += 1;
	else if (item.type === 'Folder') summary.draftFolders += 1;
	// Other types in Draft (Image / PDF inserted as inspirations,
	// rare) get counted via the cross-cutting media pass; not folded
	// into the chapter/scene tallies.
	for (const child of item.children) {
		walkDraftRecursive(child, summary);
	}
}

function countSubtree(item: BinderItem): number {
	let n = 0;
	for (const child of item.children) {
		n += 1 + countSubtree(child);
	}
	return n;
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

/**
 * Count snapshot files inside a Scrivener bundle. Snapshots live at
 * `<bundleRoot>/Files/Data/<UUID>/Snapshots/<name>.rtf`; this walks
 * each per-document data folder and tallies all snapshot files.
 *
 * Best-effort: returns 0 when the bundle has no `Files/Data` folder
 * (synthetic test fixtures, malformed bundles), and silently ignores
 * UUID folders without a `Snapshots/` subdirectory (most documents
 * have none).
 */
export async function countSnapshots(
	adapter: DataAdapter,
	bundleRoot: string
): Promise<number> {
	const dataPath = `${bundleRoot}/Files/Data`;
	if (!(await adapter.exists(dataPath))) return 0;

	let total = 0;
	const dataListing = await adapter.list(dataPath);
	for (const docFolder of dataListing.folders) {
		const snapshotsPath = `${docFolder}/Snapshots`;
		if (!(await adapter.exists(snapshotsPath))) continue;
		const snapListing = await adapter.list(snapshotsPath);
		for (const file of snapListing.files) {
			if (file.endsWith('.rtf')) total += 1;
		}
	}
	return total;
}
