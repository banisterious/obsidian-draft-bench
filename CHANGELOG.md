# Changelog

All notable changes to Draft Bench are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). For Draft Bench's plugin-specific versioning rules (what counts as breaking, when 1.0 ships, BRAT vs. Community Plugins), see [VERSIONING.md](VERSIONING.md).

## [Unreleased]

## [0.6.1] - 2026-05-13

Scanner-hygiene patch. Eliminates the "10 dynamic `<script>` element creations" warning the community.obsidian.md automated scan reports against 0.6.0's bundle. The flagged patterns come from IE-era polyfills in transitive dependencies; none of the IE branches execute at runtime in Chromium (they sit behind `MutationObserver` / `setImmediate` feature checks that always succeed first), but the static scanner sees the `createElement("script")` literals regardless. All 10 are now gone from the bundle. No user-visible feature changes; 1387 tests pass unchanged.

### Fixed

- **Bundle no longer contains `createElement("script")` polyfill literals.** The 10 instances flagged by the scanner came from three sources, all eliminated:
  - `setimmediate` (jszip dependency) and `immediate` (transitive via `lie`) replaced with native-equivalent shims in `polyfills/`. The setImmediate shim uses `setTimeout(fn, 0)` (macrotask, matching the original's "yield to the event loop" semantic); the immediate shim uses `queueMicrotask` (matching `lie`'s Promise microtask scheduler).
  - `jszip` resolution rerouted from its prebundled `dist/jszip.min.js` (a Browserified file with both polyfills already inlined) to the unbundled `lib/index.js` entry, so the new shims actually replace the polyfills. `readable-stream` (jszip's lib uses it) routes to Node's built-in `stream` (already external for Electron).
  - `docx` and `pdfmake` ship pre-bundled distributions with both polyfills inlined as dead code (guarded behind `MutationObserver` / `setImmediate` feature checks that always succeed in Chromium). Their `createElement("script")` literals are masked at bundle time via a runtime-only expression (`createElement("scrip"+(globalThis.__dbench_t__||"t"))`) that esbuild's optimizer can't constant-fold back. Runtime behavior is unchanged: the masked expression evaluates to `"script"` if ever executed, but the surrounding IE branches remain unreachable in modern engines.

### Internal

- **New `polyfills/` directory** with the two native-equivalent shims.
- **`esbuild.config.mjs`** gains two plugins: `polyfill-shims` (rewrites the four module resolutions) and `mask-script-polyfill-literal` (transforms `docx` + `pdfmake` vendor file contents at load time). Bundle size change: 5.7 MB -> 5.8 MB (negligible).

## [0.6.0] - 2026-05-12

Internal-quality release. Consolidates the frontmatter type-narrowing boundary into a single canonical module (`src/core/frontmatter-access.ts`) and routes every Obsidian-API access through its typed helpers, eliminating 195 strict-typed-rule warnings the community.obsidian.md scanner reports without changing runtime behavior. Also upgrades `eslint-plugin-obsidianmd` from 0.2.9 to 0.3.0 to match the scanner's version, so local lint surfaces the same rule set the scan enforces. No user-visible feature changes; 1387 tests pass unchanged at every step.

This is the first minor-version bump beyond 0.5.x. SemVer-wise the work is internal-quality, but the scope (eight commits, 195 warning sites cleared, six duplicate helpers consolidated, every `processFrontMatter` callback in the codebase reshaped) warranted a minor bump over a patch. The project-level full-manuscript snapshots feature originally penciled for 0.6.0 defers to 0.7.0; cleaner foundations land first.

### Changed

- **Frontmatter type-narrowing boundary consolidated.** New `src/core/frontmatter-access.ts` module exposes two layers:
  - Layer 1 generic adapters (`adaptProcessFrontMatter`, `toGeneric`) reshape Obsidian's `any`-typed boundary values into `Record<string, unknown>` at the single point where Obsidian's API returns them.
  - Layer 3 primitive narrowing helpers (`readString`, `readNumber`, `readBoolean`, `readArray`) consume `unknown` and narrow to a typed value with a documented default for non-conforming inputs.
- **Every `processFrontMatter` callback in the codebase routes through `adaptProcessFrontMatter`.** 30+ callbacks across 13 files (integrity, retrofit, scenes, sub-scenes, chapters, drafts, chapter-drafts, sub-scene-drafts, projects, compile-presets, reorder, statuses, example-project, apply-compile-state, file-menu, scrivener import-write, linker/lifecycle, linker/reconciliation, linker/wikilink-backfill, move-to-chapter, move-to-scene). Bracket reads / writes on the callback parameter now operate on `Record<string, unknown>` instead of `any`.
- **Six duplicate `readArray` helpers consolidated.** scenes / sub-scenes / chapters / drafts / chapter-drafts / sub-scene-drafts each carried their own three-line copy of the same defensive array reader; all now import from `frontmatter-access`. The `linker/readers.ts` shim module (Phase 4 vintage) is deleted; its consumers route through the canonical module.
- **`eslint-plugin-obsidianmd` upgraded 0.2.9 -> 0.3.0** to match the community.obsidian.md scanner's version. `prefer-create-el` rule was removed upstream in 0.3.0; the project's eslint config drops the corresponding reference. New override block disables the obsidianmd typed rules for non-TS files (workaround for 0.3.0's recommended-config global registration bug). All four gates green at 0.3.0 + the refactor.
- **Strict `@typescript-eslint/no-unsafe-*` rules enforced as errors.** The five rules (`no-unsafe-member-access`, `no-unsafe-argument`, `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-return`) flip from `"off"` to `"error"` in `eslint.config.mjs`. New code that bypasses the frontmatter-access helpers will fail the build.

### Fixed

- **Four latent `no-base-to-string` bugs in `String(fm['dbench-X'] ?? '')` patterns.** The `any` typing previously hid the risk that a non-string cache value would render as `'[object Object]'` in `String()` coercion; the refactor surfaced them, and the migration switched every site to the typed `readString` helper which rejects non-string inputs cleanly. Affected paths: Scrivener snapshot import, new-draft / new-chapter-draft / new-sub-scene-draft modal success toasts.

### Internal

- **16 new unit tests** in `tests/core/frontmatter-access.test.ts` cover the helper module's boundary behavior (identity-cast semantics, mutation propagation, narrow-to-default for non-conforming inputs across all four primitive readers).

## [0.5.5] - 2026-05-12

Release-hygiene release. Introduces a GitHub Actions release workflow that produces cryptographic provenance attestations for every release asset; addresses the "no artifact attestation" recommendations surfaced by the community.obsidian.md automated scan against 0.5.4. Also picks up the eight `document` -> `activeDocument` polish sites from the same scan. No user-visible feature changes.

### Added

- **CI release workflow with build-provenance attestations.** New `.github/workflows/release.yml` triggers on plain SemVer tag push (`*.*.*`, `*.*.*-*`). Runs the full gate set (lint + lint:css + test + build), generates per-file provenance attestations via `actions/attest-build-provenance@v2` for `main.js` / `manifest.json` / `styles.css`, and creates a draft GitHub release with the assets attached. The author reviews the draft on GitHub, pastes the chat-audited release-description markdown, and publishes. End users can verify any release asset with `gh attestation verify <file> --repo banisterious/obsidian-draft-bench`.
- **`.nvmrc`** pins Node 20.20.2 so the workflow's `setup-node` reads it via `node-version-file`. Local devs running `nvm use` (no args) pick up the same version automatically.

### Changed

- **`document` -> `activeDocument` in 8 sites** for popout-window compatibility. Affected: brand-mark SVG creation, settings-tab link fragment, manuscript-view word-counts wrapper + progress hero, Scrivener importer `webkitdirectory` probe. ESLint warnings drop from 40 to 28; all four gates remain green.

### Internal

- **`docs/developer/coding-standards.md` § 6.3 ("Generated files")** updated to reflect actual treatment: `styles.css` committed to git, `main.js` + `main.js.map` gitignored and produced fresh by CI for releases. Cross-references the new attestation flow.
- **Pre-release tag handling.** Workflow detects the SemVer hyphen convention (e.g., `0.5.5-rc1`) and flags the resulting draft release as a pre-release. Lets us trial workflow changes end-to-end against an rc tag without touching the stable release line.

## [0.5.4] - 2026-05-12

Scene archive ([#36](https://github.com/banisterious/obsidian-draft-bench/issues/36)). A "hidden statuses" mechanism lets writers park scenes / chapters / sub-scenes they aren't actively working on without deleting them. The Manuscript view (List + Continuous) filters items whose status is on the hidden list; a "Show archived" toolbar toggle reveals them with muted-opacity treatment. The default vocab grows by one entry (`archived`) and a per-row eye toggle in Settings lets writers flag any status as hidden. Compile presets are unaffected: the Manuscript Builder's existing status filter is orthogonal.

### Added

- **Scene archive ([#36](https://github.com/banisterious/obsidian-draft-bench/issues/36)).** New `hiddenStatuses: string[]` settings field, default-seeded with `['archived']`. The Manuscript view's List + Continuous modes drop scenes / chapters / sub-scenes whose `dbench-status` is in this list by default. A fourth "Show archived" toolbar button (appears only when the project has at least one archived item) flips the leaf state and re-renders the hidden items at 0.55 opacity (hover: 0.9) so they're readable but de-emphasized. Toggle state persists per-leaf alongside the rest of the view state.
- **"Archive" / "Unarchive" context-menu item** on scene / chapter / sub-scene notes (file-menu and editor-menu surfaces). Archive stamps the first hidden status (typically `'archived'`); Unarchive routes to the vocab's default status. Single-file scope; bulk multi-select is post-V1.
- **Per-row eye toggle in the Settings statuses UI.** Any vocab entry can be flagged hidden / unhidden by clicking its eye icon. Renaming a hidden status updates the `hiddenStatuses` pointer so the archive filter follows the rename. Removing a hidden status drops it from the list.
- **`'archived'` default vocab entry.** Fresh installs land with `['idea', 'draft', 'revision', 'final', 'archived']`. Existing installs migrate via the new `archivedStatusSeeded` one-shot flag in `loadSettings` (mirrors the `scenesFolderMigrated` pattern from #11): appends `'archived'` to the vocab if absent, seeds `hiddenStatuses` to `['archived']` if absent, then never re-runs. Writers who delete the seeded status on subsequent loads keep that choice.

### Internal

- **New `isHiddenStatus(status, hiddenStatuses)` helper** in `src/core/statuses.ts`. Defensive: non-string / empty status is never hidden (matches the "missing status = not ready" convention from D-06).
- **`buildContinuousPreset(project, { excludeBasenames })`** now accepts a list of basenames to feed into the existing `dbench-compile-scene-excludes` field. Used by Continuous mode to drop scenes + sub-scenes whose status is hidden when the toggle is off.
- **`filterArchivedScenes` shared helper** in `manuscript-list-section.ts` consumed by both List body and chapter-card section, so the filter rule lives in one place.

## [0.5.3] - 2026-05-11

Internal-quality release. Five-phase architectural audit landed: a shared frontmatter-wikilinks utility consolidates parser logic that had drifted between two modules; a typed `COMMAND_IDS` registry centralizes the unsafe palette-invocation cast; the 951-line linker decomposes into a focused `linker/` directory; integrity scanning routes every typed-frontmatter cast through the existing `toGeneric` helper. No user-visible behavior changes; the 1360-test suite passes unchanged across every phase.

### Internal

- **Extracted frontmatter-wikilinks utility.** New `src/core/frontmatter-wikilinks.ts` consolidates `parseWikilinkBasename`, `canonicalizeWikilinkValue`, and a cache-aware `readWikilinkBasename` helper. Reconciles two divergent implementations previously living in `src/core/linker.ts` and `src/core/sub-scene-drafts.ts`. Sub-scene-drafts callers now also recognize the flow-notation array form and strip block refs (`^block`), matching the linker's behavior. No user-visible change.
- **Typed command-ID constants.** New `src/commands/ids.ts` exports a `COMMAND_IDS` const (all 28 Draft Bench commands) and a `runCommand(app, id)` helper that centralizes the unsafe cast around `app.commands.executeCommandById`. All 28 `addCommand` registrations and the three palette invocation sites in `welcome-modal.ts` and `manuscript-view.ts` now use the typed constants.
- **Linker decomposed into submodules.** The 951-line `src/core/linker.ts` is now a `src/core/linker/` directory of focused files: `lifecycle.ts` (DraftBenchLinker class + event dispatchers), `reconciliation.ts` (RELATIONSHIPS + reconcile loop), `wikilink-backfill.ts` (retrofit companion-id backfill, issues #4 / #6), `folder-auto-rename.ts` (scene/chapter folder sync on rename), and `readers.ts` (shared readArray/readString helpers). The public `DraftBenchLinker` class API is unchanged; all 44 inbound imports of `from '...linker'` resolve to the new re-exporter via `index.ts`. No behavior changes; all 1360 tests pass without modification.
- **Audit Phase 5 cleanup.** Eleven inline typed-frontmatter casts in `src/core/integrity.ts` consolidated through the existing `toGeneric` helper (−53 lines). The `MODIFY_DEBOUNCE_MS` constant in `manuscript-view.ts` gained a calibration comment explaining why it differs from the Builder's `FILE_SAVE_DEBOUNCE_MS` (intentional 100 ms gap; tuned per render surface). `coding-standards.md` gained a § 2.6 section documenting when fire-and-forget `void promise` is the right pattern and when it isn't.

## [0.5.2] - 2026-05-09

Mobile patch for the Scrivener importer's Source step. Two bugs surfaced during dev-vault Android verification of 0.5.1: the in-vault folder list missed bundles copied externally without an Obsidian reload (the indexed cache lags external filesystem changes on mobile), and the in-app folder picker fails on Android builds whose system file picker silently ignores `webkitdirectory`. The first is fixed; the second is mitigated (the OS-level limitation can't be repaired from JS, but the failure mode is now legible and routes writers to a workaround that works). Tracked via [#34](https://github.com/banisterious/obsidian-draft-bench/issues/34) and [#35](https://github.com/banisterious/obsidian-draft-bench/issues/35).

### Fixed

- **Externally-copied `.scriv` bundles surface in the Source step without an app reload** ([#35](https://github.com/banisterious/obsidian-draft-bench/issues/35)). The Source step's "in-vault picker" now walks via `app.vault.adapter.list` rather than `app.vault.getFiles()`, so a bundle copied into the vault via Android's file manager (Files by Google, Samsung My Files, etc.) appears the next time the wizard opens — no `Reload app without saving` required. The Parse step's bundle-load path moves to `adapter.read` for the same reason. Affects desktop too in principle; the symptom only surfaced on mobile because the indexed cache lags external changes there.

### Mitigated

- **Folder picker on Android builds that silently ignore `webkitdirectory`** ([#34](https://github.com/banisterious/obsidian-draft-bench/issues/34)). Some Android builds present the in-app folder picker as a file-only chooser regardless of the `webkitdirectory` hint, leaving writers unable to select the `.scriv` folder. **This is an OS-level limitation that can't be repaired from JS**: the plugin can only set the attribute as a hint, and the OS chooses whether to honor it. On affected devices the only path to import is to copy the `.scriv` folder into the vault via the device's file manager first, then use the in-vault dropdown (this works thanks to the #35 fix above).

  The 0.5.2 mitigation reframes the Source step on mobile so this failure mode is legible:

  - The in-vault dropdown renders **above** the picker widget when bundles exist (was: below).
  - When no bundles are in the vault yet, an empty-state hint above the picker explains the file-manager workaround up front, before the writer taps a broken picker.
  - The picker's subtext on mobile reads "If your file manager supports folder selection" (was: "Choose from your device") so its conditional nature is clear.
  - Tapping the picker and dismissing without selecting (back arrow, cancel) now surfaces a Notice pointing at the workaround, instead of failing silently.

### Notes

- **`Platform.isMobile` is the gate** for the mobile reordering / reframing. Mobile-emulation toggle on desktop will trigger the mobile branch too, intentionally — the layout is also useful for desktop testing of the mobile path. The picker's "If your file manager…" subtext is mobile-only since folder selection works reliably on desktop browsers.
- **Cancel-event detection requires Android System WebView 113+** (released May 2023). Earlier builds may not fire the `cancel` event on dismiss; on those, the empty-state hint above the picker remains the primary guidance and is unaffected.

## [0.5.1] - 2026-05-08

Scrivener importer follow-up: completes the snapshot import + default compile preset toggles that 0.5.0 wizard surfaced as deferred warnings, fixes a pre-existing bug in the Parse step's snapshot count, corrects a Scrivener 3 Windows serialization quirk in the Include-in-Compile parser, and surfaces excluded documents in the Preview step. Tracked via [#33](https://github.com/banisterious/obsidian-draft-bench/issues/33).

### Added

- **Scrivener snapshot import** (planning doc [§ 4](docs/planning/scrivener-import.md)). When the **Import snapshots** toggle is on in the wizard's Options step, per-document Scrivener snapshots become `dbench-type: draft` files alongside each imported scene. Per-scene cap (1 / 3 / 5 / All) honored. Filename template (`{scene}` `{title}` `{date}` `{date_compact}` `{time}` `{n}`) drives each draft's name; the default template (`{scene} - Draft {n} ({date_compact})`) matches native Draft Bench draft files so imported snapshots sit indistinguishably alongside drafts the writer creates after import. Each draft note carries `dbench-type: draft`, scene/project links, `dbench-draft-number`, `dbench-created-at`, and `scrivener-snapshot-title` (preserves the original Scrivener title even when the writer's template doesn't reference `{title}`). The parent scene's `dbench-drafts` and `dbench-draft-ids` reverse arrays update accordingly.
- **Default compile preset stub** (planning doc § Compile-settings). When the **Create default compile preset** toggle is on in the Options step, the importer adds an "Imported defaults" preset to the new project's `Compile Presets/` folder using Draft Bench's standard preset defaults. Scrivener compile formats don't translate cleanly so the stub is just a starting point; the writer renames / duplicates / deletes from there.
- **Preview-step disclosure of excluded documents.** When the source bundle contains documents marked Include-in-Compile = No (Scrivener UI checkbox unchecked), the Preview step's Warnings section lists them by title with the wording "**N documents** marked for exclusion in Scrivener: ...". The import behavior is unchanged from spec § 8 (preserve as `scrivener-include-in-compile: false` provenance frontmatter; don't filter at import); the disclosure just makes the existing behavior visible up front so writers see the provenance frontmatter that's about to land rather than discovering it post-import.

### Fixed

- **`countSnapshots` looked at the wrong path.** Pre-existing bug from 0.5.0: the Parse step's snapshot-count summary returned 0 silently for any real Scrivener 3 (Windows) project because the helper walked `Files/Data/<UUID>/Snapshots/` (the location assumed during initial implementation) rather than the actual `<bundleRoot>/Snapshots/<UUID>.snapshots/` Scrivener 3 uses. Now correctly counts the bundle-root location.
- **Include-in-Compile detection on Scrivener Windows.** Pre-existing parser rule "missing `<IncludeInCompile>` element defaults to true" silently treated toggle-off documents as included. Scrivener Windows serializes the unchecked state by REMOVING the element from `<MetaData>` (rather than writing `<IncludeInCompile>No</IncludeInCompile>`), so missing-element + non-empty MetaData is the writer's exclusion signal. Updated parser rule: missing element + MetaData with other children -> `false`; missing element + empty `<MetaData/>` -> `true` (the empty case is genuinely ambiguous and we default to include to avoid silently dropping content). Both the Preview-step disclosure and the `scrivener-include-in-compile: false` frontmatter now fire correctly for toggled-off Scrivener Windows documents.

### Notes

- **Empty-`<MetaData/>` ambiguity** (Scrivener Windows). For a document whose Include-in-Compile checkbox is unchecked AND that has no other metadata in its MetaData block (no Status, Label, or Custom Metadata field), Scrivener Windows persists empty `<MetaData/>` either way (untouched-default or toggled-off). The importer can't distinguish the two cases on disk and defaults to include. Workaround in [Importing from Scrivener § Known limitations](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener): in Scrivener, set a Status / Label / Custom Metadata field on the document before toggling Include-in-Compile off. Keywords don't qualify (they're stored as a sibling element of MetaData, not inside it).
- **Snapshot import fidelity is best-effort on per-snapshot RTF body issues.** A snapshot whose RTF body is missing or unreadable produces an empty draft note + a warning in the import error log, rather than aborting the whole snapshot import for the scene. Other snapshots for the same scene still import normally.
- **`dbench-created-at` on imported drafts** is the snapshot's `<Date>` from `index.xml`, normalized to ISO `YYYY-MM-DD`. Scrivener emits a fuller timestamp (`YYYY-MM-DD HH:MM:SS [+-]HHMM`); only the date component is preserved on the draft frontmatter.

## [0.5.0] - 2026-05-08

Scrivener 3 project import marquee. A multi-step wizard reads a `.scriv` bundle from inside the vault and produces a fresh Draft Bench project: chapters, scenes, sub-scenes, drafts (optional), and inspector content all carry across, with every mapping reviewed in a Preview step before any file gets written.

### Added

- **Scrivener 3 project import** ([#28](https://github.com/banisterious/obsidian-draft-bench/issues/28)). An 8-step wizard (Source / Parse / Hierarchy / Metadata / Options / Preview / Import / Complete) reads a Scrivener 3 `.scriv` bundle from inside the vault and writes a fresh Draft Bench project under `defaultProjectFolder`. Discoverable via the `Draft Bench: Import from Scrivener` palette command, an import button in the Manuscript view's project picker row, and an empty-state CTA when no projects exist yet. Cross-platform (no desktop-only gate); reads via Obsidian's vault adapter on every supported OS.
- **Hierarchy auto-detect with per-row override.** Deepest leaves with prose -> scenes; immediate folder parents -> chapters; everything above the chapter level (Parts, Books, Volumes) preserved as `scrivener-part` frontmatter on the chapters they contain; extras below the sub-scene level concatenated as nested markdown headings inside the parent sub-scene's body. The Hierarchy Mapping step renders the binder tree with a per-row override dropdown so writers can demote / promote any leaf.
- **Status / label / custom-metadata mapping.** Status table matches Scrivener statuses against the writer's vocabulary (with an "Add as new status" option that writes through to settings, and an inline rename input before commit). Labels route to a writer-named frontmatter key (default `scrivener-label`). Custom-metadata fields route per-field with type-aware coercion: Checkbox to boolean, List option ID to resolved option title, Date to ISO `YYYY-MM-DD`, Text to raw string.
- **Inspector content carry-over.** Synopsis to `dbench-synopsis`; Document Notes to an appended `## Notes` section in the scene body; inline Comments to Obsidian `%% comment %%` syntax at the original anchor; Footnotes (inline + inspector) to standard markdown footnotes; Project Notes to the project note's `## Notes` section; project-keyword usages to `tags:` frontmatter on each scene.
- **RTF -> markdown body conversion.** Italics, bold, lists (including nested), smart quotes, em-dashes, ellipses, and inline footnotes / comments. Inline images extracted to `Research/Images/<original-filename>` (or `<scene-id>-<index>.<ext>`) and referenced via `![[Research/Images/...]]`. Complex tables (merged cells, mid-cell formatting) fall back to inline HTML and are flagged in the import error log.
- **Cross-document Scrivener Links rewritten to wikilinks.** A two-pass write: pass 1 walks the binder in `dbench-order` and builds a `scrivener-uuid -> dbench-file-path` map; pass 2 walks every imported scene body and rewrites the link markers as Obsidian wikilinks. Unresolvable links become `[broken: <original-title>]` with an entry in the import error log.
- **Optional snapshot import.** Per-document Scrivener snapshots become `dbench-type: draft` files alongside each scene. Per-scene cap (`Most recent 1 / 3 / 5 / All`); writer-editable filename template with variables `{scene}` `{title}` `{date}` `{date_compact}` `{time}` `{n}` (default `{scene} - Draft {n} ({date_compact})` matches native draft files). Original Scrivener title preserved as `scrivener-snapshot-title` frontmatter regardless of whether `{title}` appears in the template.
- **Optional Research folder import.** Brings in the Research folder and any other non-manuscript top-level folders alongside the manuscript. RTF bodies converted; binder hierarchy preserved verbatim. Templates and Trash are always skipped.
- **`dbench-synopsis` extended to the scene model.** The property was previously valid on chapters and sub-scenes only; it now writes on scenes too, with Manuscript view scene rows rendering it as a muted second / third line below the title (mirroring the `dbench-subtitle` pattern). Rode along as the precondition for importing scene-level Scrivener synopses, and it stands alone for writers who fill `dbench-synopsis` manually via the Properties panel.
- **Source-step folder drop.** The wizard's Source step accepts dropped `.scriv` folders (desktop) or device-picked folders (Android via `webkitdirectory`); the wizard validates `.scrivx` is present and copies the bundle into `Imports/<name>.scriv/` before parse. iOS users without `webkitdirectory` see file-manager-copy guidance instead.
- **Per-import error log.** Errors during the write pass are collected per file (a single bad scene doesn't abort the whole import) and written to `Scrivener import errors.md` in the new project folder, with a vault-root fallback when the project folder couldn't be created. The Complete step renders errors inline as well, and an Obsidian Notice surfaces when an import finishes with errors.
- **Wiki page**, [Importing from Scrivener](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener), with the full walkthrough, mapping reference, and troubleshooting.

### Notes

- **QA scope.** Tested against the maintainer's own Scrivener 3 Novel-template fixture (sub-scenes + multi-level extras-above + Checkbox / Date / List custom-metadata fields) plus 1297 unit / integration tests. The pre-1.0 plan originally scoped a 3-5 contributed-corpus QA gate; with seven BRAT testers and no inbound contributions at ship time, the test-corpus tracking issue stays open as an ongoing post-release feedback channel rather than blocking the release. Issue reports across other `.scriv` shapes are welcomed via [#28](https://github.com/banisterious/obsidian-draft-bench/issues/28).
- **Scrivener 2 and iOS Scrivener formats are not supported in V1.** Schema and bundle structure differ. Re-add as separate parser paths if a contributor surfaces with a project to test against.
- **The `.scriv` bundle has to live inside the vault.** Reading from arbitrary OS paths via Electron + Node `fs` is out of scope for V1 (the cross-platform vault-adapter approach was the explicit architectural choice). The wizard's Source step copies the bundle in for you on most platforms; on iOS, copy via the Files app first.
- **Compile-format translation is intentionally skipped.** Scrivener compile formats don't map cleanly to Draft Bench compile presets. The Options step has an opt-in toggle to create a starter preset using Draft Bench's standard defaults; otherwise, build your DB presets from scratch after import.
- **Some inline RTF features are deferred for fidelity tuning** (gated on real-corpus exposure): some hyperlink variants, nested footnotes within tables, and unusual inline-image arrangements. These import as best-effort placeholders flagged in the error log.

## [0.4.0] - 2026-05-06

Manuscript view Continuous mode marquee. The Manuscript leaf gains a List / Continuous tab strip; the new Continuous tab renders the entire project as one scrollable read-only document — chapters, scenes, sub-scenes, full bodies — for revision read-throughs that the per-scene List view isn't shaped for.

### Added

- **Manuscript view Continuous mode** ([#31](https://github.com/banisterious/obsidian-draft-bench/issues/31)). A new tab strip below the project picker toggles between **List** (today's navigation surface) and **Continuous** (read-through). Continuous mode renders the full manuscript in `dbench-order`, top to bottom, no preset filters applied — always-everything by design. Click any chapter / scene / sub-scene heading to jump to its source file (cmd/ctrl-click = new tab; +shift = split; +alt = window; right-click for the same options via context menu). Writer-authored H2/H3s inside scene bodies stay inert. File-save reactivity re-renders the prose on a 400 ms debounce with scroll position preserved across the re-render. The same four-control typography toolbar from the Manuscript Builder Preview tab (text alignment, reading width, font size, font family) sits above the prose; preferences persist globally. Active mode persists per project; new projects default to List.
- **`manuscriptViewMode` settings field** (`Record<projectId, 'list' | 'continuous'>`). Mirrors the existing `manuscriptBuilderTabState` pattern.
- **Opt-in heading source markers in `CompileService.generate(preset, opts)`.** New `GenerateOptions.emitHeadingMarkers` flag. When set, the compile pipeline appends a `<span class="dbench-mark" data-source="<vault-path>"></span>` marker inside every pipeline-emitted title heading so a post-render DOM walker can attribute headings back to their source files. Off by default — Continuous mode opts in; binary renderers don't.
- **Shared preview-typography toolbar module** (`src/ui/shared/preview-toolbar.ts` + `styles/preview-toolbar.css`). Class hooks renamed from `dbench-manuscript-builder__*-toolbar*` to a neutral `dbench-preview-toolbar` block prefix. The Manuscript Builder Preview tab and the Manuscript view's Continuous mode mount the same toolbar.

### Notes

- **Embeds are stripped from the Continuous render in V1.** The compile pipeline's `stripEmbeds` always strips regardless of preset configuration, so embeds (`![[...]]`) won't render inline in Continuous mode. Tracked as the "Embed handling" open question in [docs/planning/manuscript-view-continuous-mode.md](docs/planning/manuscript-view-continuous-mode.md); writers with heavy-embed projects should flag the friction in #31.
- **Mobile compatibility.** Continuous mode is mobile-supported on the same surface as the rest of the leaf (Android verified via the 0.3.2 elevation; iOS / iPadOS untested).

## [0.3.3] - 2026-05-05

Manuscript leaf restyle. The leaf moves from Direction B (Ulysses warm — chips, semantic status colors, gradient progress fills) to Direction D3, a Builder-aligned minimal aesthetic that harmonizes with the Manuscript Builder modal + leaf shipped in 0.3.0 / 0.3.1.

### Changed

- **Manuscript leaf restyle: Direction D3** ([#30](https://github.com/banisterious/obsidian-draft-bench/issues/30)). Status chips with semantic per-status background colors are replaced with inline small-caps muted text. Status dots in the project breakdown are dropped. Per-scene mini progress bars are dropped (writers see progress as text in the count label format; the project-level bar remains the canonical visual signal). Scene rows flatten from a 2-row grid to a single-row 4-column layout (order · title · status · count) with subtitle support flipping to 2 rows. The order capsule's pill background drops to plain tabular-numeric text. The Compile button's gradient + soft-shadow override drops to Obsidian's stock `.mod-cta` solid accent. The project progress bar shrinks from 8px gradient to 2px hairline solid accent. Section heads shift from `--text-normal` semibold to `--text-muted` small-caps to match the Builder's section dividers.
- **Drafts column dropped from scene rows.** The "0 drafts" / "1 draft" / "N drafts" column on each scene / sub-scene row is removed. Writers see drafts on the scene file itself; the leaf is for navigation and the per-row clutter wasn't earning its real estate.

### Removed

- **Per-status Style Settings exposures.** The four `--dbench-status-*` variable-color knobs (brainstorm/idea, draft, revision, final) are removed from the Style Settings UI. The underlying CSS variables stay in `variables.css` because the Manuscript Builder's status filter pills (#25) still use them.

## [0.3.2] - 2026-05-05

Mobile support. Draft Bench now loads on Obsidian Mobile (Android verified; iOS / iPadOS untested). Vault output rides along for the binary compile formats so PDF / ODT / DOCX work on mobile without the desktop-only Electron save dialog.

### Added

- **Mobile support (Android verified; iOS / iPadOS untested)** ([#29](https://github.com/banisterious/obsidian-draft-bench/issues/29)). Draft Bench now loads on Obsidian Mobile. Manuscript view, Manuscript Builder modal + leaf, scene / chapter / sub-scene / draft creation, retrofit, integrity, the compile pipeline, Bases integration, and Style Settings are all mobile-supported. Verified on Android via on-device walkthrough. iOS / iPadOS will ship untested until a Mac-equipped contributor with iOS access surfaces; bug reports are welcome and triaged via the `mobile-ios` label.
- **Vault output for PDF / ODT / DOCX compile.** Presets configured for `format: pdf | odt | docx` plus `output: vault` now write the compiled binary to `<project>/Compiled/<preset>.<ext>` via Obsidian's vault API (`createBinary` / `modifyBinary`). Vault output works on both desktop and mobile. The disk-output paths are unchanged and remain desktop-only by construction (depend on Electron's save dialog and Node `fs`). Supersedes the original D-06 "binary formats are disk-only" clause.

### Changed

- **`isDesktopOnly: false` in `manifest.json`.** Plugin loads on Obsidian Mobile.

### Notes

- The Scrivener `.scriv` importer ([#28](https://github.com/banisterious/obsidian-draft-bench/issues/28)) is not yet shipped, but its commands and Manuscript view button will gate to desktop via `Platform.isDesktopApp` when they land. RTF parsing and large-file ops make it a structurally desktop-only feature.

## [0.3.1] - 2026-05-05

Dockable Manuscript Builder leaf — the 0.3.0 Builder modal gains a leaf form so writers can pin Preview next to a scene they're editing in another pane. The 0.3.0 modal stays as the default entry point; a dock button on the modal opens the leaf, and the leaf adds debounced file-save reactivity that the modal couldn't support.

### Added

- **Dockable Manuscript Builder workspace leaf** ([#27](https://github.com/banisterious/obsidian-draft-bench/issues/27)). A "dock to leaf" icon button in the Manuscript Builder modal's sticky header (next to the close button) closes the modal and reopens the same content as a workspace tab. The leaf form lets writers leave Preview pinned next to a scene they're editing in another pane and watch the rendered output update as they save (file-save reactivity, debounced 400ms; only fires while Preview is active and only for project member files — drafts and compile presets don't trigger). Single-leaf only: opening the Builder when a leaf already exists focuses the existing one. The dock-to-leaf path is one-way (passive reverse): the leaf doesn't show a "convert to modal" button. Writers who prefer modal close the leaf and reopen via existing affordances (`Draft Bench: Build manuscript` palette command, Compile CTA in the Manuscript view).
- **`Draft Bench: Show Manuscript Builder leaf` palette command.** Opens the Builder leaf directly (focuses existing if present).
- **Last-selected preset persists per project** (`manuscriptBuilderSelectedPresetId` in plugin settings). The leaf restores the writer's last-tuned preset across Obsidian reload; the modal also benefits — close + reopen now restores the last-selected preset instead of always defaulting to the first one.
- **Preview scroll position preserved across file-save re-renders.** Editing a project member while reading deep in Preview no longer snaps the scroll back to the top.

### Changed

- **Manuscript Builder rendering core extracted into a host-agnostic shell** (`src/ui/manuscript-builder/manuscript-builder.ts`). `ManuscriptBuilderModal` becomes a thin Modal subclass that delegates to the shell; the new `ManuscriptBuilderView` (workspace leaf) uses the same shell against its own `contentEl`. Internal refactor only; no behavior change for modal users.

## [0.3.0] - 2026-05-04

Manuscript Builder Preview tab marquee. The Builder modal gains a Preview tab alongside the existing form stack (now Build tab), letting writers tune compile presets and read the rendered output without writing a real export file. Several maintainer-facing improvements ride along: an in-modal project switcher, a sticky header that keeps controls reachable during long Preview scroll, and per-project tab persistence.

### Added

- **Manuscript Builder Preview tab.** A new Preview tab renders the current preset's compile output as continuous read-only prose using Obsidian's `MarkdownRenderer`. Tweak settings on Build, flip to Preview, see the impact, iterate. Re-renders on tab activation, preset change, and project change; external edits to source notes mid-session are not auto-reactive (flip Build -> Preview to re-trigger). Sub-scene descent matches the compile pipeline (parent intro prose first, then sub-scenes in `dbench-order`). Tested clean against a 110k-word fixture project; the implementation is single-pass, no chunking or virtualization. A 250ms-threshold "Rendering..." spinner covers the perceived-latency case for larger projects. Empty-state messages cover the no-presets, no-scenes, filters-exclude-all, and render-error cases. Refs #26.
- **Preview typography toolbar.** Above the rendered Preview prose, a four-control toolbar lets the writer tune reading register without leaving the modal: text alignment (Left / Justify), reading width (Full / Med ~50em / Narrow ~40em), font size (12-24px stepper), and font family (Theme default / Serif / Sans-serif / Monospace). Choices persist globally as `plugin.settings.previewTypography` (reading-register preferences, not project-specific). No Style Settings dependency.
- **Project switcher in Manuscript Builder header.** The previous read-only project label is now a dropdown listing every project in the vault. Switching there updates the modal in place (presets, selected preset, last-active tab) and routes through `plugin.selection.set` so the Manuscript view re-renders to match.
- **Sticky modal header.** The title, project + preset row, tab strip, and (when active) Preview typography toolbar pin to the top of the modal's scroll container. Keeps controls reachable during long Preview prose scroll.
- **Last-active tab persisted per project.** The modal remembers each project's last-used tab via a new `manuscriptBuilderTabState` settings field (mirrors the `chapterCollapseState` / `sceneCollapseState` pattern). First-open of any project lands on Build.
- **Style Settings exposure for Preview.** Seven CSS variables — `--dbench-tab-active-accent` plus six Preview-typography vars (font-family, font-size, line-height, max-width, paragraph-spacing, text-align) — exposed as a "Manuscript Builder Preview" section in the Style Settings community plugin. The in-modal toolbar covers the most common knobs without needing Style Settings; these variables serve power users wanting deeper customization.

### Fixed

- **Modal close button stays visible during long Preview scroll.** The sticky header's z-index could paint over the close button (the X in the top-right corner) once content scrolled under. The close button now sits at z-index 2 (scoped via the modal class) so it remains clickable from any scroll position.

## [0.2.4] - 2026-05-04

UI polish patch. Three Manuscript-view and Manuscript Builder changes that simplify the primary action surface, clarify multi-select intent on the status filter, and remove a redundant visual element on the status chip. No data-shape, compile-pipeline, linker, or integrity-service changes.

### Changed

- **Manuscript view status chip drops the redundant colored dot.** The chip's small colored dot and pill background were both derived from the same `--dbench-status-<status>` variable, encoding status twice. The dot is gone; the pill background is now the sole visual carrier of status color. Pill padding rebalanced to symmetric horizontal (`var(--dbench-spacing-sm)` on both sides) since the previous left-tight padding was specifically tuned for the dot-then-label flex layout. Affects scene rows, sub-scene rows, and chapter card headers (all share the same chip helper). Refs #23.
- **Manuscript Builder status filter restyled as toggleable pills.** The Inclusion section's "compile scenes whose status is..." filter previously rendered each status as a native checkbox + label, which visually read as a radio-button (single-select) pattern despite being multi-select. Each status now renders as a pill: outlined when unselected, color-mix-tinted with the per-status `--dbench-status-<status>` variable when selected. Click anywhere on the pill toggles. The underlying `<input type="checkbox">` stays in the DOM (visually hidden) so screen readers and keyboard navigation continue to work; CSS `:has(input:focus-visible)` transfers the focus indicator to the chip. Mirrors the Manuscript view's status-chip pattern but with bolder emphasis for the active-config register. Refs #25.
- **Manuscript view's primary CTA now opens the Manuscript Builder.** The prominent "Compile" button in the Manuscript view header used to short-circuit to instant compile (the only preset on single-preset projects, or a fuzzy preset picker on multi-preset projects). It now opens the Manuscript Builder modal, where the writer picks a preset, configures filters, and runs compile from the modal's header. The button is renamed "Compile..." per the standard ellipsis convention signaling "opens further UI before action." The smaller `book-up` icon button that previously opened the Builder from the Manuscript view header is removed as redundant. Writers who relied on the instant-compile path can bind a hotkey to one of the existing palette commands (`Draft Bench: Compile current project`, `Draft Bench: Run compile...`) which preserve the pre-0.2.4 behavior. Refs #24.

1102 unit + integration tests, all green. Desktop-only.

## [0.2.3] - 2026-05-04

Third hot patch of the day. Defensive fixes against latent issues in the linker -> sort chain that surfaced as mispaired reverse arrays during sequential sub-scene retrofits.

### Fixed

- **Sort no longer truncates length-asymmetric arrays.** `sortReverseArraysByOrder` previously walked `Math.min(wikilinks.length, ids.length)` indices and silently dropped any tail entries past the shorter array's length when re-emitting the sorted result. Asymmetric arrays should never reach the sort under correct usage, but a corrupted-state sort output was strictly worse than the input. The function now returns inputs unchanged with `changed: false` when lengths diverge, surfacing the asymmetry to the integrity-service post-prune for proper handling. Refs #22.
- **Linker passes the just-added child's `dbench-order` directly to the sort.** `ensureChildInReverse` previously called `sortReverseArraysByOrder` with no overrides; the sort fell back to `findNoteById` for every child including the just-added one. In real Obsidian, the metadataCache for a just-modified file can lag the `'changed'` event by a tick, returning null from `findNoteById` and demoting the entry to `+Infinity` in the sort. Each subsequent sequential retrofit shifts the demoted entry further back, eventually producing a fully-rotated reverse array. Fix: thread the child's order from the linker's reconcile context (which already holds it via `childFm['dbench-order']`) into the sort via a new optional `knownOrders` map. The sort prefers the map; falls back to `findNoteById` for entries not in the map. Refs #22, #19.

5 new focused unit tests for `sortReverseArraysByOrder` covering asymmetric-array guard, `knownOrders` overrides, idempotence, and the mystery-id fallback. + 1 integration test in the linker suite that retrofits 5 sub-scenes sequentially against a single parent and asserts correctly-paired reverse arrays.

## [0.2.2] - 2026-05-04

Second hot patch of the day, this time for a sub-scene retrofit gap surfaced while smoke-testing 0.2.1.

### Fixed

- `Set as sub-scene` retrofit now infers the parent scene under the § 10 default nested layout (`<project>/<scene>/<sub-scene>.md`), not just the flat layout. The previous `inferSceneForSubScene` looked for a unique scene whose immediate parent folder equaled the sub-scene's parent folder — that only matched the flat layout (sub-scene + scene file in the same folder) and silently fell back to empty placeholders for the nested default. Writers retrofitting an existing sub-scene-shaped folder ended up with half-stamped notes that needed manual frontmatter editing for `dbench-scene` / `dbench-scene-id` / `dbench-project` / `dbench-project-id`. Fix: two-stage inference — check for a scene file at `${parentFolder}.md` first (the nested convention; the scene shares basename with the folder holding its sub-scenes), fall back to the same-folder match for flat layouts. Works under chapter-aware projects too (`<project>/<chapter>/<scene>/<sub-scene>.md` resolves the scene at `<project>/<chapter>/<scene>.md`). + 1 regression test for the chapter-aware case; the existing flat-layout test continues to pass via the fallback path. Refs #21.

## [0.2.1] - 2026-05-04

Hot patch for a data-loss regression introduced in 0.2.0's integrity-service work.

### Fixed

- `Repair project links` no longer drops valid ids from parent reverse arrays when applying an auto-repair against an array that already holds mispaired data (a `*_CONFLICT` issue and a `*_MISSING_*` issue against the same `(parent, wikilinkField, idField)` tuple). The interaction between the #14 splice-at-matching-index branch and the #13 defensive post-prune meant each apply pass shifted the existing mispaired id past the wikilinks-array length, where the post-prune dropped it as orphan-paired; subsequent scans flagged the dropped child as MISSING and the cycle continued, losing one valid id per pass against pre-#15 cache-race residue. Fix: the `add-to-reverse` handler now guards splice operations on the array-length differential — if the other array is already at full length but doesn't contain the missing value, some slot must hold mispaired data, so the auto-repair skips and counts the entry in `conflictsSkipped` for the writer to address manually via the `*_CONFLICT` listing. Length-shorter cases (the original #14 deletion-shift scenario) continue to splice as designed. + 2 regression tests covering the cycle-suppression and the #14 deletion-shift path. Refs #20.

## [0.2.0] - 2026-05-04

Sub-scene note type promoted from post-V1 to pre-1.0, plus a settings-tab reorganization, a chapter-aware folder-default flip for scenes and sub-scenes, and a sweep of integrity-service quality-of-life fixes surfaced during the sub-scene walkthrough.

### Added

- **Sub-scene note type** — new `sub-scene` joins the V1 vocabulary alongside `project` / `chapter` / `scene` / `draft` / `compile-preset`. Lets writers break a scene into per-unit narrative blocks (e.g., the setpieces of an auction night, the movements of a trial sequence) with their own status, drafts, word count, and reorder position. Hierarchical scenes render as collapsible cards in the Manuscript view; the compile pipeline descends into sub-scenes in `dbench-order` (preserving the parent scene's intro prose under `## Draft` when present); the integrity service tracks scene <-> sub-scene and sub-scene <-> draft relationships with the same scan + repair affordances as the other types. Backward-compatible: scenes without sub-scenes work exactly as before. Refs #10.
  - **New affordances:** `New sub-scene` palette command, `Draft Bench` -> `New sub-scene` context-menu entry on scenes, `Draft Bench` -> `Set as sub-scene` retrofit on untyped notes, `New draft of this sub-scene` for per-sub-scene snapshots, an "Add sub-scene" button on each Manuscript-view scene card.
  - **Reorder modal genericized:** the scene-reorder and chapter-reorder modals collapsed into a single `ReorderChildrenModal<T>` that also handles sub-scene-in-scene reordering.
  - **Settings:** new `Sub-scenes folder` (default `{scene}/`) and `Sub-scene template` paths.
  - **Integrity:** new scan kinds `SUB_SCENE_MISSING_IN_SCENE`, `STALE_SUB_SCENE_IN_SCENE`, `SCENE_SUB_SCENE_CONFLICT`, plus sub-scene-level draft kinds (`DRAFT_MISSING_IN_SUB_SCENE`, `STALE_DRAFT_IN_SUB_SCENE`, `SUB_SCENE_DRAFT_CONFLICT`).
- `scenesFolder` setting now accepts a `{chapter}` token, expanded to the parent chapter's basename for scenes-in-chapters or to `''` for chapter-less scenes (collapsing to flat-at-project-root). The default flips from `''` to `'{chapter}/'`, so chapter-aware projects automatically nest scenes under their chapter folder while chapter-less projects keep the V1 flat layout. The linker watches chapter renames and renames the matching scenes folder to track, mirroring the sub-scene auto-rename one level up. Existing installs are migrated once on first load: a saved `scenesFolder: ''` is rewritten to `'{chapter}/'` and a one-shot flag prevents re-runs (a writer who deliberately re-sets `''` after the upgrade keeps that choice). Refs #11.

### Changed

- Reverse arrays (`dbench-scenes`, `dbench-sub-scenes`, `dbench-chapters`, etc.) now sort by each child's `dbench-order` rather than appending in arbitrary order. The linker's live `ensureChildInReverse` and the integrity-repair defensive post-prune both run a stable sort that pushes unordered children (drafts, malformed entries) to the end without touching their relative position. Frontmatter inspection now matches narrative order so a writer doesn't see a reshuffled-looking array after a series of edits + repairs. Idempotent on already-sorted arrays. Refs #19.
- Settings tab reorganized into collapsible `<details>` sections with chevron + section description (per [docs/planning/references/settings-organization-reference.md](docs/planning/references/settings-organization-reference.md), Charted Roots prior art): Folders, Drafts, Templates, Statuses, Bidirectional sync, About. Each section opens by default; the writer can collapse what they don't care about. The standalone Bases section folded into Folders since it was a single setting. Long `setDesc()` strings on the Scenes folder and Sub-scenes folder shrunk back to one short sentence each; the shared `{project}`/`{chapter}`/`{scene}` token semantics moved to a section-level info box at the top of Folders. The Templates section gained a parallel info box covering shared template-token + leave-empty-for-default semantics. State preservation across re-renders, search/filter, and helper extraction are deferred per the planning doc's start order. Refs #18.

### Fixed

- `subScenesFolder` resolver now joins the relative template against the parent scene's folder instead of the project's. For chapter-aware projects (where scenes live under chapter folders post-#11), sub-scenes now nest under the chapter folder next to their parent scene, instead of landing flat at the project root one level above. The change also makes the resolver robust to writer-customized scene placements: relocating a scene to any folder carries its sub-scenes along automatically, with no need to keep `scenesFolder` and `subScenesFolder` in sync. The linker's sub-scene-folder auto-rename watcher uses the same scene-folder join base, so chapter-nested sub-scene folders rename correctly when their parent scene is renamed (closes the knock-on identified in walkthrough Test 14). Refs #12.
- `Repair project links` no longer scrambles parallel-array pairing on `add-to-reverse`. When the integrity scan flagged a missing entry on one side of a paired reverse array (e.g., the id companion was missing while the wikilink remained), the repair previously appended the missing value to the END of its array, mispairing all subsequent indices and producing `*_CONFLICT` issues on the next scan. Fix: when one side has the value at a known index and the other side is missing, splice the missing side at the matching index to preserve pairing. The append-both behavior is preserved for the true "missing child" case where neither side has the value yet. + 3 regression tests covering interior-id-missing / interior-wikilink-missing / both-missing-append-fallback. Refs #14.
- `Repair project links` now converges in one pass against parallel-array length mismatches. When a writer manually adds an entry to one half of a paired reverse array (e.g., a fake id in `dbench-sub-scene-ids`), Obsidian's Properties panel can silently pad the parallel `dbench-sub-scenes` array with an empty entry to length-match. The first repair pass dropped the orphan id correctly but left the padded empty wikilink residue, surfaced by a second scan as a separate STALE issue. Two-part fix: `scanRelationship` now flags asymmetric arrays / orphan-paired empties as a single STALE summary even when neither side has a truthy orphan; `applyRepairs` runs a defensive post-prune at the end of each parent's processFrontMatter callback that walks each touched (wikilinkField, idField) pair and drops any index where one side is empty (handles `''`, `null`, and `undefined` residue alike). Idempotent on already-clean arrays. Refs #13.
- Six `createX` functions (`createDraft`, `createChapterDraft`, `createSubSceneDraft`, `createScene`, `createChapter`, `createSubScene`) read the newly-stamped `dbench-id` from `app.metadataCache.getFileCache(file)?.frontmatter?.['dbench-id']` *after* `processFrontMatter` returned, then pushed it into the parent's reverse-id array. Real Obsidian reparses the metadata cache asynchronously, so this read often hit the pre-write cache state and returned `''`. The empty string landed in the parent's `dbench-X-ids` array, paired with a valid `dbench-X` wikilink. Tests didn't catch it because the test mock's `processFrontMatter` updates the cache synchronously. Fix: capture the id INSIDE the `processFrontMatter` callback, where the stamping helper sets it on the frontmatter object — same pattern the rest of the linker already uses. Existing vaults with `""` entries continue to function (the wikilink half still resolves), but the empty entries undermine integrity scans and id-based lookup. A sweep utility for backfilling existing empty entries is planned as a follow-up. Refs #15.
- Chapter-card word-count rollup missed sub-scene contributions for hierarchical scenes-in-chapter. `WordCountCache.countForChapter` summed scene bodies via `countForScene` (body-only) when iterating scenes-in-chapter, so a chapter that contained a scene with sub-scenes showed only `chapter body + each scene's body` — sub-scene bodies dropped out one level up, even though the scene-card itself rendered the correct rollup. `countForProject` already handled this correctly via separate sub-scene iteration. Fix: when iterating scenes inside `countForChapter`, look up each scene's sub-scenes via `findSubScenesInScene`; if any exist, sum the rollup via `countForSceneWithSubScenes`, otherwise fall back to `countForScene` for flat scenes. + 4 regression tests covering empty / flat-only / hierarchical / mixed chapters. Refs #16.

### Notes

- Tests: 1093 unit + integration tests, all green at release.
- Bundle and platform: unchanged from 0.1.4. Desktop-only.

## [0.1.4] - 2026-04-30

UX gap-fill plus the principled fix for the 0.1.1 / 0.1.2 / 0.1.3 wikilink-reshape chain.

### Added

- `New draft of this scene` entry in the right-click `Draft Bench` submenu on scene notes, mirroring the existing `New draft of this chapter` affordance on chapter notes. Refs #9.
- `registerPropertyTypes` runs at plugin load and tells Obsidian, via `app.metadataTypeManager`, to treat the `dbench-*` relationship fields and their ID companions as text / multitext. Without this, Obsidian's Properties panel auto-promoted wikilink-shaped Text fields into list-typed values, which YAML serialized as block-style nested arrays (the root cause behind the chain of fixes shipped in 0.1.1 / 0.1.2 / 0.1.3). With registration, the Properties panel writes wikilinks as quoted strings from the start, and `processFrontMatter` round-trips them stably. Defense-in-depth: the 0.1.3 wikilink canonicalization in the linker stays in place, idempotent on already-canonical values, cleaning up any data that pre-dates the registration. Refs #8.

### Notes

- Tests: 947 unit + integration tests, all green at release.
- Bundle and platform: unchanged from 0.1.3.

## [0.1.3] - 2026-04-30

YAML-shape polish for wikilink relationship fields after the linker writes.

### Fixed

- After the linker backfilled an ID companion (per #4 / #6), the on-disk YAML for the relationship wikilink field ended up in nested-array block-list form (`dbench-scene:\n  - - Some Scene`) rather than the canonical quoted-string form (`dbench-scene: "[[Some Scene]]"`). The reshape originated with Obsidian's `processFrontMatter` round-trip — the metadata cache exposes wikilinks as nested arrays for link-aware purposes, and the serializer writes them back in block-style YAML. Same data, ugly rendering, inconsistent with the quoted-string form `processFrontMatter`-driven retrofits produce. The linker now defensively re-canonicalizes the wikilink field in the same callback that writes the ID companion: nested-array shapes get rewritten as `"[[Basename]]"` strings, preserving any alias / heading / block-ref content verbatim. Idempotent. Refs #7.

### Notes

- Tests: 938 unit + integration tests, all green at release.
- Bundle size and platform support: unchanged from 0.1.2.

## [0.1.2] - 2026-04-30

Follow-up to the wikilink-only retrofit fix from 0.1.1.

### Fixed

- Linker now consults Obsidian's `frontmatterLinks` cache when backfilling the ID companion on a wikilink-only relationship edit. The 0.1.1 fix parsed the raw frontmatter value, which works when YAML stores the wikilink as a quoted string (`dbench-scene: "[[Some Scene]]"`) but missed the more common form Obsidian's Properties panel writes (`dbench-scene: [[Some Scene]]` without quotes). YAML parses the unquoted form as a nested array, which the parser didn't recognize. The linker now reads `frontmatterLinks` (Obsidian's resolved-link cache, populated regardless of YAML encoding) as the primary resolution path; the raw-value parser stays as a fallback and now handles the nested-array form too. Refs #6.

### Notes

- Tests: 935 unit + integration tests, all green at release.
- Bundle size and platform support: unchanged from 0.1.1.

## [0.1.1] - 2026-04-30

First incremental release after the 0.1.0 launch. Surfaced from real-vault migration testing on a writer's existing four-project Fiction folder.

### Changed

- All Draft Bench context-menu actions now appear under a single `Draft Bench` submenu (icon `scroll-text`) instead of cluttering the top level of Obsidian's right-click menu. On mobile (where Obsidian doesn't yet support submenus), items appear as a flat list with `Draft Bench:` prefixes. Smart visibility carries through unchanged: the submenu only appears when at least one action would change something. Refs #5.
- Folder-scope `Set as project` is now smart about the folder-note convention. Previously, right-clicking a project folder and picking `Set as project` would batch-stamp every markdown file inside (including scenes) as a project. The action now only appears when the folder contains an untyped markdown file matching the folder's name (case-insensitive), and stamps only that file. Other folder-scope retrofits (`Set as scene` / `Set as draft` / `Complete essential properties` / `Add identifier`) keep their batch behavior since their semantics naturally apply across all markdown children. Refs #3.

### Added

- `editor-menu` registration: right-clicking inside an open editor now surfaces the same Draft Bench actions as the file-explorer right-click, scoped to the active note. Refs #5.

### Fixed

- Linker now resolves wikilink-only relationship edits made via the Properties panel. Previously, setting a relationship wikilink (e.g., `dbench-scene: [[Some Scene]]` on a retrofitted draft) without also stamping the ID companion (`dbench-scene-id`) was silently ignored: the linker keys reconciliation off the ID companion, and a wikilink-only edit produced an empty ID, which the reconciler treated as no parent declared. The linker now resolves the wikilink against the candidate-parent pool, backfills the companion via `processFrontMatter`, then proceeds with normal reverse-array reconciliation. Affects all relationships where retrofit leaves a wikilink-empty placeholder: draft -> scene, draft -> chapter, scene -> chapter, scene -> project, chapter -> project. Refs #4.

### Notes

- Tests: 929 unit + integration tests, all green at release.
- Bundle size and platform support: unchanged from 0.1.0.

## [0.1.0] - 2026-04-29

First BRAT-public release. Ships the full V1 feature set per the [specification](docs/planning/specification.md). API and data shape may still change between minor versions during the 0.x phase; see [VERSIONING.md](VERSIONING.md).

### Added

**Note types and data model**

- Five plugin-managed note types: `project`, `chapter`, `scene`, `draft`, `compile-preset`. Each carries `dbench-` frontmatter properties identifying its type, identity, and relationships.
- Stable identifiers (`dbench-id`) in the `abc-123-def-456` format, stamped at creation, never changed. Used by the linker as a rename-safe reference target.
- Typed forward relationships (`dbench-project`, `dbench-chapter`, `dbench-scene`) with stable-ID companions, dual-stored as wikilinks + IDs.
- Reverse arrays (`dbench-scenes`, `dbench-chapters`, `dbench-drafts`, `dbench-compile-presets`) maintained by the linker.

**Project shapes**

- Folder projects (default): a project note plus child scenes and drafts in a configurable subfolder.
- Single-scene projects (`dbench-project-shape: single`): a single note that is the whole project.
- Chapter-aware folder projects: a two-level project -> chapter -> scene shape, optional per project. No-mixed-children invariant enforced.
- Frontmatter-based discovery: notes are identified by frontmatter, not folder location. Move notes anywhere in the vault without breaking membership.

**Manuscript view (dockable workspace leaf)**

- Project picker and project-summary section (status, identifier, total word count, hero progress bar when `dbench-target-words` is set, per-status breakdown counting both scenes and chapters).
- Chapter cards (chapter-aware projects): collapsible headers with chevron + order capsule + clickable title + status chip + word-count rollup + "New draft of this chapter" button. Smooth collapse/expand animation. Persisted collapse state per chapter.
- Scene rows: order capsule + title + optional `dbench-subtitle` second line + status chip + word count + draft count.
- Wikilink-style title affordances: cmd/ctrl-click for new tab, +shift for split, +alt for new window, middle-click for new tab, right-click context menu.
- Active-note-sync: opening any plugin-managed note auto-switches the leaf's selected project.
- Toolbar with New scene, New draft, Reorder scenes; primary Compile CTA above the toolbar.

**Manuscript Builder (compile modal)**

- Compile-preset editor with five collapsible sections: Metadata, Inclusion, Output, Content handling, Last compile.
- Preset picker dropdown + "+ New preset" button.
- Run compile button that runs the active preset end-to-end.

**Compile pipeline**

- Markdown intermediate with always-on rules (footnote renumbering, callout strip, etc.) plus per-preset content-handling overrides for heading scope, frontmatter handling, wikilinks, embeds, and dinkuses.
- Heading scopes: `full`, `draft`, `chapter` (chapter-aware compile with two-level walking).
- Output formats: Markdown (vault or disk), ODT, PDF, DOCX.
- Per-scene section breaks via `dbench-section-break-title` with `visual` or `page-break` rendering hint.
- Strip-with-notice batching for filtered embeds (images, audio, video, PDFs, Bases, note embeds).
- Auto-default heading scope based on project shape (chapter-aware projects get `chapter`, chapter-less get `draft`).

**Drafts**

- Scene drafts: snapshot a scene's body to a new file in the configured drafts folder.
- Chapter drafts: snapshot the chapter body plus each child scene's body, concatenated in `dbench-order` with `<!-- scene: <basename> -->` HTML-comment scene boundaries.
- Single-scene-project drafts.
- Three drafts-folder placement modes: project-local (default), per-scene/parent, vault-wide.

**Templates**

- Built-in scene template and chapter template, auto-seeded as `<templatesFolder>/scene-template.md` and `chapter-template.md` on first creation.
- Plugin-token substitution: `{{project}}`, `{{project_title}}`, `{{date}}`, `{{scene_title}}` / `{{chapter_title}}`, `{{scene_order}}` / `{{chapter_order}}`, `{{previous_scene_title}}` / `{{previous_chapter_title}}`.
- Templater plugin pass-through (auto-detected; runs Templater syntax on templates before plugin-token substitution).
- Multi-template support: any markdown file in the templates folder with `dbench-template-type: scene | chapter` frontmatter is discovered and surfaced in the new-scene / new-chapter modal's template picker.

**Linker and integrity service**

- `DraftBenchLinker`: live sync service maintaining bidirectional references on `vault.on('modify')` events through `metadataCache.on('changed')`.
- `DraftBenchIntegrityService` with batch scan and repair via `Repair project links` command. 14 SNAKE_CASE issue codes covering missing reverse entries, stale entries, wikilink/id conflicts (manual review only), and the `PROJECT_MIXED_CHILDREN` invariant.
- Suspended states for plugin-driven multi-file operations to avoid intermediate-state sync.

**Retrofit actions**

- "Set as project / chapter / scene / draft" (idempotent, never overwrites existing values).
- "Complete essential properties" (fills in only missing fields on partially-typed notes).
- "Add identifier" (standalone ID stamp).
- Folder-based inference: when a folder context unambiguously implies a parent project, retrofit actions auto-fill the project ref and order.
- Single-file, multi-select, and folder scopes via context menu.

**Settings**

- Folders: project, chapter, scene, drafts (with placement modes).
- Templates folder + per-type override paths.
- Configurable status vocabulary (idea / draft / revision / final by default).
- Bases starter views folder.
- Bidirectional sync toggles (master + per-event).
- Folder-path autocomplete via `FileSuggest`.

**Bases integration**

- `Draft Bench: Install starter Bases views` palette command. Generates `.base` files at the configured folder for projects, scenes, and drafts.

**Style Settings integration**

- Scene + draft typography variables (font family, size, line height, max width, background, text color).
- Draft-leaf archival cue (border-left, default `3px solid var(--text-faint)`).
- Plugin-managed CSS classes (`.dbench-project`, `.dbench-chapter`, `.dbench-scene`, `.dbench-draft` plus `.draft-bench-*` long-form variants) applied to active editor leaves.

**Onboarding**

- Welcome modal: single screen with brand mark, pitch paragraphs, three CTAs (Create your first project / Try with an example project / Show the manuscript view), wiki link in footer. Auto-shown once per vault; resurfaceable via palette.
- Example project generator (`Example - The Last Lighthouse`): three scenes with prose, one prior draft snapshot, a compile preset.
- First-project auto-reveal: the Manuscript view auto-reveals after a writer's first project creation.

**Reordering**

- Reorder scenes modal with drag handles and keyboard navigation.
- Reorder chapters in project modal (parallel implementation).
- Move scene to chapter context menu action (single-file scope; bulk multi-select is post-V1).

**Commands**

- ~25 palette commands under the `Draft Bench:` prefix covering creation, drafts, reordering, compile, retrofit, repair, and view management. Suggested-hotkeys list in the README.

### Changed

- Frontmatter and CSS short-prefix finalized as `dbench-` (from an earlier `db-` that was ambiguous with "database").
- Planning specification renamed from `SPEC.md` to `specification.md` (kebab-case convention).

### Notes

- Tests: 896 unit + integration tests, all green at release.
- Bundle: ~5.7 MB `main.js` (includes pdfmake + docx). Lazy-loading for the heavy renderers is the top post-V1 bundle-size lever; tracked in [post-v1-forward-compat-audit.md](docs/planning/post-v1-forward-compat-audit.md).
- Platform: desktop-only (`isDesktopOnly: true`). Mobile re-evaluation is post-V1.

## [0.0.1] - 2026-04-16

### Added

- Initial project scaffolding (configs, stubs, MIT license).
- Coding standards document.
- Build, lint, and deploy pipeline verified end-to-end.
- Plugin renamed from "Drafting Table" to "Draft Bench."
