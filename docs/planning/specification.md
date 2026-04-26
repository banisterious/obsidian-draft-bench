# Draft Bench: Plugin Specification

**Working title:** Draft Bench
**Author:** John Banister
**Status:** Initial specification / pre-development
**Date:** April 16, 2026

---

## Overview

Draft Bench is an Obsidian plugin for writers that supports a full creative writing workflow — from project creation through scene management and versioned drafts to manuscript compilation. It is inspired by [Longform](https://github.com/kevboh/longform) but aims to be more user-friendly and more feature-complete, with better onboarding, richer scene/project metadata, per-scene draft history, native compatibility with Obsidian Bases, and a compile system that requires no JavaScript knowledge.

## Non-goals

Draft Bench is a writing workflow and manuscript structure plugin. It is deliberately **not**:

- **A text editor.** Draft Bench does not modify Obsidian's editing experience beyond applying CSS classes to plugin-managed note leaves (see § Styling and Style Settings Integration). Typing, selection, and all other editor behavior stays exactly as Obsidian provides it.
- **A grammar, style, or spelling checker.** Use the browser's native spellcheck or a dedicated plugin.
- **An AI writing assistant.** Draft Bench does not call LLMs, generate prose, rewrite the user's text, summarize scenes, suggest revisions, or produce any AI-authored content. The user's words belong to the user.
- **A real-time collaboration tool.** Writing is a solo craft in Draft Bench's model; multi-user editing is not a design concern.
- **A submission tracker or publishing-workflow manager.** Tracking where you sent a story, what agents responded, or the status of a book deal is out of scope.
- **A plot, theme, or character-arc analyzer.** Draft Bench provides structural scaffolding (scenes, chapters, drafts, status); it does not interpret or analyze the content of that scaffolding.
- **A typewriter-mode or focus-mode implementation.** Themes can style `.dbench-scene` and `.dbench-draft` leaves to approximate these, but the plugin does not ship a dedicated focus mode.
- **A reference manager or citation tool.** Research-note integration post-V1 is about light linking, not citation formatting.
- **A replacement for Obsidian's native search, tags, links, or graph view.** Draft Bench complements these; it does not supplant them.

Non-goals are not a prioritization exercise — they are features that do not belong in Draft Bench at any version, short of a fundamental scope change.

## Design Principles

**Frontmatter-native.** All project data lives in note properties. There is no index file, no parallel data store, no plugin-managed JSON. The vault *is* the database. This makes every note queryable via Bases, Dataview, or any other tool that reads frontmatter.

**Modals generate YAML; users don't edit it by hand.** Every note-creating action flows through a modal that builds the correct frontmatter. Context menus provide "Add to Project as…" actions for existing notes. The property schema is an implementation detail the user can inspect but never needs to touch.

**Progressive disclosure.** A beginner gets a "Create Project" button that produces a working project with zero configuration. A power user gets dedicated surfaces (Manuscript view, Manuscript Builder) with full access to scenes, drafts, compile presets, and project metadata. The simple path and the advanced path coexist without either cluttering the other.

**Dedicated surfaces over a single hub.** Draft Bench's primary UI is a dockable Manuscript view (ambient writing companion) plus a focused Manuscript Builder modal (compile workflow). A multi-tab Control Center hub is parked for a later design pass when the plugin has enough cross-cutting content to justify it. Context menus, ribbon icons, and command palette actions provide parallel access to common operations.

**Type-extensible architecture.** Note types (project, scene, draft — plus future chapter, beat, character, location, etc.) are entries in a registry the plugin consults at runtime. Adding a new type later is a settings-level change plus a template — not a refactor.

## Data Model

### Note Types

Every note managed by Draft Bench carries a set of frontmatter properties that identify its type, its identity, and its relationships. The core properties are:

| Property | Type | Required on | Description |
|---|---|---|---|
| `dbench-type` | string | all plugin-managed notes | The note's role: `project`, `scene`, `draft`, etc. |
| `dbench-id` | string | all plugin-managed notes | Stable identifier, stamped at note creation and never changed. Used by the linker as a rename-safe reference target. Format: `abc-123-def-456` (three lowercase letters, three digits, three lowercase letters, three digits), matching Charted Roots' ID format for cross-plugin readability. Collision-resistant at realistic vault sizes, visually legible, not time-encoded. |
| `dbench-project` | wikilink | all plugin-managed notes | The project this note belongs to. Enables O(1) project-membership queries. |
| `dbench-project-id` | string | all plugin-managed notes | Stable-ID companion to `dbench-project`. Maintained by the linker. |
| `dbench-order` | number | orderable types (scene, and later chapter) | Sort position within the note's ordering scope. |
| `dbench-status` | string (optional) | project, scene, and later chapter | Workflow status (e.g., `idea`, `draft`, `revision`, `final`). |
| `dbench-target-words` | positive integer (optional) | project, scene | Authoring target used by the Manuscript view's progress bars. Writer-set via the Properties panel or template frontmatter; not stamped at creation. |
| `dbench-<target-type>` | wikilink (optional) | notes that reference a typed parent | Typed forward relationship pointer (e.g., `dbench-scene` on a draft). See § Typed Relationships. |
| `dbench-<target-type>-id` | string (optional) | same as above | Stable-ID companion to the typed forward pointer. |

The `dbench-` prefix namespaces plugin properties to avoid collisions with user properties or other plugins.

Every forward relationship is stored as both a wikilink (human-facing, clickable, graph-surfacing) and an ID companion (rename-safe, linker-maintained). See § Relationship Integrity for the full bidirectional model.

### Typed Relationships

Plugin-managed notes express parent-child relationships via typed properties of the form `dbench-<target-type>: [[Target Note]]`. This pattern extends across the type registry:

| Relationship | Property | Target |
|---|---|---|
| Any plugin-managed note -> project | `dbench-project` | project note |
| Draft -> scene | `dbench-scene` | scene note |
| Scene -> chapter (post-V1) | `dbench-chapter` | chapter note |
| Chapter -> project (post-V1) | `dbench-project` | project note |

`dbench-project` remains on every note in a project even when a typed intermediate parent exists. For example, a scene whose chapter is set to `[[Chapter 1]]` still carries `dbench-project: [[My Novel]]`. This keeps project-membership queries cheap regardless of hierarchy depth.

There is no generic `dbench-parent` property. Typed properties are clearer for writers inspecting frontmatter and produce cleaner Bases queries (`dbench-scene is [[Tempting Waters]]` instead of `dbench-parent is [[Tempting Waters]] and dbench-type is draft`).

### V1 Type Vocabulary

The initial release ships with three types:

- **`project`**: The landing and metadata note for a work. Holds synopsis, genre, target word count, and other project-level metadata in frontmatter; body holds freeform planning content (outlines, themes, cuts and deferrals), plus (in single-scene projects, see § Project Structure on Disk) the current working draft itself.
- **`scene`**: A unit of manuscript content. The primary building block in folder-shaped projects; membership is determined by `dbench-project` frontmatter, not folder location (see § Project Structure on Disk). Body holds the current working draft with planning sections above it (from the scene template).
- **`draft`**: An archived snapshot of a scene's prose (or, in single-scene projects, the project's prose). Created by the "New draft" command; not authored directly. Lives in a configurable drafts folder.

Beats are represented as headings within scene notes by default. An optional `beat` type (as a separate note) is available for writers who need per-beat metadata, word counts, or Bases queryability.

### Architected For (Post-V1)

The following types are anticipated but not shipped in V1. The type registry and template system are designed to accommodate them without architectural changes:

- `chapter`: Grouping/ordering layer above scenes. Enables the novelist archetype and dual-POV interleaving.
- `beat`: Sub-scene unit (as separate note, for writers who need per-beat metadata).
- `character`: Character bible entry.
- `location`: Setting/location reference.
- `research`: Reference material linked to a project.
- `logline`: Short pitch/premise (likely as a property on `project`, not a separate type).

