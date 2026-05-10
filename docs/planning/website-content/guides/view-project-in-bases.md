---
title: "I want to view my project in a Bases table"
description: Install Draft Bench's starter Bases, switch between manuscript outline / by-status / revision-queue / corkboard views, and embed a Base inside a project note for a per-project filter.
difficulty: medium
time_estimate: ~10 min
last_reviewed: 2026-05-10
relevant_releases: 0.5.x
---

# I want to view my project in a Bases table

You have a Draft Bench project with several scenes (and maybe chapters and drafts) and you want to browse the structure as a queryable table instead of file-tree only. Draft Bench ships three starter Bases that surface common views over your project's notes. By the end of this you'll have the starter Bases installed, opened a Scenes view, switched between its built-in views, and embedded a Base inside a project note so it auto-filters to that project.

## What you'll need

- Obsidian's **Bases** core plugin enabled (Settings -> Core plugins -> Bases).
- A Draft Bench project with at least 5 scenes - the table is more useful when there's content to browse. (Empty projects show empty tables; the views still work, just with nothing to show.)

## Steps

### 1. Install the starter Bases

From the command palette, run **Draft Bench: Install starter Bases views**. Three `.base` files land in your **Bases folder** (default `Draft Bench/Bases/`):

- **Projects.base** - one row per project. Default view shows all projects; an "In progress" view filters to projects whose status indicates active work.
- **Scenes.base** - the most-used file. Multiple views, listed in step 2.
- **Drafts.base** - all drafts in the vault, plus a "history for current scene" view that filters when embedded in a scene note.

The command writes only the files that don't already exist. Re-running won't overwrite your edits to a Base you've already customized.

### 2. Open Scenes.base and switch through the views

Open `Draft Bench/Bases/Scenes.base` in your vault. The Base displays as a table by default. The **view picker** in the Base's header (top-right) lets you switch between built-in views:

- **Manuscript outline** - scenes ordered by their position in the manuscript. The most reference-oriented view; shows project, chapter, scene title, status, word count.
- **By status** - scenes grouped by their `dbench-status` value. Useful for spotting how much of the manuscript is in each revision state.
- **Revision queue** - filtered to scenes whose status indicates they need attention. The "what should I work on next" view.
- **Corkboard** - card-shaped layout. More visual, less tabular; good for spatial readers.
- **In current project** - blank by default, populated when the Base is embedded inside a project note (see step 4).

Click each view in turn to see how the same data reshapes.

### 3. Verify scenes show up

If the table is empty even with scenes in your vault, two likely causes:

- The scenes don't have `dbench-type: scene` in frontmatter. Draft Bench stamps this on scene creation; if you imported notes from outside Draft Bench, the type may be missing. Use **Draft Bench: Set as scene** (right-click context menu) to retrofit.
- The scene's `dbench-project` link is missing or pointing at the wrong project. Check the scene's frontmatter properties panel.

The Manuscript outline view doesn't filter by project; if you have multiple projects, you'll see all scenes from all projects together. The **In current project** view (step 4) is where per-project filtering happens.

### 4. Embed Scenes.base in a project note

Open one of your project notes. At the bottom of the note's body, insert:

```markdown
![[Scenes.base#In current project]]
```

(Adjust the path if your Bases folder differs from the default; Obsidian's wikilink resolution finds the file by name.)

The embed renders the **In current project** view, automatically filtered to scenes whose `dbench-project` matches the project note you're viewing. Now the project note becomes a structured dashboard - you can keep the file open while writing and glance at the scene-state breakdown on the same page.

The same embed pattern works for `![[Drafts.base#History for current scene]]` inside a scene note.

## Variations

- **If you want to edit a view's columns**: open the `.base` file, click the view in the picker, and use the column editor in the Base's UI. Save under a new view name to keep the original starter view intact, or override the starter (re-running the install command won't restore overrides).

- **If you want a custom Base for a specific cross-cut**: copy one of the starter `.base` files as a template, edit its filters and columns, and save under a new name in the Bases folder. The dbench-* property surface ([wiki frontmatter reference](https://github.com/banisterious/obsidian-draft-bench/wiki/Frontmatter-Reference)) lists every queryable field.

- **If your project has chapters and you want a chapter-grouped view**: edit the Manuscript outline view, add a `dbench-chapter` group-by, and save as a new view. Useful for novel-length projects where the flat scene list feels long.

## Related guides

- [I want to start a writing project from scratch](start-a-writing-project) - prerequisite if you don't have a project with scenes yet.
- [I want to import a Scrivener project](import-from-scrivener) - alternative path to populate a project before browsing in Bases.
- [I want to compile my manuscript](compile-your-manuscript) - the Bases revision-queue view pairs well with a final compile pass.

## Reference

- Wiki: [Frontmatter reference](https://github.com/banisterious/obsidian-draft-bench/wiki/Frontmatter-Reference) - every `dbench-*` property the starter Bases query.
- Obsidian docs: [Bases](https://help.obsidian.md/bases) - the core feature's reference (filter syntax, formula language, view configuration).

---

*Found something wrong or unclear? [Suggest an edit][issue-link] - opens a pre-filled issue with the `guides` label.*

[issue-link]: https://github.com/banisterious/obsidian-draft-bench/issues/new?labels=guides&title=%5BGuides%5D+view-project-in-bases%3A+

---

## Notes for review

- Length: ~750 words.
- Decisions:
  - Started with the install-and-explore flow (install -> open Scenes.base -> switch views) before the embed-in-project trick. Reading order: most users open the Base file directly first, embed second.
  - Embed pattern in step 4 uses the inline-embed wikilink syntax; if Obsidian's Bases-embed shape differs in newer versions, this needs a quick fact-check at port time.
  - Verification step (step 3) addresses the most common "why is the table empty" question - missing `dbench-type` from retrofitted notes. Saves a guides-issue down the line.
  - Variations cap of 3: column edits, custom Base, chapter group-by. The custom-Base variation hands the reader the wiki frontmatter reference rather than reproducing the property list inline.
  - Cross-link to `compile-your-manuscript` is positioned as a verification path (revision queue before final compile). Reinforces the "Bases as differentiator + verification surface" framing.
- Did not include a screenshot. The Discord announcement attached `dbench-manuscript-builder-preview.png`; consider attaching `dbench-bases-projects.png` to this guide's Hugo page port if the recipe lands without enough visual context.
