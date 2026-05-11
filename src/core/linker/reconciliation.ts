import { type App, type TFile } from 'obsidian';
import {
	findChapters,
	findProjects,
	findScenes,
	findSubScenes,
} from '../discovery';
import { sortReverseArraysByOrder } from '../reverse-array-order';
import { readArray, readString } from './readers';
import { backfillCompanionId } from './wikilink-backfill';

/**
 * Describes one forward-reference / reverse-array pair the linker
 * reconciles. A single child type (e.g., `draft`) can have multiple
 * configs — one for each distinct parent type it may point to.
 */
export interface RelationshipConfig {
	/** Field on the child holding the parent's stable id, e.g., `dbench-project-id`. */
	childParentIdField: string;
	/**
	 * Field on the child holding the parent's wikilink, e.g., `dbench-project`.
	 * Used by the wikilink-only retrofit backfill: when the writer manually
	 * sets the wikilink in the Properties panel without copying the parent's
	 * id into the companion, the linker resolves the wikilink against the
	 * candidate-parent pool and writes the companion field. See issue #4.
	 */
	childParentWikilinkField: string;
	/** Reverse-array field on the parent holding wikilinks, e.g., `dbench-scenes`. */
	parentWikilinkField: string;
	/** Reverse-array field on the parent holding stable ids, e.g., `dbench-scene-ids`. */
	parentIdField: string;
	/**
	 * Enumerate candidate parents. Filtering (e.g., project-shape ==
	 * 'single' for the draft->project case) happens here so the
	 * reconciler stays generic.
	 */
	candidateParents: (
		app: App
	) => Array<{ file: TFile; frontmatter: Record<string, unknown> }>;
	/**
	 * Optional gate. When provided and returns false, the reconciler
	 * runs in cleanup-only mode for this config: stale references are
	 * still pruned from candidate parents, but the child is never added
	 * to any reverse array. Used to suppress the scene→project
	 * relationship for scenes-in-chapters (which carry both
	 * `dbench-project-id` and `dbench-chapter-id` but belong only in the
	 * chapter's reverse arrays per § 3 + § 9 of chapter-type.md).
	 */
	appliesToChild?: (childFm: Record<string, unknown>) => boolean;
}

/**
 * Per-type reconciliation rules. Keyed by `dbench-type` of the child.
 *
 * - `chapter`: one parent, the enclosing project. Reverse arrays
 *   `dbench-chapters` / `dbench-chapter-ids` on the project. Per § 9 of
 *   chapter-type.md, project shape is not filtered here — integrity
 *   surfaces mixed-children violations (a project carrying both
 *   chapters and direct scenes) rather than the linker silently
 *   dropping them.
 * - `scene`: two possible parents. Chapter-less scenes attach to the
 *   project (existing behavior); scenes-in-chapters attach to their
 *   chapter (per § 3, scenes-in-chapters carry both project + chapter
 *   refs). The scene→project config has an `appliesToChild` gate that
 *   suppresses the add when `dbench-chapter-id` is present, so the
 *   project's `dbench-scenes` reverse array stays a list of *direct*
 *   children only (per § 9 + the doc on `ProjectFrontmatter.dbench-scenes`).
 * - `sub-scene`: one parent, the enclosing scene. Reverse arrays
 *   `dbench-sub-scenes` / `dbench-sub-scene-ids` on the scene (optional
 *   fields per `SceneFrontmatter`; the linker creates them on first
 *   use). Sub-scenes also carry `dbench-project-id` for query
 *   convenience but the project doesn't track sub-scenes directly (per
 *   [sub-scene-type.md § 3](../../../docs/planning/sub-scene-type.md));
 *   parallel to how scenes-in-chapters don't appear in their project's
 *   reverse arrays.
 * - `draft`: four possible parents depending on the declared fields.
 *   Scene-parented drafts live in folder projects; project-parented
 *   drafts live in single-scene projects; chapter-parented drafts live
 *   in chapter-aware projects (§ 4); sub-scene-parented drafts live
 *   inside hierarchical scenes (per [sub-scene-type.md § 4](../../../docs/planning/sub-scene-type.md)).
 *   All four configs run on every draft modify; the one whose declared
 *   parent id doesn't resolve is a no-op on adds but still cleans up
 *   any stale references — which lets the linker recover when a writer
 *   converts a draft between target shapes.
 * - `compile-preset`: one parent, the enclosing project (either shape).
 *   Reverse arrays `dbench-compile-presets` / `dbench-compile-preset-ids`
 *   live on the project note.
 */