Outlining and synopses are not separate types. Structural planning lives in the body of project, chapter, and scene notes via template-provided sections ("Source passages," "Beat outline," "Open questions," etc.). Per-note summaries are represented by an eventual `dbench-synopsis` property, not a standalone note type — this surfaces them in the Manuscript tab (as index-card text) and in Bases views.

### Project Structure on Disk

#### Discovery is frontmatter-based, not folder-based

Before describing the project shapes, a foundational principle: **Draft Bench identifies plugin-managed notes by frontmatter, not by filesystem location.** The `dbench-type` property identifies a note's role; `dbench-project` (wikilink + `dbench-project-id` companion, per § Relationship Integrity) identifies which project a note belongs to. These frontmatter properties are authoritative — a note with `dbench-type: scene` and `dbench-project: [[The Salt Road]]` is part of that project regardless of where in the vault it lives.

Services that read from the vault (the Manuscript view, the Manuscript Builder, the linker, compile, repair) scan `app.vault.getMarkdownFiles()` and filter by frontmatter. Nothing in the read path checks folder paths.

**What this means for writers:** organize the vault however you prefer. Put scenes in status-named folders, group by POV, mix Draft Bench notes with unrelated vault content — the plugin is folder-agnostic. The project-shape conventions described below are *creation defaults* (where new notes land by default), not enforced structures (moving a note later never breaks membership).

This design is adapted from Charted Roots' approach to folder flexibility; see [D-04 — Folder flexibility](decisions/D-04-folder-flexibility.md) for the architectural decision record.

#### Project shapes

Draft Bench supports two project shapes, distinguished by the `dbench-project-shape` property on the project note.

#### Folder project (default)

`dbench-project-shape: folder`, or property absent.

A folder-shaped project is, by creation convention, a folder containing a project note and its scene notes, with drafts in a configurable subfolder. Example layout as the plugin creates it:

```
The Salt Road/
├── The Salt Road.md              ← dbench-type: project, dbench-project-shape: folder
├── Morning at the inn gate.md    ← dbench-type: scene, dbench-order: 1
├── The first mile.md             ← dbench-type: scene, dbench-order: 2
├── The merchant's bargain.md     ← dbench-type: scene, dbench-order: 3
├── ... (more scenes) ...
└── Drafts/
    ├── Morning at the inn gate - Draft 1 (20260120).md
    └── Morning at the inn gate - Draft 2 (20260214).md
```

This is a **default layout, not a requirement.** A writer who prefers to organize `The Salt Road`'s scenes under `Writing/Fantasy/Act 1/`, `Writing/Fantasy/Act 2/`, etc., can move the files there freely. The plugin continues to treat them as scenes of *The Salt Road* because their `dbench-project` frontmatter still points at the project note. Ordering comes from `dbench-order`; membership from `dbench-project`. There is no index file and no folder-path check.

#### Single-scene project

`dbench-project-shape: single`.

For short works (flash fiction, poems, single short stories), a project is a single note. The project note *is* the current working draft — its body holds the prose with optional planning sections above. No scene notes and no folder structure are required.

Example (minimal state, before any drafts have been snapshotted):

```
/Writing/Single-sits/
└── A Brief Encounter.md          ← dbench-type: project, dbench-project-shape: single
```

When the first "New draft" runs, the drafts folder appears (per the configured drafts-folder setting):

```
/Writing/Single-sits/
├── A Brief Encounter.md
└── A Brief Encounter — Drafts/
    └── A Brief Encounter - Draft 1 (20260420).md
```

Writers can graduate a single-scene project into a folder project by creating a project folder around the project note and adding scene notes; existing drafts remain valid.

#### Default creation folders

Settings expose three default folder targets that control where the plugin **creates** new notes. They are creation defaults only — once created, any note can be moved anywhere, and the plugin continues to function via frontmatter-based discovery.

| Setting | Default | Purpose | Token support |
|---|---|---|---|
| `projectsFolder` | `Draft Bench/{project}/` | Where "Create project" puts new projects. The `{project}` token is replaced with the project's title, yielding `Draft Bench/The Salt Road/` for a project titled "The Salt Road." | `{project}` |
| `scenesFolder` | inside the project folder (`{project}/`) | Where "New scene in project" puts new scenes. Default places scenes alongside the project note. Writers who prefer a flat per-project layout, or scenes in a separate `Scenes/` subfolder, or scenes grouped by part, can customize with tokens. | `{project}` |
| `draftsFolder` | `Drafts/` inside the project folder | Where snapshots go. Three placement options (see § Draft Management § Drafts folder placement). | varies by option |

Example custom settings for a writer who keeps all fiction in one tree and wants scenes in a dedicated subfolder:

- `projectsFolder`: `Writing/Fiction/{project}/`
- `scenesFolder`: `Writing/Fiction/{project}/Scenes/`
- `draftsFolder`: `Writing/Fiction/{project}/Drafts/`

None of this affects discovery — scenes created in any of these locations, or later moved elsewhere, remain discoverable by their frontmatter.

#### Why this shape

- **Bases-friendly.** Filter by folder, by `dbench-type`, by `dbench-status`, by `dbench-project`, or any typed relationship.
- **Rename-safe.** Reordering updates `dbench-order` frontmatter only: no file or folder renames, no wikilink cascade.
- **No parallel data store.** Ordering and membership live in frontmatter, not in an index file.

#### UX consideration: filesystem sort

File-explorer alphabetical sort does not match story order. The **Manuscript tab is the canonical ordered view.** Onboarding messaging and settings copy should set this expectation. Writers who specifically want filesystem-sort to equal story-order may install a community custom-sort plugin that reads `dbench-order`.

### Draft Management

Drafts are prose snapshots of a scene (in folder projects) or of the project (in single-scene projects), created on demand by the "New draft" command. They are real files — openable in split panes, linkable via wikilinks, queryable via Bases — not invisible plugin-managed records.

#### Shape

- **Location:** configurable drafts folder (default `Drafts/` inside the project folder).
- **Frontmatter:** `dbench-type: draft`, `dbench-project: [[...]]`, `dbench-draft-number: N`, plus `dbench-scene: [[...]]` for drafts of a scene in a folder project. Single-scene projects omit `dbench-scene`: the draft's `dbench-project` identifies the parent.
- **Filename:** `<Scene or Project> - Draft N (YYYYMMDD).md`.

#### Behavior

- The "New draft" command snapshots the scene note's current body (or, for single-scene projects, the project note's body) into a new draft file with the next sequential `dbench-draft-number`.
- After snapshotting, the scene (or project) note body continues forward as the new working draft. Writers are revising, not starting blank.
- Draft numbering is plugin-managed and inferred from existing drafts for that scene/project. Writers do not number manually.
- Prior drafts remain accessible as ordinary files.

#### Drafts folder placement

Settings expose three options for where the drafts folder lives:

- **Inside each project** (default): `Drafts/` as a subfolder of each project folder. Name is configurable (e.g., "Drafts," "Archive," "Brouillons" for localization).
- **Per-scene subfolder**: each scene's drafts live in a sibling folder named after the scene (`<Scene>: Drafts/`). Useful for writers who want draft history tightly co-located with its scene.
- **Vault-wide**: a single drafts folder at the vault root, with filenames disambiguated by project name. Useful for writers who archive all draft history centrally.

#### Scope of "draft"

A Draft Bench `draft` is a per-scene (or per-single-scene-project) prose snapshot — the state of one piece of content at a moment in time. It is **not** a parallel version of the entire manuscript. Full-manuscript alternate versions ("First Draft" vs. "Second Draft" as entire parallel trees, in the sense Longform uses "draft") are a separate concept covered under § Writing Sessions, Goals, and Revision Snapshots. That concept is deferred to a later build.

### Relationship Integrity

