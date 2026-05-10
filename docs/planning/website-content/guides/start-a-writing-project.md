---
title: "I want to start a writing project from scratch"
description: Create a Draft Bench project, add chapters and scenes, and open the first scene to start writing.
difficulty: easy
time_estimate: ~15 min
last_reviewed: 2026-05-10
relevant_releases: 0.5.x
---

# I want to start a writing project from scratch

You're starting fresh in Draft Bench - no existing Scrivener bundle to import. By the end of this you'll have a structured project with chapters and scenes, ready to open a scene and start writing.

## What you'll need

- Draft Bench enabled (Settings -> Community plugins -> Draft Bench).
- A project title in mind. Working titles are fine; you can rename later.

## Steps

### 1. Create the project

From the command palette, run **Draft Bench: Create project**. The new-project modal opens with three fields:

- **Title.** The project name. Used as the filename for the project note. ("Salt Road" in this walkthrough.)
- **Shape.** Pick **Folder**. Folder-shape projects hold multiple scenes (and optionally chapters). The other option, **Single scene**, is for flash fiction or poems where the project is a single note.
- **Location.** Where the project folder lives. Defaults to your **Projects folder** setting (typically `Draft Bench/{project}/`). Leave the default unless you want this project somewhere specific.

Click **Create**. Draft Bench writes the project note (`Salt Road.md`) plus a folder for the project's scenes.

### 2. Add chapters

If you're writing chapter-aware fiction (most novels), add chapters before scenes so Draft Bench can nest scenes under the right chapter automatically.

From the command palette, run **Draft Bench: New chapter in project**. The new-chapter modal asks for a chapter title. Enter the title (e.g., "Chapter 1: The road north") and confirm. The chapter note lands inside the project folder.

Repeat for as many chapters as you have to start. You don't need them all up front - new chapters can be added later via the same command.

### 3. Add scenes

Run **Draft Bench: New scene in project**. The modal asks which chapter the scene belongs to (if you skipped step 2 and the project has no chapters yet, the scene attaches to the project directly). Enter a scene title and confirm.

The scene note is created inside the chapter's folder, with the chapter and project links already in frontmatter. Repeat per scene.

### 4. Open a scene and start writing

Open any scene note. The body is empty; the frontmatter has been pre-stamped with `dbench-type: scene`, `dbench-chapter`, `dbench-project`, plus a generated `dbench-id`. Write below the frontmatter as you would in any markdown note.

Draft Bench tracks word counts, draft revision history, and reverse-link arrays automatically as you save and link.

## Variations

- **If you're writing chapter-less fiction** (short story collections where each piece is a single scene; novellas without chapter structure): skip step 2 and add scenes directly to the project. The scenes attach to the project node instead of nesting under a chapter.

- **If you want sub-scene granularity** (a long scene that breaks into beats or POV switches): create the parent scene first, then run **Draft Bench: New sub-scene in scene**. Sub-scenes nest under their parent scene's folder. Sub-scenes also have their own draft history.

- **If the default project location doesn't fit your vault**: change the **Location** field in the new-project modal, or update the **Projects folder** setting under Settings -> Draft Bench to change the default for future projects.

- **If you're doing flash fiction or poems**: set **Shape** to **Single scene** in step 1. The project becomes a single note (no folder, no chapters). Skip steps 2-3 entirely.

## Related guides

- [I want to import a Scrivener project](import-from-scrivener) - if you have an existing `.scriv` bundle, the importer is the faster path.
- [I want to work with drafts of a scene](work-with-drafts) - once you've started writing, this is the revision loop.
- [I want to compile my manuscript](compile-your-manuscript) - what to do once you have content to share.

## Reference

- Wiki: [Getting started](https://github.com/banisterious/obsidian-draft-bench/wiki/Getting-Started) - broader plugin orientation including settings and commands.
- Wiki: [Frontmatter reference](https://github.com/banisterious/obsidian-draft-bench/wiki/Frontmatter-Reference) - what `dbench-*` properties get stamped on each note type.

---

*Found something wrong or unclear? [Suggest an edit][issue-link] - opens a pre-filled issue with the `guides` label.*

[issue-link]: https://github.com/banisterious/obsidian-draft-bench/issues/new?labels=guides&title=%5BGuides%5D+start-a-writing-project%3A+

---

## Notes for review

- Length: ~600 words (body, excluding frontmatter and notes-for-review).
- Decisions:
  - Used the "Salt Road" fixture from guides-plan.md throughout. Continuity with other guides.
  - Did not show the new-project modal's screenshot; the three-field form is simple enough to describe in prose. Add the modal screenshot if scroll-depth data shows readers confused at step 1.
  - Variations cap of 4: chapter-less, sub-scenes, custom location, single-scene-shape. Sub-scene mention is brief; full sub-scene workflow may warrant its own P1 guide later.
  - Sub-scene reference is here primarily so readers know it exists. Detailed sub-scene authoring should live in the dedicated `work-with-sub-scenes` P1 guide.
  - Cross-link to `import-from-scrivener` is positioned first under Related (so users with a Scrivener bundle see the better path immediately if they landed on this guide by mistake).
  - Did not call out the ProjectShape dropdown's full semantics. The "Folder vs Single scene" framing in the body is enough for a recipe; folder-shape is the default expectation for fiction writers.
