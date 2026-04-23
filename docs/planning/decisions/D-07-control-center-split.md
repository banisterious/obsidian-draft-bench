# D-07: Control Center split (modal + workspace leaf)

**Status:** ✅ Shipped 2026-04-22 across five commits (b872c03, 4802449, fd73860, 64e2946, plus the docs commit). Blocks A / B / C voted the same day.
**Related:** [specification.md § Manuscript view and Control Center](../specification.md), [control-center-reference.md](../control-center-reference.md), [dockable-view-reference.md](../dockable-view-reference.md), [D-06](D-06-compile-preset-storage-and-content-rules.md)

---

## Context

The Control Center currently ships as a modal with tabs (Project / Manuscript / Templates / Compile). Two limitations of the modal-only shape surface in practice:

1. **Ambient vs. action content is mixed.** The Project overview (word-count progress, status breakdown) and Manuscript list (scene navigation, per-scene word badges) are things writers want to glance at *while* drafting — not interrogate once per session. The modal blocks the editor, so they can't. Reorder scenes, Repair project links, Templates management, Book Builder / compile are action-shaped (short-lived, "open, do a thing, close") and the modal suits them well.

2. **Live-refresh is mostly dormant.** The `vault.on('modify')` listener fires only for externally-triggered modifies (Sync from another device, scripts, external editors) because the modal-open state precludes in-app editing. For single-user local workflows the listener never fires during the natural write loop.

The decision isn't "should we have the Control Center?" — yes, for actions. The decision is **what content moves to a persistent workspace-leaf view so it's ambient during writing**, and **how the two surfaces coexist without fighting each other** (duplicated project pickers, dueling refresh listeners, confusing entry-point routing).

BRAT-release context: the public milestone is scoped higher than the current V1-by-phases definition. BRAT testers (often experienced Obsidian users) will benchmark Draft Bench against Longform, which has had a dockable explorer from day one. A modal-only nav is a weaker first impression. The split is therefore pre-BRAT work, not a V1 stretch goal.

## Decision

### Scope and timing

- **Both surfaces exist.** The Control Center modal stays; a new Manuscript workspace leaf is added.
- **Content allocation:**
  - **Leaf (ambient):** Project overview + Manuscript list + their toolbar actions. Writers see project summary, word-count progress bars, and the scene list while drafting.
  - **Modal (action-oriented):** Templates tab (when built) + Compile tab (when built). Reorder scenes, Repair project links, and similar short-lived flows continue to open their dedicated modals invoked from either surface.
- **Timing.** Split ships before Book Builder ([D-06](D-06-compile-preset-storage-and-content-rules.md)). Rationale: Book Builder will surface "compile current project" entry points, and those should wire into the final UI shape, not a transitional one.

### Block A — First-encounter shape

