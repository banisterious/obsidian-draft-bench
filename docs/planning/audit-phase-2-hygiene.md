# Audit Phase 2: Low-Risk Hygiene

**Status:** ✅ Complete
**Created:** May 11, 2026
**Merged:** 2026-05-11
**Branch:** `audit/phase-2-hygiene`
**Release target:** 0.5.3 patch

Mechanical refactors that improve maintainability without changing runtime behavior. Two slices land together: the frontmatter-wikilinks utility extraction and the typed command-ID constants. Both were scoped in the Phase 1 deliverable; this doc captures how they actually shook out.

---

## Frontmatter-wikilinks utility extraction

### What landed

`src/core/frontmatter-wikilinks.ts` exports:

- **`parseWikilinkBasename(value: unknown): string`** — raw-value parser handling quoted-string and flow-notation forms.
- **`readWikilinkBasename(app, file, fieldName): string`** — two-tier helper (Obsidian's `frontmatterLinks` cache, then raw-value fallback). For callers that need a fresh lookup against current cache state.
- **`canonicalizeWikilinkValue(value: unknown): unknown`** — moved verbatim from linker.ts.
- **`basenameFromLinkpath(linkpath: string): string`** — shared internal helper, exported because the linker's snapshot-semantics body composes it with `parseWikilinkBasename` directly.

The two previous `parseWikilinkBasename` implementations have been deleted; both files now import from the utility.

### Decisions and deviations from the master plan

**Exposed `parseWikilinkBasename` and `basenameFromLinkpath` as public utility exports.** The master plan listed only `readWikilinkBasename` and `canonicalizeWikilinkValue` as the public API. In practice, `sub-scene-drafts.ts:121` calls `parseWikilinkBasename` directly on a frontmatter value it already holds; using `readWikilinkBasename` instead would have required threading `app: App` through `resolveSubSceneDraftFilename`'s signature, which would force test-modification beyond import paths. The plan's constraint "all existing tests pass with no modifications beyond import-path updates" was strict enough that adding the lower-level primitives to the public API was the cleaner path.

**Linker's `resolveParentBasename` retains its body, just with utility-imported primitives.** The master plan's `readWikilinkBasename` matches what `resolveParentBasename` does. Replacing the body with a one-liner would have shifted the fallback's source from the caller-passed `childFm` snapshot to a fresh `cache.frontmatter` read. That's nearly always the same thing, but not provably so under concurrent event handlers. Preserving the existing two-tier flow with utility primitives keeps the behavior bit-identical.

**Reconciled the divergent regexes by taking the linker's superset.** Sub-scene-drafts had a slightly different regex (`.+?` lazy) and didn't strip `^block` refs; the linker's `[^\]]+` plus full strip is the superset. Both are equivalent for well-formed `[[Foo]]` inputs; the divergence only mattered on edge cases sub-scene-drafts didn't exercise.

### Behavior changes

Sub-scene-drafts callers gain two new behaviors via the unified parser:

- **Flow-notation array form** (`dbench-scene: [[Foo]]` unquoted in YAML, which Obsidian's Properties panel produces by default) now resolves to `Foo`. Previously returned `''`, causing the draft filename to fall back to just the sub-scene's basename.
- **Block references** (`^section` inside the wikilink) are stripped from the resolved basename.

Both are strict bug-fixes; no existing test exercised either edge case, so the suite passes unchanged.

### Refactored sites

| File | Site | Change |
|---|---|---|
| `src/core/linker.ts` | `resolveParentBasename` (line ~349) | Body unchanged; calls now resolve to utility imports. |
| `src/core/linker.ts` | `linkChild` `canonicalizeWikilinkValue` call (line ~268) | Import re-pointed to utility. |
| `src/core/linker.ts` | Local `parseWikilinkBasename`, `canonicalizeWikilinkValue`, `basenameFromLinkpath` definitions | Deleted (87 lines). |
| `src/core/sub-scene-drafts.ts` | `resolveSubSceneDraftFilename` (line ~121) | `parseWikilinkBasename` now from utility. |
| `src/core/sub-scene-drafts.ts` | Local `parseWikilinkBasename` definition | Deleted (19 lines). |

Net: +133 lines (utility module), -119 lines across linker.ts and sub-scene-drafts.ts.

---

## Typed command-ID constants

### What landed

`src/commands/ids.ts` exports:

- **`COMMAND_IDS`** — `as const` object enumerating all 28 Draft Bench command bare IDs.
- **`CommandId`** — type alias `(typeof COMMAND_IDS)[keyof typeof COMMAND_IDS]`.
- **`runCommand(app, commandId)`** — invokes the command, centralizing both the plugin-ID prefix (`draft-bench:`) and the unsafe cast around `app.commands.executeCommandById`. Returns `boolean`.

### Decisions and deviations from the master plan

**`COMMAND_IDS` stores bare IDs; `runCommand` prefixes at invocation time.** The master plan didn't specify which form. Storing bare IDs lets the `addCommand` registration sites use the same constant as the invocation sites (Obsidian's `plugin.addCommand({ id })` takes the bare form; Obsidian prepends `draft-bench:` internally). Storing prefixed IDs would have required either a separate bare-ID constant or string-slicing in registration. Bare + prefix-at-invocation is cleaner.

**All 28 `addCommand` registrations updated, not just `register.ts`.** The master plan said "Update `src/commands/register.ts` to use these constants when registering," but `register.ts` is a pure dispatcher: it imports each command's `register<Name>Command()` helper and calls it. The actual `addCommand` calls live inside each command's file. Interpreting the plan's spirit as "registration sites use the constants," all 28 files received the same mechanical edit (bare string → typed constant + import). The change keeps the same single-source-of-truth invariant the plan intended.

**`runCommand` returns `boolean`, not `void`.** The plan's signature hint was `boolean`; both existing call sites (welcome-modal, manuscript-view) currently ignore the return value, but exposing it preserves Obsidian's API and lets future callers detect "command not found" cases.

### Refactored sites

| File | Site | Change |
|---|---|---|
| `src/commands/*.ts` (×28) | Each `addCommand({ id: '...' })` | Bare string → `COMMAND_IDS.X`; import added. |
| `src/ui/modals/welcome-modal.ts` | "Create your first project" button handler | Inline `this.runCommand('draft-bench:create-project')` → `runCommand(this.plugin.app, COMMAND_IDS.CREATE_PROJECT)`. |
| `src/ui/modals/welcome-modal.ts` | Private `runCommand` method | Deleted (8 lines). |
| `src/ui/manuscript-view/manuscript-view.ts` | `openCreateProjectCommand` (line ~660) | Inline cast → `runCommand(...)`. |
| `src/ui/manuscript-view/manuscript-view.ts` | `openImportFromScrivenerCommand` (line ~674) | Inline cast → `runCommand(...)`. |

Net: +140 lines (mostly the constants module + 28 import statements), -53 lines (removed inline casts and the welcome-modal local helper).

---

## Verification

All four gates pass on the final branch tip:

| Gate | Result |
|---|---|
| `npm run build` | EXIT=0; tsc + esbuild both clean. |
| `npm test` | 1360 / 1360 tests across 76 / 76 suites. No test modifications beyond import paths (zero in this phase — the tests didn't reference the deleted helpers). |
| `npm run lint` | 0 errors, 40 warnings. The 40 are pre-existing `prefer-create-el` / `prefer-active-doc` from the recommended config; tracked separately. |
| `npm run lint:css` | 0 errors. |

---

## Phase 4 implications

The `linker.ts` wikilink helpers are now in the utility module, so Phase 4's `src/core/linker/` split doesn't need to re-home them. The Phase 4 `wikilink-backfill.ts` submodule mentioned in the master plan imports from `src/core/frontmatter-wikilinks.ts`, not from `linker.ts` internals — which was the whole point of doing Phase 2 first.

---

## Status

Phase 2 complete. Ready for Phase 3 (bundle-size reduction). The Phase 2 wikilink utility is now a precondition met for Phase 4 (linker refactor).
