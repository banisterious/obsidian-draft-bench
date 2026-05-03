import { type App, type TFile } from 'obsidian';
import {
	findChaptersInProject,
	findCompilePresetsOfProject,
	findDraftsOfChapter,
	findDraftsOfProject,
	findDraftsOfScene,
	findDraftsOfSubScene,
	findNoteById,
	findScenesInChapter,
	findScenesInProject,
	findSubScenesInScene,
	type ProjectNote,
} from './discovery';

/**
 * `DraftBenchIntegrityService` — batch scan and repair for project
 * relationship integrity.
 *
 * Per spec § Relationship Integrity: the `DraftBenchLinker` performs
 * live reconciliation on vault events, but relies on events actually
 * firing. Notes edited outside Obsidian (external tools, sync engines,
 * manual YAML edits via a text editor) bypass the linker and can drift.
 * This service performs a full scan of a project and its transitive
 * children (scenes, drafts), reporting mismatches classified as
 * auto-repairable or requiring manual review.
 *
 * Categories of issues detected:
 *
 * - **Missing reverse entry**: a child (scene/draft) declares this
 *   parent but the parent's reverse arrays don't list it. Auto-repair:
 *   append to both arrays.
 * - **Stale reverse entry**: parent's reverse array references a note
 *   that doesn't exist, or exists but no longer declares this parent.
 *   Auto-repair: remove from both arrays.
 * - **Wikilink / id-companion conflict**: reverse array position i has
 *   a wikilink pointing at note A and an id companion pointing at
 *   note B. The writer's intent is ambiguous; flag for manual review
 *   rather than auto-picking one.
 *
 * The scan is project-scoped: call `scanProject(app, project)` for one
 * project at a time. Vault-wide repair is a composition of per-project
 * scans (driven by the UI).
 */

/**
 * Stable SNAKE_CASE identifiers for integrity issue categories.
 *
 * Each code names one (relationship, failure mode) pairing. Codes are
 * treated as public identifiers: help-doc anchors, Data Quality tab
 * grouping, and future telemetry/logging should target these strings,
 * so they should not be renamed lightly. New relationships or failure
 * modes should add codes rather than repurposing existing ones.
 *
 * Naming shape: `<PARENT>_<CATEGORY>_<CHILD>` for reverse-array and
 * conflict issues, where CATEGORY is one of MISSING / STALE / CONFLICT.
 *
 * `PROJECT_MIXED_CHILDREN` (per § 9 of chapter-type.md) is the lone
 * state-violation code, flagged when a project carries both chapters
 * and direct scenes; it sits outside the `<PARENT>_<CATEGORY>_<CHILD>`
 * shape because it describes a structural invariant rather than a
 * single forward-ref / reverse-array pair. Manual-only repair: the
 * writer must convert the project to one shape or the other.
 *
 * Sub-scene-aware scenes (per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md))
 * carry `dbench-sub-scenes` / `dbench-sub-scene-ids` reverse arrays
 * pointing at their child sub-scenes. The `SUB_SCENE_*` codes mirror
 * the chapter↔scene shape one level deeper. Sub-scene-level draft
 * relationships are also scanned (`DRAFT_MISSING_IN_SUB_SCENE`,
 * `STALE_DRAFT_IN_SUB_SCENE`, `SUB_SCENE_DRAFT_CONFLICT`), mirroring
 * the chapter↔draft pass; sub-scene-less scenes never accumulate
 * issues from either pass because the declared-children list and the
 * reverse arrays are empty/absent.
 */
