# Getting Started

Draft Bench is an Obsidian plugin for writers. It manages projects, chapters (optional), scenes, and versioned drafts via frontmatter properties — so your writing stays in plain markdown files that remain yours.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Your First Project](#your-first-project)
- [Retrofitting Existing Notes](#retrofitting-existing-notes)
- [Next Steps](#next-steps)

---

## Prerequisites

- Obsidian v1.7.2 or later.
- Draft Bench plugin installed and enabled.
- Desktop Obsidian. V1 is desktop-only; mobile support is under post-V1 evaluation.

## Installation

### Community Plugins (recommended once approved)

1. Open Obsidian **Settings -> Community plugins**.
2. Click **Browse** and search for "Draft Bench."
3. Click **Install**, then **Enable**.

### BRAT (beta testing)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat).
2. Add the beta plugin: `banisterious/obsidian-draft-bench`.
3. Enable Draft Bench in Community plugins.

### Manual

1. Download the latest release from [GitHub Releases](https://github.com/banisterious/obsidian-draft-bench/releases).
2. Extract `main.js`, `manifest.json`, and `styles.css` into `<your-vault>/.obsidian/plugins/draft-bench/`.
3. Reload Obsidian and enable the plugin.

## Your First Project

<p align="center">
  <video controls width="800"
         src="https://draftbench.io/img/dbench-create-project.webm"
         aria-label="Creating a new Draft Bench project from an empty Obsidian vault: the command palette opens, the New Project modal collects a title and shape, the project folder appears in the file explorer, and the Manuscript view auto-reveals.">
    Your browser doesn't support embedded video.
    <a href="https://draftbench.io/img/dbench-create-project.webm">Watch the loop on draftbench.io</a>.
  </video>
</p>

### 1. Create a project

Open the command palette and run **Draft Bench: Create project** (also available as a ribbon icon). A modal prompts for:

- **Title**: the name of your work.
- **Location**: where the project is created (default `Draft Bench/{project}/`; configurable in settings).
- **Shape**: **Folder** (multiple scenes; suitable for novels, novellas, and linked-scene collections) or **Single-scene** (one note; suitable for flash fiction, poems, or single-sit pieces).

The plugin creates the project folder (or single note) and stamps the frontmatter properties. Open the project note to see them, or begin writing.

### 2. Add a chapter (optional, novel-shape projects)

If you're working on a novel and want chapter structure, run **Draft Bench: New chapter in project** from the command palette (or right-click the project note and pick **New chapter in project** under Draft Bench). Enter a title and confirm. The plugin creates a chapter note with the default [chapter template](Templates) applied.

Chapters are optional. Short-story collections, novellas without chapter divisions, and any project where you don't want chapter-level structure can stay chapter-less — scenes attach directly to the project. The decision isn't permanent: see [Projects, Chapters, and Scenes § Converting between shapes](Projects-And-Scenes#converting-between-shapes).

### 3. Add a scene (folder projects)

In the **Manuscript view** (right sidebar), click **New scene** in the toolbar. Or run **Draft Bench: New scene** from the command palette. Enter a title, position in order, and initial status. In a chapter-aware project, you'll also pick the parent chapter. The plugin creates a scene note with the default [scene template](Templates) applied — planning sections above a blank draft area.

Write your first draft in the body of the scene note.

### 3b. Add sub-scenes (optional, when a scene has internal beats)

If a scene has multiple distinct narrative units that you want to track separately — a memoir scene with several vignettes, a montage broken into beats, an act compressed into moments — you can split it into **sub-scenes**. With the parent scene active, run **Draft Bench: New sub-scene in scene** from the command palette, or click the "New sub-scene" button on the scene's card in the Manuscript view.

Sub-scenes are opt-in per scene; flat scenes coexist with hierarchical scenes inside the same project. Most scenes don't need them — internal beats inside a flat scene live as headings in the body, and that's the lighter-weight option. See [Projects, Chapters, Scenes, and Sub-scenes § Sub-scenes](Projects-And-Scenes#sub-scenes) for the full discussion of when to reach for sub-scenes vs. heading-level beats.

### 4. Take a draft snapshot

When you want to capture the current state of a scene before revising, run **New draft of this scene** from the command palette, the Manuscript view's toolbar, or the scene's right-click menu. For chapter-aware projects, **New draft of this chapter** snapshots the entire chapter (body plus all child scenes concatenated with boundary markers); for hierarchical scenes, **New draft of this sub-scene** captures just one sub-scene, and **New draft of this scene** captures the whole scene including all its sub-scenes. Draft Bench:

1. Snapshots the source content into `Drafts/<Source> - Draft N (YYYYMMDD).md` with `dbench-type: draft` frontmatter.
2. Carries the prose forward in the source note(s) so you can keep revising.
3. Auto-numbers the draft — you never number manually.

Prior drafts remain real markdown files, openable in split panes for side-by-side comparison. See [Drafts and Versioning](Drafts-And-Versioning) for the full model.

### 5. Work in the Manuscript view

The **Manuscript view** is Draft Bench's daily-writing surface — a dockable pane that opens in the right sidebar by default. It shows:

- The active project with a project picker for switching between them.
- A project summary section: status, total word count, hero progress bar (when `dbench-target-words` is set), per-status word/scene breakdown.
- A manuscript list — flat scene list for chapter-less projects, or stacked collapsible chapter cards (with nested scene rows + per-card word-count rollup + "New draft" button) for chapter-aware projects.
- A toolbar with **New scene**, **New draft**, **Reorder scenes**, and a primary **Compile** button.

Open it via the ribbon icon, the **Draft Bench: Show manuscript view** palette command, or by right-clicking a project note.

### 6. Compile your manuscript

When you're ready to share your work, click **Compile** in the Manuscript view toolbar (or run **Draft Bench: Build manuscript** from the palette) to open the [Manuscript Builder](Manuscript-Builder) — a focused modal for editing compile presets and running the compile. Output formats: Markdown (vault or disk), ODT, and PDF.

Plugin configuration (folders, drafts placement, status vocabulary, scene template, Bases folder, bidirectional sync) lives in **Settings -> Community plugins -> Draft Bench**, not in a tab.

## Retrofitting Existing Notes

If you have short stories, drafts, or project notes already in Obsidian, you don't need to recreate them. Right-click any note (or a folder, or a multi-selection) and use one of Draft Bench's retrofit actions:

- **Set as project / scene / draft**: type a note for the first time; stamps all essentials.
- **Complete essential properties**: fill in missing fields on a partially-typed note.
- **Add identifier**: just the stable `dbench-id`.

All actions are idempotent — safe to run any number of times without clobbering existing data. See [Context Menu Actions](Context-Menu-Actions).

## Next Steps

- [Projects and Scenes](Projects-And-Scenes): the data model in depth.
- [Drafts and Versioning](Drafts-And-Versioning): how Draft Bench handles draft history.
- [Essential Properties](Essential-Properties): `dbench-*` frontmatter cheat sheet.
- [Manuscript Builder](Manuscript-Builder): the compile modal and dockable Manuscript view.
- [FAQ](FAQ): common questions.
