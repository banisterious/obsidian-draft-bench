# Post-V1 candidates

**Status:** Tracking. Not committed to a specific version.

**Purpose:** Captures features under consideration for post-V1 work so they don't have to be re-derived from conversation. Each candidate has a short scope sketch, rationale, rough effort estimate, and any dependencies. Promotion to a numbered phase happens via a separate planning pass with a real ADR when the time comes.

**Relationship to other planning docs:**

- [specification.md § Non-goals](specification.md) lists features that do not belong in Draft Bench at any version. Items here are *not* non-goals; they are deferred-but-possibly-in-scope.
- [specification.md § Open Questions](specification.md) lists undecided design questions. Items here are decided-as-deferred (we'd add the feature, just not yet).
- [docs/planning/post-v1-forward-compat-audit.md](post-v1-forward-compat-audit.md) is a different doc: it tracks deferred *technical* items (lazy-loading pdfmake, Data Quality surface, active-note-sync heuristic) for a scheduled post-V1 audit. Functional candidates here.
- [branding.md § Positioning relative to adjacent Obsidian plugins](branding.md) compares Draft Bench to StoryLine and Longform; some items here exist because they close real gaps surfaced by that comparison.

---

## Promoted to planning docs (no longer candidates)

Items that started as candidates here and have since graduated to their own planning docs (with implementation sequences, ratification sections, and a target release):

- **Manuscript Builder Preview tab** — promoted 2026-05-04, target 0.3.0. Adds a Preview tab to the Manuscript Builder modal that renders the current preset's compile output as a continuous read-only document, alongside today's Build tab (the existing collapsible-section content). Complementary with [#2 (Scrivenings-style continuous Manuscript view)](#2-scrivenings-style-continuous-manuscript-view-alternate-mode) below: two distinct use cases, two independent ship paths. See [manuscript-builder-preview.md](manuscript-builder-preview.md).
- **Scrivener `.scriv` import** — promoted 2026-05-05, target pre-1.0 (specific minor TBD). Reads a Scrivener 3 project (`.scrivx` index + per-document RTF/RTFD bodies) and produces a Draft Bench project: project / chapters / scenes / sub-scenes mapped from the binder hierarchy, RTF bodies converted to markdown, inspector metadata preserved, snapshots optionally imported as drafts. DB's first wizard. See [scrivener-import.md](scrivener-import.md).

---

## Shipped (no longer candidates)

The following appeared as candidates and have since landed in main during the pre-V1 polish round (2026-04-28):

- **Scene subtitle field** (`8780951`) — optional `dbench-subtitle` property on scenes, rendered as muted second-line text in Manuscript view scene rows. Active on a per-scene opt-in basis; rows without the field keep the original two-row layout.
- **Manuscript view title links honor Obsidian's open-in-tab affordances** (`64e9091`) — chapter card titles and scene row titles support cmd/ctrl-click for new tab, +shift for split, +alt for new window, middle-click for new tab, right-click for context menu. Implemented via a shared `attachWikilinkOpenAffordances` helper in `src/ui/manuscript-view/sections/open-affordances.ts`.
- **Multi-template support** (`ae7e0f0`, `0b5f9d0`, `9a07f5d`) — discovery + picker for named templates beyond the default seed. Originally deferred as "Phase 2+ multi-template management" in spec § Scene Templates; promoted and shipped during the pre-capture polish round.
- **Active-note-sync for the Manuscript view** (`945965f`) — was tracked in [post-v1-forward-compat-audit.md § Item 3](post-v1-forward-compat-audit.md), not here. Listed for completeness because it shipped in the same polish round.

---

## Strong candidates (ranked)

### 1. Project-level full-manuscript snapshots

**Scope.** A "First Draft / Second Draft" snapshot model in the Longform sense: capture the entire project's prose state at a moment in time, distinct from per-scene `dbench-type: draft` files. New `dbench-type: project-snapshot` (or similar). Snapshot file is a single concatenated markdown manuscript with a frontmatter pointer back to the project plus a timestamp + name. Restore action: branch a new project from a snapshot for a parallel revision.

**Rationale.** Already promised in the spec under [§ Writing Sessions, Goals, and Revision Snapshots](specification.md). Per-scene drafts cover scene-level rewrites; project-level snapshots cover the "I'm starting a major rewrite from chapter one" use case. Common pattern in Scrivener (the "Draft" folder in Scrivener parlance) and Longform.

**Effort.** Moderate. New note type, new linker relationship (snapshot <-> project), a "Take project snapshot" command that runs the existing compile pipeline and writes the result as a snapshot note, integrity-scan support. UI: a "Snapshots" section in the Manuscript view or a snapshot picker on the project. Estimate 1-2 weeks.

**Dependencies.** Compile pipeline complete (it produces the snapshot bytes). Probably wants chapter-type complete too, since snapshots of chapter-aware projects need to capture chapter bodies + scenes correctly.

**References.** [specification.md § Writing Sessions, Goals, and Revision Snapshots](specification.md). Longform's draft-management model is the obvious prior art.

---

### 2. Scrivenings-style continuous Manuscript view (alternate mode)

**Scope.** A second view mode on the Manuscript leaf: in addition to today's chapter-cards-and-scene-rows, a "continuous read" mode that renders the entire manuscript as one scrollable read-only document. Descends into sub-scenes the way compile does. Click any heading to open the underlying note in the active leaf for editing. Toggle between modes via a button on the leaf header.

**Rationale.** Scrivener's "Scrivenings" is a beloved feature for read-throughs. Writers want to see their manuscript as a continuous flow during revision passes (catch repetition, pacing problems, voice drift). The chapter-card view is great for navigation and progress; it's not great for reading. StoryLine has this (with embedded Live Preview editors, which is heavier than necessary).

**Effort.** Moderate. The compile pipeline already produces continuous markdown; the new mode renders that markdown in the leaf via Obsidian's `MarkdownRenderer`. Click handlers on rendered headings to open source notes. Toggle persistence in the same plumbing as chapter collapse state. Estimate 1 week.

**Dependencies.** Chapter-type implementation complete. Compile pipeline complete (or at least the markdown intermediate from `CompileService`).

**References.** Scrivener's Scrivenings mode. StoryLine's Manuscript view. Obsidian's `MarkdownRenderer.render` API.

**Relationship to the modal-based Preview tab (promoted, target 0.3.0).** The [Manuscript Builder Preview tab](manuscript-builder-preview.md) ships the same continuous-render machinery inside the Manuscript Builder modal as a "preview before compile" task surface. Because Obsidian modals block interaction with the rest of the workspace, that implementation explicitly defers external-edit reactivity (file-save reactivity, debounced live-update, manual refresh button) per [its § 5](manuscript-builder-preview.md). This leaf-mode candidate is where that reactivity would naturally live, since a leaf can stay open while writers edit source notes in another pane — making the two surfaces complementary rather than redundant.

---

## Borderline candidates (mention, don't commit)

### Beat-sheet templates pack

**Scope.** Pre-baked template files for common story structures: Save the Cat, Three-Act, Hero's Journey, Seven-Point, Story Circle, Romancing the Beat, 27-Chapter Method. Each is a chapter-or-scene-template `.md` with named beats as headings and short prompts.

**Rationale.** StoryLine ships these as a built-in feature. For Draft Bench, they don't need to be in core; a folder of `.md` files distributed via the wiki or a companion repo is enough. Writers download the pack and drop it in their `Templates/` folder. Lower implementation cost; respects DB's narrow scope.

**Effort.** Half a day plus content writing (the templates themselves).

**Note.** This is the kind of thing that scales nicely as a community contribution — not core code, just a curated content pack.

---

### Scene archive

**Scope.** A "Archive scene" right-click action that moves a scene to an `Archive/` folder (configurable) and removes it from the Manuscript view's scene list. Restoration via "Show archive" toggle that surfaces archived scenes for selective unarchiving.

**Rationale.** Cut content has a way of accumulating. Writers don't want to delete it (might revive later) but don't want it polluting the manuscript view either. StoryLine has this.

**Effort.** Half a day. Mostly UI plumbing; the data model is just a folder move plus an optional `dbench-archived: true` flag for retrofit-detected archives.

**Note.** Could be implemented as a setting on `dbench-status` (e.g., "treat status `archived` as hidden from Manuscript view") rather than a folder move. Worth thinking through before committing.

---

### Custom field registry with Settings UI

**Scope.** Settings tab section where writers can register custom `dbench-*` fields with type + validation + (for enums) allowed values. Custom fields then surface in the scene-row UI, in templates, and in compile-rule overrides. StoryLine's "Custom Scene Fields" feature.

**Rationale.** Draft Bench already supports any frontmatter writers want to add; this would be a Settings UI for registering known custom fields so the plugin can show them in dedicated affordances rather than just letting them sit in the Properties panel.

**Effort.** Moderate. Settings UI plus a registry persisted in `data.json` plus per-field rendering logic. Estimate 1 week.

**Note.** Adds Settings surface area. Worth doing only if a real writer explicitly asks; the existing Properties panel is already a working surface for ad-hoc fields.

---

## Out of scope (reaffirmed, not candidates)

The following showed up in the StoryLine comparison and are explicitly *not* candidates here:

- Characters / Locations / Codex hub: belongs to [Charted Roots](https://github.com/banisterious/charted-roots) per the cross-plugin scope boundary.
- Plot grids / Timeline / Plotlines / Subway map: plotting tools, out of scope per [§ Non-goals](specification.md).
- Plot-hole detection / pacing analysis / echo finder / readability scores: analytics, out of scope per [§ Non-goals](specification.md).
- Image galleries on entities: no entity model in DB.
- Force-directed relationship graphs: no entity model.
- Built-in color schemes: theme-respectful by design; Style Settings is the right surface for opt-in styling.
- Writing sprint timer: tangential; better as a separate plugin.
- Series mode: 2.0 territory at best; would need a new "collection" type and significant cross-project plumbing.