export type IntegrityIssueKind =
	| 'SCENE_MISSING_IN_PROJECT'
	| 'STALE_SCENE_IN_PROJECT'
	| 'SCENE_PROJECT_CONFLICT'
	| 'DRAFT_MISSING_IN_SCENE'
	| 'STALE_DRAFT_IN_SCENE'
	| 'SCENE_DRAFT_CONFLICT'
	| 'DRAFT_MISSING_IN_PROJECT'
	| 'STALE_DRAFT_IN_PROJECT'
	| 'PROJECT_DRAFT_CONFLICT'
	| 'PRESET_MISSING_IN_PROJECT'
	| 'STALE_PRESET_IN_PROJECT'
	| 'PROJECT_PRESET_CONFLICT'
	| 'CHAPTER_MISSING_IN_PROJECT'
	| 'STALE_CHAPTER_IN_PROJECT'
	| 'PROJECT_CHAPTER_CONFLICT'
	| 'SCENE_MISSING_IN_CHAPTER'
	| 'STALE_SCENE_IN_CHAPTER'
	| 'CHAPTER_SCENE_CONFLICT'
	| 'DRAFT_MISSING_IN_CHAPTER'
	| 'STALE_DRAFT_IN_CHAPTER'
	| 'CHAPTER_DRAFT_CONFLICT'
	| 'SUB_SCENE_MISSING_IN_SCENE'
	| 'STALE_SUB_SCENE_IN_SCENE'
	| 'SCENE_SUB_SCENE_CONFLICT'
	| 'DRAFT_MISSING_IN_SUB_SCENE'
	| 'STALE_DRAFT_IN_SUB_SCENE'
	| 'SUB_SCENE_DRAFT_CONFLICT'
	| 'PROJECT_MIXED_CHILDREN';

export interface IntegrityIssue {
	kind: IntegrityIssueKind;
	autoRepairable: boolean;
	/** Human-readable summary for the preview UI. */
	description: string;
	/** Machine-actionable repair payload. Present iff `autoRepairable`. */
	repair?: RepairPayload;
}

export type RepairPayload =
	| {
			kind: 'add-to-reverse';
			parent: TFile;
			wikilink: string;
			id: string;
			wikilinkField: string;
			idField: string;
		}
	| {
			kind: 'remove-from-reverse';
			parent: TFile;
			wikilink: string;
			id: string;
			wikilinkField: string;
			idField: string;
		};

export interface IntegrityReport {
	project: ProjectNote;
	issues: IntegrityIssue[];
}

export interface IntegrityRepairResult {
	repaired: number;
	conflictsSkipped: number;
	errors: number;
}

/**
 * Scan `project` for relationship-integrity issues and return a
 * report. Pure-read (no writes); safe to call anytime.
 */
