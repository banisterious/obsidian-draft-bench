---
title: "I want to import a Scrivener project"
description: Move a Scrivener 3 project bundle into Draft Bench - chapters, scenes, sub-scenes, RTF bodies, statuses, custom metadata, and (optionally) per-document snapshots as drafts.
difficulty: medium
time_estimate: ~30+ min
last_reviewed: 2026-05-10
relevant_releases: 0.5.x
---

# I want to import a Scrivener project

You're moving a Scrivener 3 project across to Draft Bench. The importer reads your `.scriv` bundle and rebuilds the binder hierarchy as a Draft Bench project: chapters, scenes, sub-scenes, RTF bodies translated to markdown, statuses and labels and custom metadata routed to frontmatter, and (optionally) per-document snapshots as drafts. By the end you'll have a Draft Bench project sitting in your vault that mirrors what you had in Scrivener.

## What you'll need

- A Scrivener 3 `.scriv` project bundle (Mac or Windows). Scrivener 2 and the iOS Scrivener bundle format aren't supported.
- The bundle copied into your Obsidian vault folder. The importer reads from inside the vault; it won't reach external paths.
- 10-30 minutes for a typical novel-sized project; longer if you're importing snapshots.

## Steps

### 1. Get the `.scriv` folder into your vault

You have three options. Pick whichever your platform supports:

- **Drag-drop** (desktop only): drop the `.scriv` folder onto the wizard's Source step.
- **In-app picker** (desktop and most Android builds): tap **Tap to pick a .scriv folder** in the wizard's Source step and choose the bundle.
- **Device file manager** (mobile, or fallback when the in-app picker doesn't support folder selection): copy the `.scriv` folder into your vault using your device's file manager (Files by Google, Samsung My Files, etc.), then come back to the wizard. The "Pick from your vault" dropdown surfaces the folder automatically.

On some Android builds the in-app picker presents a file-only chooser regardless of what the plugin requests. If you tap the picker and can't select the folder itself, fall back to the file-manager path. Wiki: [Importing from Scrivener § Troubleshooting](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener#troubleshooting) has the full mobile guidance.

### 2. Open the import wizard

From the command palette, run **Draft Bench: Import from Scrivener**. The wizard opens with an 8-step layout (Source → Parse → Hierarchy → Metadata → Options → Preview → Import → Complete).

### 3. Walk through the wizard

Quick orientation per step:

- **Source.** Confirm or pick the bundle (already done in step 1 if you used drag-drop or the file-manager fallback).
- **Parse.** A summary card shows binder counts (chapters, scenes, sub-scenes, snapshots) and lets you set the destination project name. The default name strips the `.scriv` suffix.
- **Hierarchy mapping.** Review the auto-detected mapping. Folders containing prose-leaves typically become chapters; folders above the chapter level become Parts / Books / Volumes (recorded as `scrivener-part` frontmatter on the chapters they contain). Override per-row via the dropdowns if anything's off.
- **Metadata mapping.** Route Scrivener's statuses, labels, and custom metadata to Draft Bench's status vocabulary and frontmatter.
- **Options.** Four flags (each off by default): import the Research folder, import snapshots as drafts, create a default compile preset stub, and the image extraction folder for inline images. Turn on **Import snapshots** if you want your Scrivener version history carried across.
- **Preview.** Review the import plan. The Warnings section flags any documents marked Include-in-Compile = No in Scrivener; those are still imported, with `scrivener-include-in-compile: false` provenance frontmatter so the exclusion isn't silently lost.
- **Import.** Let it run. Larger projects (50+ scenes, snapshots on) take a few minutes.
- **Complete.** Click through to open the new project.

### 4. Verify your import

Open the new project folder. You'll see the project note, chapter folders, scene notes, sub-scene notes, and (if you enabled snapshots) drafts alongside each scene. Check the import error log file (`Scrivener import errors.md`) at the project root for any per-document warnings; the importer is best-effort on RTF body parsing, so a few warnings on unusual encodings or partial fidelity are normal.

## Variations

- **If your project is large** (110k+ words across many scenes): the import takes 1-3 minutes. Snapshot import roughly doubles that. Consider running first with **Import snapshots** off to verify the structure imports cleanly; if you decide you want snapshots after, you'd delete the imported project and re-run. Re-import doesn't merge.

- **If you're on Scrivener Windows and Include-in-Compile detection looks off**: when you've toggled "Include in Compile" off on a document AND that document has no other metadata in its `<MetaData>` block (no Status, Label, or Custom Metadata field), Scrivener Windows writes empty `<MetaData/>` either way. The importer can't distinguish unchecked-and-empty from default-and-empty. Workaround: in Scrivener, set a Status, assign a Label, or fill any Custom Metadata field on those documents first, then re-export. The importer then picks up the exclusion.

- **If the auto-detected hierarchy doesn't match your structure**: use the Hierarchy step's per-row override dropdowns. Scenes can be promoted to chapters; deep nesting can be reshaped before any files get written.

## Related guides

- [I want to compile my manuscript](compile-your-manuscript) - what to do once the project lands in Draft Bench.
- [I want to view my project in a Bases table](view-project-in-bases) - browse the imported structure as a queryable table.

## Reference

- Wiki: [Importing from Scrivener](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener) - full walkthrough with per-step screenshots, mapping reference table, known limitations, and troubleshooting.
- Wiki: [Frontmatter reference](https://github.com/banisterious/obsidian-draft-bench/wiki/Frontmatter-Reference) - the `dbench-*` and `scrivener-*` properties the importer writes.

---

*Found something wrong or unclear? [Suggest an edit][issue-link] - opens a pre-filled issue with the `guides` label.*

[issue-link]: https://github.com/banisterious/obsidian-draft-bench/issues/new?labels=guides&title=%5BGuides%5D+import-from-scrivener%3A+

---

## Notes for review

- Length: ~830 words (body, excluding frontmatter and notes-for-review).
- Skipped step-by-step screenshots for each wizard step. The wiki has those; reproducing them in the guide bloats it without adding workflow value. If GA scroll-depth data shows readers bouncing before step 3, consider adding a single Source-step screenshot at the top to anchor the reader.
- Variations capped at three: large project, Scrivener Windows MetaData quirk, hierarchy override. Other edge cases (image extraction tweaks, custom snapshot filename templates, the "Untitled Snapshot" sentinel rule) are deferred to wiki reference.
- Cross-link to `compile-your-manuscript` is the natural next step. Cross-link to `view-project-in-bases` is the differentiator-style alternative; readers who want to see structure visually before compiling go there.
- The Android picker mention deliberately stays brief and points at the wiki for full guidance. Android troubleshooting belongs in the wiki, not in a workflow guide that has to serve all platforms.
- The "re-import doesn't merge" note in Variations 1 is the anti-footgun reminder: writers who want to add snapshots after the fact often expect a re-run to merge. It doesn't.
