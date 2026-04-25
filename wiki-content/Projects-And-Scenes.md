# Projects and Scenes

Projects are the top-level container for a writing work. Scenes are the units of manuscript content within them.

---

## Project shapes

Draft Bench supports two project shapes, distinguished by the `dbench-project-shape` property on the project note.

### Folder project (default)

A folder containing a project note and one or more scene notes. Suitable for novels, novellas, short-story collections, and any project where you'll have multiple scenes. Drafts of individual scenes live in a configurable subfolder (default `Drafts/`).

### Single-scene project

A single note that *is* the whole project. Suitable for flash fiction, poems, or short pieces that don't need scene structure. The project note's body holds the current working draft directly. When you take a new draft, the plugin creates a drafts folder at that moment.

A writer can graduate a single-scene project into a folder project later by creating a project folder around the note and adding scene notes.

## Creating scenes (folder projects)

See [Getting Started § Your First Project](Getting-Started).

## Scene ordering

Story order comes from the `dbench-order` property on each scene. Reordering happens in a dedicated modal, opened from:

- The Manuscript view's toolbar.
- The scene's right-click context menu.
- The command palette: **Draft Bench: Reorder scenes**.

File and folder names are **never** renamed on reorder — only `dbench-order` changes. This keeps wikilinks, git history, and sync relationships intact.

**Important:** file-explorer alphabetical sort will not match story order. The Manuscript view (the dockable pane in the right sidebar) is the canonical ordered view.

## Folder flexibility

Draft Bench identifies notes by frontmatter, not folder location. You can organize your vault however you prefer — scenes can live in any folder. The plugin treats them as part of their project because their `dbench-project` property still points at the project note.

This means you can:

- Group scenes by status in folders like `Drafted/`, `Revising/`, `Final/`.
- Mix Draft Bench notes with unrelated vault content.
- Move scenes around freely; nothing breaks.
- Work in vaults that also host journals, research, or other plugins' notes.

See the [specification § Project Structure on Disk](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md) for the full discussion.

---

*Detailed walkthroughs coming once V1 ships.*