export function scanProject(app: App, project: ProjectNote): IntegrityReport {
	const issues: IntegrityIssue[] = [];
	const projectId = project.frontmatter['dbench-id'];
	const shape = project.frontmatter['dbench-project-shape'];
	const allScenes = findScenesInProject(app, projectId);
	const directScenes = allScenes.filter(
		(s) =>
			!readString(
				(s.frontmatter as unknown as Record<string, unknown>)[
					'dbench-chapter-id'
				]
			)
	);
	const chapters = findChaptersInProject(app, projectId);

	// PROJECT_MIXED_CHILDREN: § 9 invariant. A project's top-level
	// children are all chapters or all direct scenes, never both.
	// Manual-only repair (the writer must decide which shape to keep);
	// auto-fixing either way would silently destroy hierarchy.
	if (chapters.length > 0 && directScenes.length > 0) {
		issues.push({
			kind: 'PROJECT_MIXED_CHILDREN',
			autoRepairable: false,
			description: `${project.file.basename} has both chapters (${chapters.length}) and direct scenes (${directScenes.length}). Per chapter-type.md § 9, a project's children must be all chapters or all direct scenes; convert one set to the other.`,
		});
	}

	// Scene <-> project. Direct children only — scenes-in-chapters are
	// scanned via the chapter <-> scene pass below. Filtering on the
	// declared-children side and the predicate side keeps the scan from
	// flagging chapter-aware projects as "missing direct-children scenes
	// in dbench-scenes" when the project's reverse arrays are intentionally
	// empty.
	issues.push(
		...scanRelationship({
			app,
			parent: {
				file: project.file,
				frontmatter: project.frontmatter as unknown as Record<string, unknown>,
			},
			parentId: projectId,
			wikilinkField: 'dbench-scenes',
			idField: 'dbench-scene-ids',
			declaredChildren: directScenes.map(toGeneric),
			childDeclaresParent: (fm) =>
				fm['dbench-project-id'] === projectId &&
				!readString(fm['dbench-chapter-id']),
			childTypeLabel: 'Scene',
			kinds: {
				missing: 'SCENE_MISSING_IN_PROJECT',
				stale: 'STALE_SCENE_IN_PROJECT',
				conflict: 'SCENE_PROJECT_CONFLICT',
			},
		})
	);

	// Chapter <-> project. One relationship pass per project. No shape
	// filter: integrity surfaces chapters in any project shape (a
	// chapter in a single-scene project would surface here as a stale
	// reference once it fails to roundtrip — the linker doesn't reject
	// such configurations).
	issues.push(
		...scanRelationship({
			app,
			parent: {
				file: project.file,
				frontmatter: project.frontmatter as unknown as Record<string, unknown>,
			},
			parentId: projectId,
			wikilinkField: 'dbench-chapters',
			idField: 'dbench-chapter-ids',
			declaredChildren: chapters.map(toGeneric),
			childDeclaresParent: (fm) => fm['dbench-project-id'] === projectId,
			childTypeLabel: 'Chapter',
			kinds: {
				missing: 'CHAPTER_MISSING_IN_PROJECT',
				stale: 'STALE_CHAPTER_IN_PROJECT',
				conflict: 'PROJECT_CHAPTER_CONFLICT',
			},
		})
	);

	// Chapter <-> scene. One relationship pass per chapter.
	for (const chapter of chapters) {
		const chapterId = chapter.frontmatter['dbench-id'];
		issues.push(
			...scanRelationship({
				app,
				parent: {
					file: chapter.file,
					frontmatter: chapter.frontmatter as unknown as Record<
						string,
						unknown
					>,
				},
				parentId: chapterId,
				wikilinkField: 'dbench-scenes',
				idField: 'dbench-scene-ids',
				declaredChildren: findScenesInChapter(app, chapterId).map(toGeneric),
				childDeclaresParent: (fm) => fm['dbench-chapter-id'] === chapterId,
				childTypeLabel: 'Scene',
				kinds: {
					missing: 'SCENE_MISSING_IN_CHAPTER',
					stale: 'STALE_SCENE_IN_CHAPTER',
					conflict: 'CHAPTER_SCENE_CONFLICT',
				},
			})
		);

		// Chapter <-> draft (chapter-level drafts per § 4).
		issues.push(
			...scanRelationship({
				app,
				parent: {
					file: chapter.file,
					frontmatter: chapter.frontmatter as unknown as Record<
						string,
						unknown
					>,
				},
				parentId: chapterId,
				wikilinkField: 'dbench-drafts',
				idField: 'dbench-draft-ids',
				declaredChildren: findDraftsOfChapter(app, chapterId).map(toGeneric),
				childDeclaresParent: (fm) => fm['dbench-chapter-id'] === chapterId,
				childTypeLabel: 'Draft',
				kinds: {
					missing: 'DRAFT_MISSING_IN_CHAPTER',
					stale: 'STALE_DRAFT_IN_CHAPTER',
					conflict: 'CHAPTER_DRAFT_CONFLICT',
				},
			})
		);
	}

	// Scene <-> draft. One relationship pass per scene in the project
	// (including scenes-in-chapters: scene-level drafts attach to their
	// scene regardless of chapter parentage).
	for (const scene of allScenes) {
		issues.push(
			...scanRelationship({
				app,
				parent: {
					file: scene.file,
					frontmatter: scene.frontmatter as unknown as Record<
						string,
						unknown
					>,
				},
				parentId: scene.frontmatter['dbench-id'],
				wikilinkField: 'dbench-drafts',
				idField: 'dbench-draft-ids',
				declaredChildren: findDraftsOfScene(
					app,
					scene.frontmatter['dbench-id']
				).map(toGeneric),
				childDeclaresParent: (fm) =>
					fm['dbench-scene-id'] === scene.frontmatter['dbench-id'],
				childTypeLabel: 'Draft',
				kinds: {
					missing: 'DRAFT_MISSING_IN_SCENE',
					stale: 'STALE_DRAFT_IN_SCENE',
					conflict: 'SCENE_DRAFT_CONFLICT',
				},
			})
		);

		// Scene <-> sub-scene. Per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md),
		// hierarchical scenes carry `dbench-sub-scenes` /
		// `dbench-sub-scene-ids` reverse arrays listing their sub-scene
		// children. Sub-scene-less scenes contribute no issues here
		// (declaredChildren is empty AND the reverse arrays are absent
		// or empty, so scanRelationship returns no missing/stale entries).
		const subScenes = findSubScenesInScene(
			app,
			scene.frontmatter['dbench-id']
		);
		issues.push(
			...scanRelationship({
				app,
				parent: {
					file: scene.file,
					frontmatter: scene.frontmatter as unknown as Record<
						string,
						unknown
					>,
				},
				parentId: scene.frontmatter['dbench-id'],
				wikilinkField: 'dbench-sub-scenes',
				idField: 'dbench-sub-scene-ids',
				declaredChildren: subScenes.map(toGeneric),
				childDeclaresParent: (fm) =>
					fm['dbench-scene-id'] === scene.frontmatter['dbench-id'],
				childTypeLabel: 'Sub-scene',
				kinds: {
					missing: 'SUB_SCENE_MISSING_IN_SCENE',
					stale: 'STALE_SUB_SCENE_IN_SCENE',
					conflict: 'SCENE_SUB_SCENE_CONFLICT',
				},
			})
		);

		// Sub-scene <-> draft. One relationship pass per sub-scene under
		// this scene (sub-scene drafts attach to their sub-scene parent
		// per [sub-scene-type.md § 4](../../docs/planning/sub-scene-type.md);
		// the linker config landed in Step 4, the integrity pass lands
		// here in Step 10 alongside createSubSceneDraft).
		for (const subScene of subScenes) {
			issues.push(
				...scanRelationship({
					app,
					parent: {
						file: subScene.file,
						frontmatter: subScene.frontmatter as unknown as Record<
							string,
							unknown
						>,
					},
					parentId: subScene.frontmatter['dbench-id'],
					wikilinkField: 'dbench-drafts',
					idField: 'dbench-draft-ids',
					declaredChildren: findDraftsOfSubScene(
						app,
						subScene.frontmatter['dbench-id']
					).map(toGeneric),
					childDeclaresParent: (fm) =>
						fm['dbench-sub-scene-id'] ===
						subScene.frontmatter['dbench-id'],
					childTypeLabel: 'Draft',
					kinds: {
						missing: 'DRAFT_MISSING_IN_SUB_SCENE',
						stale: 'STALE_DRAFT_IN_SUB_SCENE',
						conflict: 'SUB_SCENE_DRAFT_CONFLICT',
					},
				})
			);
		}
	}

	// Project <-> compile preset. Applies to both folder and
	// single-scene projects (unlike drafts, which only attach directly
	// to single-scene projects).
	issues.push(
		...scanRelationship({
			app,
			parent: {
				file: project.file,
				frontmatter: project.frontmatter as unknown as Record<
					string,
					unknown
				>,
			},
			parentId: projectId,
			wikilinkField: 'dbench-compile-presets',
			idField: 'dbench-compile-preset-ids',
			declaredChildren: findCompilePresetsOfProject(app, projectId).map(
				toGeneric
			),
			childDeclaresParent: (fm) => fm['dbench-project-id'] === projectId,
			childTypeLabel: 'Compile preset',
			kinds: {
				missing: 'PRESET_MISSING_IN_PROJECT',
				stale: 'STALE_PRESET_IN_PROJECT',
				conflict: 'PROJECT_PRESET_CONFLICT',
			},
		})
	);

	// Project <-> draft (single-scene projects only — folder projects
	// don't hold drafts directly).
	if (shape === 'single') {
		issues.push(
			...scanRelationship({
				app,
				parent: {
					file: project.file,
					frontmatter: project.frontmatter as unknown as Record<
						string,
						unknown
					>,
				},
				parentId: projectId,
				wikilinkField: 'dbench-drafts',
				idField: 'dbench-draft-ids',
				declaredChildren: findDraftsOfProject(app, projectId)
					.filter(
						(d) =>
							// Only drafts without a scene parent attach directly
							// to the project. Drafts with a scene parent belong
							// to the scene<->draft relationship above.
							!d.frontmatter['dbench-scene-id']
					)
					.map(toGeneric),
				childDeclaresParent: (fm) =>
					fm['dbench-project-id'] === projectId &&
					!fm['dbench-scene-id'],
				childTypeLabel: 'Draft',
				kinds: {
					missing: 'DRAFT_MISSING_IN_PROJECT',
					stale: 'STALE_DRAFT_IN_PROJECT',
					conflict: 'PROJECT_DRAFT_CONFLICT',
				},
			})
		);
	}

	return { project, issues };
}

