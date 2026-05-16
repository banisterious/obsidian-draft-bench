# Release History

Version history for Draft Bench. For the canonical changelog with full detail, see [CHANGELOG.md](https://github.com/banisterious/obsidian-draft-bench/blob/main/CHANGELOG.md).

---

## 0.6.4: 2026-05-16 — Scanner hygiene + Scrivener import fix

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.6.4)

Scanner-hygiene release with one user-visible bug fix. Postinstall patches strip three `new Function(...)` literals from pdfmake's and docx's bundled vendor code, clearing the community-plugin scanner's Dynamic Code Execution recommendation. Production minification enabled in `esbuild.config.mjs` drops `main.js` from 5.83 MB to 3.09 MB (47% reduction, ~2 MB under the 5,242,880-byte Sync Standard threshold), retiring the scanner's "main.js > 5 MB" warning. The Scrivener RTF importer now suppresses `\fldinst` field-instruction groups so `HYPERLINK "scrivcmt://..."` noise no longer leaks into imported scenes ([#37](https://github.com/banisterious/obsidian-draft-bench/issues/37)). No user-visible feature changes beyond the import fix; 1389 tests pass unchanged.

### Fixed

- **RTF field-instruction text no longer leaks into imported Scrivener scenes ([#37](https://github.com/banisterious/obsidian-draft-bench/issues/37)).** Scrivener wraps inline comments and hyperlinks as RTF fields (`{\field{\*\fldinst{HYPERLINK "..."}}{\fldrslt {visible text}}}`). The custom RTF parser's MVP scope had deferred hyperlink / comment rendering but never suppressed the `\fldinst` payload, so the instruction text (HYPERLINK + scrivcmt:// URI, or HYPERLINK + http URL) emitted into the markdown verbatim alongside the visible content. `fldinst` joins the existing `SKIPPED_GROUP_CONTROL_WORDS` set in `src/import/scrivener/rtf-to-markdown.ts`; the parser's suppress-depth mechanism drops the instruction group while `\fldrslt` content still emits. Real `http(s)` hyperlinks lose their URL with this change (the visible link text still renders as plain text); proper RTF-hyperlink-to-markdown rendering remains a separately deferred feature.
- **Bundle no longer contains `new Function(...)` literals.** Three sites flagged by the community-plugin scanner at recommendation severity (Dynamic Code Execution) all sat inside dead-code branches: two `new Function("return this")()` calls in pdfmake's bundled core-js globalThis polyfill + webpack runtime (guarded by `typeof globalThis === "object"` early returns, which always fire in Electron), and one `new Function("" + e4)` string-callback shim in docx's bundled `setimmediate` polyfill (the string-callback path is unused; docx always passes functions). New postinstall scripts (`patch-pdfmake.js` + `patch-docx.js`) strip the branches from `node_modules/` during `npm install`. Same shape as the IE8 setImmediate `createElement('script')` patches the Charted Roots scan-cleanup arc landed earlier.
- **Bundle no longer exceeds the 5 MB Sync Standard threshold.** Production minification enabled in `esbuild.config.mjs` (`minify: prod`) drops `main.js` from 5,825,743 bytes to 3,088,650 bytes (47% reduction, ~2 MB under the 5,242,880-byte limit). Source unchanged; no UX change. The scanner's "main.js > 5 MB" warning retires alongside the `new Function` recommendation.

### Internal

- **Postinstall patches are idempotent and vendor-update-safe.** Each substitution carries a marker comment (`draft-bench-postinstall-patch`) so re-running `npm install` is a no-op once applied. When an ORIGINAL string isn't found (vendor upgrade reshapes the targeted block), the patch logs a warning and skips that substitution rather than silently mis-editing; the next scan exposes any regression.
- **Patches subsume the IE8 `createElement('script')` literals on the resolution path esbuild loads** (`pdfmake/build/pdfmake.js` and `docx/dist/index.mjs`). The pre-existing `mask-script-polyfill-literal` esbuild plugin stays in place as a no-op safety net: its regex matches nothing in the patched files but covers any future drift if esbuild's module resolution ever selects a different docx variant.
- **Name-introspection grep clean.** Source contains no `Function.prototype.name`, `.constructor.name`, or function `.toString()` calls, so esbuild's identifier mangling can rename freely without `keepNames: true`. 1389 tests pass under minification.

Mobile-supported (Android verified through 0.5.2). 1389 tests pass. Community-plugin scan score: 95/100.

## 0.6.3: 2026-05-15 — Scanner-hygiene patch (`:has()`)

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.6.3)

Internal-quality release. Replaces the Manuscript Builder status-chip filter's `:has()` selectors with equivalent sibling-combinator rules so the bundle no longer triggers the community-plugin scanner's "broad selector invalidation" performance advisory. All 16 sites the scanner flagged (8 source rules × 2 paths: source CSS + bundled `styles.css`) are eliminated. UX is identical to 0.6.2.

### Changed

- **Status-chip markup restructured.** Inputs previously nested inside their labels (label-wraps-input affordance); they now sit as siblings paired via `for`/`id`. Click-to-toggle still works via the standard browser association. Input IDs are namespaced through a module-level counter so multiple concurrent Manuscript Builder instances (dock-leaf + popout window, etc.) don't collide.
- **Eight `:has(input:...)` CSS rules rewritten as sibling combinators** (`.chip-input:checked + .chip`, `.chip-input:focus-visible + .chip`, etc.). Pure CSS, no JS state-sync. `:focus-visible` semantics survive intact — the combinator reads the real focused element, so mouse clicks toggle the chip *without* showing the keyboard focus ring (`:focus-visible` rejects pointer-induced focus), while tab navigation transfers the ring to each label correctly.

### Internal

- **Visually-hidden checkbox rule scoped via wrapper + attribute** (`.dbench-manuscript-builder__status-chips input[type="checkbox"]`, specificity 0-2-1) to win against Obsidian's bare `input[type="radio"], input[type="checkbox"]` rule in `app.css` (0-1-1). A naive class-only selector loses on specificity and the checkboxes reappear at native size.

Mobile-supported (Android verified through 0.5.2). 1387 tests pass. Community-plugin scan score: 92/100.

## 0.6.2: 2026-05-15 — jszip -> fflate migration

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.6.2)

Scanner-hygiene release. Replaces `jszip` with `fflate` (through a thin JSZip-shaped adapter at `src/utils/zip.ts`) so the bundle no longer ships jszip's UMD module-detection code, which the community-plugin scanner escalated to an error severity on 2026-05-15. The IE-era polyfill workarounds 0.6.1 introduced to neutralize jszip's transitive `setimmediate` / `immediate` / `lie` / `readable-stream` chain are no longer needed and have been removed. Bundle shrinks from ~5.8 MB to ~5.6 MB; runtime behavior is unchanged.

### Changed

- **ODT archive creation now routes through `fflate` via `src/utils/zip.ts`.** `ZipBuilder` exposes the stateful builder API the codebase already used (`new ZipBuilder()` -> `.file()` -> `.generateAsync()`); `ZipReader` exposes the JSZip reader pattern (`loadAsync` + `zip.files` record + `zip.file(path)` lookup + `.async('string' | 'uint8array' | 'arraybuffer')`).
- **`jszip` removed from dependencies**, replaced by `fflate@^0.8.2` (pure JavaScript, zero transitive deps, TypeScript types built in).
- **Test files updated** to use the adapter's `ZipReader` for inspecting compiled DOCX / ODT bytes. The reader pattern API is unchanged from JSZip's surface; only the import line differs.

### Internal

- **Bundling infrastructure simplified.** Deleted the `polyfill-shims` esbuild plugin (which rerouted `setimmediate` / `immediate` / `jszip` / `readable-stream`), the `polyfills/setimmediate.js` and `polyfills/immediate.js` native-equivalent shims, the `polyfills/` directory, and the `polyfills/**` eslint ignore. The `mask-script-polyfill-literal` plugin remains for `docx` + `pdfmake`'s pre-bundled IE-era polyfill code.
- **Bundle size dropped ~200 KB** (5.8 MB -> 5.6 MB) from removing jszip and its transitive chain.

Mobile-supported (Android verified through 0.5.2). 1387 tests pass. Manual ODT round-trip verified against LibreOffice before tag-push.

## 0.6.1: 2026-05-13 — Scanner-hygiene patch

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.6.1)

Internal-quality release. Eliminates the "10 dynamic `<script>` element creations" warning the community-plugin scanner reports against 0.6.0's bundle. The flagged patterns come from IE-era polyfills in transitive dependencies; none execute at runtime in Chromium (they sit behind `MutationObserver` / `setImmediate` feature checks that always succeed first), but the static scanner sees the `createElement("script")` literals regardless. All 10 are now gone from the bundle. No user-visible feature changes; 1387 tests pass unchanged.

### Fixed

- **`setimmediate` and `immediate` (jszip's transitive deps) replaced with native-equivalent shims** in `polyfills/`. The setImmediate shim uses `setTimeout(fn, 0)` (matching the original's macrotask semantic); the immediate shim uses `queueMicrotask` (matching lie's Promise microtask scheduler).
- **`jszip` resolution rerouted from its prebundled Browserified `dist/jszip.min.js` to the unbundled `lib/index.js`** so the shims actually replace the polyfills. `readable-stream` routes to Node's built-in `stream` (already external for Electron).
- **`docx` and `pdfmake` `createElement("script")` literals masked at bundle time** via a non-foldable runtime expression. Both vendors ship pre-bundled distributions with the polyfills inlined as dead code; the masked branches remain unreachable in modern engines, so runtime is unaffected.

Mobile-supported (Android verified through 0.5.2). 1387 tests pass.

## 0.6.0: 2026-05-12 — Frontmatter type-narrowing refactor

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.6.0)

Internal-quality release. Consolidates the frontmatter type-narrowing boundary into a single canonical module and routes every Obsidian-API access through its typed helpers, clearing 195 strict-typed-rule warnings the community.obsidian.md scanner reports without changing runtime behavior. Also upgrades `eslint-plugin-obsidianmd` from 0.2.9 to 0.3.0 to match the scanner's version. No user-visible feature changes; 1387 tests pass unchanged.

This is the first minor-version bump beyond 0.5.x. SemVer-wise the work is internal-quality, but the scope (eight commits, 195 warning sites cleared, six duplicate helpers consolidated, every `processFrontMatter` callback in the codebase reshaped) warranted a minor bump over a patch. Project-level full-manuscript snapshots (originally penciled for 0.6.0) defer to 0.7.0.

### Changed

- **New `src/core/frontmatter-access.ts` module** is the single canonical home for the type-narrowing boundary. Layer 1 adapters reshape Obsidian's `any`-typed values into `Record<string, unknown>`; Layer 3 helpers (`readString`, `readNumber`, `readBoolean`, `readArray`) narrow `unknown` to typed values with documented defaults.
- **Strict typed-rule enforcement.** The five `@typescript-eslint/no-unsafe-*` rules now run as `error` severity locally (matching the community.obsidian.md scanner). New code that bypasses the helpers fails the build.
- **Cleanup:** six duplicate `readArray` definitions consolidated; the `linker/readers.ts` shim module deleted; latent `no-base-to-string` bugs (`String(any-typed-cache-value)` could render `'[object Object]'`) surfaced and fixed via the typed helpers.

Mobile-supported (Android verified through 0.5.2). 1387 tests pass.

## 0.5.5: 2026-05-12 — Release-hygiene + popout polish

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.5.5)

