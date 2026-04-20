# Drafts and Versioning

Draft Bench treats drafts as first-class files. Each "new draft" operation captures a snapshot of a scene's current prose, preserves it as its own markdown file, and lets you continue revising in the scene note.

---

## What a draft is

A draft is an **archived snapshot** of a scene's prose (or a single-scene project's body) at a moment in time. Drafts are real markdown files — openable in split panes, linkable via wikilinks, queryable via Bases.

## What a draft is *not*

A draft is not a parallel version of the entire manuscript. If you're coming from Longform, note:

- **Longform's drafts** are parallel trees of the whole project ("First Draft," "Second Draft").
- **Draft Bench's drafts** are per-scene snapshots.

Full-manuscript parallel versions are planned as a separate feature under **Revision Snapshots** (post-V1). See the [specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md).

## Creating a new draft

Use **New draft of this scene** via:

- The command palette.
- The Manuscript tab toolbar.
- The scene's right-click context menu.

When invoked, the plugin:

1. Snapshots the scene note's current body into `Drafts/<Scene> - Draft N (YYYYMMDD).md` with `dbench-type: draft`, `dbench-scene: [[<Scene>]]`, and `dbench-draft-number: N`.
2. Carries the prose forward in the scene note — you continue revising, not starting blank.
3. Auto-numbers the draft; you never manage `N` manually.

## Drafts folder placement

Three options in settings:

- **Inside each project** (default): `Drafts/` subfolder inside the project folder.
- **Per-scene subfolder**: each scene's drafts in a sibling folder named `<Scene>: Drafts/`.
- **Vault-wide**: a single `Drafts/` folder at the vault root, with filenames disambiguated by project name.

See [Settings and Configuration](Settings-And-Configuration).

## Working with prior drafts

Prior drafts are ordinary files. You can:

- **Open them in split panes** for side-by-side comparison with the current working draft.
- **Link to them** via wikilinks from notes, feedback docs, or research files.
- **Query them with Bases** using `dbench-type: draft` and `dbench-scene`.
- **Style them distinctively** via `.dbench-draft` CSS class: by default they render with a subtle archival visual cue to avoid editing-archive-by-mistake.

## Retrofit: converting existing draft files

If you already have draft files from a previous workflow, use **Set as draft** from the context menu. The plugin stamps the required frontmatter. See [Context Menu Actions](Context-Menu-Actions).

---

*Walkthroughs and screenshots coming once V1 ships.*