Draft Bench keeps relationships between notes consistent across renames, moves, and manual edits through a bidirectional linking model. The pattern is adapted from the Charted Roots plugin's `BidirectionalLinker` / `DataQualityService` split (see [charted-roots repo — `src/core/bidirectional-linker.ts` and `docs/developer/implementation/data-services.md` § Bidirectional Relationship Sync](https://github.com/banisterious/charted-roots)).

#### The three-layer model

**1. Stable identity per note.**

Every plugin-managed note receives a `dbench-id` stamped at creation. The ID format is `abc-123-def-456` — three lowercase letters, three digits, three lowercase letters, three digits — matching Charted Roots' readable ID pattern. The ID never changes, even if the note is renamed, moved, or has its title edited. It is the rename-safe reference target used by the linker.

**2. Forward references are dual-stored.**

Each typed forward relationship is stored as both a wikilink (for human-facing display, Obsidian graph, clickability) and an ID companion (for linker reliability). Example, a scene note in a folder project:

```yaml
---
dbench-type: scene
dbench-id: rkn-482-pvt-739
dbench-project: [[The Salt Road]]
dbench-project-id: lmw-194-bxh-806
dbench-order: 3
dbench-status: revision
---
```

**3. Reverse references are plugin-maintained arrays.**

Parent notes carry arrays back to their children, maintained by the linker. Example, the project note:

```yaml
---
dbench-type: project
dbench-id: lmw-194-bxh-806
dbench-project-shape: folder
dbench-scenes: ["[[Morning at the inn gate]]", "[[The first mile]]", "[[The merchant's bargain]]"]
dbench-scene-ids: [fjq-207-zxc-551, gbw-864-tnm-302, hrd-719-pks-485]
---
```

Scene notes carry a similar pair for their drafts:

```yaml
---
dbench-type: scene
dbench-drafts: ["[[Morning at the inn gate - Draft 1 (20260120)]]", ...]
dbench-draft-ids: [zma-361-vxq-907, ...]
---
```

Reverse arrays give the Manuscript view cheap population (read one property, not a vault scan) and a canonical redundant record of what belongs to a parent, enabling repair when forward references break.

#### V1 relationships under the linker

| Forward (on child) | Reverse array (on parent) | Parent note type |
|---|---|---|
| `dbench-project` (+ `dbench-project-id`) | `dbench-scenes` + `dbench-scene-ids` | project |
| `dbench-scene` (+ `dbench-scene-id`) | `dbench-drafts` + `dbench-draft-ids` | scene |
| `dbench-project` (on drafts in single-scene projects) | `dbench-drafts` + `dbench-draft-ids` | project |

Post-V1 `dbench-chapter` relationships slot in without architectural change (new forward `dbench-chapter` + reverse `dbench-chapter-scenes` on chapter notes, and `dbench-chapters` on project notes).

#### Live sync service

A `DraftBenchLinker` service listens for three vault events on plugin-managed notes:

- **`vault.on('modify')`**: forward-reference changes propagate to parent reverse arrays; user edits to a reverse array propagate back to the forward side. All frontmatter writes go through `FileManager.processFrontMatter`.
- **`vault.on('delete')`**: when a plugin-managed note is deleted from the file explorer (or via any other means), the linker removes its entry from the parent's reverse array and drops the ID companion. Without this, `dbench-scenes` accumulates stale entries that would confuse the Manuscript tab until the next manual repair.
- **`vault.on('rename')`**: mostly redundant with Obsidian's automatic wikilink updater, but listened to as a safety net. If a rename happens through a non-Obsidian tool and wikilinks aren't auto-updated, the linker still has the stable `dbench-id` companion to reconcile from.

The linker handles:

- Forward -> reverse propagation on add/change.
- Reverse -> forward propagation on array edits (if a user manually removes a child from a parent's array, the child's forward reference is cleared).
- Delete cascade to reverse arrays.
- ID companion sync: when a wikilink changes but the target's `dbench-id` is the same, the ID companion is left alone; when the target `dbench-id` changes (rare: only if a note's identity is rebuilt), the companion is updated.

#### Failure modes and atomicity

Several plugin-driven operations are two-file (or more) writes: "New scene in project" stamps the new scene note *and* appends an entry to the parent project's `dbench-scenes` reverse array. "New draft" writes the draft file *and* updates the parent scene's `dbench-drafts` array. If the plugin errors between the two writes — a crash, a filesystem error, a vault sync race — the vault is left in a recoverable-but-inconsistent state: the scene exists but the project doesn't know about it, or the draft exists without a reverse-array entry.

This is acceptable because: (1) the scene or draft is never silently lost — the primary file is written first, so the user's content is always safe; (2) the repair service reconciles on next invocation; (3) forward references alone are enough for most queries and UI rendering, so the transient inconsistency degrades gracefully. The linker does not attempt full two-phase commit — the complexity cost outweighs the recovery cost.

#### Batch repair service

A `DraftBenchIntegrityService` owns the "Repair project links" command (available from the command palette and project context menu). It performs a full scan-and-reconcile pass on a project:

- Finds scenes whose `dbench-project` wikilink doesn't resolve but whose `dbench-project-id` is valid -> rebuilds the wikilink.
- Finds orphan scenes (inside the project folder by filesystem, but missing or wrong `dbench-project`) -> prompts the user to re-assign.
- Finds reverse-array entries that no longer point at existing notes -> removes them.
- Finds missing reverse-array entries (scenes that reference the project but aren't in the project's `dbench-scenes` array) -> adds them.

The repair command is intentionally **manual, not automatic**. Automatic reconciliation during a live session risks clobbering mid-edit state. Users invoke repair deliberately.

#### Conflict detection, not auto-resolution

When the linker or repair service finds an inconsistency it cannot resolve unambiguously — for example, a draft's `dbench-scene` wikilink points to `[[Scene A]]` but its `dbench-scene-id` points to a different note — the conflict is flagged for manual review rather than auto-overwritten. Following CR's pattern: it is safer to ask than to guess when the user's intent is ambiguous.

#### Settings

- `enableBidirectionalSync` (default: on): master toggle for the live sync service. When off, the linker is dormant; repair can still be invoked manually.
- `syncOnFileModify` (default: on): listen to `vault.on('modify')` events. Can be disabled for performance in very large vaults.

#### Suspended states

The linker is suspended during plugin-driven operations to avoid stale intermediate states:

