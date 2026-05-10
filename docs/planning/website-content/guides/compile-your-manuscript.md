---
title: "I want to compile my manuscript"
description: Use the Manuscript Builder to assemble a compile preset, preview the rendered output, and export to Markdown, DOCX, PDF, or ODT.
difficulty: easy
time_estimate: ~15 min
last_reviewed: 2026-05-10
relevant_releases: 0.5.x
---

# I want to compile my manuscript

You have a Draft Bench project with content - chapters, scenes, maybe sub-scenes - and you want to produce a manuscript file you can share. The Manuscript Builder is where this happens. By the end you'll have a compile preset configured, a live preview verifying it looks right, and an exported file (Markdown, DOCX, PDF, or ODT) sitting in your vault.

## What you'll need

- A Draft Bench project with at least one scene that has content. Empty scenes compile to empty sections; you'll see them in Preview.
- 5-10 minutes for a first compile. Subsequent compiles of the same preset are one click.

## Steps

### 1. Open the Manuscript Builder

Three ways in:

- **Compile button** in the Manuscript view's toolbar (most common; opens the Builder scoped to the project you're already viewing).
- Command palette: **Draft Bench: Build manuscript**.
- Right-click the project note in the file explorer -> **Build manuscript**.

The Builder opens as a modal by default. If you'd rather keep the Preview tab pinned while you edit a scene in another pane, click the **dock** button in the modal's header to convert it to a workspace leaf.

### 2. Create a compile preset

If this is the project's first preset, the Builder shows a **+ New preset** button. Click it. You'll be prompted for:

- **Name** - what you'll see in the preset picker. Use something descriptive ("Workshop draft," "Submission DOCX," "Galley PDF") because you'll likely have multiple presets per project over time.
- **Project** - pre-filled to the active project.
- **Output format** - **Markdown**, **PDF**, **ODT**, or **DOCX**. Pick the one that matches where this output is going (Markdown for export to another tool; DOCX for editors and most submission portals; PDF for read-only sharing; ODT for LibreOffice/OpenOffice users).

The preset is saved as a note inside the project's `Compile Presets/` folder. You can edit its frontmatter directly later if you want to fine-tune anything not exposed in the Builder's form.

### 3. Configure the preset on the Build tab

The Builder's body has two tabs in the header: **Build** (form fields) and **Preview** (rendered output). On Build:

- Verify the output format and the output file path (where the compiled file lands in your vault).
- Adjust scene-separator settings, page-break behavior between chapters, and any per-format options (DOCX style mappings, PDF page size, etc.) as needed.
- Defaults are sensible for typical fiction-manuscript output. You can ship a first compile without changing anything.

### 4. Preview the output

Click the **Preview** tab. The rendered manuscript appears, including chapter headings, scenes, and any draft material. If the Builder is in leaf form (docked), Preview updates as you save edits to scenes (debounced ~400ms; only fires while Preview is the active tab).

Use the Preview to verify: scene order is right, chapter headings render as expected, no scenes are missing, draft material that should/shouldn't appear is correct.

### 5. Run compile

Click **Run compile** in the Builder's header (visible from both tabs). The compile runs end to end. You'll see a status indicator, then the output file appears at the path configured in your preset.

Open the output file from your file manager (or via the file explorer in Obsidian, depending on format). For DOCX/PDF/ODT, Obsidian opens these in your system's default viewer.

## Variations

- **If you want multiple compile profiles for the same project** (a quick-share Markdown export plus a polished DOCX submission, for example): create a second preset via **+ New preset** in the same Builder. Each preset is a separate note in `Compile Presets/`; switch between them via the preset picker in the Builder header.

- **If you want to compile the project from outside the Builder**: run **Draft Bench: Compile current project** from the command palette. It runs the project's most-recently-used preset without opening the Builder. Useful for binding a hotkey for one-click recompile after editing.

- **If your output looks off** (missing scenes, wrong order, unexpected formatting): switch back to the Build tab and check the scene-list filter and ordering settings. The Manuscript view's scene-order is what the Builder uses by default; reordering there flows through to the next compile.

## Related guides

- [I want to start a writing project from scratch](start-a-writing-project) - prerequisite if you don't have a project yet.
- [I want to work with drafts of a scene](work-with-drafts) - the revision loop. Drafts can be selectively included in compiles via preset filters.
- [I want to view my project in a Bases table](view-project-in-bases) - useful for verifying scene status / completeness before a final compile.

## Reference

- Wiki: [Manuscript Builder](https://github.com/banisterious/obsidian-draft-bench/wiki/Manuscript-Builder) - full Builder reference including modal vs leaf trade-offs, every form field, and per-format option details.
- Wiki: [Compile presets](https://github.com/banisterious/obsidian-draft-bench/wiki/Compile-Presets) - preset frontmatter reference for hand-tuning.

---

*Found something wrong or unclear? [Suggest an edit][issue-link] - opens a pre-filled issue with the `guides` label.*

[issue-link]: https://github.com/banisterious/obsidian-draft-bench/issues/new?labels=guides&title=%5BGuides%5D+compile-your-manuscript%3A+

---

## Notes for review

- Length: ~700 words.
- Decisions:
  - Walked through the modal flow as the default. The dock-to-leaf option is mentioned in step 1 but not the headline path; the leaf form is more useful for power users and the recipe targets first-time compilers.
  - Skipped per-format option details. DOCX style mappings, PDF page sizes, etc. are wiki territory; the recipe should hand the writer enough to ship a first compile without wading through reference material.
  - The "If your output looks off" variation is a soft pointer at the Manuscript view's scene-ordering surface. A dedicated "I want to reorder scenes" guide could be P1 if scene-order questions accumulate in `guides`-labeled issues.
  - The Wiki: Compile presets link assumes a wiki page at that path. If the actual wiki page is named differently, the port brief should flag the link rewrite.
  - Cross-link to `view-project-in-bases` is positioned as a verification path before final compile (status / completeness check). Reinforces the differentiator-style framing.
- Did not include a screenshot of the Builder. The wiki has the canonical Builder screenshot ([dbench-manuscript-builder-leaf.png]); the recipe form fits in 5 numbered steps without one.