/**
 * Apply auto-repairable issues from `report`. Conflicts and non-
 * repairable entries are counted into `conflictsSkipped`. Errors from
 * frontmatter writes are counted into `errors`.
 *
 * Repairs targeting the same parent file are batched into a single
 * `processFrontMatter` call so the file is written at most once per
 * parent.
 */
export async function applyRepairs(
	app: App,
	report: IntegrityReport
): Promise<IntegrityRepairResult> {
	const byParent = new Map<string, RepairPayload[]>();
	let conflictsSkipped = 0;

	for (const issue of report.issues) {
		if (!issue.autoRepairable || !issue.repair) {
			conflictsSkipped++;
			continue;
		}
		const key = issue.repair.parent.path;
		if (!byParent.has(key)) byParent.set(key, []);
		byParent.get(key)!.push(issue.repair);
	}

	let repaired = 0;
	let errors = 0;

	for (const [, payloads] of byParent) {
		const parentFile = payloads[0].parent;
		try {
			await app.fileManager.processFrontMatter(parentFile, (fm) => {
				for (const p of payloads) {
					if (p.kind === 'add-to-reverse') {
						const warr = readArray(fm[p.wikilinkField]);
						const iarr = readArray(fm[p.idField]);
						if (!warr.includes(p.wikilink)) warr.push(p.wikilink);
						if (!iarr.includes(p.id)) iarr.push(p.id);
						fm[p.wikilinkField] = warr;
						fm[p.idField] = iarr;
					} else {
						// remove-from-reverse — filter by value, not index, so
						// multiple removals against the same parent don't
						// interfere.
						const warr = readArray(fm[p.wikilinkField]).filter(
							(x) => x !== p.wikilink
						);
						const iarr = readArray(fm[p.idField]).filter(
							(x) => x !== p.id
						);
						fm[p.wikilinkField] = warr;
						fm[p.idField] = iarr;
					}
				}
			});
			repaired += payloads.length;
		} catch {
			errors += payloads.length;
		}
	}

	return { repaired, conflictsSkipped, errors };
}

