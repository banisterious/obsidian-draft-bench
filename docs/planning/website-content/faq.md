# Frequently asked questions

Common questions from writers evaluating Draft Bench. For deeper documentation, see [the wiki](https://github.com/banisterious/obsidian-draft-bench/wiki).

## Getting started

### What is Draft Bench?

A writing plugin for Obsidian. It manages the manuscript spine — projects, chapters, scenes, sub-scenes, drafts, and compile — as first-class note types in your vault, using Obsidian's native frontmatter properties. See [the homepage](/) for a longer overview.

### Who is it for?

Novelists and long-form-fiction writers who already use Obsidian (or want to) and want a focused tool for organizing scenes into chapters, snapshotting drafts, and compiling a manuscript. Short-fiction writers fit too: a single-scene project is a valid Draft Bench shape.

If you're looking for a plotting tool with character databases, plot grids, and pacing analytics, Draft Bench isn't that plugin. [StoryLine](https://github.com/PixeroJan/obsidian-storyline) is.

### When can I install it?

Now. Install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) by adding `banisterious/obsidian-draft-bench` as a beta plugin, then enabling Draft Bench in **Settings -> Community plugins**. The current release is **0.5.1** (2026-05-08); the first BRAT-public release was 0.1.0 on 2026-04-29. Community-plugin directory submission follows after the 0.x phase stabilizes.

### Is it free?

Yes. Draft Bench is open-source and free to use. The plugin is available through Obsidian's BRAT plugin during the 0.x phase; community-plugin directory submission follows after the 0.x line stabilizes.

## How it compares

### How is Draft Bench different from Longform?

[Longform](https://github.com/kevboh/longform) is the original Obsidian writing plugin and the closest spiritual ancestor; Draft Bench owes a real debt to its prior art. Longform handles scene-as-note + drag-to-reorder + compile-to-single-file with quiet single-author maintenance.

Draft Bench extends that model with chapter as a first-class note type, drafts as a `dbench-type` (not a side-effect), compile presets that are themselves vault notes, bidirectional linking with an integrity service, and Bases-native starter views. See [the comparison page](comparison.md) for a side-by-side.

### How is it different from StoryLine?

[StoryLine](https://github.com/PixeroJan/obsidian-storyline) is much broader — a Scrivener-in-Obsidian that handles plotting (corkboard, kanban, plotgrid, subway map, timeline), entity management (characters, locations, codex), beat-sheet templates, plot-hole detection, and pacing analysis. Both Draft Bench and StoryLine import Scrivener 3 `.scriv` projects (Draft Bench since 0.5.0).

Draft Bench is narrow on purpose. It handles the manuscript spine and stays out of the rest. If you want one plugin that covers the whole writing-tool surface, StoryLine is excellent at that. If you want a focused tool for the structural editing of a manuscript with everything else in plain notes or in [Charted Roots](https://chartedroots.com/), Draft Bench is built for that.

### Can it replace Scrivener?

For the manuscript-organization and compile parts, often yes — Draft Bench's project / chapter / scene / draft model maps cleanly to how most novelists use Scrivener's binder, and the compile pipeline supports the four formats writers actually submit (Markdown, PDF, ODT, DOCX). For corkboard plotting, character sheets, research-folder management, and Scrivener-specific features, no — Draft Bench doesn't try to replicate them. Some writers will want a focused plugin alongside other Obsidian tools; some will stay in Scrivener. Both choices are reasonable.

If you're moving over, the **Scrivener 3 importer** (shipped in 0.5.0) reads a `.scriv` bundle from inside your vault and produces a fresh Draft Bench project: chapters, scenes, sub-scenes, drafts (optional), inspector content, and custom metadata all carry across. See [Importing from Scrivener](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener) for the full walkthrough.

## Workflow

### Can I preview the compile output before running it?

Yes. The Manuscript Builder has a Preview tab that renders the current preset's compile output as continuous read-only prose. Tweak settings on the Build tab, flip to Preview, see the impact, iterate — without writing a real export file each time. Preview shipped in 0.3.0.

### Can I keep Preview open while editing scenes?

Yes, in the Manuscript Builder's leaf form (shipped in 0.3.1). The default modal blocks the rest of the workspace, so you can't edit a scene while it's up; the leaf form (opened via the dock-to-leaf button in the modal's sticky header, or the **Draft Bench: Show Manuscript Builder leaf** palette command) doesn't block. Drag the leaf to a side pane, edit a scene in the main pane, save — Preview re-renders ~400ms after the last save event. Useful for read-throughs where you want to fix a paragraph and see the effect immediately.

### Can I read the whole manuscript top-to-bottom without opening the Builder?

Yes. The Manuscript view's **Continuous** tab (shipped in 0.4.0) renders the entire project as one scrollable read-only document — chapters, scenes, sub-scenes, full bodies. No preset filters apply: it's always-everything by design, for revision read-throughs where the per-scene List view is noise. Click any title heading to jump to its source file (cmd/ctrl-click for new tab, +shift for split, +alt for window; right-click for the same options). Editing any scene re-renders the prose with scroll position preserved. Builder Preview is preset-scoped (filters / scope / transforms apply); Continuous is full-manuscript-scoped — different surfaces, different jobs.

## Scope and compatibility

### Does it work on Obsidian Mobile?

Yes — Draft Bench supports Obsidian Mobile as of 0.3.2. **Android is verified** via on-device walkthrough; **iOS and iPadOS ship untested** until a Mac-equipped contributor surfaces. All the surfaces work on mobile (Manuscript view, Manuscript Builder, scene / chapter / sub-scene / draft creation, retrofit, integrity, the compile pipeline, Bases, Style Settings). Compile to disk is desktop-only by construction (depends on Electron's native save dialog); compile to vault works on both desktop and mobile across all four formats (Markdown, PDF, ODT, DOCX). iOS bug reports are welcome and triaged via the `mobile-ios` label.

### Does Draft Bench manage characters or locations?

No. Auxiliary content — characters, locations, research, worldbuilding — stays user-managed in plain markdown notes, or moves to [Charted Roots](https://chartedroots.com/), the sibling plugin that owns world-building. Two focused plugins in one shared vault.

This is a design commitment, not an unfinished scope. Writers who want everything in one plugin should look at StoryLine.

### Does it import from Scrivener?

Yes, as of **0.5.0** (2026-05-08). A multi-step wizard reads a Scrivener 3 `.scriv` bundle from inside your vault and produces a fresh Draft Bench project. Hierarchy auto-detect maps the binder to projects / chapters / scenes / sub-scenes; statuses, labels, and custom-metadata fields route to your vocabulary; RTF bodies convert to markdown; inline images extract; cross-document Scrivener Links rewrite to wikilinks. Optional snapshot import and Research-folder import. Cross-platform (works on every OS Draft Bench supports). Scrivener 2 and iOS Scrivener formats are not supported in V1. See [Importing from Scrivener](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener) for the full walkthrough and known limitations.

### Does it lock my notes into a plugin format?

No. Every Draft Bench artifact is a regular markdown file with `dbench-` frontmatter properties — standard Obsidian properties, visible in each note's Properties panel and queryable from Bases, Dataview, or Templater. The `dbench-` prefix is namespaced so the plugin's keys can't collide with your own conventions or another plugin's. A vault opened without the plugin still reads cleanly: scenes are notes, drafts are notes, compile presets are notes. Uninstalling Draft Bench leaves your manuscript intact; the only thing you lose is the plugin's UI surfaces (Manuscript view, Manuscript Builder, integrity service).

### Does it work with other Obsidian writing plugins?

Generally yes. Draft Bench's `dbench-` frontmatter prefix is namespaced so it doesn't collide with other plugins' properties, and the plugin opts in to standard Obsidian APIs (FileManager, Bases, Style Settings) rather than parallel mechanisms.

Specific compatibility: Draft Bench is built to coexist with [Charted Roots](https://chartedroots.com/) (sibling plugin, no overlap by design). Coexistence with Longform or StoryLine in the same vault is technically possible but not a tested configuration — those plugins overlap with Draft Bench's manuscript-spine scope, so most writers will pick one.

## Getting help

### Where do I report a bug or request a feature?

[GitHub issues](https://github.com/banisterious/obsidian-draft-bench/issues). Both bug reports and feature requests welcome; the BRAT-public phase is when feedback shapes V1.x most. For day-to-day usage questions, the [wiki](https://github.com/banisterious/obsidian-draft-bench/wiki) covers Getting Started, Manuscript Builder, Drafts and Versioning, Projects and Scenes, and Settings.