export const RELATIONSHIPS: Record<string, RelationshipConfig[]> = {
	chapter: [
		{
			childParentIdField: 'dbench-project-id',
			childParentWikilinkField: 'dbench-project',
			parentWikilinkField: 'dbench-chapters',
			parentIdField: 'dbench-chapter-ids',
			candidateParents: (app) =>
				findProjects(app).map((p) => ({
					file: p.file,
					frontmatter: p.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	scene: [
		{
			childParentIdField: 'dbench-project-id',
			childParentWikilinkField: 'dbench-project',
			parentWikilinkField: 'dbench-scenes',
			parentIdField: 'dbench-scene-ids',
			candidateParents: (app) =>
				findProjects(app).map((p) => ({
					file: p.file,
					frontmatter: p.frontmatter as unknown as Record<string, unknown>,
				})),
			appliesToChild: (fm) => readString(fm['dbench-chapter-id']) === '',
		},
		{
			childParentIdField: 'dbench-chapter-id',
			childParentWikilinkField: 'dbench-chapter',
			parentWikilinkField: 'dbench-scenes',
			parentIdField: 'dbench-scene-ids',
			candidateParents: (app) =>
				findChapters(app).map((c) => ({
					file: c.file,
					frontmatter: c.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	'sub-scene': [
		{
			childParentIdField: 'dbench-scene-id',
			childParentWikilinkField: 'dbench-scene',
			parentWikilinkField: 'dbench-sub-scenes',
			parentIdField: 'dbench-sub-scene-ids',
			candidateParents: (app) =>
				findScenes(app).map((s) => ({
					file: s.file,
					frontmatter: s.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	draft: [
		{
			childParentIdField: 'dbench-scene-id',
			childParentWikilinkField: 'dbench-scene',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findScenes(app).map((s) => ({
					file: s.file,
					frontmatter: s.frontmatter as unknown as Record<string, unknown>,
				})),
		},
		{
			childParentIdField: 'dbench-chapter-id',
			childParentWikilinkField: 'dbench-chapter',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findChapters(app).map((c) => ({
					file: c.file,
					frontmatter: c.frontmatter as unknown as Record<string, unknown>,
				})),
		},
		{
			childParentIdField: 'dbench-project-id',
			childParentWikilinkField: 'dbench-project',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findProjects(app)
					.filter(
						(p) => p.frontmatter['dbench-project-shape'] === 'single'
					)
					.map((p) => ({
						file: p.file,
						frontmatter: p.frontmatter as unknown as Record<
							string,
							unknown
						>,
					})),
		},
		{
			childParentIdField: 'dbench-sub-scene-id',
			childParentWikilinkField: 'dbench-sub-scene',
			parentWikilinkField: 'dbench-drafts',
			parentIdField: 'dbench-draft-ids',
			candidateParents: (app) =>
				findSubScenes(app).map((s) => ({
					file: s.file,
					frontmatter: s.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
	'compile-preset': [
		{
			childParentIdField: 'dbench-project-id',
			childParentWikilinkField: 'dbench-project',
			parentWikilinkField: 'dbench-compile-presets',
			parentIdField: 'dbench-compile-preset-ids',
			candidateParents: (app) =>
				findProjects(app).map((p) => ({
					file: p.file,
					frontmatter: p.frontmatter as unknown as Record<string, unknown>,
				})),
		},
	],
};

/**
 * Scan-based reconciliation. For the child's declared parent id, ensure
 * the parent's reverse arrays include this child. For every other
 * candidate parent that currently references this child, remove the
 * stale entry. Idempotent; no writes when already in sync.
 *
 * When the child's parent-id companion is empty but the wikilink field
 * is populated, runs a retrofit backfill (issues #4 and #6): resolve
 * the wikilink against the candidate parents, write the matched
 * parent's id into the companion, then proceed with reconciliation
 * using the resolved id. The wikilink-backfill helper lives in this
 * file for now; a future refactor will hoist it into its own submodule.
 */
export async function reconcileChildInParent(
	app: App,
	childFile: TFile,
	childFm: Record<string, unknown>,
	config: RelationshipConfig
): Promise<void> {
	const childId = readString(childFm['dbench-id']);
	if (childId === '') return;

	// When `appliesToChild` returns false, the config still runs to
	// clean up stale references but treats the declared parent as
	// empty so it never adds the child to any reverse array. Used by
	// scene→project: a scene-in-chapter (one with `dbench-chapter-id`
	// set) carries both project + chapter ids per § 3, but per § 9
	// the project's reverse arrays list direct children only, so the
	// scene must not appear there.
	const applies = config.appliesToChild?.(childFm) ?? true;

	// Retrofit-time wikilink-only companion-id backfill (issues #4 / #6)
	// runs here so reconciliation in this pass uses the resolved id and
	// the parent's reverse arrays update on the same event. See
	// `./wikilink-backfill.ts` for the resolution flow.
	const declaredParentId = await backfillCompanionId(
		app,
		childFile,
		childFm,
		config,
		applies
	);

	const childWikilink = `[[${childFile.basename}]]`;

	for (const candidate of config.candidateParents(app)) {
		const isDeclaredParent =
			declaredParentId !== '' &&
			candidate.frontmatter['dbench-id'] === declaredParentId;

		if (isDeclaredParent) {
			// Pull the child's `dbench-order` from the cache the
			// linker already has in hand and pass it to the sort
			// directly (#22), sidestepping the cache-timing window
			// in `findNoteById` for the just-modified file.
			const rawOrder = childFm['dbench-order'];
			const childOrder =
				typeof rawOrder === 'number' ? rawOrder : undefined;
			await ensureChildInReverse(
				app,
				candidate.file,
				childWikilink,
				childId,
				childOrder,
				config
			);
		} else {
			// Only touch parents that actually reference this child;
			// skip the rest so we don't churn every unrelated note.
			if (
				!containsWikilinkOrId(
					candidate.frontmatter[config.parentWikilinkField],
					candidate.frontmatter[config.parentIdField],
					childWikilink,
					childId
				)
			) {
				continue;
			}
			await removeChildFromReverse(
				app,
				candidate.file,
				childWikilink,
				childId,
				config
			);
		}
	}
}

async function ensureChildInReverse(
	app: App,
	parent: TFile,
	childWikilink: string,
	childId: string,
	childOrder: number | undefined,
	config: RelationshipConfig
): Promise<void> {
	await app.fileManager.processFrontMatter(parent, (fm) => {
		const warr = readArray(fm[config.parentWikilinkField]);
		const iarr = readArray(fm[config.parentIdField]);
		const hasWikilink = warr.includes(childWikilink);
		const hasId = iarr.includes(childId);
		if (hasWikilink && hasId) return; // already in sync; no write
		if (!hasWikilink) warr.push(childWikilink);
		if (!hasId) iarr.push(childId);
		// Sort by each child's `dbench-order` so live additions land
		// in narrative order rather than arbitrary append order (#19).
		// Pass the just-added child's order directly to the sort
		// (#22) so it doesn't depend on `findNoteById`'s view of the
		// metadataCache, which can lag by a tick on the file that
		// triggered the current `'changed'` event.
		const knownOrders = new Map<string, number>();
		if (typeof childOrder === 'number') {
			knownOrders.set(childId, childOrder);
		}
		const sorted = sortReverseArraysByOrder(app, warr, iarr, knownOrders);
		fm[config.parentWikilinkField] = sorted.wikilinks;
		fm[config.parentIdField] = sorted.ids;
	});
}

async function removeChildFromReverse(
	app: App,
	parent: TFile,
	childWikilink: string,
	childId: string,
	config: RelationshipConfig
): Promise<void> {
	await app.fileManager.processFrontMatter(parent, (fm) => {
		const warr = readArray(fm[config.parentWikilinkField]);
		const iarr = readArray(fm[config.parentIdField]);
		const filteredWikilinks = warr.filter((x) => x !== childWikilink);
		const filteredIds = iarr.filter((x) => x !== childId);
		if (
			filteredWikilinks.length !== warr.length ||
			filteredIds.length !== iarr.length
		) {
			fm[config.parentWikilinkField] = filteredWikilinks;
			fm[config.parentIdField] = filteredIds;
		}
	});
}

/**
 * True iff either the wikilink array contains `wikilink` or the id array
 * contains `id`. Used to short-circuit work on projects that don't
 * mention this scene at all.
 */
function containsWikilinkOrId(
	wikilinks: unknown,
	ids: unknown,
	wikilink: string,
	id: string
): boolean {
	const warr = readArray(wikilinks);
	const iarr = readArray(ids);
	return warr.includes(wikilink) || iarr.includes(id);
}