Internal-quality release. Introduces a CI release workflow that produces cryptographic provenance attestations for every release asset (`main.js`, `manifest.json`, `styles.css`), addressing recommendations from the community.obsidian.md automated scan against 0.5.4. Also picks up eight popout-window polish sites. No user-visible feature changes.

### Added

- **CI release workflow with build-provenance attestations.** Tag push triggers `actions/attest-build-provenance@v2` against the three release assets. Verify any asset with `gh attestation verify <file> --repo banisterious/obsidian-draft-bench`.

### Changed

- **`document` -> `activeDocument`** in 8 sites so SVG / element / fragment creation in Obsidian popout windows works without further plumbing. ESLint warning count drops from 40 to 28.

Mobile-supported (Android verified through 0.5.2). 1371 tests pass.

## 0.5.4: 2026-05-12 — Scene archive

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.5.4)

Adds a status-based archive workflow for the Manuscript view ([#36](https://github.com/banisterious/obsidian-draft-bench/issues/36)). Park scenes / chapters / sub-scenes you aren't actively working on without deleting them: the Manuscript view filters items whose status is on a "hidden" list and a "Show archived" toolbar toggle reveals them with muted treatment. Compile presets are unaffected.

### Added

- **Hidden statuses.** New per-status "hide from Manuscript view" flag. The default vocabulary grows by one entry (`archived`) which is hidden by default. Any other vocab entry can be flagged hidden via the Settings tab's eye toggle. Renaming a hidden status updates the flag pointer; removing it drops the flag.
- **"Show archived" toolbar toggle.** Appears on the Manuscript leaf as a fourth toolbar button when the project has at least one archived item. Flipping it reveals hidden scenes / sub-scenes (and muted chapter cards) at 0.55 opacity (hover lifts to 0.9). State persists per-leaf.
- **"Archive" / "Unarchive" context-menu item** on scene, chapter, and sub-scene notes. Stamps `dbench-status` to the first hidden status (typically `'archived'`); unarchive routes to the vocab's default status.
- **Migration for existing installs.** A one-shot flag appends `'archived'` to the vocabulary (if absent) and seeds the hidden-statuses list to `['archived']` on first load after upgrade. Writers who delete the seeded status keep that choice; the migration runs at most once.

Mobile-supported (Android verified through 0.5.2). 1371 tests pass.

## 0.5.3: 2026-05-11 — Audit-work release

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.5.3)

Internal-quality release bundling a five-phase architectural audit. No user-visible behavior changes; the 1360-test suite passes unchanged across every phase. Writers should see no difference from 0.5.2.

### Internal

- **Frontmatter wikilink utility extracted.** A new shared module consolidates parser logic that had drifted between two source files; sub-scene-drafts gains parity with the linker on the flow-notation `[[Foo]]` array form and block-ref stripping.
- **Typed command-ID constants.** All 28 Draft Bench command IDs now live in a single typed `COMMAND_IDS` registry, with a `runCommand` helper that centralizes the unsafe `app.commands.executeCommandById` cast.
- **Linker decomposed into a submodule directory.** The 951-line `linker.ts` becomes a `linker/` directory of five focused files (lifecycle, reconciliation, wikilink-backfill, folder-auto-rename, readers) plus a re-exporting `index.ts`. Public API unchanged.
- **Integrity-scanner cleanup.** Eleven inline typed-frontmatter casts route through the existing helper. Debounce-constant divergence between Manuscript view and Manuscript Builder is now documented in code; the gap is intentional.

Mobile-supported (Android verified through 0.5.2). 1360 tests pass.

## 0.5.2: 2026-05-09 — Android Scrivener-import polish

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/0.5.2)

