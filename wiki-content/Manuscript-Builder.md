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

Which scenes to include. V1 uses an "auto" scene source: every scene in the project, in `dbench-order`. Chapter-aware projects walk two-level — chapters in `dbench-order`, then each chapter's scenes in their within-chapter `dbench-order`. Filters:

- **Statuses**: include only scenes whose `dbench-status` is in this list. Empty = all statuses.
- **Excludes**: explicit list of scene **or chapter** basenames / `[[wikilinks]]` to skip. Excluding a chapter drops the chapter heading, the chapter body's `## Draft` intro, and every child scene from the output (the dropped scenes still count toward the "filtered out N scenes" notice).

### Output

- **Format**: `md` (Markdown), `odt`, `pdf`, or `docx`.
- **Destination**: `vault` (writes into the project folder) or `disk` (opens an OS save dialog).
- **Page size**, **cover**, **table of contents**, **chapter numbering**, **section breaks**: format-specific knobs.

Vault Markdown lands at `<project folder>/Compiled/<preset name>.md` so subsequent compiles overwrite the same file. Disk outputs prompt with a save dialog every run.

### Content handling

Per-preset overrides for the five content-handling rules that have meaningful per-output trade-offs (**heading scope**, frontmatter, wikilinks, embeds, dinkuses). The other compile-time rules (footnote renumbering, callout stripping, etc.) are always-on.

**Heading scope** has three values:

- **`scope: full`** — emits each scene's full body (planning sections plus `## Draft`). Scene title becomes an H1 above each body. When a scene has [sub-scenes](Projects-And-Scenes#sub-scenes), each sub-scene title becomes an H2 below the scene's H1.
- **`scope: draft`** — emits only the `## Draft` content from each scene. Planning sections are stripped. Scene titles become H1s; sub-scene titles (when present) become H2s. Default for chapter-less projects.
- **`scope: chapter`** — chapter-aware compile. Emits one `# <chapter title>` per chapter, then the chapter body's `## Draft` content (chapter-introductory prose) when non-empty, then scene content. Flat scenes emit their `## Draft` body as continuous prose with the scene title omitted. **Hierarchical scenes** (with sub-scenes) emit `## <scene title>` (H2) followed by the scene's intro prose, followed by their sub-scenes as `### <sub-scene title>` (H3). Three-level cascade — chapter / scene / sub-scene = H1 / H2 / H3 — surfaces structure where it exists; flat scenes within the same chapter continue to render as continuous prose. Default for chapter-aware projects.

The default is auto-selected when the preset is created based on the project's shape; you can override later via the Compile tab. Existing presets are never silently changed when a project gains chapters or scenes gain sub-scenes.

A compile preset is itself a note in the vault. Its content-handling rules live in the note's frontmatter, editable from the Properties panel as well as from the Manuscript Builder modal:

<p align="center">
  <img src="https://draftbench.io/img/dbench-compile-preset-properties.png"
       alt="A Draft Bench compile preset note open in Obsidian's Properties panel, showing the dbench-compile-* fields for output format, heading scope, frontmatter handling, embeds, dinkuses, and other content-handling rules."
       width="800">
</p>

### Last compile

Read-only display of when the preset last compiled, where the output landed, and how many scenes have changed since (computed from per-scene content hashes).

## Run compile

<p align="center">
  <video controls width="800"
         src="https://draftbench.io/img/dbench-compile-flow.webm"
         aria-label="The compile flow: clicking Compile in the Manuscript view opens the Manuscript Builder modal, the Run compile action runs the preset, and the resulting markdown manuscript opens in the vault.">
    Your browser doesn't support embedded video.
    <a href="https://draftbench.io/img/dbench-compile-flow.webm">Watch the loop on draftbench.io</a>.
  </video>
</p>

The **Run compile** button at the top of the modal runs the active preset end to end: walks scenes in order, applies content-handling rules, renders the chosen format, writes the output. A success notice surfaces the output path; if any embeds were stripped from the output (images, audio, video, base files, note embeds), a second notice line summarizes counts by category.

The same compile flow is reachable from:

- **Draft Bench: Run compile** (palette).
- **Draft Bench: Compile current project** (palette).
- Right-click a compile preset note -> **Run compile**.
- Right-click a scene or draft -> **Compile current project** (resolves to the scene's parent project).

## Manuscript view

The Manuscript view is the dockable companion to the Manuscript Builder. It opens in the right sidebar by default and shows:

- The active project + a picker for switching projects.
- A **Project summary** section: status, identifier, total word count, hero progress bar (when `dbench-target-words` is set), per-status word/scene-and-chapter breakdown.
- A **Manuscript list** section. The body shape depends on whether the active project has chapters:
  - **Chapter-less projects** show a flat ordered scene list (sorted by `dbench-order`) with status chips, per-scene word counts, and draft counts.
  - **Chapter-aware projects** show stacked **chapter cards**. Each card has a clickable header (chevron + order capsule + chapter title link + status chip + chapter word-count rollup + a "New draft of this chapter" icon button on the right) and a body listing the chapter's scenes via the same scene-row primitive used by the flat list. Cards are individually collapsible — collapse state persists per chapter across reloads. Click the chapter title to open the chapter note; click anywhere else on the header to toggle.
- A toolbar with **New scene**, **New draft**, **Reorder scenes**, and a primary **Compile** button.

Open it via the ribbon icon, the **Draft Bench: Show manuscript view** palette command, or by right-clicking a project note.

## Plugin settings

Plugin configuration (folders, drafts placement, status vocabulary, scene template, Bases folder, bidirectional sync) lives in Obsidian's **Settings -> Community plugins -> Draft Bench**, not in the Manuscript Builder. See [Settings and Configuration](Settings-And-Configuration).

