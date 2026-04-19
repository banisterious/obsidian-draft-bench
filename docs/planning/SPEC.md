# Draft Bench — Plugin Specification

**Working title:** Draft Bench
**Author:** John Banister
**Status:** Initial specification / pre-development
**Date:** April 16, 2026

---

## Overview

Draft Bench is an Obsidian plugin for writers that supports a full creative writing workflow — from project creation through scene management to manuscript compilation. It is inspired by [Longform](https://github.com/kevboh/longform) but aims to be more user-friendly and more feature-complete, with better onboarding, richer scene/project metadata, native compatibility with Obsidian Bases, and a compile system that requires no JavaScript knowledge.

## Design Principles

**Frontmatter-native.** All project data lives in note properties. There is no index file, no parallel data store, no plugin-managed JSON. The vault *is* the database. This makes every note queryable via Bases, Dataview, or any other tool that reads frontmatter.

**Modals generate YAML; users don't edit it by hand.** Every note-creating action flows through a modal that builds the correct frontmatter. Context menus provide "Add to Project as…" actions for existing notes. The property schema is an implementation detail the user can inspect but never needs to touch.

**Progressive disclosure.** A beginner gets a "Create Project" button that produces a working project with zero configuration. A power user gets a Control Center with full access to templates, compile presets, property schemas, and project settings. The simple path and the advanced path coexist without either cluttering the other.

**Control Center as primary UI.** A tabbed, non-transient modal (following the pattern established in Oneirometrics, Sonigraph, and Charted Roots) serves as the plugin's main hub. Context menus, ribbon icons, and command palette actions provide parallel access to common operations.

**Type-extensible architecture.** Note types (project, scene, beat, character, location, etc.) are entries in a registry the plugin consults at runtime. Adding a new type later is a settings-level change plus a template — not a refactor.

## Data Model

### Note Types

Every note managed by Draft Bench carries a set of frontmatter properties that identify its type and its relationships. The core properties are:

| Property | Type | Description |
|---|---|---|
| `db-type` | string | The note's role: `project`, `scene`, `beat`, etc. |
| `db-project` | string | The project this note belongs to (matches the project note's title or ID). |
| `db-parent` | string (optional) | The parent note (e.g., a scene's chapter, a beat's scene). |
| `db-order` | number | Sort position among siblings. |
| `db-status` | string (optional) | Workflow status (e.g., `idea`, `draft`, `revision`, `final`). |

The `db-` prefix namespaces plugin properties to avoid collisions with user properties or other plugins.

### V1 Type Vocabulary

The initial release ships with a minimal set of types:

- **`project`** — The landing/metadata note for a work. Contains synopsis, genre, target word count, and other project-level metadata.
- **`scene`** — A unit of manuscript content. The primary building block.

Beats are represented as headings within scene notes by default. An optional `beat` type (as a separate note) is available for writers who need per-beat metadata, word counts, or Bases queryability.

### Architected For (Post-V1)

The following types are anticipated but not shipped in initial builds. The type registry and template system are designed to accommodate them without architectural changes:

- `chapter` — Grouping/ordering layer above scenes
- `beat` — Sub-scene unit (as separate note, for writers who need it)
- `character` — Character bible entry
- `location` — Setting/location reference
- `research` — Reference material linked to a project
- `synopsis` — Project or scene-level summary
- `logline` — Short pitch/premise
- `outline` — Structural plan

### Project Structure on Disk

A project is a folder. Every note inside that folder (recursively) with `db-project` set to the project name belongs to that project. There is no index file that lists scenes in order — ordering comes from the `db-order` property on each note, and membership comes from the `db-project` property.

Example folder structure:

```
My Novel/
├── My Novel.md              ← db-type: project
├── Chapter 1 - Arrival.md   ← db-type: scene, db-order: 1
├── Chapter 2 - The Search.md← db-type: scene, db-order: 2
├── Chapter 3 - Descent.md   ← db-type: scene, db-order: 3
└── ...
```

This approach:
- Plays well with Bases (filter by folder, by type, by status)
- Supports drag-and-drop reordering in the plugin UI (updates `db-order`)
- Doesn't break when users rename files
- Doesn't require users to maintain an external scene list

## User Interface

### Control Center

A tabbed modal accessible via ribbon icon, command palette, or context menu. Tabs include (tentative):

- **Project** — Overview, metadata, synopsis, word count summary
- **Manuscript** — Scene list with drag-and-drop reordering, status indicators, word counts
- **Templates** — Manage built-in and user-defined scene/project templates
- **Compile** — Book Builder interface (see Compile section)
- **Settings** — Plugin configuration

### Context Menu Actions

Right-click actions on files and folders:

- **Create Draft Bench Project** (on folders)
- **New Scene** / **New [Type]** (within project folders)
- **Add to Project as…** (on any existing note — applies frontmatter via modal)
- **Set Status** (quick status change)
- **Reorder** (move up/down among siblings)

### Command Palette

All context menu actions are also available as commands, plus:

- Open Control Center
- Open current project's Control Center
- Create new project
- Compile current project
- Jump to next/previous scene

### Onboarding

First-run experience when the plugin is enabled:

- Welcome modal explaining the plugin's purpose
- Guided project creation (walks the user through creating their first project)
- Option to create an example project that demonstrates the plugin's features (can be deleted afterward)

## Scene Templates

### Built-in Library

The plugin ships with a small set of starter templates. Exact contents TBD, but likely includes a general-purpose scene template and 2–3 genre- or form-specific variants.

### User-defined Templates

Users can create and manage their own templates. A template includes:

- Frontmatter scaffolding (pre-filled properties appropriate to the note type)
- Body text (structural prompts, placeholder headings, or blank)
- A display name and optional description

Templates are stored as markdown files in a configurable templates folder within the vault.

### Templater Integration (Stretch Goal)

If the Templater plugin is installed, user-defined templates may use Templater syntax for dynamic content (dates, prompts, cursor placement, etc.). The plugin detects Templater's presence and processes templates through it when available.

## Compile / Book Builder

Modeled on the Charted Roots Book Builder. The user assembles a compile configuration through a form-based UI — no JavaScript required.

### Core Capabilities

- **Include/exclude** individual scenes or groups by status, type, or manual selection
- **Section breaks** — configurable separators between scenes
- **Title page** generation (optional)
- **Frontmatter stripping** — remove YAML from compiled output
- **Heading transformation** — e.g., convert scene titles to chapter headings
- **Scene ordering** — uses `db-order` by default; manual override available

### Output Formats

- **Vault (MD)** — compiled manuscript as a new note in the vault
- **Saved MD** — markdown file saved outside the vault
- **ODT** — OpenDocument Text
- **PDF** — direct PDF export

Implementation note: ODT and PDF export will likely reuse patterns from the Charted Roots Book Builder. Pandoc integration is a possibility for extended format support if the user has it installed, with graceful degradation if not.

### Compile Presets

Compile configurations are saved as named presets. Presets can be duplicated, edited, and shared. Each project can have multiple presets (e.g., "Draft for workshop," "Final manuscript," "Synopsis only").

## Bases Integration

Because every note carries typed frontmatter properties (`db-type`, `db-project`, `db-status`, `db-order`, etc.), Obsidian Bases views work automatically:

- A **table view** filtered by `db-type: scene` and sorted by `db-order` becomes a scene outline
- A **cards view** becomes a corkboard
- Filtering by `db-status: draft` creates a revision queue
- Future types like `character` or `location` become their own Bases views with no plugin changes

No custom Bases view registration is required for v1. The plugin may ship template `.base` files as a stretch goal.

## Writing Sessions, Goals, and Revision Snapshots

These features are planned but deferred to later builds:

- **Writing sessions** — track daily word counts per project
- **Goals** — target word counts with progress tracking (per session, per scene, per project)
- **Revision snapshots** — save named snapshots of scenes/manuscripts with diff viewing

The data model and UI accommodate these features without architectural changes.

## Technical Considerations

### Platform

TBD. Desktop-first is assumed. Mobile compatibility to be evaluated — mobile Obsidian restricts some API surface and imposes bundle-size constraints.

### Dependencies

- No external runtime dependencies required for core functionality
- ODT/PDF export may leverage libraries to be determined (patterns from Charted Roots)
- Pandoc as an optional enhancement for extended export formats
- Templater as an optional integration (detected, not required)

### Performance

Target: comfortable operation on vaults with multiple projects totaling hundreds of scenes. Property reads via Obsidian's metadata cache (not raw file parsing). Scene reordering updates only the affected notes' `db-order` values.

### Distribution

- Fresh repository: `S:\Projects\obsidian-plugins\draft-bench`
- Community plugin directory submission when ready
- BRAT-compatible for beta testing
- License: TBD

### Relation to Existing Plugins

Draft Bench is a standalone plugin. It does not share code with Oneirometrics, Sonigraph, or Charted Roots, but follows their established UI patterns (Control Center, settings conventions, modal design language). Compile/export code from Charted Roots' Book Builder may be studied and adapted.

## Open Questions

These decisions are deferred and will be resolved as development progresses:

1. **Auxiliary content scope** — When (if ever) do character cards, location cards, research folders, and synopsis layers enter the picture? The type registry supports them; the question is prioritization.

2. **Beat granularity** — Beats-as-headings is the default. How much UI support do beats-as-separate-notes need in v1? Is it enough to allow the `beat` type and let power users create them manually, or does it need first-class modal/template support?

3. **Template library contents** — What specific templates ship with the plugin? What frontmatter fields and body structures do they include?

4. **Custom Bases views** — Should the plugin register a custom Bases view type (e.g., a manuscript/storyboard view), or is the property schema sufficient for users to build their own?

5. **Templater integration depth** — Detection and passthrough, or deeper integration (e.g., plugin-aware Templater commands)?

6. **Mobile support** — Desktop-only for v1, or design for mobile from the start?

7. **Status vocabulary** — Is the status workflow (`idea` → `draft` → `revision` → `final`) hardcoded, user-configurable, or both (defaults with override)?

## Development Phases (Rough)

### Phase 1 — Foundation
- Project creation (folder + project note with frontmatter)
- Scene creation (notes with typed frontmatter)
- Control Center skeleton (Project and Manuscript tabs)
- Scene reordering (drag-and-drop in Manuscript tab, updates `db-order`)
- Context menu actions (create project, new scene, add to project)
- Basic onboarding (welcome modal, guided first project)

### Phase 2 — Templates and Polish
- Built-in scene template library
- User-defined template management (Templates tab in Control Center)
- Status workflow (set/change via context menu and Control Center)
- Word counts (per-scene, per-project, displayed in Manuscript tab)

### Phase 3 — Compile
- Book Builder UI (Compile tab in Control Center)
- Include/exclude scenes
- Section breaks, title page, frontmatter stripping
- Output to vault MD and saved MD
- ODT and PDF export
- Compile presets (save, duplicate, edit)

### Phase 4 — Sessions, Goals, and Snapshots
- Writing session tracking
- Word count goals and progress
- Revision snapshots with diff viewing

### Phase 5+ — Extended Types and Integrations
- Additional note types (character, location, research, synopsis, etc.)
- Template `.base` files for common views
- Templater integration
- Custom Bases view types (if warranted)
- Mobile support (if warranted)