- New-project creation (project note + initial scene note + reverse-array stamp).
- "New scene in project" command (scene note write + project's `dbench-scenes` array update).
- "New draft" command (snapshot file write + scene's `dbench-drafts` array update).
- Future: bulk scene imports, project-template expansion.

After a suspended operation completes, the plugin runs a targeted re-sync on the affected notes. The failure-mode guarantees above still apply — primary file writes happen first, reverse-array updates second, repair service reconciles any interruption.

## User Interface

This section describes what the UI surfaces do. For **how** to build them — component patterns, CSS conventions, modal structures, accessibility guarantees, empty/loading states — see the companion [UI/UX Reference](ui-reference.md), which captures the patterns adapted from Charted Roots.

### Manuscript view and Manuscript Builder

Draft Bench's UI has two primary surfaces, split per [D-07](decisions/D-07-control-center-split.md) to match the shape of what each surface hosts. (The split was originally Manuscript view + Control Center; the Control Center concept was deferred for V1 — see [control-center-reference.md](control-center-reference.md) — and replaced by a focused Manuscript Builder modal that owns the compile workflow.)

**Manuscript view (dockable workspace leaf).** The ambient writing companion. Lives in the right sidebar by default; can be dragged to the left sidebar, the main pane, or detached to a popout window. Hosts:

- **Project picker** at the top — dropdown of all discoverable projects. Selection persists across reloads.
- **Compile CTA** above the toolbar (primary action, opens the Manuscript Builder for the active project's preset workflow).
- **Toolbar** with three buttons: **New scene**, **New draft of current scene**, **Reorder scenes**. Buttons invoke the existing commands / dedicated modals; the leaf stays open.
- **Project summary** section (collapsible): status, shape, identifier, total word count, hero progress bar when `dbench-target-words` is set on the project, per-status word/scene breakdown.
- **Manuscript list** section (collapsible): ordered scene list with click-through, status chip, word-count or per-scene progress bar (when `dbench-target-words` is set), draft count.
- **Empty states**: brand-mark + "Your manuscript begins here" CTA when no projects exist; compact prompt when projects exist but none is selected.

Invoked via:

- Ribbon icon (lucide `pencil-ruler`).
- Palette command `Draft Bench: Show manuscript view`.
- Project-note context menu entry `Show manuscript view` (selects that project, reveals the leaf).
- Auto-reveals on first project creation (one-shot behavior; writers who close the leaf afterward stay closed).

**Manuscript Builder (compile-preset modal).** Single-purpose modal hosting the compile-preset editor + Run CTA. Five collapsible form sections (Metadata, Inclusion, Output, Content handling, Last compile) operate on the active project's selected preset; a header dropdown switches presets and a "+ New preset" button opens the create modal. No tab navigation — the modal does one thing.

Invoked via:

- Header gear button on the Manuscript leaf.
- Palette command `Draft Bench: Build manuscript`.
- Project-note context menu entry `Build manuscript`.

**Cross-surface state.** Both surfaces share a single plugin-level `selectedProjectId` so selecting a project in one is reflected in the other. The Manuscript view additionally persists its selection via plugin settings so reloads restore the previous project.

**Settings.** Plugin configuration lives in Obsidian's native Settings panel (Options -> Community plugins -> Draft Bench), not in either surface. A future Dashboard / Control Center could include a launcher tile that jumps to the native settings tab via `app.setting.open()` + `openTabById('draft-bench')`; no settings UI is duplicated.

For further reading:

- [D-07](decisions/D-07-control-center-split.md) — the original split decision (Manuscript view + Control Center). Subsequent decision to replace the Control Center with the Manuscript Builder is captured in [control-center-reference.md § Draft Bench's current direction](control-center-reference.md#draft-benchs-current-direction).
- [dockable-view-reference.md](dockable-view-reference.md) — Obsidian `ItemView` patterns that inform the Manuscript leaf's implementation.
- [control-center-reference.md](control-center-reference.md) — Charted Roots architectural reference, parked for a later Control Center / Dashboard design pass when DB has enough cross-cutting content to justify a hub.

### Scene reordering

Scene reordering happens in a dedicated modal, not inline in the Manuscript tab. Rationale: reorder is a deliberate, occasional act, not a constant one. A focused modal gives it room, simplifies keyboard accessibility, and keeps the Manuscript tab uncluttered.

**Reorder scenes modal:**

- Shows scenes in current order, one row per scene.
- Row affordances: a drag handle on the left edge for mouse users; keyboard users focus a row and use arrow keys (or J/K) to move it. Drag-and-drop and keyboard each cover the full reorder surface.
- Preview of the new sequence before commit.
- Commit writes `dbench-order` on each affected scene via `FileManager.processFrontMatter`. No file or folder renames.
- Triggered from: the Manuscript view's toolbar, the scene context menu, or the command palette.

### Context menu actions

Right-click actions on files and folders:

- **Create Draft Bench project** (on folders): opens the new-project modal.
- **New scene in project** (inside a project folder): opens the new-scene modal.
- **New draft of this scene** (on a scene note): snapshots and carries forward per § Draft Management.
- **Set as…** / **Complete essential properties** / **Add identifier**: context-sensitive retrofit actions for bringing existing notes under plugin management. See § Applying Draft Bench properties to existing notes below.
- **Set status** (quick status change).
- **Reorder scenes** (anywhere inside a project): opens the reorder modal.

### Applying Draft Bench properties to existing notes

Writers who install Draft Bench often already have project notes, scene notes, or draft files created manually in Obsidian, through Longform, or from imports. These notes lack plugin frontmatter but otherwise match the content shape. Rather than requiring users to recreate them, the plugin offers context-menu actions that add missing frontmatter idempotently. The pattern is adapted from [Charted Roots' "Add essential properties" actions](https://github.com/banisterious/charted-roots); see [D-05 — Property retrofit actions](decisions/D-05-property-retrofit-actions.md) for the decision record.

#### Action inventory

Three per-type helpers plus one standalone ID helper:

- **Set as project**: stamps project essentials on an untyped note: `dbench-type: project`, `dbench-id`, `dbench-project: [[self]]`, `dbench-project-id: <same>`, `dbench-project-shape: folder` (or prompts for folder/single), `dbench-status: idea`, `dbench-scenes: []`, `dbench-scene-ids: []`.
- **Set as scene**: stamps scene essentials on an untyped note: `dbench-type: scene`, `dbench-id`, `dbench-project: ''`, `dbench-project-id: ''`, `dbench-order: 9999` (sorts to the end until user adjusts), `dbench-status: idea`, `dbench-drafts: []`, `dbench-draft-ids: []`.
- **Set as draft**: stamps draft essentials on an untyped note: `dbench-type: draft`, `dbench-id`, `dbench-project: ''`, `dbench-scene: ''`, `dbench-scene-id: ''`, `dbench-draft-number: 1`. Draft number defaults to 1; writers retrofitting a non-first draft can adjust via the Properties panel (or via "Complete essential properties" after setting `dbench-draft-number` manually).
- **Complete essential properties**: applies to a note that already has `dbench-type` but is missing other essentials for its type. Fills in only the missing fields.
- **Add identifier**: standalone ID stamp, for notes that have `dbench-type` but lack an identifier.

Per-type helpers are named "Set as X" rather than "Add essential X properties" (CR's phrasing) because DB's version also sets the `dbench-type` discriminator; the action converts an untyped note into a typed note in one step.

#### Behavior guarantees

**Idempotent.** Every field check is "if absent, add; if present, leave alone." Running an action twice produces the same result as running it once. Writers can safely batch-apply across hundreds of files.

**Never overwrites.** Existing frontmatter values are preserved. The action only ever *adds* missing keys; it never mutates values that are already set.

**Empty string / empty array for missing references.** Wikilink fields (`dbench-project`, `dbench-scene`) that cannot be auto-determined are added as empty strings. The note becomes "orphan" from the plugin's perspective — it has the right type but no project membership — until the writer fills in the property via Obsidian's Properties panel. Phase 2 will add a picker modal ("Add this scene to project…") that resolves empty wikilinks in one step.

**Folder-based inference at retrofit time.** When the note's file location unambiguously implies a parent project, the retrofit actions use that context:

- **Set as scene:** if the immediate parent folder contains exactly one `dbench-type: project` note, `dbench-project`, `dbench-project-id`, and `dbench-order` (as `max(existing) + 1`) are populated from it.
- **Set as draft:** walks up the folder hierarchy looking for exactly one project note at some ancestor level (handles the common `<project>/Drafts/<file>.md` layout). Populates `dbench-project` and `dbench-project-id`.
- **Complete essential properties (on type scene or draft):** the same inference runs, but only upgrades fields that are empty / still at the `9999` placeholder. Non-empty existing values are never overwritten.

Any ambiguity — zero or multiple project notes at a given level — falls back to the empty-placeholder behavior above. Inference is creation-time only; it does not change how existing scenes or drafts are *discovered* (discovery remains frontmatter-based per D-04).

**Filename defaults.** For properties where the filename is a natural default (e.g., a project's self-link), the action uses the file's basename. The `dbench-draft-number` value is also inferred by parsing a `Draft N` pattern from the basename, falling back to `1`.

#### Smart menu visibility

The context menu pre-scans the selection and only shows actions that would actually do something:

- A note with `dbench-type` already set: offer "Complete essential properties" only if something is missing. Offer "Add identifier" only if the ID is absent.
- A note without `dbench-type`: offer "Set as project / scene / draft" as a submenu (flat menu on mobile per Platform detection, following CR).
- A note with all properties present: show no Draft Bench menu items.

This keeps the context menu from feeling noisy — users don't see "Complete essential properties" on a selection that already has them.

#### Menu scope

All three invocation scopes are supported in V1:

- **Single file.** Right-click on a markdown file.
- **Multi-file.** Right-click on a multi-selected group. Smart detection runs across the selection; the menu offers an action only if at least one file in the selection would change.
- **Folder.** Right-click on a folder. Action applies to all markdown files inside, recursively. Useful for retrofit on existing projects.

Menu entries follow Obsidian's desktop/mobile conventions: submenus on desktop (`setSubmenu()`), flat menus on mobile.

#### Feedback

Actions emit a notice on completion:

- Single file: "Set as scene" / "Already a scene" / "Failed to apply properties"
- Multi-file or folder: "Set as scene: 5 updated, 3 already typed, 1 error"

This matches Charted Roots' feedback shape for cross-plugin consistency.

### Command palette

All commands are registered with the `Draft Bench:` prefix (matching Obsidian's plugin command convention). The command palette filters by prefix when users type "Draft Bench" or "db".

All context menu actions are also available as commands, plus:

- `Draft Bench: Build manuscript`
- `Draft Bench: Show manuscript view`
- `Draft Bench: Create project`
- `Draft Bench: New scene in project`
- `Draft Bench: New draft of this scene`
- `Draft Bench: Reorder scenes`
- `Draft Bench: Repair project links`
- `Draft Bench: Set as project / scene / draft` (retrofit actions)
- `Draft Bench: Complete essential properties`
- `Draft Bench: Add identifier`
- `Draft Bench: Create compile preset` (Phase 3+)
- `Draft Bench: Run compile` (Phase 3+)
- `Draft Bench: Duplicate compile preset` (Phase 3+)
- `Draft Bench: Compile current project` (Phase 3+)
- `Draft Bench: Jump to next scene` / `Draft Bench: Jump to previous scene`

### Notice conventions

Draft Bench uses Obsidian's `Notice` API for all user-visible feedback. Conventions:

- **Success.** Prefix with `\u2713`. Use domain nouns (scene, project, draft), not internal terms (frontmatter, linker). Example: "\u2713 Created Draft 2 of Tempting Waters."
- **Progress.** Plain text ending in `...` while async work runs. Example: "Repairing project links..."
- **Failure.** Start with "Could not" and state what was attempted. Follow with what the user can do, if actionable. Stack traces never appear in a notice; they go to the developer console at error level. Example: "Could not write Drafts folder. Check that the folder path in Settings is valid."
- **Batch summary.** `<Action>: <n> <result>, <n> <result>, <n> errors`. Example: "Set as scene: 5 updated, 3 already typed, 1 error."
- **Plain tone.** No apology language ("Sorry, we couldn't..."), no exclamation marks (even for success), no internal jargon in user-facing text. Say "draft" not "snapshot file," "project" not "project note," "scene" not "markdown file with dbench-type: scene."
- **Pluralization.** Use a `pluralize` helper so grammar matches the count (`1 scene` vs. `5 scenes`).

### Keyboard accessibility

Draft Bench's UI surface is designed to be keyboard-operable end to end. Three guarantees:

**Every plugin action is a named command.** Every action accessible via ribbon icon, context menu, or Manuscript Builder button is also registered as a Draft Bench command. Obsidian's Hotkeys settings then lets users bind any shortcut they want — the plugin does not ship default hotkeys (bundling defaults risks conflicting with user-set hotkeys and other plugins).

**Modals support keyboard-only operation.** Tab order reflects visual order, Escape closes, Enter commits the primary action. List-heavy modals (Reorder scenes, and future multi-select modals) support arrow-key navigation, with standard shortcuts where they exist (J/K for up/down in the reorder modal, matching convention used elsewhere in Obsidian).

**ARIA roles and focus management.** All modals set correct ARIA roles (`dialog`, `listbox`, `option` where applicable), trap focus within the modal while open, and restore focus to the triggering element on close. Reader-friendly labels are set on all interactive elements.

The README ships with a suggested-hotkey list (not auto-bound) so writers have a starting point for frequently-used commands without risking conflicts.

### Onboarding: deferred

Guided onboarding (welcome modal, first-project walkthrough, example-project generator) is deferred to Phase 3 or later. V1 would be onboarding users to features that don't yet exist. Early builds ship with README documentation and a short settings-level note pointing to the command palette for the available actions.

When onboarding lands, it is likely to be wizard-shaped (multi-step flow with resumable state, since users may abandon midway and return). For the full architectural reference on wizard modals (step model, validation gates, `ModalStatePersistence<T>` for resume, branching vs. linear flows) drawn from Charted Roots, see [wizards-reference.md](wizards-reference.md). The reference doc is context for later evolution, not a blueprint.

## Scene Templates

### Built-in library (V1)

V1 ships with a single built-in scene template, applied automatically when "New scene in project" runs. The template body is:

```markdown
## Source passages

## Beat outline

## Open questions

## Draft

```

The four section headings are deliberate, matching the UC-01 short-story-from-sources archetype that's the V1 first-wave target:

- **Source passages**: places to paste or link to reference material the scene draws on (transcripts, research notes, historical sources).
- **Beat outline**: structural beats of the scene before prose drafting begins.
- **Open questions**: unresolved choices the writer wants to flag for later.
- **Draft**: where the actual prose lives; the body below this heading is what the "new draft" command snapshots.

Frontmatter is stamped by the plugin (not by the template itself). The template file lives at a configurable path in the vault; writers can edit it directly to change defaults. Writers who don't plan before drafting can delete the headings in the template file, or use a leaner template from the Phase 2 multi-template system.

### User-defined templates (Phase 2+)

Phase 2 adds the ability to create, name, and manage multiple templates. Template selection happens at scene creation. A template includes:

- Frontmatter scaffolding (pre-filled properties appropriate to the note type).
- Body text (structural prompts, placeholder headings, or blank).
- A display name and optional description.

Templates are stored as markdown files in a configurable templates folder within the vault.

### Templater Integration

When the Templater plugin is installed, scene templates are processed through Templater before Draft Bench's plugin tokens are substituted. Writers can use Templater syntax (`<% tp.* %>`) for dynamic content — prompts, dates, cursor placement, user-defined functions — alongside Draft Bench's `{{scene_title}}`-style tokens. The two syntaxes don't collide; Templater runs first on the template body (with the new scene file as `tp.file.*` context), then Draft Bench substitutes plugin tokens on the result.

Detection is automatic — no setting. When Templater isn't installed, or when a template script throws at runtime, scene creation falls through to the plain plugin-token flow; a broken Templater script never blocks scene creation. Projects and drafts don't use Templater in V1 (projects start empty, drafts snapshot the parent scene's body).

## Compile / Book Builder

Book Builder assembles compiled manuscripts from a project's scenes: markdown concatenation with content-handling rules, rendered to markdown, PDF, or ODT for vault storage, workshop circulation, or submission. Runs entirely in-process (no Pandoc, no LaTeX, no external toolchain); writers export on any platform with Obsidian installed.

Full V1 design rationale in [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md). The spec below summarizes the locked shape.

### Compile-as-artifact

Compile configurations are first-class vault notes with `dbench-type: compile-preset`. Presets are persistent artifacts writers open, edit, and return to, not transient UI state dismissed after a single session. The preset note is the canonical compile surface; the Book Builder UI is one editing surface among several (Properties panel, Bases views, direct frontmatter edit).

Consequences: presets survive Obsidian restarts and vault moves; writers maintain multiple presets per project cheaply (workshop draft / final manuscript / Kindle sample / synopsis-only); preset notes travel between vaults as plain markdown files; git-synced vaults version presets natively.

Presets participate in bidirectional linking with their parent project (preset `dbench-project` <-> project `dbench-compile-presets` / `dbench-compile-preset-ids` reverse arrays, same pattern as scene <-> project).

### Core capabilities

- **Scene concatenation** in `dbench-order`.
- **Status filtering** via `dbench-status` values (empty filter = all statuses).
- **Explicit exclusions** via wikilink list on the preset.
- **Section breaks** as scene-scoped decorations (named breaks rendered before specific scenes).
- **Content-handling rules** for markdown constructs: frontmatter, wikilinks, embeds, callouts, footnotes, etc. Five rules are per-preset; the rest are hardcoded defaults (see § Content-handling rules below and [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md) for the full table).
- **Heading-scope** selection: include only content below `^## Draft` (V1 default) or the full scene body.
- **Scene-title heading insertion** (H1) with optional chapter-numbering prefix.
- **Title page** generation (optional).

### Inclusion model

Three flat preset fields control which scenes enter the compile set:

```yaml
dbench-compile-scene-source: auto       # V1 value; explicit reserved post-V1
dbench-compile-scene-statuses: []       # [] = all; ["final"] = filter
dbench-compile-scene-excludes: []       # wikilink array of scenes to skip
```

Pipeline order: collect all scenes in `dbench-order` -> filter by status (strict: missing status excluded if filter is non-empty) -> remove excluded scenes -> compile set.

Default status filter is empty (all statuses) so a new preset compiles visibly during early drafting. A future Data Quality surface will flag missing-status scenes as a fixable pre-compile issue (see [data-quality-reference.md](data-quality-reference.md)).

### Granularity tiers

V1 supports two granularity modes via `dbench-compile-heading-scope`:

- **Scene-level, draft-only** (default, `scope: draft`): include only content below each scene's `^## Draft` heading. Planning sections (Source passages, Beat outline, Open questions) are excluded. Matches the built-in scene template's manuscript-only region.
- **Scene-level, full body** (`scope: full`): include the entire scene body, including planning sections. Useful for internal review compiles; rarely used for submission output.

Deferred post-V1: **draft-version cross-section** (compile a specific historical draft per scene, e.g., "Draft 2 across the manuscript," using each scene's `dbench-drafts` array). Useful for snapshotting a complete revision state; not V1-essential.

### Output formats

V1 ships four formats. Format and destination are encoded as two orthogonal preset fields:

```yaml
dbench-compile-format: md           # md | pdf | odt | docx
dbench-compile-output: vault        # vault | disk (vault meaningful only when format=md)
```

- **Markdown to vault** (`format: md`, `output: vault`): compiled manuscript as a new note at `<project folder>/Compiled/<preset name>.md`. Re-compile overwrites. Default for new presets.
- **Markdown to disk** (`format: md`, `output: disk`): markdown file saved outside the vault via Obsidian's native save dialog.
- **PDF** (`format: pdf`): direct export via [pdfmake](https://pdfmake.github.io/docs/) with lazy-loaded VFS fonts (Roboto + DejaVu Sans Mono). Dynamically imported on first compile so the ~200KB library and ~1.5MB font VFS don't affect plugin load time. Save dialog for destination.
- **ODT** (`format: odt`): OpenDocument Text via a JSZip-built archive (mimetype + manifest + styles.xml + content.xml subset). System fonts, no bundling. Save dialog for destination.
- **DOCX** (`format: docx`): Microsoft Word format via the [docx](https://docx.js.org/) library (a self-contained DOCX writer that needs no external Pandoc dependency). Shares the same MD-AST intermediate as ODT and PDF (parser at `src/core/compile/md-ast.ts`); a `render-docx.ts` orchestrator emits the DOCX archive. System fonts, no bundling. Save dialog for destination. Targeted because most agents and editors expect Word-format submissions, so producing a DOCX from MD or ODT outside the plugin is friction every submission cycle.

One preset, one output. Writers wanting multiple formats (e.g., MD for vault records + DOCX for submission) create two presets; cheap under the compile-as-artifact model.

Post-V1: EPUB / RTF formats, Kindle direct-send, per-preset output path override, auto-versioned output filenames.

### Section breaks

Named section breaks (e.g., "Part II." / "Interlude") are scene-scoped decorations, declared on the scene that the break precedes:

```yaml
# On the scene note:
dbench-section-break-title: "II."
dbench-section-break-style: visual      # visual | page-break; default visual
```

Presence of `dbench-section-break-title` triggers a break before that scene during compile. Styles: `visual` = dinkus + heading (default); `page-break` = page break + heading (PDF / ODT; falls back to visual in MD). Absent = no break.

Preset-level `dbench-compile-include-section-breaks: true | false` (default true) suppresses all breaks for variant-compile flexibility (workshop compile with breaks off, final compile with breaks on, from the same scene structure).

### Content-handling rules

When concatenating scene bodies, Book Builder applies explicit rules for how each construct renders in the compiled output. V1 has 16 rules; 5 are per-preset (heading-scope, frontmatter, dinkuses, embeds, wikilinks), 11 are hardcoded. The full rule table with defaults and overrides lives in [D-06 § Content-handling rules](decisions/D-06-compile-preset-storage-and-content-rules.md).

Highlights:

- **Scene body scope**: per-preset; defaults to `## Draft` section only.
- **Heading transformation**: scene title emitted as H1 above each compiled body; chapter-numbering prefix if set; in-body H1s shifted to H2.
- **Footnote renumbering**: auto-renumber across concatenated scenes so identifiers don't collide.
- **Wikilinks**: per-preset; default `display-text` (strip brackets, keep display).
- **Embeds**: split by target type. Note embeds (`![[Some Note]]`) per-preset (V1 strip-only); image embeds (`![[photo.jpg]]`) and base embeds (`![[view.base]]`) hardcoded strip-with-notice (post-V1 image support via MediaService).
- **Callouts / Tasks / Tags / Comments / Highlights**: hardcoded strip with sensible preservations (callout body preserved, task text preserved, highlight text preserved).

Strip-with-notice constructs trigger a single batched notice on compile completion (e.g., `"12 embeds stripped (8 images, 3 bases, 1 PDF); post-V1 adds include paths for supported types."`) rather than per-embed notice spam.

### User interface

Three surfaces mirror the three operations writers perform:

**Create** — palette command `Draft Bench: Create compile preset` or "New preset" button in the Compile tab opens a minimal modal with three fields: preset name, project (auto-filled from active file context), output format (default md). All other fields stamped with defaults on the new preset note.

**Edit** — the Manuscript Builder modal renders a form view of the active project's presets. Header: preset picker + "New preset" + "Run compile" buttons. Body: grouped collapsible sections (Metadata, Inclusion, Output, Content-handling, Last compile) with appropriate per-field affordances (radio groups for enums, toggles for booleans, multi-select for status filter, scene picker for excludes, read-only display for compile state). Saves via `processFrontMatter` on change; the Properties panel remains a valid alternative surface.

**Run** — palette command `Draft Bench: Run compile` with smart file-context resolution (active preset = run that preset; active scene / project / draft = pick from project's presets; unrelated = project picker -> preset picker). The Compile tab's "Run compile" button runs the currently-selected preset directly.

Context menu entries on compile-relevant notes:

- On preset notes: "Run compile" and "Duplicate preset."
- On project notes: "Create compile preset" (alongside existing "Show manuscript view" and "Repair project links").
- On scene / draft notes: "Compile current project."

Each context menu action has a palette-command counterpart for keyboard parity. No wizard UI ships in V1; the compile-as-artifact principle eliminates the "commit to N decisions up front" need.

## Bases Integration

Because every note carries typed frontmatter properties (`dbench-type`, `dbench-project`, `dbench-status`, `dbench-order`, etc.), Obsidian Bases views work automatically:

- A **table view** filtered by `dbench-type: scene` and sorted by `dbench-order` becomes a scene outline.
- A **cards view** over the same filter becomes a corkboard.
- Filtering by `dbench-status: revision` creates a revision queue; `dbench-status: idea` an incubator queue.
- Filtering by `dbench-type: draft` with `dbench-scene: [[Tempting Waters]]` shows one scene's full draft history.
- Future types like `character` or `location` become their own Bases views with no plugin changes.

Note the disambiguation: `dbench-type: draft` identifies a note's role (it's an archived snapshot); `dbench-status: draft` identifies a workflow state (first-pass drafting, pre-revision). They are distinct.

No custom Bases view registration is required for V1. The plugin may ship template `.base` files in Phase 2 (see § Development Phases).

For the full Charted Roots architectural reference on `.base` generation (orchestration module, availability detection, template styles, view conventions, "already exists" guard) that informs the P2.C implementation, see [bases-reference.md](bases-reference.md). V1 adopts the orchestration pattern wholesale but ships a much smaller view palette and drops the property-alias system (DB doesn't have one).

## Styling and Style Settings Integration

Draft Bench tags editor leaves with type-identifying CSS classes, giving writers (and vault themes) a reliable hook for styling plugin-managed notes differently from ordinary notes. This mirrors Longform's `.longform-leaf` pattern.

### CSS classes applied

When a plugin-managed note is the active leaf, the plugin adds a class to the leaf's container based on the note's `dbench-type`:

- `.dbench-project`: project notes
- `.dbench-scene`: scene notes
- `.dbench-draft`: draft notes
- `.dbench-chapter`: chapter notes (post-V1)

The `.draft-bench-` long-form prefix is also applied alongside each short-form class (`.draft-bench-scene`, `.draft-bench-draft`, etc.) per the project's CSS naming conventions.

### Style Settings integration

If the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) community plugin is installed, Draft Bench exposes user-configurable variables for scene and draft styling. Variables are grouped so writers can tune the scene leaf and the archived-draft leaf independently — distinguishing the live working draft from an archival snapshot is a genuine UX concern.

**Shared (apply to both scene and draft leaves unless overridden):**

- `--dbench-scene-font-family`: font for scene and draft note bodies.
- `--dbench-scene-font-size`
- `--dbench-scene-line-height`
- `--dbench-scene-max-width`: caps line length for comfortable reading/writing.

**Scene-leaf only:**

- `--dbench-scene-background`: optional paper-tint or distinct background for live scenes.
- `--dbench-scene-text-color`

**Draft-leaf only (archival cue):**

V1 ships exactly one default style rule — `--dbench-draft-border-left`, a thin `3px solid var(--text-faint)` rule on the left edge of draft leaves. It's the subtle "archive, not live" cue that motivated the class tagging in the first place, and it doesn't impose any colors that would fight with user themes.

The remaining draft-leaf variables are declared but not consumed by default rules in V1:

- `--dbench-draft-background`: available for writers who want a muted background on draft leaves; no default visual effect.
- `--dbench-draft-text-color`: available for writers who want dimmed draft text; no default visual effect.

Writers who want these to take effect can either install Style Settings and author a theme that consumes them via a snippet, or wait for Phase 2 when the plugin ships the consuming rules with opinionated defaults.

Style Settings integration is opt-in — Draft Bench does not require the plugin. Without it, the CSS classes are still applied; users can style them via their theme or a CSS snippet.

### Phase 2 consideration: draft-edit prompt

Styling drafts distinctively reduces but doesn't eliminate the "I accidentally edited the archive instead of the live scene" failure mode. A Phase 2 feature to evaluate: prompt on first edit of a `dbench-type: draft` note ("You're editing an archived snapshot — changes here don't flow back to the current scene. Continue?"), with a "don't ask again for this session / ever" option. Deferred because it requires an `editor-change` listener specifically for draft notes and the prompt design needs real usage data to calibrate. Not MVP.

### Scope

CSS class tagging is V1-scoped. V1 ships exactly one default style rule — the draft border-left archival cue — so the plugin imposes no typography or color defaults on writers' themes. The Style Settings variable declarations for scene typography and draft background/text are scaffolding; their consuming rules land in Phase 2 together with opinionated defaults. Additional variables can be added as writer feedback clarifies what's worth exposing.

## Writing Sessions, Goals, and Revision Snapshots

These features are planned but deferred to later builds:

- **Writing sessions**: track daily word counts per project.
- **Goals**: session-based goal tracking (deferred — daily/weekly targets, streaks, historical charts). V1 ships static target-word counts via `dbench-target-words` on project and scene notes, surfaced as progress bars on the Project and Manuscript tabs; see § Word Counts.
- **Revision snapshots**: save named snapshots of scenes or of the entire manuscript with diff viewing. Project-level snapshots (parallel full-manuscript versions in the Longform "First Draft / Second Draft" sense) belong here, distinct from the per-scene drafts covered in § Draft Management. A per-scene `draft` captures one scene's prose at a moment in time; a project-level snapshot captures the whole manuscript's state at a moment in time.

The data model and UI accommodate these features without architectural changes.

## Technical Considerations

### Platform

V1 is desktop-only (`isDesktopOnly: true` in `manifest.json`). Mobile compatibility is a post-V1 evaluation — mobile Obsidian restricts some API surface and imposes bundle-size constraints, and the primary UX (Manuscript view, Manuscript Builder, reorder modal, Style Settings integration) is designed around a desktop form factor.

### Dependencies

- No external runtime dependencies required for core functionality
- ODT/PDF export may leverage libraries to be determined (patterns from Charted Roots)
- Pandoc as an optional enhancement for extended export formats
- Templater as an optional integration (detected, not required)

### Performance

Target: comfortable operation on vaults with multiple projects totaling hundreds of scenes. Property reads via Obsidian's metadata cache (not raw file parsing). Scene reordering updates only the affected notes' `dbench-order` values.

**Vault-wide scanning is cheap.** Discovery calls `app.vault.getMarkdownFiles()` (O(1) list access, returns the full vault index) and filters by frontmatter via `metadataCache.getFileCache()` — an in-memory hash lookup, not a filesystem read. For a vault of 10,000 notes containing three Draft Bench projects with 30 scenes, a Manuscript view open scans all 10,000 entries but reads cached YAML for each; typical completion is a few milliseconds on desktop hardware. The scan is linear in vault size and therefore scales until the metadata cache itself becomes expensive — somewhere well north of 10,000 notes on modern hardware.

For very large mixed-purpose vaults where scan time becomes user-visible, the optional folder filter (Phase 5+, see [D-04](../planning/decisions/D-04-folder-flexibility.md)) lets writers scope Draft Bench's discovery to specific folders. This is the architectural escape hatch for the frontmatter-based discovery model.

### Distribution

- Repository: `S:\Projects\obsidian-plugins\draft-bench` (private GitHub mirror at `github.com/banisterious/obsidian-draft-bench`).
- Community plugin directory submission when ready.
- BRAT-compatible for beta testing.
- License: MIT.

### Relation to Existing Plugins

Draft Bench is a standalone plugin. It does not share code with Oneirometrics, Sonigraph, or Charted Roots, but follows their established UI patterns (settings conventions, modal design language). Compile/export code from Charted Roots' Book Builder was studied and adapted (see [book-builder-reference.md](book-builder-reference.md)).

### Plugin compatibility

Draft Bench is designed to coexist with plugins writers commonly use. Before each release, we verify interaction with:

| Plugin | Tested interaction |
|---|---|
| Templater | Auto-detected. When installed, scene templates are processed through Templater before Draft Bench's plugin-token substitution runs; when absent (or when a Templater script throws), the plain plugin-token flow is used. See § Templater Integration. |
| Style Settings | If installed, Draft Bench exposes scene- and draft-leaf styling variables. See § Styling and Style Settings Integration. |
| Obsidian Bases | Every `dbench-*` property is Bases-queryable. Template `.base` files ship as a Phase 2 stretch goal. |
| Dataview | Alternative query layer; `dbench-*` properties work in Dataview queries for writers who prefer it. |
| Longform | Coexists (different namespaces: `longform-*` vs. `dbench-*`). Writers migrating between plugins need a conversion step; no automated migration is shipped. |
| StoryLine | Coexists (different namespaces). Different scope: StoryLine bundles entity management (characters, locations), plot grids, beat sheets, timelines, and stats; Draft Bench stays narrow on the manuscript spine and defers entity/world content to sibling plugins or user-managed notes. See [branding.md § Positioning relative to adjacent Obsidian plugins](branding.md) for the full comparison. |
| Custom file-explorer sort plugins | A plugin that reads frontmatter keys can sort by `dbench-order` to restore filesystem-sort = story-order if desired. See [D-02](../planning/decisions/D-02-ordering-and-filesystem-sort.md). |

**Known-caution combinations:**

- Plugins that auto-modify frontmatter in bulk (tag-adders, linters) may touch `dbench-*` properties. The integrity service can usually repair after the fact, but users running such plugins should be aware.
- Plugins that replace the file explorer tree may not render `dbench-status` / `dbench-order` unless they read those properties natively.

## Open Questions

These decisions are deferred and will be resolved as development progresses:

1. **Auxiliary content scope**: When (if ever) do character cards, location cards, research folders, and synopsis layers enter the picture? The type registry supports them; the question is prioritization. Waits for V1 user signal to answer.

### Resolved

- **Template library contents**: V1 ships with a single built-in scene template (see § Scene Templates). User-defined multi-template management is Phase 2+.
- **Status vocabulary**: The `dbench-status` workflow on project and scene notes is user-configurable via Settings -> Draft Bench -> Statuses (Phase 2, P2.D). The default vocabulary is `idea -> draft -> revision -> final`; the first entry is always the default stamped onto new scenes. Writers can add, rename, reorder (drag-handle or keyboard), and remove values. Renaming a status that's in use migrates the affected notes in place. Removing an in-use status prompts an optional bulk-rename to another value (or remove-without-migrating, which leaves those notes carrying the retired value out-of-vocabulary). Per-project overrides remain a post-V1 consideration.
- **Beat granularity**: V1 default is beats-as-headings inside scene notes. The `beat` type remains on the post-V1 type list for writers who need per-beat word counts or Bases queryability, but it stays "available if you want it, not first-class UI." No V1 modal or template support.
- **Custom Bases views**: The plugin does not register a custom Bases view type. The property schema is sufficient: every `dbench-*` property is Bases-queryable, and writers build manuscript tables, status queues, and corkboards with vanilla Bases. Phase 2 ships template `.base` files as starters.
- **Templater integration depth**: Pass-through behavior shipped in Phase 2 (P2.A.4). Scene templates route through Templater when installed; see § Templater Integration. Deeper integration (plugin-aware Templater commands, e.g., `tp.draftBench.previousScene()`) remains deferred until a writer requests it.
- **Mobile support**: V1 is desktop-only (`isDesktopOnly: true` in `manifest.json`). Post-V1 re-evaluation of mobile compatibility is deferred; the decision depends on whether mobile becomes a meaningful portion of the user base once V1 ships.

## Documentation

Draft Bench documentation is split by audience:

**Developer docs** live in [`docs/developer/`](../developer/). Cover architecture, the data model, the linker and integrity service internals, CSS conventions, and contribution guidelines. Target contributors and maintainers; reviewed in PRs alongside code changes. Currently: [`coding-standards.md`](../developer/coding-standards.md).

**User docs** live in `wiki-content/`. Cover getting started, the command reference, template authoring, the compile / Book Builder, and an FAQ. Target writers using the plugin. Committed in the repo so user-facing documentation is versioned with the plugin code that implements it.

**The GitHub wiki is the eventual publishing target** for user docs. Content in `wiki-content/` mirrors to the wiki once it's set up, making it browsable at `github.com/banisterious/obsidian-draft-bench/wiki`. Mirroring is either manual (for small changes) or automated via a GitHub Action if documentation velocity warrants it.

The specific page inventory for each tree will emerge as features land. This section signals intent, not a prescriptive table of contents.

## Development Phases (Rough)

### Phase 1: Foundation
- Project creation: folder shape and single-scene shape, with `dbench-project-shape` frontmatter.
- Scene creation (notes with typed frontmatter, built-in scene template applied).
- New draft command: snapshot current scene/project body into the drafts folder with `dbench-type: draft`, auto-numbered.
- Relationship integrity: `DraftBenchLinker` live sync service + `DraftBenchIntegrityService` batch repair (see § Relationship Integrity).
- Manuscript view leaf (Project summary + Manuscript list; subsequently expanded across Phase 2 and Phase 3).
- Scene reordering modal (updates `dbench-order`, no file renames).
- Property retrofit actions: "Set as project / scene / draft," "Complete essential properties," "Add identifier" (see § Applying Draft Bench properties to existing notes). Single-file, multi-file, and folder scopes.
- Context menu actions (create project, new scene, new draft, add to project, reorder scenes, retrofit actions).
- CSS class tagging of plugin-managed editor leaves (`.dbench-project`, `.dbench-scene`, `.dbench-draft` / long-form equivalents).
- Minimal Style Settings integration (scene font, line height, max-width, paper tint, text color, draft archival cue).

### Phase 2: Templates and Polish
- User-defined scene template management (multiple named templates, selectable at scene creation).
- Status workflow (set/change via context menu and the Manuscript view; resolve status-vocabulary open question).
- Word counts (per-scene, per-project, displayed in the Manuscript view). Optional `dbench-target-words` surfaces progress bars on the project summary and per-scene rows.
- Bases starter views (template `.base` files for manuscript table, status queue, corkboard).

### Phase 3: Compile and onboarding
- Manuscript Builder modal hosting the compile-preset editor + Run CTA.
- Include/exclude scenes, section breaks, title page, frontmatter stripping.
- Output to vault MD and saved MD.
- ODT, PDF, and DOCX export.
- Compile presets (save, duplicate, edit).
- Onboarding: welcome modal, guided first-project creation, example-project generator. Appropriate now because the core feature surface exists to guide users through.

### Phase 4: Sessions, Goals, and Snapshots
- Writing session tracking.
- Word count goals and progress.
- Revision snapshots: including project-level full-manuscript snapshots distinct from per-scene drafts (see § Draft Management and § Writing Sessions, Goals, and Revision Snapshots).

### Phase 5+: Extended Types and Integrations
- Additional note types (character, location, research, etc.) — bounded by the [Charted Roots cross-plugin scope](branding.md#positioning-relative-to-adjacent-obsidian-plugins): DB owns narrative, CR owns world. Auxiliary content stays user-managed in V1.
- Optional folder filter: scoped vault scanning for mixed-purpose vaults. Off by default; writers with large or diverse vaults can restrict Draft Bench's discovery to include/exclude folder lists. Matches Charted Roots' `FolderFilterService` pattern.
- Templater integration (deeper than pass-through, if warranted).
- Mobile support (if warranted).

(Chapter type was moved to V1 / Phase 4 per the 2026-04-25 scope expansion. Tracked across the chapter-type implementation steps.)

### Post-V1 candidates

Features under consideration but not committed to a specific version. See [post-v1-candidates.md](post-v1-candidates.md) for the ranked list with scope sketches, rationale, effort estimates, and dependencies. Strongest candidates as of 2026-04-26:

1. **Scrivener `.scriv` import** — migration path from the dominant prior tool.
2. **Project-level full-manuscript snapshots** — already promised under § Writing Sessions; the "First Draft / Second Draft" sense in the Longform model.
3. **Scrivenings-style continuous Manuscript view (alternate mode)** — read/scan the entire manuscript inline as one scrollable read.
