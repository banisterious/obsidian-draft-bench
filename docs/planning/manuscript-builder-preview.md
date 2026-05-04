# Manuscript Builder Preview tab (0.3.0)

Planning doc for adding a Preview tab to the Manuscript Builder modal. Originally captured as candidate #4 in [post-v1-candidates.md](post-v1-candidates.md), promoted to its own planning doc on 2026-05-04 with a 0.3.0 target.

**Status:** Drafted 2026-05-04. Sections below mirror [sub-scene-type.md](sub-scene-type.md)'s template (the most recent pre-1.0 promotion precedent). Implementation pending per the sequence at the end of this doc; no GitHub issue filed yet.

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

**Question:** What's the practical upper bound on project size before the simple-approach (one `MarkdownRenderer.render` pass) starts feeling slow?

**Options:**

- **A. Trust `MarkdownRenderer`, no virtualization.** Simplest. Works fine for typical novel-length manuscripts (60-100k words). May lag for 200k+ word projects.
- **B. Chunked render** (descend chapter-by-chapter, render each, concat). More complex. Smoother feel for large projects.
- **C. Virtualized scroll** (render visible chapters only, lazy-load on scroll). Most complex; biggest implementation cost.

**Recommendation:** **A for 0.3.0; revisit if writers report lag.** The "Rendering..." spinner already covers the perceived-latency case. Document the ceiling in a code comment so a future contributor knows where to start if the issue surfaces.

**Smoke-test target:** A 100k-word project should render in under 2 seconds on a modest desktop. If that fails the test, fall back to B before shipping.

### 3. Spinner threshold

**Question:** When does the "Rendering..." spinner appear?

**Options:**

- **A. Always.** Spinner shows for the full render window, however brief.
- **B. After N ms** (e.g., 250ms). Sub-N renders happen invisibly; longer renders show the spinner.
- **C. Never.** Skip the spinner; trust that renders are fast enough.

**Recommendation:** **B with N = 250ms.** Sub-quarter-second renders look snappy without spinner flash; longer renders get explicit progress feedback. Matches the standard responsive-UI threshold (Nielsen's 100ms / 1000ms guidelines split the difference at ~250ms for "perceived as a delay worth acknowledging").

### 4. Preview re-render trigger granularity

**Question:** Beyond tab activation, what else triggers a Preview re-render?

**Locked:** tab activation always re-renders.

**Open:**

- **(a) Preset-selector change while on Preview tab.** Probably yes — the Preview should reflect the *current* preset. If the writer flips presets via the dropdown, Preview should follow.
- **(b) Project-selector change while on Preview tab.** Yes, same logic.
- **(c) External edit to a source note while modal is open.** Probably no — too noisy. The writer can re-trigger by clicking back to Build then back to Preview, or by adding a "Refresh preview" button (see § 5).

**Recommendation:** **Re-render on tab activation, preset change, project change.** Skip external-edit reactivity for 0.3.0.

### 5. "Refresh preview" button

**Question:** Does the Preview tab include a manual refresh affordance?

**Options:**

- **A. No button.** Tab activation is the only re-trigger. Writer flips Build -> Preview to refresh after editing settings.
- **B. Small refresh button** in the Preview tab header (e.g., circular-arrow icon). Lets the writer re-render without round-tripping through Build.
- **C. Refresh button only when stale** (i.e., something changed since last render and the writer is still on Preview). Fancy; needs change-detection.

**Recommendation:** **A for 0.3.0 (no button).** Tab activation always re-renders against current state; flipping back-and-forth is the natural refresh gesture. If writers report wanting an explicit refresh, add B (small button) in a follow-up.

### 6. Compile button visibility on the Preview tab

**Question:** Locked that the button stays in the modal header (visible from both tabs). What about secondary affordances?

**Open:**

- Should the Preview tab include a "ready to compile?" callout near the bottom of the rendered preview, especially after a long scroll? (e.g., a sticky footer or inline button at end of preview)

**Recommendation:** **No additional Compile-prompting in Preview for 0.3.0.** The header button is reachable; the Preview tab is for review, not action-prompting. Avoid double-affordance.

### 7. Empty-state copy (placeholders)

**Question:** What does each empty state actually say?

**Locked:** three states (filters exclude all, project has no scenes, render error) get brief actionable messages.

**Open:** the actual copy.

**Initial drafts (placeholder, refine post-launch):**

- **Filters exclude all:** "No scenes match this preset's filters. Adjust scene-statuses or scene-excludes on the Build tab."
- **Project has no scenes:** "No scenes in this project yet. Create scenes from the Manuscript view."
- **Render error:** "Preview render failed: `<error message>`. The Build tab settings may be inconsistent; check the console for details."

**Recommendation:** Ship with these placeholders. Iterate based on actual writer reactions.

### 8. CSS class hooks for theme authors

**Question:** What new class hooks does this work expose for Style Settings / theme authors?

**Recommendation:** Expose:

- `dbench-manuscript-builder__tabs` — tab strip container
- `dbench-manuscript-builder__tab` — individual tab
- `dbench-manuscript-builder__tab--active` — active tab state
- `dbench-manuscript-builder__tab-body` — body region whose content swaps on tab change
- `dbench-manuscript-builder__preview` — Preview tab body specifically (so theme authors can target preview-rendered prose without affecting Build)
- `dbench-manuscript-builder__preview-empty` — empty-state container
- `dbench-manuscript-builder__preview-spinner` — "Rendering..." spinner

Style Settings variable (new): `--dbench-tab-active-accent` defaulting to `var(--interactive-accent)`.

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
9. **Style Settings exposure.** Document the new class hooks and the `--dbench-tab-active-accent` variable in [styles/style-settings.css](../../styles/style-settings.css) so theme authors can target them.
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
