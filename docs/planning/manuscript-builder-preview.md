# Manuscript Builder Preview tab (0.3.0)

Planning doc for adding a Preview tab to the Manuscript Builder modal. Originally captured as candidate #4 in [post-v1-candidates.md](post-v1-candidates.md), promoted to its own planning doc on 2026-05-04 with a 0.3.0 target.

**Status:** Drafted 2026-05-04. Sections below mirror [sub-scene-type.md](sub-scene-type.md)'s template (the most recent pre-1.0 promotion precedent). Implementation tracked via [#26](https://github.com/banisterious/obsidian-draft-bench/issues/26).

**Target release:** 0.3.0 (next minor after the 0.2.x line).

**One-line scope.** Add a Preview tab to the Manuscript Builder modal that renders the current preset's compile output as a continuous read-only document, alongside today's Build tab (the existing collapsible-section content).

---

## Why this is in 0.3.0

The maintainer hit it in their own writing on 2026-05-04: tuning compile presets without a fast preview path means either (a) Compile-and-inspect-the-file (slow iteration; clutter from real output files just to see what something looks like), or (b) trust the form fields and discover surprises only when the real compile lands. A Preview tab inside the modal that already holds the preset settings closes the loop: tweak settings on Build, flip to Preview, see the impact, iterate.

The modal is also wider than the Manuscript view's default sidebar location, which makes it the better surface for reading prose anyway. This is the practical answer to the read-through use case the original [post-v1-candidates.md § 3 (Scrivenings-style continuous Manuscript view)](post-v1-candidates.md) entry articulated, while leaving #3 itself in place for the *persistent / leave-open / multi-pane* use case it actually serves better. They're complementary, not redundant; #3 can ship later (or never) without diminishing this work.

---

## What's locked at the meta level

