# Audit Phase 5: Lower-Priority Cleanup

**Status:** ✅ Complete
**Created:** May 11, 2026
**Merged:** 2026-05-11
**Branch:** `audit/phase-5-cleanup`
**Release target:** Bundled into the next convenient release; doesn't justify its own version bump.

Opportunistic improvements that didn't earn their own phase but are worth doing while the audit context is fresh. Each of the four items in the master plan was evaluated independently; three landed as code/doc changes, one was deliberately skipped after checking its precondition.

---

## Items

### Item 1 — `toGeneric` consolidation in `integrity.ts` (✅ done)

Eleven call sites in `scanProject` each built the same `{ file: X.file, frontmatter: X.frontmatter as unknown as Record<string, unknown> }` literal to pass to `scanRelationship`. They now call `toGeneric(X)` — the same helper their sibling `.map(toGeneric)` lines already used. Net diff: −53 lines.

One outlier cast (filtering direct scenes by `dbench-chapter-id`) was simpler than expected: `SceneFrontmatter` already declares `dbench-chapter-id` as an optional typed field, so the cast was never needed; the body simplified to `!s.frontmatter['dbench-chapter-id']`.

`toGeneric`'s own internal cast is preserved — that's precisely what the helper is for.

Commit: `refactor(integrity): Route every typed-frontmatter cast through toGeneric`.

### Item 2 — Debounce-constant divergence (✅ documented)

The two debounce constants serve different rendering surfaces:

- [src/ui/manuscript-view/manuscript-view.ts](../../src/ui/manuscript-view/manuscript-view.ts) — `MODIFY_DEBOUNCE_MS = 300` for the scene-list refresh.
- [src/ui/manuscript-builder/manuscript-builder.ts](../../src/ui/manuscript-builder/manuscript-builder.ts) — `FILE_SAVE_DEBOUNCE_MS = 400` for the Builder's Preview re-render.

The Builder's constant already had a calibration comment. The view's didn't. The 100 ms gap is intentional — the scene list is a lighter re-render than the Builder's Preview, so it can afford a tighter window — and the two should stay tuned per surface rather than unify onto a single constant.

Added a calibration block above `MODIFY_DEBOUNCE_MS` that references the Builder's constant and explains why the values diverge. Both comments are now self-explanatory; readers landing on either find the rationale without cross-referencing.

Commit: `docs(coding-standards): Document debounce divergence + void-pattern guidance` (bundled with Item 4).

### Item 3 — `VaultListenerSet` helper (✗ deliberately skipped)

The Phase 5 plan made extraction conditional on the four-listener pattern (`vault.on('modify')` + `metadataCache.on('changed')` + `metadataCache.on('resolved')` + `metadataCache.on('deleted')`) appearing in more than one view. Empirical survey:

- [src/ui/manuscript-view/manuscript-view.ts](../../src/ui/manuscript-view/manuscript-view.ts) — full 4-listener set (lines ~151-164).
- [src/ui/manuscript-builder/manuscript-builder.ts](../../src/ui/manuscript-builder/manuscript-builder.ts) — only `vault.on('modify')` (line ~136). Single listener.
- [src/ui/manuscript-view/sections/continuous.ts](../../src/ui/manuscript-view/sections/continuous.ts) — only `vault.on('modify')` (line ~198). Single listener.
- [src/ui/leaf-styles.ts](../../src/ui/leaf-styles.ts) — only `metadataCache.on('changed')` (line ~68). Single listener.

The 4-listener pattern is unique to one surface. Extracting a `VaultListenerSet` helper for a single caller adds an abstraction layer without payoff — the helper would be parameterized for use cases that don't exist. Per the Phase 5 plan's "If only `manuscript-view.ts` uses the pattern, leave it inline" instruction: left inline.

### Item 4 — Fire-and-forget `void` pattern doc (✅ documented)

Added § 2.6 "Async error handling" to [docs/developer/coding-standards.md](../developer/coding-standards.md). Documents:

- When `void promise` is the right tool (sync enclosing function + genuinely fire-and-forget OR errors handled inside the awaited function / chained via `.catch`).
- When it's wrong (silent failure of user-facing operations, async-by-restructure-able caller, breaking try/catch boundaries).
- Pattern guidance, not refactor obligation — existing call sites stay; only rewrite when one of the "wrong" conditions clearly applies.
- A future `runAsync(promise, errorContext)` helper is mentioned as a possible follow-up if a common-shape error-handling pattern emerges across many sites, but isn't scoped here.

Commit: `docs(coding-standards): Document debounce divergence + void-pattern guidance` (bundled with Item 2).

---

## Verification

| Gate | Result |
|---|---|
| `npm run build` | EXIT=0 |
| `npm test` | 1360 / 1360 across 76 / 76 suites. No test modifications. |
| `npm run lint` | 0 errors, 40 warnings (pre-existing `prefer-create-el` / `prefer-active-doc`). |
| `npm run lint:css` | 0 errors. |

---

## Status

Phase 5 complete. All five audit phases are now ✅ in the master plan. The audit plan and its five phase deliverables are ready for archival together once the user signals the audit work as fully wrapped.