Mobile patch for the Scrivener importer's Source step. Two Android-specific bugs surfaced during dev-vault verification of 0.5.1 are now addressed.

### Fixed

- **Externally-copied `.scriv` bundles surface without an app reload** ([#35](https://github.com/banisterious/obsidian-draft-bench/issues/35)). The in-vault bundle picker now walks via the vault adapter rather than the indexed file list, so a bundle copied into the vault via Android's file manager appears the next time the wizard opens — no `Reload app without saving` required. Affects desktop in principle too; the symptom only surfaced on mobile because the indexed cache lags external changes there.

### Mitigated

- **Folder picker on Android builds that silently ignore `webkitdirectory`** ([#34](https://github.com/banisterious/obsidian-draft-bench/issues/34)). Some Android builds present the in-app folder picker as a file-only chooser regardless of the `webkitdirectory` hint, leaving writers unable to select the `.scriv` folder. This is an OS-level limitation; the 0.5.2 mitigation reframes the Source step on mobile so the failure mode is legible: in-vault dropdown above the picker when bundles exist, an empty-state hint explaining the file-manager workaround when nothing's in the vault yet, picker subtext clarifying the conditional nature, and a Notice surfaced on cancel/dismiss pointing at the workaround.

Mobile-supported (Android verified). 1360 tests pass.

## 0.5.1: 2026-05-08 — Scrivener importer follow-up

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.5.1)

Completes the snapshot import + default compile preset toggles that the 0.5.0 wizard surfaced as deferred warnings, plus two parser fixes that improve Scrivener 3 (Windows) import fidelity. Tracked via [#33](https://github.com/banisterious/obsidian-draft-bench/issues/33).

### Added

- **Scrivener snapshot import.** When the **Import snapshots** toggle is on in the wizard's Options step, per-document Scrivener snapshots become `dbench-type: draft` files alongside each imported scene. Per-scene cap (1 / 3 / 5 / All). Default filename template (`{scene} - Draft {n} ({date_compact})`) matches native Draft Bench draft files; tokens `{scene}` / `{title}` / `{date}` / `{date_compact}` / `{time}` / `{n}` available. Original Scrivener title preserved as `scrivener-snapshot-title` even when the template doesn't reference `{title}`. The parent scene's `dbench-drafts` and `dbench-draft-ids` reverse arrays update accordingly.
- **Default compile preset stub.** When the **Create default compile preset** toggle is on, the importer adds an "Imported defaults" preset to the new project's `Compile Presets/` folder using Draft Bench's standard preset defaults. Starting point; rename / duplicate / delete as needed.
- **Preview-step disclosure of excluded documents.** When the source bundle contains documents marked Include-in-Compile = No, the Preview step's Warnings section lists them by title.

### Fixed

- **`countSnapshots` looked at the wrong path** (pre-existing from 0.5.0). The Parse step's snapshot-count summary returned 0 silently for any real Scrivener 3 (Windows) project; now correctly counts the bundle-root `Snapshots/<UUID>.snapshots/` location.
- **Include-in-Compile detection on Scrivener Windows.** Scrivener Windows serializes the unchecked state by removing the `<IncludeInCompile>` element from non-empty `<MetaData>`; the parser now treats that shape as `false`. Both the Preview-step disclosure and the `scrivener-include-in-compile: false` provenance frontmatter fire correctly.

### Notes

- **Empty-`<MetaData/>` ambiguity** (Scrivener Windows). For a document with no other metadata and an unchecked Include-in-Compile toggle, Scrivener Windows persists empty `<MetaData/>` either way; the importer can't distinguish and defaults to include. Workaround in [Importing from Scrivener § Known limitations](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener): set any other metadata field (Status, Label, custom field) in Scrivener before toggling Include-in-Compile off.

Desktop + Android. 1297 tests pass.

## 0.5.0: 2026-05-08 — Scrivener 3 project import

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.5.0)

The marquee feature for the 0.5.x line: a multi-step wizard reads a Scrivener 3 `.scriv` bundle from inside your vault and writes a fresh Draft Bench project — chapters, scenes, sub-scenes, drafts (optional), and inspector content all carry across, with every mapping reviewed in a Preview step before any file gets written. Tracked via [#28](https://github.com/banisterious/obsidian-draft-bench/issues/28). See the [Importing from Scrivener](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener) wiki page for the full walkthrough.

### Added

- **Scrivener 3 project import.** Eight-step wizard (Source → Parse → Hierarchy → Metadata → Options → Preview → Import → Complete). Discoverable via the `Draft Bench: Import from Scrivener` palette command, an import button in the Manuscript view's project picker row, and an empty-state CTA when no projects exist yet. Cross-platform — reads via Obsidian's vault adapter on every supported OS.
- **Hierarchy auto-detect with per-row override.** Deepest leaves with prose → scenes; immediate folder parents → chapters; extras above the chapter level (Parts, Books, Volumes) preserved as `scrivener-part` frontmatter; extras below the sub-scene level concatenated as nested markdown headings inside the parent sub-scene's body. The Hierarchy step renders the binder tree with per-row overrides.
- **Status, label, and custom-metadata mapping.** Status table matches Scrivener statuses against your vocabulary (with an "Add as new status" option). Labels route to a writer-named frontmatter key. Custom-metadata fields route per-field with type-aware coercion (Checkbox → boolean, List option → resolved title, Date → ISO `YYYY-MM-DD`, Text → string).
- **Inspector content carry-over.** Synopsis → `dbench-synopsis`; Document Notes → appended `## Notes` section in the scene body; inline Comments → Obsidian `%% comment %%` syntax; Footnotes → standard markdown footnotes; Project Notes → the project note's `## Notes` section; project-keyword usages → `tags:` frontmatter on each scene.
- **RTF → markdown body conversion.** Italics, bold, lists (nested), smart quotes, em-dashes, ellipses, and inline footnotes / comments. Inline images extracted to `Research/Images/` and referenced via Obsidian wikilinks.
- **Cross-document Scrivener Links rewritten to wikilinks.** A two-pass write builds a `scrivener-uuid → dbench-file-path` map and rewrites link markers as Obsidian wikilinks. Unresolvable links become `[broken: <title>]` and are logged.
- **Optional snapshot import, optional Research folder import.** Both gated by toggles in the Options step.
- **`dbench-synopsis` extended to the scene model.** Previously valid on chapters and sub-scenes only; now writes on scenes too, with Manuscript view scene rows rendering it as a muted second / third line below the title.
- **Per-import error log.** Errors during the write pass are collected per file (a single bad scene doesn't abort the whole import) and written to `Scrivener import errors.md` in the new project folder.

### Notes

- **QA scope.** Tested against the maintainer's own Scrivener 3 Novel-template fixture (sub-scenes + multi-level extras-above + Checkbox / Date / List custom-metadata fields) plus 1297 unit / integration tests. The test-corpus tracking issue stays open as an ongoing post-release feedback channel; issue reports across other `.scriv` shapes welcomed via [#28](https://github.com/banisterious/obsidian-draft-bench/issues/28).
- **Scrivener 2 and iOS Scrivener formats are not supported in V1.** Schema and bundle structure differ.
- **The `.scriv` bundle has to live inside the vault.** The wizard's Source step copies it in for you on most platforms; on iOS, copy via the Files app first.
- **Compile-format translation is intentionally skipped.** Scrivener compile formats don't map cleanly. The Options step has an opt-in toggle to create a starter preset; otherwise, build from scratch after import.
- **Some inline RTF features are deferred for fidelity tuning** (gated on real-corpus exposure): some hyperlink variants, nested footnotes within tables, unusual inline-image arrangements. These import as best-effort placeholders flagged in the error log.

Desktop + Android. 1297 tests pass.

## 0.4.0: 2026-05-06 — Manuscript view Continuous mode

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.4.0)

The Manuscript leaf gains a **List / Continuous** tab strip below the project picker. The new **Continuous tab** renders the entire project as one scrollable read-only document — chapters, scenes, sub-scenes, full bodies — for revision read-throughs that the per-scene List view isn't shaped for. Click any title heading to jump to its source file; the rest of the leaf (typography toolbar, file-save reactivity, scroll preservation) mirrors the Manuscript Builder Preview tab so writers experience the same reading-register behavior across both surfaces.

### Added

- **Manuscript view Continuous mode** ([#31](https://github.com/banisterious/obsidian-draft-bench/issues/31)). Tab strip toggles between List (today's navigation surface) and Continuous (read-through). Continuous renders the full manuscript in `dbench-order` — no preset filters, always-everything by design. Chapter / scene / sub-scene title headings carry click handlers (cmd/ctrl-click = new tab; +shift = split; +alt = window; right-click for the same options); writer-authored H2/H3s inside scene bodies stay inert. File-save reactivity re-renders prose on a 400 ms debounce with scroll preservation across the re-render. Shared four-control typography toolbar (text alignment, reading width, font size, font family) sits above the prose — same controls + global persistence as the Builder Preview. Active mode persists per project; new projects default to List.
- **`manuscriptViewMode` settings field.** `Record<projectId, 'list' | 'continuous'>` mirroring the existing `manuscriptBuilderTabState` pattern.
- **Opt-in heading source markers in `CompileService.generate(preset, opts)`.** New `GenerateOptions.emitHeadingMarkers` flag instructs the pipeline to append a `<span class="dbench-mark" data-source="<vault-path>"></span>` marker inside every emitted title heading so a post-render walker can attribute headings back to their source files. Off by default — Continuous mode opts in; binary compile renderers don't.
- **Shared preview-typography toolbar module** (`src/ui/shared/preview-toolbar.ts` + `styles/preview-toolbar.css`). Class hooks renamed from `dbench-manuscript-builder__*-toolbar*` to a neutral `dbench-preview-toolbar` block so the same toolbar mounts in both surfaces.

### Notes

- **Embeds are stripped from the Continuous render in V1.** The compile pipeline's `stripEmbeds` always strips regardless of preset configuration, so embeds (`![[...]]`) won't render inline in Continuous mode. Tracked as the "Embed handling" open question in the planning doc; flag friction in #31 if heavy-embed projects bite.
- **Mobile compatibility.** Continuous mode is mobile-supported on the same surface as the rest of the leaf (Android verified via the 0.3.2 elevation; iOS / iPadOS untested).

1130 unit + integration tests, all green. Mobile-supported (Android verified; iOS / iPadOS untested) — same as 0.3.2.

## 0.3.3: 2026-05-05 — Manuscript leaf restyle

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.3.3)

The Manuscript leaf moves from Direction B (Ulysses warm — chips, semantic status colors, gradient progress) to **Direction D3**, a Builder-aligned minimal aesthetic. Now harmonizes with the Manuscript Builder modal + leaf that shipped in 0.3.0 / 0.3.1: hairline rhythm, no semantic-status chrome, stock `.mod-cta` for the Compile button, section heads as small-caps muted text. Pure visual / IA polish; no API or data-shape change.

### Changed

- **Manuscript leaf restyle (Direction D3)** ([#30](https://github.com/banisterious/obsidian-draft-bench/issues/30)). Status chips replaced with inline small-caps muted text. Status dots in the project breakdown dropped. Per-scene mini progress bars dropped (writers read progress as text; the project-level bar is the canonical visual signal). Scene rows flatten to a single-row 4-column grid (order · title · status · count). Order capsule pill drops to plain tabular-numeric text. Compile button's gradient + shadow override drops to Obsidian's stock `.mod-cta` solid accent. Project progress bar shrinks from 8px gradient to 2px hairline solid accent. Section heads to `--text-muted` small-caps, matching the Builder.
- **Drafts column dropped from scene rows.** The "N drafts" column on each row is removed. Writers see drafts on the scene file itself; the leaf is for navigation.

### Removed

- **Per-status Style Settings exposures.** The four `--dbench-status-*` variable-color knobs are removed from the Style Settings UI. The CSS variables stay in `variables.css` because the Manuscript Builder's status filter pills (#25) still use them.

1112 unit + integration tests, all green. Mobile-supported (Android verified; iOS / iPadOS untested) — same as 0.3.2.

## 0.3.2: 2026-05-05 — Mobile support

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.3.2)

Draft Bench now loads on **Obsidian Mobile**. The desktop-only restriction is lifted in `manifest.json`; the audit pass found the plugin's surfaces work cleanly on touch devices without code-level breakage. **Vault output for PDF / ODT / DOCX** rides along so the binary compile formats produce a working result on mobile (the existing disk-output paths require Electron's save dialog and stay desktop-only).

Verified on Android via on-device walkthrough across Manuscript view, Manuscript Builder modal + leaf, scene / chapter / sub-scene / draft creation, the compile pipeline (including PDF + ODT + DOCX vault output), Style Settings, and Bases integration. iOS / iPadOS will ship **untested** until a Mac-equipped contributor with iOS access surfaces; bug reports are welcome and triaged via the `mobile-ios` label.

### Added

- **Mobile support** ([#29](https://github.com/banisterious/obsidian-draft-bench/issues/29)). `isDesktopOnly: false` in `manifest.json`. Every existing feature works on mobile except the disk-output side of the compile pipeline (desktop-only by construction; vault output is the mobile path).
- **Vault output for PDF / ODT / DOCX compile.** Presets configured for `format: pdf | odt | docx` plus `output: vault` now write the compiled binary to `<project>/Compiled/<preset>.<ext>` via Obsidian's `createBinary` / `modifyBinary`. Mobile-compatible. Supersedes the original D-06 clause that restricted binary formats to disk output.

### Notes

- The Scrivener `.scriv` importer ([#28](https://github.com/banisterious/obsidian-draft-bench/issues/28)) is not yet shipped. When it lands, its command and Manuscript view button will gate to desktop via `Platform.isDesktopApp` (RTF parsing and large-file ops make it a structurally desktop-only feature).

1112 unit + integration tests, all green. Mobile-supported (Android verified; iOS / iPadOS untested).

## 0.3.1: 2026-05-05 — Dockable Manuscript Builder leaf

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.3.1)

The 0.3.0 Manuscript Builder modal gains a **dockable leaf form** so writers can pin Preview next to a scene they're editing in another pane. The modal stays as the default entry point; a "dock to leaf" icon button in the modal's sticky header (next to the close button) closes the modal and reopens the same content as a workspace tab. The leaf form adds **debounced file-save reactivity** that the modal couldn't support — Preview re-renders ~400ms after a project member is saved, batching rapid saves into a single update.

### Added

- **Dockable Manuscript Builder workspace leaf** ([#27](https://github.com/banisterious/obsidian-draft-bench/issues/27)). A "dock to leaf" icon button in the modal's sticky header opens a workspace-tab version of the same Build / Preview UI. With the leaf open in a side pane, you can edit a scene in the main pane and watch Preview update as you save. File-save reactivity is debounced (400ms), filtered to project members (drafts and compile presets don't trigger), and only fires while the Preview tab is active. Single-leaf only: opening the Builder when a leaf already exists focuses the existing one. The leaf is one-way (no "convert back to modal" button); to return to modal form, close the leaf and reopen via the palette command or the Manuscript view's Compile CTA.
- **`Draft Bench: Show Manuscript Builder leaf` palette command.** Opens the leaf directly (focuses existing if present).
- **Preview scroll position preserved across file-save re-renders.** When you're reading deep in Preview and save a paragraph in another pane, Preview re-renders without snapping the scroll back to the top. Tab / preset / project changes still land at the top (those are "fresh entry" re-renders where you'd expect to start from the beginning).
- **Last-selected preset persists per project** (`manuscriptBuilderSelectedPresetId` in plugin settings). The leaf restores your last-tuned preset across Obsidian reload; the modal also benefits — close + reopen now restores the last-selected preset instead of always defaulting to the first one.

### Changed

- **Manuscript Builder rendering core extracted into a host-agnostic shell** so the modal and the new leaf share the same code. Internal refactor only; no behavior change for modal users.

1102 unit + integration tests, all green. Desktop-only.

## 0.3.0: 2026-05-04 — Manuscript Builder Preview tab

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.3.0)

The Manuscript Builder modal gains a **Preview tab** alongside the existing form stack (now Build tab), letting writers tune compile presets and read the rendered output without writing a real export file. Several maintainer-facing improvements ride along: an in-modal project switcher, a sticky header that keeps controls reachable during long Preview scroll, and per-project tab persistence.

### Added

- **Manuscript Builder Preview tab** ([#26](https://github.com/banisterious/obsidian-draft-bench/issues/26)). A new Preview tab renders the current preset's compile output as continuous read-only prose using Obsidian's `MarkdownRenderer`. Tweak settings on Build, flip to Preview, see the impact, iterate. Re-renders on tab activation, preset change, and project change; external edits to source notes mid-session are not auto-reactive (flip Build -> Preview to re-trigger). Sub-scene descent matches the compile pipeline (parent intro prose first, then sub-scenes in `dbench-order`). Tested clean against a 110k-word fixture project; the implementation is single-pass, no chunking or virtualization. A 250ms-threshold "Rendering..." spinner covers the perceived-latency case for larger projects. Empty-state messages cover the no-presets, no-scenes, filters-exclude-all, and render-error cases.
- **Preview typography toolbar.** Above the rendered Preview prose, a four-control toolbar lets the writer tune reading register without leaving the modal: text alignment (Left / Justify), reading width (Full / Med ~50em / Narrow ~40em), font size (12-24px stepper), and font family (Theme default / Serif / Sans-serif / Monospace). Choices persist globally as a reading-register preference, not per-project. No Style Settings dependency.
- **Project switcher in Manuscript Builder header.** The previous read-only project label is now a dropdown listing every project in the vault. Switching there updates the modal in place (presets, selected preset, last-active tab) and routes through the plugin's selection so the Manuscript view re-renders to match.
- **Sticky modal header.** The title, project + preset row, tab strip, and (when active) Preview typography toolbar pin to the top of the modal's scroll container. Keeps controls reachable during long Preview prose scroll.
- **Last-active tab persisted per project.** The modal remembers each project's last-used tab. First-open of any project lands on Build.
- **Style Settings exposure for Preview.** Seven CSS variables — `--dbench-tab-active-accent` plus six Preview-typography vars (font-family, font-size, line-height, max-width, paragraph-spacing, text-align) — exposed as a "Manuscript Builder Preview" section in the Style Settings community plugin. The in-modal toolbar covers the most common knobs without needing Style Settings; these variables serve power users wanting deeper customization.

### Fixed

- **Modal close button stays visible during long Preview scroll.** The sticky header's stacking context could paint over the close button (the X in the top-right corner) once content scrolled under. The close button now sits above the sticky header so it remains clickable from any scroll position.

1102 unit + integration tests, all green. Desktop-only.

## 0.2.4: 2026-05-04 — Manuscript view + Builder UI polish

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.2.4)

UI polish patch covering three small Manuscript-view and Manuscript Builder changes. Simplifies the primary action surface, clarifies multi-select intent on the status filter, and removes a redundant visual element on the status chip. No data-shape, compile-pipeline, linker, or integrity-service changes.

### Changed

- **Status chip drops the redundant colored dot** ([#23](https://github.com/banisterious/obsidian-draft-bench/issues/23)). The chip's small colored dot and pill background were both derived from the same `--dbench-status-<status>` variable, encoding status twice. The dot is gone; the pill background alone now carries the status color, matching the convention used in GitHub, Linear, Notion, and similar status-badge implementations. Pill horizontal padding rebalanced to symmetric since the previous left-tight padding was tuned for the dot-then-label flex layout. Affects scene rows, sub-scene rows, and chapter card headers (all share the same chip helper). Style Settings overrides on `--dbench-status-*` continue to work unchanged.
- **Status filter restyled as toggleable pills** ([#25](https://github.com/banisterious/obsidian-draft-bench/issues/25)). The Manuscript Builder's Inclusion section previously rendered each status as a native checkbox plus label, which visually read as a radio-button (single-select) pattern despite being multi-select. Each status now renders as a pill: outlined when unselected, color-mix-tinted with the per-status color when selected. Click anywhere on the pill toggles. The underlying `<input type="checkbox">` stays in the DOM (visually hidden) so screen readers and keyboard navigation continue to work; CSS `:has(input:focus-visible)` transfers the focus indicator to the chip. Mirrors the Manuscript view's status-chip pattern but with bolder emphasis for the active-config register.
- **Manuscript view's primary CTA now opens the Manuscript Builder** ([#24](https://github.com/banisterious/obsidian-draft-bench/issues/24)). The prominent "Compile" button used to short-circuit to instant compile (the only preset on single-preset projects, or a fuzzy preset picker on multi-preset projects). It now opens the Manuscript Builder modal, where the writer picks a preset, configures filters, and runs compile from the modal's header. The button is renamed "Compile..." per the standard ellipsis convention signaling "opens further UI before action." The smaller `book-up` icon button that previously opened the Builder from the Manuscript view header is removed as redundant. Writers who want true one-click compile can bind a hotkey to one of the existing palette commands (`Draft Bench: Compile current project`, `Draft Bench: Run compile...`).

1102 unit + integration tests, all green. Desktop-only.

## 0.2.3: 2026-05-04 — defensive linker-sort fixes

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.2.3)

Third hot patch of the day. Sequential `Set as sub-scene` retrofits surfaced a corruption pattern in a parent scene's reverse arrays — mispaired entries plus an orphan id that didn't match any note in the vault. Two defensive fixes against latent issues in the linker -> sort chain.

### Fixed

- **Sort no longer truncates length-asymmetric arrays** ([#22](https://github.com/banisterious/obsidian-draft-bench/issues/22)). `sortReverseArraysByOrder` used `Math.min` of the two array lengths and silently dropped tail entries when emitting the sorted output. Asymmetric arrays should never reach the sort under correct usage, but a corrupted sort output was strictly worse than the input. Now returns inputs unchanged when lengths diverge, surfacing the asymmetry for the integrity service to handle.
- **Linker passes the just-added child's order directly to the sort** ([#22](https://github.com/banisterious/obsidian-draft-bench/issues/22)). `ensureChildInReverse` previously relied on `findNoteById` against the metadataCache for every child including the just-added one. In real Obsidian, the cache for a just-modified file can lag its `'changed'` event by a tick, returning null and demoting the entry to `+Infinity` in the sort. Each subsequent sequential retrofit shifted the demoted entry further back, eventually producing a fully-rotated reverse array. The linker now threads the child's `dbench-order` through to the sort via a new `knownOrders` map; the sort prefers caller-provided values and falls back to `findNoteById` only for entries not in the map.

1102 unit + integration tests, all green. Desktop-only.

## 0.2.2: 2026-05-04 — sub-scene retrofit nested-layout fix

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.2.2)

Second hot patch of the day, surfaced while smoke-testing 0.2.1 against an existing sub-scene-shaped folder. `Set as sub-scene` retrofit was inferring the parent scene only for the flat layout; the § 10 nested layout (the post-#11/#12 default) silently fell through to empty placeholders, producing half-stamped notes that needed manual frontmatter editing.

### Fixed

- **Nested-layout parent inference** ([#21](https://github.com/banisterious/obsidian-draft-bench/issues/21)). `inferSceneForSubScene` now does a two-stage match: looks for a scene file at `${parentFolder}.md` first (the nested convention; the scene shares basename with the folder holding its sub-scenes), then falls back to the same-folder match for flat layouts. Resolves correctly under chapter-aware projects too. The retrofit now stamps the full `dbench-scene` / `dbench-scene-id` / `dbench-project` / `dbench-project-id` set + the next `dbench-order` automatically when the writer right-clicks an untyped file in a sub-scene-shaped folder.

1096 unit + integration tests, all green. Desktop-only.

## 0.2.1: 2026-05-04 — integrity-repair data-loss hot patch

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.2.1)

Same-day hot patch for a regression introduced by the 0.2.0 integrity-service work. Surfaced during post-release smoke testing in the maintainer's BRAT-public vault when running `Repair project links` against pre-#15 cache-race residue: each apply pass dropped one valid id from the parent's reverse arrays, then flagged the dropped child as MISSING on the next scan, then dropped another id on apply — a tight data-loss cycle that ran until manually stopped.

### Fixed

- **Auto-repair length guard** ([#20](https://github.com/banisterious/obsidian-draft-bench/issues/20)). The `add-to-reverse` handler now skips the splice-at-matching-index branch when the other array is already at full length but doesn't contain the missing value (i.e., some slot holds mispaired data). Such entries are counted in `conflictsSkipped` rather than being auto-repaired; the writer fixes the underlying `*_CONFLICT` manually first, then re-running scan converges cleanly. The original #14 deletion-shift scenario (where one array is genuinely shorter) continues to auto-repair as designed.

If you ran `Repair project links` against a pre-#15 vault between 0.2.0 and this patch and saw repeated MISSING flags, your reverse arrays may have lost ids. Recovery: open each affected child's frontmatter, copy its `dbench-id`, paste it into the parent's reverse-id array at the matching wikilink position. The integrity scan after this patch will surface the right targets via `*_CONFLICT` descriptions.

1095 unit + integration tests, all green. Desktop-only.

## 0.2.0: 2026-05-04 — sub-scene note type

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.2.0)

The first feature release after the BRAT-public 0.1.x patch series. Sub-scene type promoted from post-V1 to pre-1.0 (the maintainer hit it themselves while writing: six distinct narrative units in a single scene that needed per-unit status, drafts, and isolation), plus a settings-tab reorganization, chapter-aware folder defaults, and a sweep of integrity-service quality-of-life fixes.

### Headline

- **Sub-scene note type** ([#10](https://github.com/banisterious/obsidian-draft-bench/issues/10)). Break a scene into per-unit narrative blocks (the setpieces of an auction night, the movements of a trial sequence, the four memories of a grief sequence), each with its own status, drafts, word count, and reorder position. Hierarchical scenes render as collapsible cards in the Manuscript view; the compile pipeline descends into sub-scenes in narrative order (preserving the parent scene's intro prose under `## Draft` when present); the integrity service tracks scene `<->` sub-scene and sub-scene `<->` draft relationships with the same scan + repair affordances as the other types. New affordances: `New sub-scene` palette command, `Draft Bench` -> `New sub-scene` context-menu entry, `Draft Bench` -> `Set as sub-scene` retrofit, `New draft of this sub-scene`, an "Add sub-scene" button on each Manuscript-view scene card. **Backward-compatible**: scenes without sub-scenes work exactly as before.

### UX + organization

- **Settings tab reorganized** ([#18](https://github.com/banisterious/obsidian-draft-bench/issues/18)). Six collapsible sections (Folders, Drafts, Templates, Statuses, Bidirectional sync, About) replace the previous flat scroll. Long descriptions on Scenes folder + Sub-scenes folder shrunk to one short sentence each; shared `{project}` / `{chapter}` / `{scene}` token semantics moved to a section-level info box. About section gained clickable Repository / Wiki / Website links.
- **Chapter-aware folder defaults** ([#11](https://github.com/banisterious/obsidian-draft-bench/issues/11), [#12](https://github.com/banisterious/obsidian-draft-bench/issues/12)). New `scenesFolder` default `{chapter}/` nests scenes under their chapter folder for chapter-aware projects (degrades to flat for chapter-less ones). `subScenesFolder` joins against the parent scene's actual folder, so sub-scenes follow scenes wherever they live. Existing installs migrate once on first 0.2.0 load, and the linker auto-renames the matching folders when a chapter or scene gets renamed.

### Integrity-service quality-of-life

- **One-pass repair convergence** ([#13](https://github.com/banisterious/obsidian-draft-bench/issues/13)). `Repair project links` now resolves length-mismatched parallel arrays (orphan id + padded-empty wikilink, or vice versa) in a single pass instead of needing two.
- **Pairing-preserving repair** ([#14](https://github.com/banisterious/obsidian-draft-bench/issues/14)). When the scan flags a missing entry on one side of a paired array, the repair splices the missing side at the matching index so wikilinks and ids stay aligned by position.
- **Sorted reverse arrays** ([#19](https://github.com/banisterious/obsidian-draft-bench/issues/19)). `dbench-scenes` / `dbench-sub-scenes` / etc. now sort by each child's `dbench-order` so frontmatter inspection mirrors narrative order.
- **`processFrontMatter` cache-race fix** ([#15](https://github.com/banisterious/obsidian-draft-bench/issues/15)). Six `createX` functions previously read the newly-stamped `dbench-id` from the metadata cache after the write returned, often hitting pre-write cache state. Fix captures the id inside the callback. Existing vaults with `""` reverse-id entries from before this fix continue to function; a sweep utility for backfilling is planned as a follow-up.
- **Word-count rollup fix** ([#16](https://github.com/banisterious/obsidian-draft-bench/issues/16)). Chapter-card word counts now include sub-scene contributions for hierarchical scenes-in-chapter (was dropping them one level up).

1093 unit + integration tests, all green. Desktop-only.

## 0.1.4: 2026-04-30 — property-type registration + scene context-menu parity

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.4)

Two fixes:

- **Property-type registration**: tells Obsidian's `metadataTypeManager` to treat `dbench-*` relationship fields and their ID companions as text / multitext. The principled root-cause fix for the 0.1.1 → 0.1.3 wikilink-reshape chain — Properties panel now writes wikilinks as quoted strings from the start, and `processFrontMatter` round-trips them stably. Defense-in-depth: the 0.1.3 canonicalization in the linker stays as a safety net. Refs #8.
- **Scene context-menu parity**: right-clicking a scene file now surfaces a `New draft of this scene` entry in the `Draft Bench` submenu, matching the existing `New draft of this chapter` affordance on chapter notes. Refs #9.

947 unit + integration tests, all green. Desktop-only.

## 0.1.3: 2026-04-30 — YAML-shape polish for wikilink fields

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.3)

Single-fix patch. After the linker backfilled an ID companion for a wikilink-only relationship edit (per 0.1.1 / 0.1.2), the on-disk YAML for the wikilink field ended up in block-style nested-array form (`dbench-scene:\n  - - Some Scene`) rather than the canonical quoted-string form (`dbench-scene: "[[Some Scene]]"`). Same data, ugly rendering. The linker now re-canonicalizes the wikilink field in the same callback that writes the companion. Refs #7.

938 unit + integration tests, all green. Desktop-only.

## 0.1.2: 2026-04-30 — wikilink-only retrofit fix (frontmatterLinks)

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.2)

Follow-up to the wikilink-only retrofit fix from 0.1.1. The 0.1.1 fix parsed the raw frontmatter value, which works for YAML-quoted wikilinks (`dbench-scene: "[[Some Scene]]"`) but missed the unquoted form Obsidian's Properties panel writes by default (`dbench-scene: [[Some Scene]]`). YAML parses the unquoted form as a nested array, which the parser didn't recognize.

Highlights:

- The linker now consults Obsidian's `frontmatterLinks` cache when backfilling the ID companion. That cache holds the resolved link target regardless of how the YAML stored the value, so the backfill works for both quoted and unquoted forms. Refs #6.
- The raw-value parser stays as a defense-in-depth fallback and now also handles the nested-array form for cases where `frontmatterLinks` isn't populated.

935 unit + integration tests, all green. Desktop-only.

## 0.1.1: 2026-04-30 — context-menu refactor + retrofit fixes

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.1)

First incremental release after the 0.1.0 launch. Surfaced from real-vault migration testing on a writer's existing four-project Fiction folder.

Highlights:

- **Draft Bench submenu for context-menu actions**: all plugin entries now live under a single `Draft Bench` submenu in Obsidian's right-click menu (icon `scroll-text`), instead of cluttering the top level. Mobile fallback ships as a flat `Draft Bench:`-prefixed list since Obsidian doesn't support submenus on mobile yet. Refs #5.
- **Editor-menu support**: right-clicking inside an open editor now surfaces the same actions as right-clicking the file in the explorer. Refs #5.
- **Wikilink-only relationship edits now work**: setting a relationship wikilink (e.g., `dbench-scene: [[Some Scene]]` on a retrofitted draft) via the Properties panel previously required also hand-copying the parent's `dbench-id` into the companion field. The linker now resolves the wikilink against the candidate-parent pool and backfills the companion automatically, then proceeds with normal reverse-array reconciliation. Affects all relationship retrofits. Refs #4.
- **Folder-scope `Set as project` is folder-note-aware**: previously, right-clicking a project folder and picking `Set as project` would batch-stamp every markdown file inside (including scene siblings) as a project. The action now only appears when the folder contains an untyped markdown file matching the folder's name (case-insensitive), and stamps only that file. Other folder-scope retrofits keep their batch behavior. Refs #3.

929 unit + integration tests, all green. Desktop-only.

## 0.1.0: 2026-04-29 — first BRAT-public release

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.0)

<p align="center">
  <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-bases-projects.png"
       alt="A Draft Bench Bases view listing projects with their type, status, target word count, and other dbench- frontmatter columns."
       width="800">
</p>

Ships the full V1 feature set per the [specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md). API and data shape may still adjust between minor versions during the 0.x phase; see [VERSIONING.md](https://github.com/banisterious/obsidian-draft-bench/blob/main/VERSIONING.md).

Highlights:

- Project, chapter, scene, draft, and compile-preset note types with `dbench-` frontmatter and bidirectional linking.
- Manuscript view with chapter cards, scene rows, status chips, word-count rollups, optional subtitles, wikilink-style title affordances, and active-note-sync.
- Manuscript Builder modal with multi-section compile-preset editor.
- Compile pipeline: Markdown / ODT / PDF / DOCX output, three heading-scope modes (full / draft / chapter), per-preset content-handling rules.
- Drafts: scene drafts, chapter drafts (concatenated body + scenes with boundary markers), single-scene-project drafts.
- Templates: built-in scene + chapter templates, plugin-token substitution, Templater pass-through, multi-template discovery via `dbench-template-type` frontmatter.
- Linker + integrity service with batch repair via the `Repair project links` command.
- Retrofit actions (`Set as project / chapter / scene / draft`, complete essential properties, add identifier) with folder-based inference.
- Bases starter views, Style Settings integration, configurable status vocabulary.
- Onboarding: welcome modal, example-project generator, first-project auto-reveal.

896 unit + integration tests, all green. Desktop-only (`isDesktopOnly: true`); mobile re-evaluation is post-V1.

## 0.0.1: 2026-04-16 — scaffolding

Initial scaffolding. No user-facing features.

- Project scaffolding: configs, stubs, MIT license, build/lint/deploy pipeline.
- Coding standards document.
- Specification document.

---

For the development roadmap, see the [specification § Development Phases](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md).
