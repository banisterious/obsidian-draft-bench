# Importing from Scrivener

Draft Bench can import a Scrivener 3 project as a fresh Draft Bench project. Chapters, scenes, sub-scenes, drafts (optional), and inspector content all carry across. The importer is a multi-step wizard that lets you preview every mapping decision before any file gets written to your vault.

This page covers how to run the import, what each wizard step does, how the mappings work, and what to expect after the import lands.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Opening the wizard](#opening-the-wizard)
- [The wizard, step by step](#the-wizard-step-by-step)
- [What gets created](#what-gets-created)
- [Mapping reference](#mapping-reference)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Re-importing](#re-importing)
- [See also](#see-also)

---

<p align="center">
  <a href="https://draftbench.io/img/dbench-scrivener-import.webm">
    <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-scrivener-import-hierarchy.png"
         alt="Click to watch the Scrivener import wizard run end-to-end on draftbench.io: a .scriv folder is dropped onto the Source step, the Parse step renders the counts summary, the Hierarchy step shows auto-detected scene and chapter rows, the Metadata step routes statuses and custom fields, the Options step exposes the snapshot template, the Preview step shows the file tree, and the Complete step reports success."
         width="800">
  </a>
  <br>
  <em>▶ Click to watch the wizard end-to-end on draftbench.io</em>
</p>

## Prerequisites

- **Scrivener 3 only.** Scrivener 2 (older binder schema) and iOS Scrivener (different bundle structure) are not supported in V1. If you're still on Scrivener 2, upgrade to 3 (or stand up a 3.x trial), open the project once so it migrates, and import the upgraded bundle.
- **The `.scriv` bundle has to live inside your vault.** Draft Bench reads via Obsidian's vault adapter, not the OS file system. The wizard's Source step can do the copy for you on most platforms (drag-drop on desktop; the device picker on Android). On iOS / iPadOS, copy the bundle into your vault folder via the Files app first, then reopen the wizard.
- **A destination project folder.** The importer creates a new Draft Bench project under your `defaultProjectFolder` setting and never overwrites an existing project of the same name.

## Opening the wizard

Three entry points, all of which open the same wizard at step 1:

- **Command palette:** `Draft Bench: Import from Scrivener`.
- **Manuscript view header:** the import button (file-input icon) sits next to the **+** "New project" button in the project picker row.
- **Manuscript view empty state:** when no Draft Bench projects exist yet, an "Import from Scrivener" button surfaces alongside "Create project."

## The wizard, step by step

The wizard has 8 steps. The indicator strip across the top shows steps 1-6 (the configuration phase); the in-flight Import step and the post-write Complete step are hidden from the strip per the convention used elsewhere in Draft Bench. At any point you can click **Back** to revise an earlier mapping; form data is preserved within the session.

### 1. Source

Pick the `.scriv` folder you want to import. Three input shapes are surfaced:

- **Drop or browse widget** (desktop + Android). Drop a `.scriv` folder onto the zone, or click to pick via the device's directory picker. The wizard copies the bundle into your vault under `Imports/<name>.scriv/` automatically.
- **Vault picker.** If any `.scriv` folders are already in your vault, an "Or pick from your vault" dropdown lists them.
- **Empty state.** On platforms without `webkitdirectory` support (notably iOS Safari WKWebView), copy the `.scriv` bundle into your vault via the Files app first, then reopen the wizard so the vault picker can surface it.

<p align="center">
  <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-scrivener-import-source.png"
       alt="Source step of the Scrivener import wizard: a centered drop-or-pick widget with an upload icon and 'Drop a .scriv folder here / Or click to browse' captions, plus an 'Or pick from your vault' dropdown below it listing in-vault .scriv folders."
       width="800">
</p>

### 2. Parse

Reads the `.scrivx` index, walks every binder document, and tallies what's there. Two things appear:

- A summary card with counts (chapters, scenes, sub-scenes, snapshots, images, custom-metadata fields, statuses, labels, keywords).
- A "Destination project name" text field. Defaults to the bundle's basename minus `.scriv`. Conflict-checked in real time against your `defaultProjectFolder`; if the target folder already exists, the validation message shows and **Next** stays disabled until the name resolves.

Parse runs once per source path. Going Back to Source and picking a different bundle invalidates the cache and re-parses on entry.

<p align="center">
  <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-scrivener-import-parse.png"
       alt="Parse step showing the import summary card with counts (chapters, scenes, sub-scenes, snapshots, images, custom-metadata fields, statuses, labels, keywords) and a 'Destination project name' text input below the card."
       width="800">
</p>

### 3. Hierarchy mapping

Scrivener allows arbitrary binder nesting; Draft Bench has four levels (project / chapter / scene / sub-scene). The wizard auto-detects an initial mapping using a deepest-leaves-with-prose heuristic:

- Documents at the deepest level with prose -> **Scenes**.
- Their immediate folder parents -> **Chapters**.
- Anything above the chapter level (Parts, Books, Volumes) -> **Extras above**, preserved as `scrivener-part: "Part 1"` frontmatter on the chapters they contain (not folded into the chapter title).
- Anything below the sub-scene level (sub-sub-scenes and beyond) -> **Extras below**, concatenated into the parent sub-scene's body as nested markdown headings (`### Sub-sub-scene title` followed by its prose). Loses structural distinction; preserves prose order.

The step renders the binder tree with a per-row dropdown so you can override any auto-detected target (demote a chapter to scene, promote a scene to chapter, etc.). A summary line counts how many documents will be merged into parents (e.g., `3 documents will be merged into their parents`) so the lossy mapping is visible up front.

The **Next** button is gated on every binder leaf having a target type assigned.

<p align="center">
  <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-scrivener-import-hierarchy.png"
       alt="Hierarchy mapping step rendering the parsed binder as a nested tree. Each row shows the document title and an auto-detected target type (Chapter / Scene / Sub-scene / Extras above / Extras below) in a per-row override dropdown."
       width="800">
</p>

### 4. Metadata

Three sub-tables in this step. Each routes a Scrivener metadata axis into your project's frontmatter. Always-passes Next.

#### Statuses

Each Scrivener status with its document count, plus a target dropdown:

- One row per status in your existing **Status vocabulary** (Settings -> Draft Bench -> Statuses).
- **Add as new status.** Adds the source status to your vocabulary as part of the import write phase. An inline text input appears so you can rename before commit.
- **Drop (use default).** Falls back to your default status.

Default behavior: exact-string and case-insensitive match against your existing vocabulary. Unmatched statuses default to "Add as new status" with the original Scrivener title pre-filled.

#### Labels

Scrivener "Label" is a single per-document value, often used as POV character or scene category. Draft Bench has no built-in label slot, so labels route to a writer-named frontmatter key. Default key: `scrivener-label`. Rename to `dbench-pov` or anything else; the value gets written verbatim per document.

#### Custom metadata

Each Scrivener custom field is listed with its field type (`Text`, `Checkbox`, `List`, `Date`). Pick a frontmatter key target for each:

- `scrivener-<field-name>` (default, provenance prefix).
- `dbench-<field-name>` (rare; writer-driven).
- **Drop**: skip this field at import.

Values are coerced by field type at write time:

| Scrivener field type | Source format | Imported as |
|---|---|---|
| Checkbox | `Yes` / `No` | JS boolean (`true` / `false`) |
| List | Option ID (e.g., `2`) | Resolved option title |
| Date | `YYYY-MM-DD HH:MM:SS ±HHMM` | ISO `YYYY-MM-DD` (Bases / Dataview queryable) |
| Text | Raw string | Raw string |

<p align="center">
  <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-scrivener-import-metadata.png"
       alt="Metadata step with three stacked sub-tables: Statuses (each Scrivener status with a target dropdown, including an 'Add as new status' option with an inline rename input), Labels (a single 'Label frontmatter key' text input defaulting to scrivener-label), and Custom metadata (each Scrivener custom field with its type and a per-field target dropdown)."
       width="800">
</p>

### 5. Options

Toggles and inputs for writer-driven preferences. Always-passes Next.

- **Import research** (default off). Brings in the Research folder and any other non-manuscript top-level folders alongside the manuscript. RTF bodies converted; binder hierarchy preserved verbatim under `Research/`. Templates and Trash are always skipped regardless.
- **Import snapshots** (default off). Per-document Scrivener snapshots become `dbench-type: draft` files alongside each scene. When on, two extra fields surface:
  - **Snapshots per scene.** Cap of `Most recent 1 / 3 / 5 / All`.
  - **Snapshot filename template.** Variables: `{scene}` `{title}` `{date}` `{date_compact}` `{time}` `{n}`. Default template (`{scene} - Draft {n} ({date_compact})`) matches native draft files. Empty `{title}` resolves to `Untitled`. Filesystem-unsafe characters in the result are replaced with `-`.
  - The original Scrivener title is preserved as `scrivener-snapshot-title` frontmatter regardless of whether `{title}` appears in the template.
- **Image extraction folder** (default `Research/Images/`). Vault folder under the new project where inline images get extracted. Path is project-relative.
- **Create default compile preset** (default off). Adds a starter `dbench-type: compile-preset` note to the new project so the writer has somewhere to begin. The preset uses Draft Bench's standard defaults; Scrivener compile formats don't translate directly.

<p align="center">
  <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-scrivener-import-snapshots.png"
       alt="Options step with 'Import snapshots' toggled on, surfacing the 'Snapshots per scene' cap dropdown and the 'Snapshot filename template' text input with the available variables listed in its help text below."
       width="800">
</p>

### 6. Preview

Last review before the write pass. Three sections:

- **Counts summary.** How many project / chapter / scene / sub-scene / draft / image / preset files will be created.
- **Warnings.** Anything the importer flagged during planning. Common entries: `N documents will be merged into parents` (extras-below), `N RTF features fell back to HTML` (complex tables, unusual formatting), `N statuses unmatched` (when statuses default to Drop).
- **File tree.** Every vault path the import write pass will create, with the project folder as the root. Useful for spotting filename surprises before commit.

The **Import** button replaces **Next** here; clicking it commits.

<p align="center">
  <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-scrivener-import-preview.png"
       alt="Preview step with three sections: a counts summary at the top, a warnings list in the middle, and a file tree at the bottom enumerating every vault path the import write pass will create under the new project folder."
       width="800">
</p>

### 7. Import (in flight)

The actual write pass. Runs asynchronously and renders progress with a per-file count. Once started, the **Back** button is gone; the import has to finish (or error) before the wizard advances.

The pass is two-phase:

- **Pass 1.** Creates the project folder, walks the binder in `dbench-order`, writes notes via `FileManager.processFrontMatter`, extracts images, integrates with the integrity service / linker for reverse arrays. Builds a `scrivener-uuid -> dbench-file-path` map for the second pass.
- **Pass 2.** Walks every imported scene body and rewrites cross-document Scrivener Links to Obsidian wikilinks via the UUID map. Unresolvable links (target excluded from import or not found) become `[broken: <original-title>]` with an entry in the import error log.

Errors during the write pass are collected per-file; a single bad scene won't abort the whole import.

### 8. Complete

Summary of what was created:

- File counts.
- Warnings + errors list. When errors are present they render inline on the Complete step regardless of disk-write success, so you always see the result.
- Link to the import error log if one was produced (`Scrivener import errors.md` in the new project folder; falls back to the vault root if the project folder couldn't be created).
- **Done** (focuses the new project in the Manuscript view) and **Import another** (resets the wizard to step 1 with empty form data).

If the import finished with errors, an Obsidian Notice toast surfaces alongside the Complete step so the result isn't silent.

<p align="center">
  <img src="https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/dbench-scrivener-import-complete.png"
       alt="Complete step showing the import-success summary: file counts, any errors-or-warnings list, and Done plus 'Import another' buttons in the wizard footer."
       width="800">
</p>

## What gets created

A typical novel-shape import lands as:

```
<defaultProjectFolder>/
  <ProjectName>/
    <ProjectName>.md             # project note (dbench-type: project)
    Chapter 1 - Departure.md     # chapter (dbench-type: chapter)
    Chapter 1/
      01 - Opening.md            # scene (dbench-type: scene)
      02 - Inquiry.md
      ...
    Chapter 2 - Crossing.md
    Chapter 2/
      ...
    Drafts/                      # if "Import snapshots" was on
      01 - Opening - Draft 1 (20240315).md
      ...
    Research/                    # if "Import research" was on
      <preserved Scrivener Research hierarchy>
    Research/Images/             # extracted inline images
    Scrivener import errors.md   # only when errors occurred
```

Each note carries Draft Bench's `dbench-*` frontmatter plus Scrivener-provenance frontmatter (`scrivener-uuid`, `scrivener-part`, `scrivener-include-in-compile`, `scrivener-label` or your renamed key, custom metadata fields per your mappings, `scrivener-snapshot-title` on imported drafts).

## Mapping reference

A summary of where each piece of Scrivener content lands.

### Inspector

| Scrivener field | Draft Bench destination |
|---|---|
| Synopsis (corkboard index card) | `dbench-synopsis` frontmatter |
| Document Notes (writing-pad sidebar) | Appended `## Notes` section in the scene body |
| Custom Metadata fields | Frontmatter via the Step 4 mapping |
| Inline Comments (anchored to text) | Obsidian `%% comment %%` syntax at the original anchor |
| Footnotes (inline + inspector) | Standard markdown footnotes |
| Project Notes (project-level) | Appended `## Notes` section in the project note body |
| Keywords | Obsidian `tags:` frontmatter array |

### Body content

Scrivener stores bodies as RTF (`.rtf`) or RTFD (`.rtfd`). The conversion handles:

- **Inline formatting.** Italics, bold, underline, strikethrough.
- **Smart quotes, em-dashes, ellipses.** Preserved verbatim (no straight-quote conversion; Scrivener's character choices are yours).
- **Lists.** Ordered and unordered, including nested.
- **Tables.** Simple tables -> markdown tables. Complex tables (merged cells, mid-cell formatting) fall back to raw HTML in the body and are flagged in the import error log.
- **Inline images.** Extracted to `Research/Images/<original-filename>` (or `<scene-id>-<index>.<ext>` if no original filename) and referenced via `![[Research/Images/foo.png]]`.
- **Footnotes.** Inline + inspector both -> `[^1]` reference + `[^1]: body` definition. The inline / inspector distinction is lost (markdown has only one footnote type).
- **Comments.** Anchored to the original location as `%% comment %%`. Author and timestamp metadata are dropped (markdown comments don't carry metadata).
- **Cross-document Scrivener Links.** Rewritten to `[[wikilinks]]` via the UUID map. Unresolvable links become `[broken: <title>]`.

### Include in Compile flag

Scrivener's per-document "Include in Compile" boolean is preserved as `scrivener-include-in-compile: false` on excluded documents, as provenance only. Draft Bench doesn't actively read this property after import. If you want to mirror the flag in compile, add a status-based exclusion to your compile preset.

### Project metadata

- **Title.** Comes from your destination-name confirmation in step 2.
- **Description / project notes.** Appended to the project note body as `## Notes`.
- **Project keyword vocabulary.** Not directly imported (Draft Bench has no per-project tag vocabulary). Per-document keyword *uses* land as `tags:` frontmatter on the relevant scenes.

## Known limitations

What V1 doesn't do:

- **Scrivener 2 / iOS Scrivener formats.** Schema and bundle structure differ. Re-add as separate parser paths if a contributor surfaces with a project to test against.
- **Reading `.scriv` from outside the vault.** V1 reads vault-internal paths only; copy the bundle in first.
- **Compile settings translation.** Scrivener compile formats don't map cleanly to Draft Bench compile presets. Build your DB compile presets from scratch after import.
- **Custom destination folder picker.** New project lands under `defaultProjectFolder`. Move or rename after import if needed.
- **Resumable wizard state.** Form data is in-session only; closing and reopening starts fresh. Source `.scriv` bundles can change between sessions, so re-parsing is the right default.
- **Inline RTF features deferred for fidelity tuning** (gated on real-corpus exposure): some hyperlink variants, nested footnotes within tables, unusual inline-image arrangements. These import as best-effort placeholders flagged in the error log.
- **Include-in-Compile detection on docs with no other metadata** (Scrivener Windows quirk). When Scrivener Windows persists a document whose `Include in Compile` checkbox is unchecked, it removes the corresponding XML element from the document's `<MetaData>` block (rather than writing an explicit "No"). The importer detects this — but only when the document also carries some *other* metadata that lives **inside** the `<MetaData>` block: a **Status**, a **Label**, or a **Custom Metadata** field. (Keywords don't qualify — they're stored as a sibling element of `<MetaData>`, not inside it.) For a document with empty `<MetaData/>`, the unchecked-state and untouched-default state are indistinguishable on disk. Workaround: in Scrivener, set a Status, assign a Label, or fill any Custom Metadata field on the document before toggling Include-in-Compile off. The importer then detects the exclusion and surfaces the document in the Preview step's disclosure.

## Troubleshooting

**Empty Source step on iOS.** iOS Safari WKWebView doesn't support `webkitdirectory`. Copy the `.scriv` bundle into your vault using the Files app, then reopen the wizard so the in-vault picker dropdown can surface it.

**"Project creation failed" in the Complete step.** Almost always a destination-name conflict (a project with that name already exists in `defaultProjectFolder`). Go back to step 2 and pick a unique name.

**Scenes have empty bodies after import.** Check the import error log (`Scrivener import errors.md` in the project folder). The most common cause is RTF parser fallback on unusual encodings; the bodies should still contain *some* content as HTML fallback. File an issue at [#28](https://github.com/banisterious/obsidian-draft-bench/issues/28) with the offending RTF (sanitized) so the parser can be tuned.

**Status vocabulary grew unexpectedly.** Step 4's "Add as new status" rows write through to your settings. Edit the status vocabulary in plugin settings to clean up after import.

**Tags exploded after a keyword-heavy import.** Scrivener Keywords map to Obsidian `tags:` frontmatter. To isolate them instead, rename `tags:` to `scrivener-keywords:` per scene (a Find-and-Replace across the new project folder works) and keep DB tags clean.

**Cross-document links read `[broken: <title>]`.** The link's target document was excluded from the import (e.g., it lived in Templates / Trash, or you hadn't enabled "Import research" for a Research-folder target). Re-import with the relevant option toggled on, or rewrite the broken link manually.

## Re-importing

The importer doesn't track prior imports. Running it twice with the same source produces a name conflict (caught at step 2's destination-name validation), not an in-place merge. To re-import:

- **Replace.** Delete the previous Draft Bench project folder, then run the import with the same destination name.
- **Side-by-side.** Change the destination name in step 2 (e.g., add a date suffix) so both projects coexist.

Re-importing is the right move when the source `.scriv` has changed substantially. For incremental updates, working in the imported Draft Bench project directly is cleaner than re-running the wizard.

## See also

- [Projects, Chapters, Scenes, and Sub-scenes](Projects-And-Scenes): the data model the importer maps onto.
- [Frontmatter Reference](Frontmatter-Reference): every property the importer writes.
- [Settings and Configuration](Settings-And-Configuration): `defaultProjectFolder`, status vocabulary.
- [#28 on GitHub](https://github.com/banisterious/obsidian-draft-bench/issues/28): milestone tracking issue and feedback channel.
