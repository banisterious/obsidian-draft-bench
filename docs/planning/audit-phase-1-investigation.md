# Audit Phase 1: Investigation

**Status:** Active
**Created:** May 11, 2026
**Branch:** `audit/phase-1-investigation`

The operational evidence base for Phases 2-5 of the audit. Produced by running the bundle-measurement tool in `scripts/audit/measure-bundle.mjs` and performing two targeted source surveys. No source code was modified during this phase; the deliverable is this document plus the (gitignored) raw measurement output.

The audit document referenced in the master plan is the primary reasoning source; this doc operationalizes its findings.

---

## Bundle measurement

`npm run build` produces a 5.7 MB `main.js`. The top contributors, ordered by share of the bundle:

| Module | Size | Share | Notes |
|---|---|---|---|
| `pdfmake/build/pdfmake.js` | 3.5 MB | 62.3% | PDF renderer. Loaded by `src/core/compile/render-pdf.ts`. |
| `pdfmake/build/vfs_fonts.js` | 834.9 KB | 14.4% | Roboto VFS that ships with pdfmake. Same loader. |
| `docx/dist/index.mjs` | 674.4 KB | 11.6% | DOCX builder. Loaded by `src/core/compile/render-docx.ts`. |
| `jszip/dist/jszip.min.js` | 154.1 KB | 2.7% | ZIP container. Loaded by `src/core/compile/render-odt.ts` (and transitively by `docx`). |
| `src/import/scrivener/import-wizard-modal.ts` | 48.7 KB | 0.8% | Largest single source file; entry of Scrivener import codepath. |
| `src/import/scrivener/import-write.ts` | 23.4 KB | 0.4% | Reachable only via the import command. |
| `src/core/linker.ts` | 22.9 KB | 0.4% | Subject of Phase 4's refactor. |

The four binary dependencies (pdfmake + vfs_fonts + docx + jszip) together account for **5.16 MB / 5.7 MB (90.4%)** of the bundle. The plugin's own source code is roughly 540 KB. Full ranked output (161 entries) lives in the regenerable `scripts/audit/bundle-report.txt`; run `node scripts/audit/measure-bundle.mjs` to recompute.

### Observations

The bundle's center of gravity is renderers, not application logic. Lazy-loading the four binary deps would reduce the initial bundle from 5.7 MB to roughly 550 KB, a ~90% reduction.

The Scrivener import tree is the second-largest non-renderer cluster (`import-wizard-modal.ts` + `import-write.ts` + neighbors total roughly 100 KB across `src/import/scrivener/`). Its entry point (`src/commands/import-from-scrivener.ts`) is statically imported by `src/commands/register.ts`, so the whole tree is reachable from plugin-startup.

`src/core/linker.ts` at 22.9 KB confirms the Phase 4 refactor's premise. The other notable individual modules (`manuscript-builder.ts` at 21 KB, `settings-tab.ts` at 18 KB, `manuscript-view.ts` at 15 KB, `integrity.ts` at 15 KB) are each large enough to deserve eventual attention but do not warrant a phase on their own.

---

## `executeCommandById` survey

Three call sites across two files. Two unique command IDs.

| Site | Command ID | Context |
|---|---|---|
| `src/ui/modals/welcome-modal.ts:69` (via wrapper at line 127) | `draft-bench:create-project` | Modal "Create your first project" button delegates through a private `runCommand(commandId: string)` method. |
| `src/ui/manuscript-view/manuscript-view.ts:671` | `draft-bench:create-project` | `openCreateProjectCommand()` private method in the manuscript view's empty state. |
| `src/ui/manuscript-view/manuscript-view.ts:682` | `draft-bench:import-from-scrivener` | `openImportFromScrivenerCommand()` private method in the manuscript view's empty state. |

Welcome-modal already isolates the unsafe `app.commands.executeCommandById` cast inside a single private `runCommand` helper; the manuscript view inlines the same pattern in two places without a wrapper. Phase 2's `runCommand` helper in `src/commands/ids.ts` (per the master plan) plus typed `COMMAND_IDS` constants should:

- Replace the two inline `executeCommandById` calls in `manuscript-view.ts` with `runCommand(app, COMMAND_IDS.CREATE_PROJECT)` and `runCommand(app, COMMAND_IDS.IMPORT_FROM_SCRIVENER)`.
- Update `welcome-modal.ts` to call the shared helper rather than its local copy; remove the local `runCommand` method.
- Add the two command IDs to `src/commands/ids.ts` (which will also enumerate every other registered ID for future call sites).

