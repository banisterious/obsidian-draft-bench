# Manuscript Builder

The Manuscript Builder is Draft Bench's compile surface — a focused modal for editing a project's compile presets and running a compile.

It pairs with the **[Manuscript view](#manuscript-view)** (a dockable workspace pane), which is where day-to-day writing work happens. The Manuscript view shows your ordered scene list, status breakdown, and word-count progress; the Manuscript Builder is where you turn that material into a finished output (Markdown, ODT, PDF, or DOCX) when you're ready to share.

---

## Opening the Manuscript Builder

- **Compile button** in the Manuscript view's toolbar (most common — opens the modal scoped to the active project).
- Command palette: **Draft Bench: Build manuscript**.
- Right-click a project note in the file explorer -> **Build manuscript**.

If no compile preset exists yet for the active project, the modal opens with a **+ New preset** button so you can create one in place.

## Sections

The modal is a stack of collapsible sections. Each section's fields persist directly to the preset note's `dbench-compile-*` frontmatter — no separate save step.

### Metadata

Title, subtitle, author, and date format. Used by output renderers (PDF / ODT / DOCX) for cover pages and headers.

### Inclusion

Which scenes to include. V1 uses an "auto" scene source: every scene in the project, in `dbench-order`. Filters:

- **Statuses**: include only scenes whose `dbench-status` is in this list. Empty = all statuses.
- **Excludes**: explicit list of scene basenames or `[[wikilinks]]` to skip.

### Output

- **Format**: `md` (Markdown), `odt`, `pdf`, or `docx`.
- **Destination**: `vault` (writes into the project folder) or `disk` (opens an OS save dialog).
- **Page size**, **cover**, **table of contents**, **chapter numbering**, **section breaks**: format-specific knobs.

Vault Markdown lands at `<project folder>/Compiled/<preset name>.md` so subsequent compiles overwrite the same file. Disk outputs prompt with a save dialog every run.

### Content handling

Per-preset overrides for the five content-handling rules that have meaningful per-output trade-offs (heading scope, frontmatter, wikilinks, embeds, dinkuses). The other compile-time rules (footnote renumbering, callout stripping, etc.) are always-on.

### Last compile

Read-only display of when the preset last compiled, where the output landed, and how many scenes have changed since (computed from per-scene content hashes).

## Run compile

The **Run compile** button at the top of the modal runs the active preset end to end: walks scenes in order, applies content-handling rules, renders the chosen format, writes the output. A success notice surfaces the output path; if any embeds were stripped from the output (images, audio, video, base files, note embeds), a second notice line summarizes counts by category.

The same compile flow is reachable from:

- **Draft Bench: Run compile** (palette).
- **Draft Bench: Compile current project** (palette).
- Right-click a compile preset note -> **Run compile**.
- Right-click a scene or draft -> **Compile current project** (resolves to the scene's parent project).

## Manuscript view

The Manuscript view is the dockable companion to the Manuscript Builder. It opens in the right sidebar by default and shows:

- The active project + a picker for switching projects.
- An ordered scene list (sorted by `dbench-order`) with status chips and per-scene word counts.
- A status breakdown for the project.
- A toolbar with **New scene**, **New draft**, **Reorder scenes**, and a primary **Compile** button.

Open it via the ribbon icon, the **Draft Bench: Show manuscript view** palette command, or by right-clicking a project note.

## Plugin settings

Plugin configuration (folders, drafts placement, status vocabulary, scene template, Bases folder, bidirectional sync) lives in Obsidian's **Settings -> Community plugins -> Draft Bench**, not in the Manuscript Builder. See [Settings and Configuration](Settings-And-Configuration).

---

*The earlier "Control Center" tabbed-modal hub was retired in favor of the focused Manuscript Builder + dockable Manuscript view. Detailed walkthroughs and screenshots will land once V1 ships.*