Decisions ratified during the design conversation on 2026-05-04 (preserved here so the implementation phase doesn't re-litigate):

- **Two horizontal tabs at the top of the modal body: `Build` and `Preview`.** Build is today's stacked collapsible-section content, unchanged. Preview is the new continuous render.
- **Tabs sit below the project + preset selector row.** Header (project + preset selectors) stays at the top so the writer always knows which preset is in play; tabs switch what's below.
- **Compile button stays in the modal header, visible from both tabs.** The Compile action is the modal's primary verb and should be reachable from anywhere inside it.
- **Compile button name unchanged: "Run compile".** Format-aware refinement (e.g., "Compile to PDF...") is a separate UX question, deferred.
- **Live preview = re-render on each tab activation.** In a top-tab world the user can't be on Build and Preview simultaneously, so "live" reduces to "Preview reflects the current preset state every time it's activated." A small "Rendering..." spinner covers the render window for large projects.
- **Preview descends into sub-scenes the way compile does.** Hierarchical scenes render with sub-scene bodies in `dbench-order`, preserving the parent scene's intro prose at the head — same semantics as the compile pipeline.
- **No click-heading-to-open interactions in Preview.** Preview is a *review* surface, not an *edit* surface; modal context can't accommodate click-through cleanly (closes-modal loses context; keeps-modal opens the source note invisibly behind the modal). The leaf-mode candidate ([post-v1-candidates.md § 3](post-v1-candidates.md)) is where click-heading lives.
- **Empty states designed in.** Three cases: no scenes match the preset's filters; project has no scenes; render error. Each surfaces a brief actionable message. Copy iterates after writers hit them in practice.
- **Last-active tab persists per project.** Matches the existing per-project preset-selection persistence pattern.

---

## Sections requiring ratification

Each section below presents a remaining design decision. Ratify each before implementation begins.

### 1. Tab styling and pattern

**Ratified 2026-05-04: underline pattern, custom CSS with `dbench-` prefix.**

The Build / Preview tabs render as plain text labels with a 2-pixel accent-colored underline beneath the active tab. Inactive tabs are muted text (`var(--text-muted)`) with a hover state lifting them to `var(--text-normal)`. Active tab text and underline both use `var(--interactive-accent)`. Tab padding ~10px vertical / 16px horizontal. The tab strip has a 1-pixel bottom border (`var(--background-modifier-border)`) that the active tab's underline overlaps by 1 pixel (negative bottom margin) so the active tab visually "punches through" the strip's border.

This is the lowest-visual-weight of the patterns evaluated; status badges and other modal chrome stay primary, with tabs reading as quiet navigation.

**Class hooks** (used by both the implementation and Style Settings):

- `dbench-manuscript-builder__tabs` — tab strip container
- `dbench-manuscript-builder__tab` — individual tab
- `dbench-manuscript-builder__tab--active` — active tab state

**Style Settings variable:** `--dbench-tab-active-accent`, defaulting to `var(--interactive-accent)`. Lets theme authors override the underline / active-text color independently of Obsidian's global accent if desired.

**Considered and not chosen:**

- **Native Obsidian editor-tab pattern** (`.workspace-tab-header`). Visual coherence pro, but intended for editor tabs and reads heavy at modal scale.
- **Pill-style** (rounded-pill background tinted with accent on the active tab; Notion / Linear pattern). Medium visual weight; reads as "selectable state" but the modal didn't need that emphasis.
- **Segmented control** (both tabs in a unified background container; active tab a raised inner cell; iOS-like). Strong "binary toggle" framing — close runner-up. May be worth revisiting if Build / Preview ever expands to more than two tabs (which would break the segmented metaphor anyway).

Visual mockups for all three considered patterns lived under `docs/mockups/tab-pattern-{1,2,3}-*.html` during the design phase (gitignored).

### 2. Render performance ceiling

**Ratified 2026-05-04: Option A (trust `MarkdownRenderer`, no virtualization). Not gated on a pre-ship performance smoke test.**

The Preview tab calls `MarkdownRenderer.render` against the `CompileService` markdown intermediate in a single pass. No chunking, no virtualization. The "Rendering..." spinner (per § 3) covers the perceived-latency case for whatever render time results.

**Code-comment requirement:** the renderer call site carries a comment naming this decision and pointing at the chunked-render path as the next step if performance reports surface. Format: a brief paragraph describing the trade-off, so a future contributor lands in the right place without having to dig through git history.

**Future activity (not a ship blocker):** build a seeded, large dummy vault (target 100k+ words across multiple chapters with hierarchical scenes) and benchmark Preview render time. The maintainer's own active vaults are not large enough to surface large-project lag organically, so a deliberate test fixture is the right way to characterize where Option A breaks down. This work is independent of 0.3.0 release timing.

**Considered and not chosen:**

- **B. Chunked render** (descend chapter-by-chapter, render each, concat). The known fallback path. More complex than A; warranted only if writers report lag or the eventual large-vault benchmark surfaces unacceptable render times.
- **C. Virtualized scroll** (render visible chapters only, lazy-load on scroll). Real engineering project. Defer indefinitely.

### 3. Spinner threshold

**Ratified 2026-05-04: Option B with N = 250ms.**

The "Rendering..." spinner appears only when the render takes longer than 250 milliseconds. Sub-N renders happen invisibly so writers don't see a spinner-flash on snappy operations; longer renders get explicit progress feedback so writers know the modal isn't frozen.

The 250ms threshold matches the standard responsive-UI register: Nielsen's 100ms ("perceived as instant") and 1000ms ("user notices the delay") guidelines bracket ~250ms as the sweet spot for "delay worth acknowledging."

**Implementation note:** trigger the spinner via a `setTimeout(showSpinner, 250)` cleared on render completion; the timeout fires only if the render is still running at the threshold. Standard pattern.

**Considered and not chosen:**

- **A. Always show the spinner.** Causes a visible flash on every snappy render. Annoying.
- **C. Never show the spinner.** Leaves writers with no feedback during longer renders; the modal would feel frozen.

### 4. Preview re-render trigger granularity

**Ratified 2026-05-04: Re-render on tab activation, preset-selector change, and project-selector change. Skip external-edit reactivity for 0.3.0.**

The Preview tab re-renders in three situations:

1. **Tab activation.** Each time the user clicks Preview, the tab re-renders against the current preset state. Already locked under "What's locked at the meta level."
2. **Preset-selector change while on Preview tab.** If the writer flips presets via the dropdown, Preview follows immediately so the rendered output always reflects the *current* preset.
3. **Project-selector change while on Preview tab.** Same logic; Preview tracks the modal's current project.

**External-edit reactivity is explicitly out of scope for 0.3.0.** Writers may have the modal open and edit a source note in another pane; Preview does not pick up those edits live. Two reasons: (a) per-keystroke re-rendering would feel chaotic during active editing, and (b) even file-save reactivity adds plumbing (vault event listeners with cleanup) for a use case that's served well enough by flipping Build -> Preview to re-trigger. Revisit if writers report wanting it.

**Considered and not chosen for 0.3.0:**

- File-save reactivity (re-render Preview when a scene file is saved while the modal is open). Plausible later addition; deferred until concrete demand.
- Debounced live-update (re-render Preview on a debounced timer as source notes change). Heavier still; would compete with the manual flip-tab gesture without clearly improving on it.

### 5. "Refresh preview" button

**Ratified 2026-05-04: Option A (no button) for 0.3.0.**

The Preview tab does not include an explicit refresh affordance. The re-render triggers ratified in § 4 (tab activation, preset-selector change, project-selector change) cover the in-modal scenarios; flipping Build -> Preview is the natural gesture for any other re-trigger.

**Strengthening rationale (modal context):** Obsidian modals block interaction with the rest of the workspace. Writers cannot edit a source note while the Manuscript Builder modal is open. The only ways external file changes can land during a session are (a) a different application modifying a source file from outside Obsidian, or (b) a background sync (Obsidian Sync, Syncthing, git pull) landing changes mid-session. Both are genuine edge cases, but rare enough that the manual flip-tab gesture is a sufficient workaround.

**Forward-compat note:** if the Preview surface ever moves to a leaf or gains a dockable variant (cf. [post-v1-candidates.md § 3 (Scrivenings-style continuous Manuscript view)](post-v1-candidates.md)), the modal-blocks-vault rationale stops applying — writers could edit source notes in another pane while Preview stays open. At that point, external-edit reactivity becomes a real use case worth revisiting (either as a "Refresh preview" button, file-save reactivity, or debounced live-update). The leaf-mode candidate already implies this; this is a reminder that the modal-only Preview tab inherits a narrower interaction model by design.

**Considered and not chosen for 0.3.0:**

- **B. Small refresh button** in the Preview tab header (e.g., circular-arrow icon). Cheap to add later if writers report wanting it; defer until concrete demand.
- **C. Refresh button only when stale** (change-detection driven). Heavier; needs the same vault-event-listener plumbing § 4 deferred. Same rationale as B for skipping in 0.3.0.

### 6. Compile button visibility on the Preview tab

**Ratified 2026-05-04: No secondary Compile affordance on the Preview tab for 0.3.0.**

The Compile button stays in the modal header per the meta-level lock and is visible from both tabs. The Preview tab body does not add a sticky footer button, an inline end-of-preview button, or any other Compile-prompting affordance.

**Rationale.** Three reasons reinforce the no-secondary-affordance call:

1. The header button is already reachable from anywhere in the modal; a second instance would create double-affordance (two paths to the same action), mild UX noise.
2. A sticky footer in Preview competes with the rendered prose for visual attention while the writer is reading.
3. The Preview tab is conceptually a *review* surface; prompting compile mid-review pushes the writer out of review-mode. Better to let them finish reading, then click the header button when ready.

**Long-scroll consideration:** on long manuscripts, after a deep scroll the modal header may be off-screen, making the Compile button less visible. Two cheap mitigations to evaluate during implementation (Step 4):

- The modal header could be sticky (CSS `position: sticky` on the header bar) so it stays visible during Preview scroll. Lightweight; no new affordance.
- A subtle "back to top" button at the bottom of long previews. Simpler than a redundant Compile button and more in line with browsing conventions.

Neither is locked; both are easier to add later than to remove if writers find the long-scroll case painful in practice.

**Considered and not chosen:**

- **Sticky footer with inline Compile button** at the bottom of the Preview viewport. Real estate cost during reading; double-affordance noise.
- **End-of-preview Compile button** (rendered after the last scene's content). Less obtrusive than a sticky footer but still double-affordance.

### 7. Empty-state copy (placeholders)

**Ratified 2026-05-04: Ship with the placeholder copy below; iterate post-launch based on writer reactions.**

The Preview tab handles three empty / non-content states. Each surfaces a brief actionable message; copy is intentionally placeholder-grade and may shift after writers hit the messages in practice.

| State | Message |
|---|---|
| Filters exclude all scenes | "No scenes match this preset's filters. Adjust scene-statuses or scene-excludes on the Build tab." |
| Project has no scenes | "No scenes in this project yet. Create scenes from the Manuscript view." |
| Render error | "Preview render failed: `<error message>`. The Build tab settings may be inconsistent; check the console for details." |

**Notes:**

- The "Filters exclude all" message names two specific filter fields (`scene-statuses`, `scene-excludes`) rather than going generic. Concrete > generic for actionability; minor cost is needing a copy update if those filter names change in the future.
- The "Project has no scenes" message intentionally doesn't mention sub-scenes — a project with zero scenes has zero sub-scenes by definition (sub-scenes live under scenes), so the scene-only framing is correct.
- The "Render error" copy embeds the raw error message inline. Useful for debugging, potentially intimidating for non-technical writers. If post-launch feedback indicates the raw-error inline is too rough, a friendlier framing with the raw error tucked into a collapsible is the natural follow-up. Not worth pre-engineering for 0.3.0.

The fourth case (no project / no preset selected) is presumably handled by the modal at large; Preview inherits whatever empty state the modal shows. Confirm during Step 4 of implementation.

### 8. CSS class hooks for theme authors

**Ratified 2026-05-04: Seven class hooks + seven Style Settings variables (one tab-related, six Preview-typography).**

**Class hooks** (used by both the implementation and Style Settings):

| Hook | Purpose |
|---|---|
| `dbench-manuscript-builder__tabs` | Tab strip container |
| `dbench-manuscript-builder__tab` | Individual tab |
| `dbench-manuscript-builder__tab--active` | Active tab state |
| `dbench-manuscript-builder__tab-body` | Body region whose content swaps on tab change |
| `dbench-manuscript-builder__preview` | Preview tab body container (lets theme authors target preview-rendered prose without affecting Build's form fields) |
| `dbench-manuscript-builder__preview-empty` | Empty-state container (the three messages from § 7) |
| `dbench-manuscript-builder__preview-spinner` | The 250ms-delayed "Rendering..." spinner from § 3 |

The first three plus the active-tab variable were also captured in § 1; listed here for completeness.

**Style Settings variables:**

| Variable | Default | What it controls |
|---|---|---|
| `--dbench-tab-active-accent` | `var(--interactive-accent)` | Underline + active-text color for the tab strip. |
| `--dbench-preview-font-family` | `var(--font-text)` | Font used in Preview body. Writers often prefer serif (Crimson, Garamond, Caslon) for prose review even when their regular note font is sans-serif. |
| `--dbench-preview-font-size` | `var(--font-text-size)` | Body font size in Preview. |
| `--dbench-preview-line-height` | `var(--line-height-normal)` | Line spacing; a major readability lever for long-form prose. |
| `--dbench-preview-max-width` | `none` | Optional reading-column constraint (e.g., `45em` for a 65-75-character column). Many writers prefer a constrained column for prose review even when the modal is wider. |
| `--dbench-preview-paragraph-spacing` | `1em` | Gap between paragraphs. |
| `--dbench-preview-text-align` | `left` | Body text alignment. Style Settings exposes the choice as a select with options `left` and `justify`. |

All Preview-typography defaults inherit from Obsidian's text-pane variables where reasonable, so default Preview matches the writer's regular note-reading register out of the box. Style Settings users override per-variable to tune Preview without affecting their other notes.

**Important framing for the Style Settings UI copy and any user docs.** Preview is for in-Obsidian review, **not** a faithful render of the compiled PDF / ODT / DOCX output. Different rendering pipelines (`MarkdownRenderer` here versus pdfmake / docx generators in the actual compile path). The variables above tune Preview *display*, not the exported file. Writers wanting "how will my final PDF look?" should compile to disk and open the file. Worth stating explicitly so writers don't expect Preview to WYSIWYG the compiled output.

**Considered and not chosen for 0.3.0:**

- `--dbench-preview-text-color` — theme-derived defaults (`--text-normal`) cover the common case; explicit override is rare and hard to do well. Add later if writers ask.
- `--dbench-preview-background` — same; theme-driven. A "paper-like" rendering mode (cream / off-white) is interesting but worth a separate FR.
- `--dbench-preview-hyphens` (controlling `hyphens: auto`) — paired with justify-alignment, automatic hyphenation can dramatically improve justified-prose appearance by breaking up rivers. Skipping for 0.3.0; revisit if writers report ugly justified output.
- `--dbench-preview-content` class hook — redundant with `MarkdownRenderer.render`'s built-in `.markdown-rendered` class.

---

## Implementation sequence

Numbered steps to ship 0.3.0. Each step is committable independently.

1. **Tab strip skeleton.** Add the tab strip below the preset row in [src/ui/manuscript-builder/manuscript-builder-modal.ts](../../src/ui/manuscript-builder/manuscript-builder-modal.ts). Build tab wraps the existing section stack (no behavior change); Preview tab is a placeholder div. Tab-switch state lives in modal-level state. Visual styling per § 1.
2. **Tab-switch CSS.** Add the new `dbench-manuscript-builder__tabs` / `__tab` / `__tab--active` classes to [styles/manuscript-builder.css](../../styles/manuscript-builder.css). Smoke-test against default light + default dark.
3. **Last-active-tab persistence.** Save the last-active tab per project to plugin settings via the same mechanism that persists last-selected preset. Restore on modal open.
4. **Preview render plumbing.** Wire the Preview tab to call `CompileService` (or its markdown-intermediate-only path) and render the result via Obsidian's `MarkdownRenderer.render`. Re-render trigger: tab activation, preset change, project change.
5. **Spinner.** Add the 250ms-threshold "Rendering..." spinner per § 3. Spinner DOM lives in `dbench-manuscript-builder__preview-spinner`.
6. **Empty states.** Implement the three empty-state branches per § 7. Use the placeholder copy.
7. **Sub-scene descent verification.** Test against a project with hierarchical scenes (sub-scenes); confirm Preview matches the actual compile output structurally (parent intro prose first, then sub-scenes in `dbench-order`).
8. **Performance smoke test.** Test against a 100k-word project per § 2. If render exceeds 2 seconds, file a follow-up issue and decide whether to fall back to chunked render before shipping.
9. **Style Settings exposure.** Document the seven new class hooks and the seven new Style Settings variables (one tab-related, six Preview-typography) in [styles/style-settings.css](../../styles/style-settings.css). See § 8 for the full list and defaults; the Preview-typography group should land under a "Manuscript Builder Preview" Style Settings section with a brief intro noting that Preview is for in-Obsidian review, not a WYSIWYG of compiled output.
10. **Wiki updates.** Refresh the [Manuscript-Builder wiki page](../../wiki-content/Manuscript-Builder.md) to document the Build/Preview tabs. Possibly a new screenshot showing Preview in action.
11. **CHANGELOG entry.** Under `[Unreleased]`, then cut to `[0.3.0]` at release time.

Estimated total effort: **3-4 days of focused work**, plus QA / dogfooding pass. No new linker / integrity / compile-pipeline work required.

---

## Out of scope for 0.3.0

Explicitly deferred (some may revisit in 0.3.x, some are post-1.0 candidates):

- **Format-aware Compile button labeling** (e.g., "Compile to PDF..." reading from `dbench-compile-format`). Separate UX issue worth its own discussion.
- **Cross-tab live preview** (Build settings update Preview without a tab switch). Would require a split-pane mode or background pre-rendering; defer until writers ask.
- **Click-heading-to-open in Preview.** See § Locked decisions; this is the leaf-mode candidate's territory.
- **Multi-tab section restructure of the Build tab** (one tab per section instead of one stack of collapsibles). Separate UX-improvement question; competes with the recently-shipped collapsible-sections pattern from #18.
- **"Refresh preview" button** (§ 5 option B). Add only if writers report wanting it after 0.3.0 ships.
- **External-edit reactivity** (Preview re-renders when source notes change while modal is open). Probably too noisy; revisit only with concrete demand.
- **Chunked / virtualized rendering** for 200k+ word projects. The simple-render approach in step 4 covers typical novel sizes; switch only if performance demands it.
- **Dock-to-leaf affordance** (a button on the modal that closes it and re-opens the same content as a workspace leaf, so writers can leave Preview open while editing source notes in another pane). Considered and deferred 2026-05-04 from 0.3.0; promoted to a queued FR for 0.3.x as [#27](https://github.com/banisterious/obsidian-draft-bench/issues/27) on 2026-05-05; **implemented and shipped in 0.3.1 (2026-05-05)** across three commits (shell extraction, leaf view + dock button, debounced file-save reactivity), with one unplanned UX fix (Preview scroll preservation across file-save re-renders) that the dogfood pass surfaced. Distinct from [post-v1-candidates.md § 3 (Scrivenings-style continuous Manuscript view)](post-v1-candidates.md), which extends the *existing* Manuscript view leaf rather than creating a new Manuscript Builder leaf.

---

## Open questions

Items the design conversation didn't resolve; carry forward into implementation:

- **Spinner appearance.** Match Obsidian's native loading-spinner style (`.lucide-loader-2` with CSS spin animation), or ship a minimal text-only "Rendering..." string with no glyph? Recommendation TBD; ratify in implementation Step 5.
- **Project-with-no-presets state.** If the writer opens Manuscript Builder for a project with no compile presets at all, the Build tab presumably already handles that (preset picker shows "create a preset"). Does the Preview tab show its own empty state, or inherit Build's? Probably inherit; ratify during Step 4.
- **Modal width.** Is the modal currently constrained in a way that makes Preview cramped for prose? If so, this is the right time to widen — but widening affects Build tab too. Audit modal width during Step 1 before locking the tab layout.

---

## Decision log

Track ratifications and reversals here as work proceeds.

- **2026-05-04** — Doc created. All §§ "What's locked at the meta level" decisions ratified during the design conversation. §§ 1-8 "Sections requiring ratification" recommendations awaiting confirmation.
- **2026-05-04** — § 1 ratified: underline pattern, custom CSS with `dbench-` prefix, after evaluating three visual mockups. Pattern 3 (segmented control) was the close runner-up and is noted as a potential future revisit if the tab count grows past two.
- **2026-05-04** — § 2 ratified: Option A (single-pass `MarkdownRenderer`, no virtualization), not gated on a pre-ship performance smoke test. Future activity: build a seeded large dummy vault (100k+ words) for benchmarking, independent of 0.3.0 release timing. Chunked-render (Option B) is the known fallback if performance reports surface.
- **2026-05-04** — § 3 ratified: Option B with N = 250ms. Spinner appears only when render exceeds the threshold; implemented via `setTimeout` cleared on render completion.
- **2026-05-04** — § 4 ratified: Preview re-renders on tab activation, preset-selector change, and project-selector change. External-edit reactivity (file-save or debounced live-update) explicitly deferred.
- **2026-05-04** — § 5 ratified: no refresh button for 0.3.0. Modal-blocks-vault constraint strengthens the deferral; the only paths for external file changes during a session are out-of-Obsidian edits or background sync, both narrow enough to be served by the manual flip-tab gesture. Forward-compat note added pointing at the leaf-mode candidate ([post-v1-candidates.md § 3](post-v1-candidates.md)).
- **2026-05-04** — Reciprocal cross-reference added in [post-v1-candidates.md § 3](post-v1-candidates.md) noting that the modal Preview tab defers external-edit reactivity by design and the leaf-mode candidate is where that reactivity would naturally live.
- **2026-05-04** — § 6 ratified: no secondary Compile affordance on the Preview tab for 0.3.0. Header Compile button is the single source. Sticky-header CSS and "back to top" affordance flagged as cheap long-scroll mitigations to evaluate during implementation (not locked).
- **2026-05-04** — § 7 ratified: ship the three placeholder empty-state messages as drafted (filters exclude all; project has no scenes; render error). Iterate post-launch based on writer reactions. Friendlier render-error framing flagged as a natural follow-up if raw-inline-error is too rough in practice.
- **2026-05-04** — § 8 ratified: seven class hooks + seven Style Settings variables. Variables: one tab-related (`--dbench-tab-active-accent`) + six Preview-typography (`font-family`, `font-size`, `line-height`, `max-width`, `paragraph-spacing`, `text-align`). Justification was added to the typography set during ratification. Preview-as-not-WYSIWYG-of-compile-output framing captured for the Style Settings UI copy.
- **2026-05-04** — Dock-to-leaf affordance considered and deferred (Path A from a three-way design choice: defer, ship minimal dock-button-with-modal-internals, or do a full leaf-mode design pass). Captured in Out of scope. Revisit in 0.3.x or 0.4.0 once writer feedback on the modal form validates the leaf use case.
- **2026-05-05** — Dock-to-leaf affordance promoted from deferred to queued for 0.3.x as [#27](https://github.com/banisterious/obsidian-draft-bench/issues/27). Four design questions resolved before filing the FR:
  - **§ 4 extension (re-render triggers).** File-save reactivity with 300-500ms debouncing as the primary leaf-mode trigger. Refresh button deferred until debounced reactivity is perf-tested against a 100k+ word document; ships only if debouncing alone proves insufficient.
  - **§ 6 (compile button).** Stays in the sticky header. No leaf-specific button placement; the same sticky-header pattern from 0.3.0 carries over.
  - **Multi-leaf state.** Single Builder leaf only. Opening when one already exists focuses the existing via `workspace.revealLeaf`. Mirrors the modal's single-Builder-open assumption.
  - **Leaf-state persistence.** Leaf is essentially stateless; plugin settings own the data, mirroring the Manuscript view leaf pattern (per the established memory: persistence routes through `saveSettings` / `data.json`, not `requestSaveLayout`). Active project (already in `plugin.selection` + `lastSelectedProjectId`), last-active tab (already in `manuscriptBuilderTabState`), and Preview typography (already in `previewTypography`) need no new state. **One new field added:** `manuscriptBuilderSelectedPresetId: Record<projectId, presetId>` so the leaf restores the last-tuned preset across reload. Side benefit: also improves the modal's open-and-restore UX.
  - **Reverse path.** Passive only — no leaf -> modal button. Writers who prefer modal close the leaf and open via existing affordances (palette command, Compile CTA in the Manuscript view).
  - **Dock button placement.** Sticky-header icon button next to the close button. Visible from any scroll position, matches Obsidian conventions for window-management actions clustering at the top-right.

  Implementation start still gated on writer-feedback validation that the leaf use case is load-bearing.
- **2026-05-05** — Dock-to-leaf affordance implemented and shipped in 0.3.1. The implementation followed the resolved design verbatim: shell extraction (commit `2ee5f86`), leaf view + dock button + multi-leaf prevention + selected-preset persistence (`4391487`), file-save reactivity with 400ms debouncing (`0dd6822`). One unplanned UX fix surfaced during dogfood: Preview scroll position now preserves across file-save re-renders (capture `contentEl.scrollTop` *before* `renderActiveTab` empties the body, restore via `requestAnimationFrame` after `MarkdownRenderer.render` lays out the new content); tab / preset / project changes still land at the top by design. The 100k+ word perf-test target was met by the 110k-word fixture validated for 0.3.0; debounced reactivity feels snappy at that size, so the refresh button stays deferred. The user-feedback gate was satisfied by the maintainer's own dogfood reactions ("I keep wanting Preview pinned next to a scene I'm editing"); the website / GitHub haven't yet captured external users so other-writer feedback wasn't yet available, but the maintainer's pass was decisive enough to ship.