Total refactor scope: 3 call sites + 1 local-helper removal + 1 new constants file + 1 wrapper helper. Small.

---

## Wikilink-shape handling survey

Five categories of handling, all confined to two files (`src/core/linker.ts` and `src/core/sub-scene-drafts.ts`).

**`parseWikilinkBasename` — two distinct implementations.** Defined at [linker.ts:1026](../../src/core/linker.ts) and [sub-scene-drafts.ts:268](../../src/core/sub-scene-drafts.ts). The regexes are similar but not identical (`/^\[\[([^\]]+)\]\]$/` vs `/^\[\[(.+?)\]\]$/`), and the post-match handling diverges on how each strips pipes, hash anchors, and path separators. Phase 2's utility must reconcile these into one canonical implementation; this is the only place in the survey where behavior could subtly shift, so the test suite needs to cover both call paths before the merge.

**Call sites of `parseWikilinkBasename`:** [linker.ts:355](../../src/core/linker.ts) (inside `resolveParentBasename()`, used as a fallback when `frontmatterLinks` is empty) and [sub-scene-drafts.ts:121](../../src/core/sub-scene-drafts.ts) (inside `resolveSubSceneDraftFilename()`, extracting the scene basename from `dbench-scene` to prefix the draft filename).

**`canonicalizeWikilinkValue` — single definition, single call site.** Defined at [linker.ts:967](../../src/core/linker.ts); called at [linker.ts:268](../../src/core/linker.ts) inside `linkChild()`'s `processFrontMatter` callback to re-normalize a wikilink field after writing its ID companion, so the YAML serializer emits clean quoted form rather than block-style nested-array. Pure move into the utility.

**`frontmatterLinks` cache reads:** one site, at [linker.ts:350](../../src/core/linker.ts). The pattern is `cache?.frontmatterLinks?.find((l) => l.key === fieldName)` and it cascades to `parseWikilinkBasename` as fallback. The utility's `readWikilinkBasename(app, file, fieldName)` per the master plan would encapsulate exactly this cascade.

**Hand-parsed `[[Foo]]` regex sites:** both live inside the two `parseWikilinkBasename` implementations ([linker.ts:1029](../../src/core/linker.ts), [sub-scene-drafts.ts:270](../../src/core/sub-scene-drafts.ts)). Both move with their parent functions during the merge.

**Nested-array YAML detection blocks:** both live in `linker.ts` ([linker.ts:1035-1043](../../src/core/linker.ts) inside `parseWikilinkBasename`, [linker.ts:969-977](../../src/core/linker.ts) inside `canonicalizeWikilinkValue`). Same detection pattern duplicated across the two helpers; the utility can extract a private `isNestedArrayWikilink(value)` predicate and share it.

### Refactor scope summary

Net effect for Phase 2: create `src/core/frontmatter-wikilinks.ts` exposing `readWikilinkBasename` and `canonicalizeWikilinkValue`. Internally factor a shared nested-array detector. Update 3 call sites (one in linker.ts, one in sub-scene-drafts.ts, plus the existing canonicalize call in linker.ts). Delete the two `parseWikilinkBasename` definitions. Tests already cover the linker's wikilink handling end-to-end via the relationship-reconciliation suites; the sub-scene-drafts path needs verification that the merged implementation still produces the expected filename prefixes.

The two implementations' regex divergence is the only point of behavioral risk; reconcile before extracting.

---

## Dynamic-import recommendations for Phase 3

Recommended in priority order, each independently mergeable.

**1. pdfmake + vfs_fonts (4.3 MB savings, 76% of bundle).** Highest-impact lever by a wide margin. Convert [render-pdf.ts:1-2](../../src/core/compile/render-pdf.ts) from static imports to a dynamic-import wrapper invoked from inside the render function. The two modules must load together because `vfs_fonts` patches `pdfMake.vfs` at module-load time (the existing code does this once at startup; the dynamic version does it once per session on first compile). The codebase already documents this as a planned optimization in [render-pdf.ts:30-32](../../src/core/compile/render-pdf.ts).

