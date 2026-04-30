# Drafts and Versioning

Draft Bench treats drafts as first-class files. A "new draft" operation captures a snapshot of the work-in-progress at a moment in time, preserves it as its own markdown file, and lets you continue revising in the source note.

---

## What a draft is

A draft is an **archived snapshot** at a moment in time. Drafts are real markdown files — openable in split panes, linkable via wikilinks, queryable via Bases.

V1 supports three target types — **scene**, **chapter**, and **single-scene project** — chosen by which "new draft" command you run. All three share the same `Drafts/` folder; their frontmatter parent ref tells the plugin (and you) which one each draft belongs to.

## What a draft is *not*

A draft is not a parallel version of the entire manuscript. If you're coming from Longform, note:

- **Longform's drafts** are parallel trees of the whole project ("First Draft," "Second Draft").
- **Draft Bench's drafts** are per-scene, per-chapter, or per-single-scene-project snapshots.

Full-manuscript parallel versions are planned as a separate feature under **Revision Snapshots** (post-V1). See the [specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md).

---

## Scene drafts

<p align="center">
  <video controls width="800"
         src="https://draftbench.io/img/dbench-new-draft.webm"
         aria-label="Taking a new draft of a scene: the right-click context menu opens, the New draft of this scene action is selected, a preview modal confirms the snapshot path, and the new draft note opens with stamped frontmatter.">
    Your browser doesn't support embedded video.
    <a href="https://draftbench.io/img/dbench-new-draft.webm">Watch the loop on draftbench.io</a>.
  </video>
</p>

Use **New draft of this scene** via:

- The command palette.
- The Manuscript view's toolbar.
- The scene's right-click context menu.

When invoked, the plugin:

1. Snapshots the scene note's current body into `Drafts/<Scene> - Draft N (YYYYMMDD).md` with `dbench-type: draft`, `dbench-scene: [[<Scene>]]`, and `dbench-draft-number: N`.
2. Carries the prose forward in the scene note — you continue revising, not starting blank.
3. Auto-numbers the draft; you never manage `N` manually.

---

## Chapter drafts

Use **New draft of this chapter** via:

- The command palette (with a chapter note active).
- The Manuscript view's chapter card — each card has a "New draft" icon button on its right edge.
- A chapter note's right-click context menu.

A chapter draft is a snapshot of the chapter as a whole — the chapter body **plus each child scene's body**, concatenated in `dbench-order` with HTML-comment scene boundaries between sections:

```markdown
Chapter introductory prose...

<!-- scene: First scene title -->

First scene body...

<!-- scene: Second scene title -->

Second scene body...
```

Frontmatter is stripped from each piece, but planning sections (Source passages / Beat outline / Open questions) are preserved on every file. The chapter draft captures the *state of the work* — both the prose and the planning thoughts — rather than a polished frozen artifact. (For polished output, use the [Manuscript Builder](Manuscript-Builder) compile pipeline.)

The chapter note and each scene note are unchanged after a chapter draft is taken — you continue revising them as the working draft.

When to use which:

- **Scene draft** — preserve the state of one scene before a major revision pass on that scene.
- **Chapter draft** — preserve the state of an entire chapter (including all its scenes and the chapter-level planning) before a major restructuring pass that touches multiple scenes.
- **Both** — there's no conflict. A scene's draft history and its parent chapter's draft history live alongside each other in the same `Drafts/` folder, distinguished by whether the draft carries `dbench-scene` or `dbench-chapter`.

---

## Single-scene project drafts

For single-scene projects (flash fiction, poems), **New draft** snapshots the project note's body, like a scene draft but with the project as parent. The draft's frontmatter has `dbench-project` but no scene or chapter ref.

---

## Drafts folder placement

Three options in settings:

- **Inside each project** (default): `Drafts/` subfolder inside the project folder.
- **Per-scene subfolder**: each scene's (or chapter's) drafts in a sibling folder named `<Source>: Drafts/`.
- **Vault-wide**: a single `Drafts/` folder at the vault root, with filenames disambiguated by project name.

See [Settings and Configuration](Settings-And-Configuration).

## Working with prior drafts

Prior drafts are ordinary files. You can:

- **Open them in split panes** for side-by-side comparison with the current working draft.
- **Link to them** via wikilinks from notes, feedback docs, or research files.
- **Query them with Bases** using `dbench-type: draft` plus the relevant parent ref (`dbench-scene`, `dbench-chapter`, or `dbench-project`).
- **Style them distinctively** via `.dbench-draft` CSS class: by default they render with a subtle archival visual cue to avoid editing-archive-by-mistake.

## Retrofit: converting existing draft files

If you already have draft files from a previous workflow, use **Set as draft** from the context menu. The plugin stamps the required frontmatter. See [Context Menu Actions](Context-Menu-Actions).

---

*Walkthroughs and screenshots coming once V1 ships.*
