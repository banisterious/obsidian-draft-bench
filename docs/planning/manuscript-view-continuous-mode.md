# Manuscript view continuous mode (0.4.0)

Planning doc for adding a Continuous view mode to the Manuscript leaf, alongside today's List view. Originally captured as candidate #2 in [post-v1-candidates.md](post-v1-candidates.md), promoted to its own planning doc on 2026-05-05 with a 0.4.0 target.

**Status:** Drafted 2026-05-05. Sections below mirror [manuscript-builder-preview.md](manuscript-builder-preview.md)'s template. Implementation tracked via [#31](https://github.com/banisterious/obsidian-draft-bench/issues/31).

**Target release:** 0.4.0. Sequenced after the Manuscript leaf restyle ([#30](https://github.com/banisterious/obsidian-draft-bench/issues/30), targeting 0.3.3) so the new tab strip lands on the D3-aligned visual base.

**One-line scope.** Add a Continuous view mode to the Manuscript leaf that renders the entire manuscript as one scrollable read-only document, alongside today's List view. Toggle via a `List / Continuous` tab strip in the leaf header. Reuses the Manuscript Builder Preview's renderer machinery (`MarkdownRenderer.render`, 250ms spinner threshold, typography toolbar, Style Settings vars).

---

## Why this is in 0.4.0

Read-throughs are a load-bearing writing-tool need. Scrivener's Scrivenings is beloved for it; StoryLine has it; Longform has it. Writers want to see their manuscript as continuous prose during revision passes (catch repetition, pacing problems, voice drift). Today's List view is great for navigation and progress tracking, but it's not great for reading.

The Builder Preview tab (0.3.0) ships continuous-render machinery, but Builder Preview is preset-scoped (filters, scope, transforms applied) and modal/Builder-leaf-shaped (open when configuring a compile). Continuous mode is full-manuscript-scoped and sidebar-shaped (always-available alongside writing). Two distinct use cases, two surfaces.

The dependencies are met as of 0.3.1 (compile pipeline, sub-scenes, integrity hardening, the leaf machinery from the dock-to-leaf work). The restyle ([#30](https://github.com/banisterious/obsidian-draft-bench/issues/30), 0.3.3) introduces the visual register Continuous mode lands into. After 0.3.3 ships, this milestone adds the tab strip + the new tab.

---

## What's locked at the meta level

Decisions ratified during the design conversation on 2026-05-05 (preserved here so the implementation phase doesn't re-litigate):

- **Two view modes on the Manuscript leaf: List (today) / Continuous (new).** Toggle via a tab strip in the leaf header. The strip is added in this milestone (the restyle in [#30](https://github.com/banisterious/obsidian-draft-bench/issues/30) ships without it; single-tab UI reads as broken).
- **Sidebar role preserved.** Continuous lives in the existing Manuscript leaf, not a new leaf. The leaf stays sidebar-shaped (always-available while writing).
- **Renderer reuse.** Continuous calls the same `MarkdownRenderer.render` path the Builder Preview uses. Same 250ms spinner threshold (per [manuscript-builder-preview.md § 3](manuscript-builder-preview.md)). No new renderer, no new spinner, no chunked or virtualized variant for V1.
- **Filter-aware: always-everything.** Continuous mode shows the entire manuscript top-to-bottom, never preset-filtered. Filters are a Builder concern. Distinct surface, distinct semantics.
- **Typography toolbar reused verbatim.** Same four controls (alignment / max-width / font-size / font-family). Same `--dbench-preview-*` Style Settings vars (`font-family`, `font-size`, `line-height`, `max-width`, `paragraph-spacing`, `text-align`). The toolbar component extracts to a shared module if it isn't already; both surfaces mount it.
- **Click-heading-to-open: active leaf, with context-menu open-affordances.** Tap a heading -> opens the source file in the active leaf. Right-click / long-press -> existing `attachWikilinkOpenAffordances` helper offers new tab / split / window. Same affordances writers already get on List view's scene rows.
- **Empty state: identical to List.** Same brand-mark empty state as List view (per [manuscript-leaf-design-refinement.md](manuscript-leaf-design-refinement.md) lock). No mode-distinct copy.
- **Default mode: List for new projects.** Per-project last-used mode persists via new settings field `manuscriptViewMode: Record<projectId, 'list' | 'continuous'>`. No global "always default to X" override.
- **Builder Preview vs Continuous mode are complementary, not redundant.** Each serves a different writer need and lives in a different surface; the docs should make that explicit so writers don't experience them as duplicate features. Reciprocal cross-reference goes into [manuscript-builder-preview.md](manuscript-builder-preview.md).

---

## Sections requiring ratification

Each section presents a remaining design decision, ratified during the 2026-05-05 design conversation. Ratifications carry forward into implementation.

### 1. Tab strip placement and styling

**Ratified 2026-05-05: tab strip below the project picker, two tabs, underline pattern.**

The strip mirrors the Manuscript Builder's tab pattern from 0.3.0 (per [manuscript-builder-preview.md § 1](manuscript-builder-preview.md#1-tab-styling-and-pattern)): plain text labels with a 2-pixel accent-colored underline beneath the active tab. Inactive tabs use `var(--text-muted)`. Same class-hook namespace pattern as the Builder.

**Class hooks:**

- `dbench-manuscript-view__tabs` — strip container
- `dbench-manuscript-view__tab` — individual tab
- `dbench-manuscript-view__tab--active` — active state

**Style Settings:** reuses `--dbench-tab-active-accent` from the Builder Preview's Style Settings section. No new variable.

**Considered and not chosen:**

- **Header dropdown** ("View: List / Continuous"). Lower discoverability — the toggle would feel buried.
- **Toggle button** (single button that flips state). Clear binary, but adds chrome; tabs are a known affordance writers already use in the Builder.
- **Palette command only.** Too hidden for a primary mode.

### 2. Scene-source mechanism (synthetic default-preset)

**Ratified 2026-05-05: synthetic default-preset feeds the existing `CompileService.generate`.**

Continuous mode constructs a synthetic `CompilePresetNote` in memory with minimal-transform defaults aimed at "show me the manuscript as it exists in the vault":

| Field | Synthetic value | Why |
|---|---|---|
| `dbench-compile-format` | `md` | Output is for in-Obsidian rendering; format value is moot but `md` keeps the pipeline straightforward |
| `dbench-compile-output` | `vault` | Same — format/output don't actually write a file in this path |
| `dbench-compile-scene-statuses` | empty | No status filtering; show every scene regardless of status |
| `dbench-compile-scene-excludes` | empty | No scene exclusions |
| `dbench-compile-heading-scope` | `full` | Include the whole scene body, not just `## Draft` content |
| `dbench-compile-frontmatter` | `strip` | YAML doesn't render meaningfully in `MarkdownRenderer` anyway |
| `dbench-compile-wikilinks` | `preserve` | Keep wikilinks clickable so writers can jump to references during read-through |
| `dbench-compile-embeds` | `preserve` | Embeds render inline via `MarkdownRenderer`; writers see what they wrote |
| `dbench-compile-dinkuses` | `preserve` | Same as the Builder Preview default |
| `dbench-compile-include-section-breaks` | `true` | Honor scene-level section breaks |
| `dbench-compile-chapter-numbering` | `none` | Continuous reads as the writer wrote it; no compile-style numbering injected |
| `dbench-compile-include-cover` | `false` | No cover page in a sidebar read-through |
| `dbench-compile-include-toc` | `false` | TOC is a Builder Preview / compile-output concern |

The result: every project member rendered in `dbench-order`, full bodies, wikilinks and embeds clickable, footnotes auto-renumbered (per the hardcoded D-06 rule).

**Why not a separate "raw concatenation" function:**

- The compile pipeline already handles `dbench-order` walking, scene/chapter/sub-scene assembly, footnote renumbering. A new path would duplicate that work and risk drift.
- The synthetic-preset approach is roughly 20 lines of TypeScript (build the preset object) plus zero new pipeline code.
- Future content-handling rule additions (per D-06) automatically apply consistently to both surfaces.

**Considered and not chosen:**

- **New `CompileService` entry point** (e.g., `generateForReadThrough()`). Cleaner API but duplicates everything the synthetic-preset path gets for free.
- **Hard-coded "raw concat" function.** Tighter control but parallel implementation.
- **Use a real preset chosen by the writer.** Fundamentally changes the semantics — Continuous becomes preset-scoped, which is the Builder Preview's job.

### 3. Click-heading-to-open behavior

**Ratified 2026-05-05: tap = open in active leaf; context menu offers new tab / split / window.**

Tapping a heading in the rendered prose opens the source file in the active leaf via `app.workspace.openLinkText`. Right-click on desktop or long-press on mobile surfaces the existing context-menu affordances via [attachWikilinkOpenAffordances](../../src/ui/manuscript-view/sections/open-affordances.ts) — the same helper the List view's scene rows already use. This means cmd/ctrl-click for new tab, +shift for split, +alt for new window, middle-click for new tab, are all wired automatically.

**Heading scope:** all chapter / scene / sub-scene title headings get click handlers. Headings inside scene bodies (writer-authored H2/H3 inside the prose) do not — they're prose structure, not navigation.

**Considered and not chosen:**

- **Always open in new tab.** Non-destructive but disrupts the writer's flow when they want to make a quick edit and return.
- **Active leaf with no context menu.** Too rigid; writers sometimes want to open in split for side-by-side editing.
- **Click-anywhere-on-scene-body to open.** Confusing — the prose is for reading; click-to-open should be on a clearly marked navigation element (the heading).

### 4. Re-render triggers

**Ratified 2026-05-05: tab activation, project-selector change, debounced file-save reactivity (400ms, project-member filter).**

Same trigger set as the Manuscript Builder leaf (per [manuscript-builder-preview.md § 4](manuscript-builder-preview.md#4-preview-re-render-trigger-granularity), as extended in 0.3.1):

1. **Tab activation.** Switching from List to Continuous re-renders against the current state.
2. **Project-selector change.** Switching projects while on Continuous re-renders against the new project.
3. **File-save reactivity.** `vault.on('modify')` listener filtered to project members (`dbench-type` of project / chapter / scene / sub-scene with matching `dbench-project-id`; drafts and compile-presets excluded). Debounced 400ms (`FILE_SAVE_DEBOUNCE_MS`); listener no-ops when active tab is List.
4. **Scroll preservation across re-renders.** Mirroring the 0.3.1 Builder leaf pattern: capture `scrollTop` in the debounce callback before re-render; restore via `requestAnimationFrame` after `MarkdownRenderer.render` lays out new content. Tab / project changes deliberately don't preserve scroll (they're "fresh entry" re-renders).

**Considered and not chosen:**

- **Manual refresh button.** Unnecessary given file-save reactivity. Would be redundant chrome.
- **Per-keystroke reactivity.** Too noisy; the debounced file-save behavior is the right granularity.
- **External-edit reactivity off.** Continuous lives in a leaf alongside the writer's editing pane; reactivity is the whole point.

### 5. Performance ceiling

**Ratified 2026-05-05: single-pass `MarkdownRenderer.render` against the synthetic-preset's `CompileResult.markdown`. No chunking, no virtualization. 250ms spinner threshold.**

Same approach the Builder Preview shipped (per [manuscript-builder-preview.md § 2](manuscript-builder-preview.md#2-render-performance-ceiling)). The Builder Preview was tested clean against a 110k-word fixture project; Continuous mode renders the same kind of content via the same renderer, so the same performance bound applies. Sidebar viewport may be narrower (250-400px) but height is the full leaf; render time is content-bound, not viewport-bound.

**Code-comment requirement:** the renderer call site carries a comment naming this decision and pointing at the chunked-render path as the next step if performance reports surface. Same pattern as the Builder Preview.

**Considered and not chosen:**

- **Chunked render.** The known fallback path. Defer until writers report lag or a benchmark surfaces unacceptable times.
- **Virtualized scroll.** Real engineering project. Defer indefinitely.

### 6. Typography toolbar reuse

**Ratified 2026-05-05: reuse the Manuscript Builder Preview's typography toolbar verbatim.**

The toolbar component (alignment / max-width / font-size / font-family controls) extracts to a shared module if it isn't already. Both surfaces mount it. Same Style Settings variables apply (`--dbench-preview-*`).

**Implementation note:** the toolbar's persistence pattern (settings field `previewTypography` per [manuscript-builder-preview.md](manuscript-builder-preview.md)) is shared. Continuous mode and Builder Preview honor the same writer-set typography preferences — flipping between them shouldn't reset font choice.

**Considered and not chosen:**

- **New toolbar with different controls.** Needless divergence. The four controls cover what writers tune for prose reading.
- **No typography toolbar.** Writers want font / size control for read-throughs; the Builder Preview proves this. Same need here.
- **Per-mode independent typography preferences.** Saving two sets of preferences for the same prose-reading register over-engineers a problem writers don't have.

### 7. Empty state

**Ratified 2026-05-05: identical brand-mark empty state to List view.**

When no project is selected (or the selected project has no scenes), Continuous mode shows the same brand-mark empty state as List view — the writer's situation ("no project / no scenes") is identical regardless of mode, and the action ("Create your first project to start tracking scenes, drafts, and compile presets") is identical too.

**Considered and not chosen:**

- **Distinct copy** ("Continuous mode shows your manuscript top-to-bottom; create scenes first to see them here"). Over-engineering; the writer is told to create scenes either way.
- **Auto-fall-back to List on empty state.** Mode change without writer asking is confusing.

### 8. Default mode and persistence

**Ratified 2026-05-05: List default; per-project last-used mode persists.**

- New project, never opened in either mode -> defaults to List. List is the navigation surface; Continuous is the special-occasion read-through.
- Writer flips to Continuous on a project -> next time the project is opened, Continuous is restored.
- Settings field: `manuscriptViewMode: Record<projectId, 'list' | 'continuous'>`. Mirrors the existing `manuscriptBuilderTabState` per-project pattern from 0.3.0.
- No global "always default to Continuous" preference for V1.

**Considered and not chosen:**

- **Continuous as default for new projects.** Writers haven't created scenes yet; the navigation surface (List + empty state CTA) is more useful at first encounter.
- **Global override.** Defer to writer feedback; the per-project pattern likely covers the common case.
- **Reset-to-default-on-project-rename.** Would lose meaningful state across legitimate project renames; not worth the protection.

### 9. Heading-to-source association

**Ratified 2026-05-05: scene-source paths attached to title-heading DOM nodes via data-attribute during the compile pipeline's emit step.**

For each chapter / scene / sub-scene the compile pipeline knows about, the renderer wraps the emitted title-H1 with a `data-source-path="<vault-relative-path>"` attribute. The rendered DOM carries the attribute; tap handlers read it and call `app.workspace.openLinkText(path, '', shouldOpenInNew)`.

**Implementation seam:** the compile pipeline currently emits markdown as a flat string. The minimum extension is a sibling structured emission that carries `{ heading, sourcePath }` records, threaded through to the renderer. Alternatively, the renderer post-processes the rendered DOM to match heading text against project members and attach sources after the fact — fragile if titles aren't unique.

The structured-emission approach is the recommended path; it's tighter and handles duplicate titles cleanly.

**Considered and not chosen:**

- **DOM walk to find heading source after render.** Brittle; assumes heading text uniquely identifies the source file, which isn't guaranteed.
- **Render-side wikilink emission per heading** (e.g., emit `[[scene-file]]` as the heading text). Visually fights wikilink rendering; complicates the compile pipeline.
- **No click-heading-to-open** for V1, defer to writer feedback. Possible but undermines a key Continuous-mode use case (revising prose, then jumping to make an edit at the source).

---

## Implementation sequence

Numbered steps to ship 0.4.0. Each step is committable independently.

1. **Settings: `manuscriptViewMode` field.** Add `manuscriptViewMode: Record<string, 'list' | 'continuous'>` to plugin settings shape, default `{}`. Wire load/save like the existing per-project tab-state field.
2. **Tab strip in Manuscript view header.** Two tabs (List / Continuous), underline pattern. State change updates `manuscriptViewMode[projectId]` and re-renders the body. CSS: `dbench-manuscript-view__tabs`/`__tab`/`__tab--active`. Smoke against default-light + default-dark + at least one community theme.
3. **Default mode logic.** New project (no entry in `manuscriptViewMode`) -> List. Existing entry -> restore.
4. **Continuous body container.** New module at `src/ui/manuscript-view/sections/continuous.ts`. Mounts the typography toolbar (extract from Builder Preview if not already shared) + a render container. Empty initially.
5. **Synthetic default-preset construction.** Helper that produces a `CompilePresetNote` with the minimal-transform defaults from § 2. Per-call (project-scoped, not cached).
6. **Continuous render plumbing.** Wire the body to call `CompileService.generate(syntheticPreset)`, pass `CompileResult.markdown` to `MarkdownRenderer.render`. 250ms-threshold spinner per § 5.
7. **Heading-to-source DOM attribution.** Extend the compile pipeline's emit step (or post-render DOM walk, per § 9 ratification) to attach `data-source-path` to each chapter / scene / sub-scene title heading.
8. **Click-heading handlers.** Tap = open in active leaf via `app.workspace.openLinkText`. Use `attachWikilinkOpenAffordances` for context-menu affordances per § 3.
9. **File-save reactivity.** `vault.on('modify')` listener filtered to project members; 400ms debounce; no-op when active tab is List. Same pattern as the Builder leaf.
10. **Scroll preservation across re-renders.** Capture `scrollTop` in the debounce callback before re-render; restore via `requestAnimationFrame`. Tab / project changes don't preserve scroll.
11. **Empty state.** Confirm the existing brand-mark empty state surfaces correctly in Continuous mode (project not selected, or selected project has no scenes). No new copy.
12. **Style Settings.** Confirm `--dbench-preview-*` variables apply correctly when used from the Manuscript view's Continuous body. No new vars.
13. **Wiki page update.** Add a "Continuous mode" section to the Manuscript-view wiki page covering toggle, scope, click-heading, typography toolbar.
14. **CHANGELOG entry.** Under `[Unreleased]`, then cut to `[0.4.0]` at release time.

Estimated total effort: **3-5 days of focused work** plus QA / dogfooding pass against a real project. Most complexity is in steps 5-7 (synthetic preset + heading attribution); the rest is boilerplate and reuse.

---

## Out of scope for 0.4.0

Explicitly deferred:

- **Chapter-scoped continuous read.** Tap a chapter card in List view to open just that chapter's continuous view. Post-V1.
- **Heading-scope toggle.** Writer flips between draft-only / full body view in Continuous. V1 is full-body; revisit if feedback asks.
- **Global default-mode preference.** Per-project last-used is enough.
- **Bookmark / scroll-to-section navigation.** Post-V1.
- **TOC sidebar within Continuous.** Post-V1.
- **Per-mode Style Settings divergence.** V1 reuses `--dbench-preview-*`; revisit if writers want independent typography for the two surfaces.
- **Read-only highlight or comment overlay.** Out of scope; writers edit at the source via click-heading.
- **Print-style page breaks rendered in Continuous.** Continuous is for screen reading, not print preview; the Builder Preview / actual compile cover that need.

---

## Open questions

Items the design conversation didn't fully resolve; carry forward into implementation:

- **Heading-scope default for the synthetic preset.** Locked as `full` per § 2. Worth verifying in dogfood whether `draft` would be the better default (writers reading for prose flow may not want planning-section content interleaving). Easy revision if surfaced.
- **Embed handling.** Locked as `preserve` per § 2. Writers with heavy embed usage may find Continuous rendering slow or visually noisy. Revisit if reports surface; could switch to `strip` if needed.
- **Tab persistence at the wrong granularity.** `manuscriptViewMode[projectId]` is per-project. If a writer flips to Continuous on Project A, then later opens Project B (which they'd never seen Continuous on), B defaults to List. Correct behavior, but worth noting for documentation.
- **Performance smoke test against very-large vaults.** The Builder Preview was tested at 110k words; Continuous mode renders the same content. A 500k-word project hasn't been benchmarked. Not a ship blocker for V1; flag in the implementation step 6 commit body if writers report lag.

---

## Decision log

Track ratifications and reversals as work proceeds.

- **2026-05-05** — Doc created from candidate #2 in [post-v1-candidates.md](post-v1-candidates.md) after a design conversation covering: relationship to Builder Preview (different consumer, different surface), tab-strip placement, scene-source mechanism (synthetic default-preset), click-heading behavior, re-render triggers, performance, typography toolbar reuse, empty state, default mode + persistence, heading-to-source association. All meta-level decisions ratified. § 1-9 ratifications captured below.
- **2026-05-05** — § 1 ratified: tab strip below project picker, two tabs, underline pattern matching Builder.
- **2026-05-05** — § 2 ratified: synthetic default-preset (heading-scope: full, frontmatter: strip, wikilinks/embeds/dinkuses: preserve, no chapter numbering, no filters) feeds existing `CompileService.generate`.
- **2026-05-05** — § 3 ratified: tap = open in active leaf; right-click / long-press = new tab / split / window via existing `attachWikilinkOpenAffordances` helper.
- **2026-05-05** — § 4 ratified: re-render on tab activation, project-selector change, debounced (400ms) file-save reactivity. Scroll preservation across re-renders mirroring 0.3.1 Builder leaf pattern.
- **2026-05-05** — § 5 ratified: single-pass `MarkdownRenderer.render`, 250ms spinner. Same as Builder Preview.
- **2026-05-05** — § 6 ratified: typography toolbar reused verbatim from Builder Preview; same `--dbench-preview-*` variables; shared persistence via `previewTypography` settings field.
- **2026-05-05** — § 7 ratified: empty state identical to List view.
- **2026-05-05** — § 8 ratified: List default for new projects; per-project last-used mode persists via new `manuscriptViewMode` settings field; no global override.
- **2026-05-05** — § 9 ratified: scene-source paths attached to title-heading DOM nodes via `data-source-path` during the compile pipeline's emit step.
- **2026-05-05** — Reciprocal cross-reference TBD in [manuscript-builder-preview.md](manuscript-builder-preview.md) once the milestone moves to implementation: note Continuous mode as the leaf-shaped, full-manuscript-scoped sibling to the modal/leaf-shaped, preset-scoped Builder Preview.