/**
 * Single-relationship scan. Detects missing-reverse, stale-reverse,
 * and wikilink/id-companion conflicts for one forward-ref pair.
 */
interface RelationshipScan {
	app: App;
	parent: { file: TFile; frontmatter: Record<string, unknown> };
	parentId: string;
	wikilinkField: string;
	idField: string;
	/** All children whose forward-ref points at this parent. */
	declaredChildren: Array<{ file: TFile; frontmatter: Record<string, unknown> }>;
	/** Given a child's frontmatter, does it still declare this parent? */
	childDeclaresParent: (fm: Record<string, unknown>) => boolean;
	childTypeLabel: string;
	kinds: {
		missing: IntegrityIssueKind;
		stale: IntegrityIssueKind;
		conflict: IntegrityIssueKind;
	};
}

function scanRelationship(scan: RelationshipScan): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	const wikilinks = readArray(scan.parent.frontmatter[scan.wikilinkField]);
	const ids = readArray(scan.parent.frontmatter[scan.idField]);

	// Missing: child declares parent but isn't listed in parent's reverse arrays.
	for (const child of scan.declaredChildren) {
		const childWikilink = `[[${child.file.basename}]]`;
		const childId = readString(child.frontmatter['dbench-id']);
		const hasWikilink = wikilinks.includes(childWikilink);
		const hasId = ids.includes(childId);
		if (!hasWikilink || !hasId) {
			issues.push({
				kind: scan.kinds.missing,
				autoRepairable: true,
				description: `${scan.childTypeLabel} "${child.file.basename}" declares ${scan.parent.file.basename} but is missing from its ${scan.wikilinkField}.`,
				repair: {
					kind: 'add-to-reverse',
					parent: scan.parent.file,
					wikilink: childWikilink,
					id: childId,
					wikilinkField: scan.wikilinkField,
					idField: scan.idField,
				},
			});
		}
	}

	// Stale + conflict: walk parent's reverse arrays.
	const maxLen = Math.max(wikilinks.length, ids.length);
	for (let i = 0; i < maxLen; i++) {
		const wikilink = wikilinks[i];
		const id = ids[i];

		const wikilinkTarget = wikilink
			? resolveWikilinkToFile(scan.app, wikilink)
			: null;
		const idTarget = id ? findNoteById(scan.app, id) : null;

		// Conflict: both resolve, but to different files.
		if (
			wikilinkTarget &&
			idTarget &&
			wikilinkTarget.file.path !== idTarget.file.path
		) {
			issues.push({
				kind: scan.kinds.conflict,
				autoRepairable: false,
				description: `${scan.parent.file.basename}'s ${scan.wikilinkField}[${i}]: wikilink "${wikilink}" -> ${wikilinkTarget.file.basename}, but id "${id}" -> ${idTarget.file.basename}.`,
			});
			continue;
		}

		const actualTarget = wikilinkTarget ?? idTarget;

		if (!actualTarget) {
			// Stale: neither wikilink nor id resolves. Only flag if at
			// least one value is present (empty paired entries in a new
			// reverse array aren't issues).
			if (wikilink || id) {
				issues.push({
					kind: scan.kinds.stale,
					autoRepairable: true,
					description: `${scan.parent.file.basename}'s ${scan.wikilinkField}[${i}]="${wikilink ?? ''}" does not resolve to an existing note.`,
					repair: {
						kind: 'remove-from-reverse',
						parent: scan.parent.file,
						wikilink: wikilink ?? '',
						id: id ?? '',
						wikilinkField: scan.wikilinkField,
						idField: scan.idField,
					},
				});
			}
			continue;
		}

		// Target resolves — verify it still declares this parent.
		if (!scan.childDeclaresParent(actualTarget.frontmatter)) {
			issues.push({
				kind: scan.kinds.stale,
				autoRepairable: true,
				description: `${scan.parent.file.basename}'s ${scan.wikilinkField}[${i}]="${wikilink ?? ''}" no longer declares ${scan.parent.file.basename} as its parent.`,
				repair: {
					kind: 'remove-from-reverse',
					parent: scan.parent.file,
					wikilink: wikilink ?? '',
					id: id ?? '',
					wikilinkField: scan.wikilinkField,
					idField: scan.idField,
				},
			});
		}
	}

	return issues;
}

