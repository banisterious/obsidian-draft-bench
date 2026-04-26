# Post-V1 candidates

**Status:** Tracking. Not committed to a specific version.

**Purpose:** Captures features under consideration for post-V1 work so they don't have to be re-derived from conversation. Each candidate has a short scope sketch, rationale, rough effort estimate, and any dependencies. Promotion to a numbered phase happens via a separate planning pass with a real ADR when the time comes.

**Relationship to other planning docs:**

- [specification.md § Non-goals](specification.md) lists features that do not belong in Draft Bench at any version. Items here are *not* non-goals; they are deferred-but-possibly-in-scope.
- [specification.md § Open Questions](specification.md) lists undecided design questions. Items here are decided-as-deferred (we'd add the feature, just not yet).
- [docs/planning/post-v1-forward-compat-audit.md](post-v1-forward-compat-audit.md) is a different doc: it tracks deferred *technical* items (lazy-loading pdfmake, Data Quality surface, active-note-sync heuristic) for a scheduled post-V1 audit. Functional candidates here.
- [branding.md § Positioning relative to adjacent Obsidian plugins](branding.md) compares Draft Bench to StoryLine and Longform; some items here exist because they close real gaps surfaced by that comparison.

---

## Strong candidates (ranked)

### 1. Scrivener `.scriv` import

**Scope.** Read a Scrivener 2 / 3 project (`.scrivx` XML + per-document RTF/RTFD bodies) and produce a Draft Bench project: project note, chapter notes (from binder folders), scene notes (from binder documents), with metadata mapping where it cleanly translates (synopsis -> `dbench-synopsis`, status -> `dbench-status` if the writer's Scrivener statuses overlap the configured vocabulary, label/POV -> custom frontmatter writers can keep). Images extracted to a `Research/` folder. Snapshots imported as `dbench-type: draft` files where possible.

**Rationale.** Scrivener is the dominant prior tool for fiction writers Draft Bench targets. Without an importer, a Scrivener user has to manually rebuild their project structure scene by scene; that's enough friction to send them to StoryLine (which has an importer) or to give up. The presence of an importer is a marketing-tier feature: it's the answer to "but I have ten years of Scrivener projects."

**Effort.** Substantial. Three sub-problems: (a) parse the Scrivener XML format (well-documented but versioned), (b) convert RTF/RTFD body content to markdown without losing italics / bold / footnotes / inline images, (c) map the binder hierarchy to project / chapter / scene with sensible defaults the writer can review. Probably 2-3 weeks of focused work plus QA against several real `.scriv` projects. Worth a dedicated milestone.

**Dependencies.** Chapter-type implementation complete (Steps 1-15) — chapters are required for binder-folder mapping. Drafts feature complete. Compile not required.

**References.** StoryLine has this; their import path is the marketing comparison. Open-source RTF parsers exist in JS (e.g., `rtf-parser`, `rtf-stream-parser`). Apple Pages and other tools also import `.scriv`; their behavior is reference material.

---

### 2. Project-level full-manuscript snapshots

**Scope.** A "First Draft / Second Draft" snapshot model in the Longform sense: capture the entire project's prose state at a moment in time, distinct from per-scene `dbench-type: draft` files. New `dbench-type: project-snapshot` (or similar). Snapshot file is a single concatenated markdown manuscript with a frontmatter pointer back to the project plus a timestamp + name. Restore action: branch a new project from a snapshot for a parallel revision.

**Rationale.** Already promised in the spec under [§ Writing Sessions, Goals, and Revision Snapshots](specification.md). Per-scene drafts cover scene-level rewrites; project-level snapshots cover the "I'm starting a major rewrite from chapter one" use case. Common pattern in Scrivener (the "Draft" folder in Scrivener parlance) and Longform.

**Effort.** Moderate. New note type, new linker relationship (snapshot <-> project), a "Take project snapshot" command that runs the existing compile pipeline and writes the result as a snapshot note, integrity-scan support. UI: a "Snapshots" section in the Manuscript view or a snapshot picker on the project. Estimate 1-2 weeks.

**Dependencies.** Compile pipeline complete (it produces the snapshot bytes). Probably wants chapter-type complete too, since snapshots of chapter-aware projects need to capture chapter bodies + scenes correctly.

**References.** [specification.md § Writing Sessions, Goals, and Revision Snapshots](specification.md). Longform's draft-management model is the obvious prior art.

---

### 3. Scrivenings-style continuous Manuscript view (alternate mode)

**Scope.** A second view mode on the Manuscript leaf: in addition to today's chapter-cards-and-scene-rows, a "continuous read" mode that renders the entire manuscript as one scrollable read-only document. Click any heading to open the underlying note in the active leaf for editing. Toggle between modes via a button on the leaf header.

**Rationale.** Scrivener's "Scrivenings" is a beloved feature for read-throughs. Writers want to see their manuscript as a continuous flow during revision passes (catch repetition, pacing problems, voice drift). The chapter-card view is great for navigation and progress; it's not great for reading. StoryLine has this (with embedded Live Preview editors, which is heavier than necessary).

**Effort.** Moderate. The compile pipeline already produces continuous markdown; the new mode renders that markdown in the leaf via Obsidian's `MarkdownRenderer`. Click handlers on rendered headings to open source notes. Toggle persistence in the same plumbing as chapter collapse state. Estimate 1 week.

**Dependencies.** Chapter-type implementation complete. Compile pipeline complete (or at least the markdown intermediate from `CompileService`).

**References.** Scrivener's Scrivenings mode. StoryLine's Manuscript view. Obsidian's `MarkdownRenderer.render` API.

---

## Borderline candidates (mention, don't commit)

### Beat-sheet templates pack

**Scope.** Pre-baked template files for common story structures: Save the Cat, Three-Act, Hero's Journey, Seven-Point, Story Circle, Romancing the Beat, 27-Chapter Method. Each is a chapter-or-scene-template `.md` with named beats as headings and short prompts.

**Rationale.** StoryLine ships these as a built-in feature. For Draft Bench, they don't need to be in core; a folder of `.md` files distributed via the wiki or a companion repo is enough. Writers download the pack and drop it in their `Templates/` folder. Lower implementation cost; respects DB's narrow scope.

**Effort.** Half a day plus content writing (the templates themselves).

**Note.** This is the kind of thing that scales nicely as a community contribution — not core code, just a curated content pack.

---

### Scene subtitle field

**Scope.** Optional `dbench-scene-subtitle` field on scene frontmatter. Renders as a smaller secondary line under the scene title in the Manuscript view (chapter-card scene rows + flat scene rows). Writers use it for POV character, locale, time-of-day tags, or whatever annotation helps them navigate.

**Rationale.** Tiny feature, useful for some writers, no implementation cost beyond a frontmatter field + one CSS class + ~10 lines of TS. Asked for by name in StoryLine's release notes.

**Effort.** A few hours.

---

### Scene archive

**Scope.** A "Archive scene" right-click action that moves a scene to an `Archive/` folder (configurable) and removes it from the Manuscript view's scene list. Restoration via "Show archive" toggle that surfaces archived scenes for selective unarchiving.

**Rationale.** Cut content has a way of accumulating. Writers don't want to delete it (might revive later) but don't want it polluting the manuscript view either. StoryLine has this.

**Effort.** Half a day. Mostly UI plumbing; the data model is just a folder move plus an optional `dbench-archived: true` flag for retrofit-detected archives.

**Note.** Could be implemented as a setting on `dbench-status` (e.g., "treat status `archived` as hidden from Manuscript view") rather than a folder move. Worth thinking through before committing.

---

### Manuscript view title links honor Obsidian's open-in-tab affordances

**Scope.** Title links in the Manuscript view (chapter cards' chapter titles, scene rows' scene titles) currently always open in the active leaf. Extend them to honor Obsidian's standard wikilink affordances: Ctrl/Cmd-click and middle-click open in a new tab; right-click opens a context menu with "Open in new tab," "Open to the right," "Open in new window" (the same actions Obsidian shows for native wikilinks).

**Rationale.** Writers expect title links to behave like native wikilinks. The current "always open in active leaf" behavior is a paper cut — surfaced during the chapter-card walkthrough (Step 7 testing, 2026-04-26): a writer comparing scenes side-by-side has to manually drag the just-opened tab into a split, every time. Native-affordance support adds zero clutter (right-click is hidden until needed) and removes a real friction point during revision passes.

**Effort.** Small. Two implementation pieces:
- Click handler upgrade: detect `evt.ctrlKey || evt.metaKey` (or `evt.button === 1` for middle-click) before calling `getLeaf(false)`; pass the new-tab flag through to `workspace.openLinkText` or `workspace.getLeaf(true)`.
- Context menu: hook `contextmenu` on the title link, build an Obsidian `Menu` with the standard four actions, attach to the click event.

Probably ~50 LOC across `scene-row.ts` and `chapter-card-section.ts`. Could land as pre-V1 polish if a small Phase 4 / pre-BRAT pass picks it up.

**Dependencies.** None.

**Note.** Likely belongs to "polish" rather than post-V1 if the cost is genuinely small. Tracked here so it doesn't get lost in conversation; promote to a Phase 4 polish step or pre-BRAT hardening when there's bandwidth.

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