**2. docx + jszip together (~830 KB savings).** The `docx` library transitively depends on `jszip` (DOCX is a ZIP container). Lazy-loading `render-docx.ts` would defer both. There is a subtlety: if both `render-docx` and `render-odt` are lazy-loaded independently, esbuild may emit two copies of `jszip` in the dynamic chunks (one for each entry point's transitive set). Worth verifying with the metafile output after Phase 3 lands; if duplication occurs, force a shared chunk for jszip via esbuild's `splitting` option or restructure the lazy entry points.

**3. jszip standalone for ODT (~154 KB savings).** Smaller win but mechanically the same dynamic-import pattern applied to [render-odt.ts:1](../../src/core/compile/render-odt.ts). Worth doing in the same phase as #2 to keep all three renderers consistent. Reconsider scope based on what the metafile shows about jszip's actual chunk placement after #2 lands.

**4. Scrivener import codepath (~100 KB savings, optional).** Lower-impact compared to the renderers but available. The lever is at [src/commands/import-from-scrivener.ts:4](../../src/commands/import-from-scrivener.ts): change the static import of `ScrivenerImportWizardModal` to a dynamic import inside the command callback. The whole `src/import/scrivener/` tree would migrate from the main chunk to a deferred chunk that loads on first invocation of the import command. Defer to Phase 3's discretion based on how the renderer changes affect overall bundle size.

If all four levers are pulled, the initial bundle drops from 5.7 MB to roughly 500 KB. Even the renderer-only changes (levers 1-3) get us to roughly 600 KB.

### UX consideration

Lever 1 alone shifts ~4.3 MB of disk read from plugin-startup to first PDF compile. On a slow disk that could be a 1-2 second perceptual hitch with no feedback. The master plan's Phase 3 scope already includes adding a status-line / Notice indicator for the dynamic-load window; Phase 3 should plan that UX work in tandem with the lazy-load itself, not as a follow-up.

---

## Additional findings

**No other static-imported binary dependencies were found.** The bundle measurement walks the dependency graph from `main.ts` outward; the four already identified (pdfmake, vfs_fonts, docx, jszip) are the only ones contributing more than 100 KB to the bundle. Phase 3 scope is exhausted by what's listed above; no surprise candidates to incorporate.

**`Packer` from `docx` is the only docx export consumed.** This means a tree-shaken dynamic import of just the `Packer` entry could potentially be smaller than the full `docx` chunk. esbuild's tree-shaking already runs in the static build; whether dynamic-import chunks tree-shake the same way is worth verifying empirically during Phase 3.

**The `obsidianmd/prefer-create-el` and `prefer-active-doc` lint warnings (40 total) are surfaced by the 0.2.9 plugin recommended config but not enforced by the review bot.** Not within audit scope, but worth a follow-up: either drop them to `off` and stop showing the warnings, or schedule a sweep PR to migrate the call sites. The master plan didn't address this; flagging for a future decision.

**`src/core/linker.ts` references in JSDoc comments throughout `src/`.** Phase 4's refactor splits `linker.ts` into a directory of submodules; the master plan's Phase 4 scope already calls out updating architecture.md and JSDoc comments, but a quick grep before Phase 4 starts will give an exact site list for that scope.

**`npm run lint:css` reports 1 preexisting error on `main`.** [styles/manuscript-builder.css:35](../../styles/manuscript-builder.css) targets Obsidian's built-in `.modal-close-button` class, which doesn't match the `selector-class-pattern` rule's allow-list (`markdown-`, `cm-`, `workspace-`, `view-`, `nav-`, `is-`, `mod-`). The selector itself is correct — it patches a z-index stacking issue on the Manuscript Builder modal — but `modal-` isn't in the allow-list. Fix is one of: extend the allow-list in `.stylelintrc.json` to include `modal-` (Obsidian uses it for modal-related built-in classes), or add a targeted `stylelint-disable-next-line` with a comment explaining the cross-cutting intent. Out of scope for Phase 1; flagging for a follow-up commit before Phase 2 starts so the gate is green for subsequent phases.

---

## Status

- Bundle measurement: ✅ complete (`scripts/audit/measure-bundle.mjs`).
- `executeCommandById` survey: ✅ complete (3 sites, 2 unique IDs).
- Wikilink-shape survey: ✅ complete (5 categories, 2 files).
- Dynamic-import recommendations: ✅ complete (4 levers prioritized).

This deliverable is ready for review. On merge to `main`, update the master plan's Phase 1 checkbox and unblock Phase 2.