/**
 * Resolve a wikilink string like `[[Target]]` to its file in the vault
 * by basename match. Returns the file + its cached frontmatter, or
 * null if no file has that basename.
 *
 * Simpler than Obsidian's `getFirstLinkpathDest` (which handles
 * aliasing / path-qualified links); sufficient for the reverse-array
 * integrity scan where we store `[[basename]]` literally.
 */
function resolveWikilinkToFile(
	app: App,
	wikilink: string
): { file: TFile; frontmatter: Record<string, unknown> } | null {
	const m = wikilink.match(/^\[\[(.+?)\]\]$/);
	if (!m) return null;
	const target = m[1];
	for (const f of app.vault.getMarkdownFiles()) {
		if (f.basename === target) {
			const fm = app.metadataCache.getFileCache(f)?.frontmatter ?? {};
			return { file: f, frontmatter: fm as Record<string, unknown> };
		}
	}
	return null;
}

/**
 * Narrow typed discovery results (ProjectNote / SceneNote / DraftNote)
 * into the generic shape `scanRelationship` expects. The typed
 * frontmatters don't satisfy `Record<string, unknown>` directly (their
 * literal keys conflict with the index signature), so we go through
 * `unknown` to shed the specific type.
 */
function toGeneric(note: {
	file: TFile;
	frontmatter: object;
}): { file: TFile; frontmatter: Record<string, unknown> } {
	return {
		file: note.file,
		frontmatter: note.frontmatter as unknown as Record<string, unknown>,
	};
}

function readArray(value: unknown): string[] {
	return Array.isArray(value) ? (value as string[]) : [];
}

function readString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}
