# Audit Phase 4: Linker Refactor

**Status:** ✅ Complete
**Created:** May 11, 2026
**Merged:** 2026-05-11
**Branch:** `audit/phase-4-linker-refactor`
**Release target:** 0.5.4 patch

Decompose `src/core/linker.ts` (951 lines) into a focused directory of submodules. Internal structure change with no public API change and no behavior change. The `DraftBenchLinker` class stays as the public entry point; submodule responsibilities are: lifecycle / event dispatch, reconciliation, wikilink-backfill, folder auto-rename, and shared readers.

---

## Final file layout

`src/core/linker/` (six files; one over the master plan's five):

| File | Lines | Responsibility |
|---|---|---|
| `index.ts` | 8 | Re-exports `DraftBenchLinker` for external consumers. |
| `lifecycle.ts` | 308 | `DraftBenchLinker` class. State (suspended counter, event refs), start/stop/suspend/resume/withSuspended, fire-and-forget event-handler dispatchers (`handleModify`/`handleDelete`/`handleRename`), async event handlers (`onModify`/`onDelete`/`onRename`). |
| `reconciliation.ts` | 367 | `RELATIONSHIPS` table, `RelationshipConfig` type, `reconcileChildInParent` (module-level), internal `ensureChildInReverse` / `removeChildFromReverse` / `containsWikilinkOrId`. |
| `wikilink-backfill.ts` | 99 | Retrofit-time companion-id backfill: `backfillCompanionId(app, childFile, childFm, config, applies)`. Resolves wikilinks via Obsidian's `frontmatterLinks` cache (cascading to `parseWikilinkBasename`), writes the matched parent's id into the child's companion field, returns the resolved id. Issues #4 and #6. |
| `folder-auto-rename.ts` | 220 | `renameSubSceneFolderIfNeeded` and `renameChapterScenesFolderIfNeeded`. Sub-scene-type § 10 + issue #11 auto-rename logic when a scene/chapter file rename triggers a matching folder rename. Owns its `parentPath` / `computeSubSceneFolderPath` / `computeChapterScenesFolderPath` helpers. |
| `readers.ts` | 18 | `readArray` and `readString` — shared defensive frontmatter-value readers. |

Total: 1020 lines (up from 951; ~7% growth from the function-signature boilerplate that comes with extracting class methods to module-level functions plus expanded JSDoc on the new module boundaries).

---

## Decisions and deviations from the master plan

**Six files instead of five.** The master plan listed `index.ts` + four submodules. `readers.ts` is a sixth. Three submodules need `readString` (reconciliation, folder-auto-rename, wikilink-backfill); putting the two-line helper in any one of them and importing across would have created an arbitrary owner. Pulling it into its own micro-module keeps the import graph clean and the helper trivially discoverable.

**`DraftBenchLinker` class lives in `lifecycle.ts`, not a dedicated class file.** The master plan's literal reading was ambiguous (`lifecycle.ts` listed alongside the class). The class's state (suspended counter, three event refs) is inherently coupled to its lifecycle methods, so splitting them across files would have produced unnatural seams. `lifecycle.ts` owns both. `index.ts` re-exports.

**Module-level pure functions, class as thin orchestrator.** The class's `onModify` / `onDelete` / `onRename` handlers became thin dispatchers that call module-level `reconcileChildInParent`, `backfillCompanionId`, `renameSubSceneFolderIfNeeded`, and `renameChapterScenesFolderIfNeeded` with `this.app` (and `this.getSettings()` where relevant). The submodule functions are pure of class state; they take everything they need as parameters.

**Circular type-only import.** `wikilink-backfill.ts` imports `RelationshipConfig` from `reconciliation.ts` (type-only). `reconciliation.ts` imports `backfillCompanionId` from `wikilink-backfill.ts` (value). TypeScript handles this via `import type` erasure at compile time; ESM handles the runtime cycle via the standard hoisting + lazy-binding contract (neither module accesses the other's exports at module-init time; both are called only inside functions).

**`basenameFromPath` stayed in `lifecycle.ts`.** Used only by `onRename`. No reason to move it out — single-use, internal to lifecycle.

---

## Migration sequence

Four incremental commits, each with tests passing:

1. **Setup** (`refactor(linker): Set up linker/ directory with re-exporter`): `git mv src/core/linker.ts src/core/linker/lifecycle.ts`, create `index.ts` re-exporter, fix the file's internal `from './discovery'` imports to `from '../discovery'`. Pure rename — no logic change.

2. **Folder-auto-rename + readers** (`refactor(linker): Extract folder-auto-rename submodule`): Create `readers.ts` (readArray/readString); create `folder-auto-rename.ts` (renameSubScene/Chapter folder methods as module-level functions, plus internal path helpers); update `lifecycle.ts`'s `onRename` to call them; remove the now-duplicated readers, the moved methods, and the path helpers from lifecycle.

3. **Reconciliation** (`refactor(linker): Extract reconciliation submodule`): Create `reconciliation.ts` holding `RELATIONSHIPS`, `RelationshipConfig`, `reconcileChildInParent`, internal `ensureChildInReverse`/`removeChildFromReverse`/`containsWikilinkOrId`, and a local `resolveParentBasename` helper (temporarily inline; extracted next commit); update `lifecycle.ts`'s `onModify` to delegate; remove the moved class methods and the RELATIONSHIPS const.

4. **Wikilink-backfill** (`refactor(linker): Extract wikilink-backfill submodule`): Create `wikilink-backfill.ts` exposing `backfillCompanionId`; hoist `resolveParentBasename` out of reconciliation; update `reconcileChildInParent` to call `backfillCompanionId` at the start of its loop instead of inlining the backfill block.

The sequence was constrained by the dependency graph: `reconciliation` needs `readers` (so readers landed alongside folder-auto-rename); `wikilink-backfill` references `RelationshipConfig` (so reconciliation landed first); circular value imports between reconciliation and wikilink-backfill resolved via runtime cycle in commit 4.

Each commit ran `npm test` before staging, halting on the first regression. None happened.

---

## Verification

| Gate | Result |
|---|---|
| `npm run build` | EXIT=0; tsc + esbuild both clean. |
| `npm test` | 1360 / 1360 tests across 76 / 76 suites. **No test files modified** — the constraint from the master plan held. |
| `npm run lint` | 0 errors, 40 warnings (pre-existing `prefer-create-el` / `prefer-active-doc`). |
| `npm run lint:css` | 0 errors. |

The test suite served as the load-bearing safety net. The 44 inbound `from '...linker'` import sites (tests + src/* + main.ts) all continued to resolve via `linker/index.ts`'s re-export; no caller-side changes were needed.

---

## Documentation updates

[docs/developer/architecture.md](../developer/architecture.md) refreshed in three places:

- Source-tree diagram (line ~25): replaced the single `linker.ts` entry with a tree of the six submodule files.
- Source layout description (line ~205): listed the submodule composition under `core/linker/`.
- Phase 1 bootstrap order + post-V1 lever (lines ~236, ~371): updated the `core/linker.ts` references to point at `core/linker/` or the specific submodule.

Older planning docs (`docs/planning/sub-scene-type.md`, `docs/planning/chapter-type.md`) contain historic `src/core/linker.ts:NNN` line-pinned references documenting past implementation work. Those are archival; not updated in this phase.

`src/` JSDoc references to `linker.ts` had already been swept clean in Phase 2's reference-doc reorganization; the grep for `linker\.ts` under `src/` returned empty.

---

## Implications

**Phase 5 unchanged.** Independent of this refactor.

**Future linker work lands inside the relevant submodule rather than growing one big file.** New `RelationshipConfig` entries go to `reconciliation.ts`'s `RELATIONSHIPS` table; new folder-rename triggers extend `folder-auto-rename.ts`; new wikilink-resolution edge cases go to `wikilink-backfill.ts`; lifecycle additions (new event listeners, new suspend semantics) stay in `lifecycle.ts`.

**The 22.9 KB linker.ts entry that showed up in Phase 1's bundle measurement** is now split across six files. Each is small enough to grep / read in one screen.

---

## Status

Phase 4 complete. Ready for Phase 5 (lower-priority cleanup).