- **Leaf position default: right sidebar.** Matches Longform; conventional home for companion / reference panes in Obsidian (Outline, Backlinks, etc. live there). Writers who prefer the left can drag the leaf themselves.
- **Default visibility: auto-reveal on first project creation.** Not on install / vault load (surprises writers retrofitting existing vaults); not pure opt-in (invisible to writers who don't read docs). The leaf becomes useful the moment the first project exists — that's when to show it. Tracked via a `firstProjectRevealed: boolean` flag in settings; one-shot, not a recurring reveal.
- **Selection-state ownership: single source of truth** in plugin memory (`plugin.selectedProjectId: string | null`). Both surfaces read + write it via a small event emitter on the plugin. The leaf *also* persists `selectedProjectId` via `getState()` so a layout reload restores the prior selection — on `onOpen`, if plugin state is empty but leaf state has a project, the leaf pushes its value up to plugin state.
- **Entry-point routing:**

  | Entry point | Current | Post-split |
  |---|---|---|
  | Ribbon icon (`pencil-ruler`) | Opens modal | Reveals leaf |
  | Palette `Draft Bench: Open control center` | Opens modal | Unchanged (still opens modal for Templates / Compile) |
  | Palette `Draft Bench: Show manuscript view` (new) | — | Reveals leaf |
  | Project-note context menu "Open control center" | Opens modal | Reveals leaf, with that project selected |
  | Project-note context menu "Repair project links" | Opens repair modal | Unchanged |

  Ribbon tooltip stays "Open Draft Bench" (doesn't surface the leaf-vs-modal implementation detail).
- **Live-refresh ownership: both surfaces register their own `vault.on('modify')` listeners.** The shared `WordCountCache` coalesces work, so double-listening doesn't multiply cost. The leaf's listener is the primary freshness driver for in-session writing; the modal's remains useful for external modifies (Sync, scripts) when the modal happens to be open.

### Block B — Modal scope and naming

- **Manuscript tab: removed from modal.** The leaf is the home for scene-list navigation and ambient manuscript content.
- **Project tab: removed from modal.** Same reasoning — project overview, word counts, and progress bars live in the leaf.
- **Modal keeps "Control Center" name.** Phase 3 will fill the remaining Templates and Compile tabs with real content (multi-template management, compile preset editor, run-compile button), so the name grows back into itself. Renaming for the brief pre-Phase-3 window would add confusion.
- **Palette command unchanged: `Draft Bench: Open control center`.** Paired with the name decision; the modal still exists, still hosts coherent action-shaped flows.
- **No deprecation banner.** DB hasn't shipped publicly; no muscle memory to preserve. One-time discovery friction (writer opens modal looking for manuscript, sees Templates, finds `Show manuscript view` instead) is acceptable for the internal audience.

**Transitional posture.** Between the split landing and Phase 3 completing, the modal hosts only Templates (stub) and Compile (stub) — it will be thin until Book Builder fills the Compile tab. That's expected; the split's value is the leaf, not the modal. The modal becomes full-featured gradually as Phase 3 content lands.

### Block C — Leaf UX details

- **Empty state: smart, with two variants.**
  - *No projects exist in the vault*: full welcome message with a "Create your first project" CTA that opens `NewProjectModal`, plus a one-line pointer to `Draft Bench: Open control center` for templates/compile actions.
  - *Projects exist but none selected*: compact prompt — project picker dropdown + "Select a project to view its manuscript" text. No CTA.
- **Per-project memory: remember across reloads, fall through gracefully if the remembered project no longer exists.** Falls out of the Block A selection-state persistence (`getState()` carries `selectedProjectId`). Guard in `onOpen`: validate the ID against `findProjects(app)`; if no match, fall through to the empty state.
- **Scroll preservation: capture + restore `scrollTop` around full re-render** for the MVP. Simple and sufficient. Upgrade to surgical per-row updates (updating only the changed scene's badge) is a later refinement if writers notice flicker on rapid edits.
- **Collapse state: persists across reloads** via `sectionStates: Record<string, boolean>` in `getState()`. Keyed by `sectionId` (Project summary, Manuscript list).
- **Mobile: desktop-only V1** (`isDesktopOnly: true` in `manifest.json`). Don't engineer for mobile, but don't fight it: prefer tap-friendly hit targets (≥44×44px logical), `overflow-y: auto` on scroll containers, no hover-only interactions.
- **Future Dashboard coexistence.** If a Dashboard lands post-V1 (per [control-center-reference.md](../control-center-reference.md)), it'd likely be a main-pane tab — cross-project overview with launcher tiles. It coexists with the Manuscript leaf (sidebar, project-scoped) and Control Center modal (action-shaped). Three surfaces, three roles; the split closes no doors.
- **Live-refresh debounce: 300ms** to match the existing modal implementation. Measure in practice; tighten to 200ms / 150ms if writers report the leaf feels stale.

## Rationale

The Control Center was designed for a single tabbed modal, but the content has two distinct shapes: **ambient** (the writer wants to glance at it while drafting — word counts, scene list, status breakdown) and **action-shaped** (short-lived flows like Reorder scenes or Compile, where "open, do, close" is the right lifetime). Forcing both through one modal means the ambient content is inaccessible during the write loop, and the live-refresh listener never meaningfully fires. Splitting the two lets each surface have the lifetime its content wants.

**Right sidebar for the leaf** matches the strongest prior art (Longform) and Obsidian's own pattern — Outline, Backlinks, Tag pane all live there as reference companions. Auto-revealing on first project creation (rather than install) avoids panel-appearance surprise while still surfacing the view the moment it becomes useful. Single source of truth for project selection keeps the modal and leaf from drifting ("why does the modal show Novel A and the leaf show Novel B?"). Entry-point routing funnels the most-used surfaces (ribbon, context menu) to the primary new surface (leaf), while keeping the explicit `Open control center` palette command for writers who specifically want Templates or Compile.

**Modal retains its name and identity** because Phase 3 will restore its weight — Templates management and Book Builder will both be substantial surfaces. Renaming now would churn a name that's going to fit again within the same release cycle. Removing Project and Manuscript tabs prevents duplicated renderers that would drift out of sync.

**Block C's decisions are mostly about handling real-world edge cases** — deleted projects, scroll jump on re-render, collapsed section memory — and they err toward "persist by default, degrade gracefully." Empty states are a first-impression concern; the smart variant handles both the new-writer and returning-after-delete cases without either being jarring.

## Alternatives considered

- **No split, add a "Refresh" button to the modal.** Cheap; solves the freshness-paranoia case but doesn't address the core UX friction of modal-while-drafting. Rejected for pre-BRAT but reasonable as a hedge if the split slipped.
- **Replace the modal with the leaf entirely.** Removes modal chrome for Templates / Compile. Rejected because action flows benefit from modal focus — you don't want the Compile preset editor competing with the editor pane.
- **Pop-out / floating window for the leaf content.** Obsidian supports window detachment from workspace leaves natively, so this falls out for free from the leaf design without special-casing.
- **Sidebar widget embedded in the file-explorer tree.** Tight integration with Obsidian's file nav but would require embedding in the existing explorer's DOM — fragile.
- **Left sidebar default (rather than right).** The file explorer's natural home. Rejected because right is the Obsidian-idiomatic location for companion/reference panes (Outline, Backlinks); left is navigation-of-the-vault, not navigation-of-a-project.
- **Independent selection state per surface.** Simpler isolation but invites divergence between modal and leaf. Rejected in favor of single source of truth.
- **Rename modal to "Actions" or "Tools" post-split.** More honest to the brief transitional scope but re-educates writers. Rejected in favor of keeping "Control Center" as a name that'll fit again once Phase 3 ships.
- **Per-session project memory (reset on Obsidian restart).** Simpler but forces writers to re-pick their project after every restart. Rejected in favor of persistent memory with graceful fall-through.
- **Surgical per-row updates on `vault.on('modify')`** instead of full re-render with scrollTop capture/restore. Better UX, more complex (requires per-scene DOM refs and a diff). Deferred to a later refinement; full re-render is acceptable for MVP.

## Implementation-time follow-ups

Decisions that don't need to be locked before coding begins but want explicit attention during the split work.

- **Draft the `ItemView` subclass.** `src/ui/manuscript-view/manuscript-view.ts`. See [dockable-view-reference.md](../dockable-view-reference.md) Part 1 for the Obsidian mechanics (minimum view class, activate-view helper, state persistence, header actions, anti-patterns); Part 3 for the DB-specific LOC breakdown and section allocations.
- **CSS scope.** Leaf wants its own stylesheet component (`styles/manuscript-view.css`) using the `.dbench-manuscript-view__*` prefix. Shares variables with `control-center.css` but owns its layout. Add to `build-css.js`'s `componentOrder`.
- **Plugin-state / leaf-state reconciliation on `onOpen`.** Pattern: if plugin state has a selection, use it; else if leaf state has a selection, push it up to plugin state; else empty state. Both paths should validate the project still exists before activating.
- **Active-note-sync heuristic for the leaf.** When the writer opens a scene file belonging to a different project than the current selection, the leaf silently switches to that project. Gated on the file being plugin-managed (`dbench-type: scene`), debounced 150ms. This is the one place the leaf overrides explicit selection — and it's recoverable (writer can re-pick from the dropdown). Intentional scope: don't auto-switch on non-scene files, don't auto-switch if the current project still matches.
- **Migration for existing writers.** The one surface to mind: writers who bound a hotkey to "Draft Bench: Open control center" post-split will still get the modal, but its content is different. Acceptable per Block B's "no deprecation banner" decision; revisit if internal testing reveals confusion.
- **Modal stub content.** Once Project/Manuscript tabs are removed, the modal's opening tab (Templates) should have at minimum a placeholder explaining that full template management ships in Phase 3. Compile tab similarly. Don't ship blank tabs; writers deserve a "this is intentional" signal.
- **Re-test the existing Control Center features after the split.** Project-picker preserves selection, toolbar buttons work, keyboard nav still reaches the list, etc. — all the V1 behaviors that currently live in the modal's Project/Manuscript tabs need equivalent regression coverage in the leaf.
