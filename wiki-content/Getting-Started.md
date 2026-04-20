# Getting Started

Draft Bench is an Obsidian plugin for writers. It manages projects, scenes, and versioned drafts via frontmatter properties — so your writing stays in plain markdown files that remain yours.

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

### 1. Create a project

Open the command palette and run **Draft Bench: Create project** (also available as a ribbon icon). A modal prompts for:

- **Title**: the name of your work.
- **Location**: where the project is created (default `Draft Bench/{project}/`; configurable in settings).
- **Shape**: **Folder** (multiple scenes; suitable for novels, novellas, and linked-scene collections) or **Single-scene** (one note; suitable for flash fiction, poems, or single-sit pieces).

The plugin creates the project folder (or single note) and stamps the frontmatter properties. Open the project note to see them, or begin writing.

### 2. Add a scene (folder projects)

From the Control Center's **Manuscript** tab, click **New scene**. Enter a title, position in order, and initial status. The plugin creates a scene note with the default [scene template](Templates) applied — planning sections above a blank draft area.

Write your first draft in the body of the scene note.

### 3. Take a draft snapshot

When you want to capture the current state of a scene before revising, run **New draft of this scene** from the command palette, the Manuscript tab toolbar, or the scene's right-click menu. Draft Bench:

1. Snapshots the scene's current body into `Drafts/<Scene> - Draft N (YYYYMMDD).md` with `dbench-type: draft` frontmatter.
2. Carries the prose forward in the scene note so you can keep revising.
3. Auto-numbers the draft — you never number manually.

Prior drafts remain real markdown files, openable in split panes for side-by-side comparison. See [Drafts and Versioning](Drafts-And-Versioning) for the full model.

### 4. Work in the Control Center

The [Control Center](Control-Center) is Draft Bench's main hub, with tabs for:

- **Project**: overview, metadata, word count.
- **Manuscript**: ordered list of scenes with status and prior-draft count; click-through to any scene.
- **Templates**: scene template management.
- **Compile**: manuscript export (Phase 3+).
- **Settings**: configuration.

## Retrofitting Existing Notes

If you have short stories, drafts, or project notes already in Obsidian, you don't need to recreate them. Right-click any note (or a folder, or a multi-selection) and use one of Draft Bench's retrofit actions:

- **Set as project / scene / draft**: type a note for the first time; stamps all essentials.
- **Complete essential properties**: fill in missing fields on a partially-typed note.
- **Add dbench-id**: just the stable identifier.

All actions are idempotent — safe to run any number of times without clobbering existing data. See [Context Menu Actions](Context-Menu-Actions).

## Next Steps

- [Projects and Scenes](Projects-And-Scenes): the data model in depth.
- [Drafts and Versioning](Drafts-And-Versioning): how Draft Bench handles draft history.
- [Essential Properties](Essential-Properties): `dbench-*` frontmatter cheat sheet.
- [Control Center](Control-Center): the tabbed hub.
- [FAQ](FAQ): common questions.
