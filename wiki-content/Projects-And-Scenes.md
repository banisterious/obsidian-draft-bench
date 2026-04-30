# Projects, Chapters, and Scenes

Projects are the top-level container for a writing work. Scenes are the units of manuscript content within them. **Chapters** are an optional grouping layer between projects and scenes — natural for novels, but never required.

---

## Project shapes

Draft Bench supports two project shapes, distinguished by the `dbench-project-shape` property on the project note.

### Folder project (default)

A folder containing a project note and its child notes. Suitable for novels, novellas, short-story collections, and any project where you'll have multiple scenes. Drafts of individual scenes (or chapters) live in a configurable subfolder (default `Drafts/`).

A folder project comes in two flavors that you can choose at creation time and convert between later:

- **Chapter-less** (flat). Scenes attach directly to the project. The simpler shape; suitable for short-story collections, novellas without chapter divisions, or anyone who doesn't want chapter-level structure.
- **Chapter-aware**. Scenes attach to chapters, and chapters attach to the project. The novel shape; gives you per-chapter word-count rollups, per-chapter status, chapter-level draft snapshots, and chapter-aware compile output.

The plugin enforces a **no-mixed-children** rule: a project's top-level children are *either* all chapters *or* all direct scenes, never both. Prologues, interludes, and epilogues in a chapter-aware project are modeled as single-scene chapters (a chapter note with one scene as its sole child) rather than as orphan scenes alongside chapters.

### Single-scene project

A single note that *is* the whole project. Suitable for flash fiction, poems, or short pieces that don't need scene structure. The project note's body holds the current working draft directly. When you take a new draft, the plugin creates a drafts folder at that moment.

A writer can graduate a single-scene project into a folder project later by creating a project folder around the note and adding scene notes.

---

## Chapters

Chapter notes carry a body in the same shape as scene notes — planning sections (Source passages / Beat outline / Open questions) plus a `## Draft` section. The chapter's `## Draft` is for **chapter-introductory prose only**: epigraphs, opening framing, time-of-year setting. It emits before the chapter's scenes in compile output, not interleaved between them. Most chapters leave it empty; the planning sections are usually where the chapter body earns its keep.

### Creating chapters

- Palette: **Draft Bench: New chapter in project**
- Right-click a project note (or a folder inside the project) -> **Draft Bench** -> **New chapter in project**

Refused (with a notice) on chapter-less projects that already have direct scenes — the no-mixed-children rule requires moving those scenes into a chapter first via the **Move to chapter** action.

### Chapter ordering

Chapter order is at the project level, on the chapter note's `dbench-order` property. Reorder via the **Reorder chapters in project** modal, opened from:

- The Manuscript view's toolbar.
- The command palette: **Draft Bench: Reorder chapters in project**.

### Chapter properties

Beyond the standard `dbench-type: chapter`, `dbench-id`, `dbench-project`, `dbench-status`, `dbench-order`, chapters support two optional fields:

- `dbench-target-words` — chapter-level authoring target. Surfaces a per-chapter progress bar in the Manuscript view's chapter card.
- `dbench-synopsis` — short summary surfaced as an index-card subline in the chapter card.

Both are writer-set via the Properties panel; neither is stamped at creation.

### Converting between shapes

Chapter-less and chapter-aware projects coexist forever. Conversion is manual — there is no auto-grouping retrofit:

- **Add chapters to a chapter-less project**: first move every direct scene into a chapter (via **Move to chapter** on each scene, or by editing `dbench-chapter` in the Properties panel), then create chapters with **New chapter in project**.
- **Flatten a chapter-aware project**: remove each scene's `dbench-chapter` and `dbench-chapter-id` properties, then delete the chapter notes. The integrity service can flag any inconsistencies via **Repair project links**.

---

## Scenes

A scene is a single unit of manuscript content. Scenes live as standalone markdown notes with `dbench-type: scene`.

### Creating scenes

- Palette: **Draft Bench: New scene in project** (chapter-less project) or new scene inside the active chapter
- Right-click context menu inside a project folder

In a chapter-aware project, scene creation prompts for the parent chapter (or scopes to it automatically when invoked from a chapter note).

### Scene ordering

Story order comes from the `dbench-order` property. **Order is within the scene's immediate parent** — within the project for chapter-less scenes, within the chapter for scenes-in-chapters.

Reordering happens in a dedicated modal, opened from:

- The Manuscript view's toolbar.
- The scene's right-click context menu.
- The command palette: **Draft Bench: Reorder scenes**.

The modal is context-aware: invoked on a scene-in-chapter, it scopes to that chapter; invoked on a chapter-less project, it scopes to the project's flat scene list. Cross-chapter scene moves use **Move to chapter** instead.

File and folder names are **never** renamed on reorder — only `dbench-order` changes. This keeps wikilinks, git history, and sync relationships intact.

**Important:** file-explorer alphabetical sort will not match story order. The Manuscript view (the dockable pane in the right sidebar) is the canonical ordered view.

### Moving a scene between chapters

Right-click a scene in a chapter-aware project -> **Draft Bench** -> **Move to chapter**. A modal opens with a chapter picker; on confirm, the scene's `dbench-chapter` and `dbench-chapter-id` are updated and both the source and target chapters' reverse arrays sync via the linker.

Single-file scope in V1 — bulk multi-select moves are post-V1.

---

## Folder flexibility

Draft Bench identifies notes by frontmatter, not folder location. You can organize your vault however you prefer — scenes and chapters can live in any folder. The plugin treats them as part of their project because their `dbench-project` property still points at the project note.

This means you can:

- Group scenes by status in folders like `Drafted/`, `Revising/`, `Final/`.
- Keep all chapter notes flat in the project folder, or nest them in `Chapters/`, `Parts/Part 1/`, etc.
- Mix Draft Bench notes with unrelated vault content.
- Move notes around freely; nothing breaks.
- Work in vaults that also host journals, research, or other plugins' notes.

See the [specification § Project Structure on Disk](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md) for the full discussion.

