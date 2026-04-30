# Frequently asked questions

Common questions from writers evaluating Draft Bench. For deeper documentation, see [the wiki](https://github.com/banisterious/obsidian-draft-bench/wiki).

## Getting started

### What is Draft Bench?

A writing plugin for Obsidian. It manages the manuscript spine — projects, chapters, scenes, drafts, and compile — as first-class note types in your vault, using Obsidian's native frontmatter properties. See [the homepage](/) for a longer overview.

### Who is it for?

Novelists and long-form-fiction writers who already use Obsidian (or want to) and want a focused tool for organizing scenes into chapters, snapshotting drafts, and compiling a manuscript. Short-fiction writers fit too: a single-scene project is a valid Draft Bench shape.

If you're looking for a plotting tool with character databases, plot grids, and pacing analytics, Draft Bench isn't that plugin. [StoryLine](https://github.com/PixeroJan/obsidian-storyline) is.

### When can I install it?

Now. Draft Bench's first BRAT-public release (0.1.0) shipped on 2026-04-29. Install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) by adding `banisterious/obsidian-draft-bench` as a beta plugin, then enabling Draft Bench in **Settings -> Community plugins**. Community-plugin directory submission follows after the 0.x phase stabilizes.

### Is it free?

Yes. Draft Bench is open-source and free to use. The plugin will be available through Obsidian's BRAT plugin first; community-plugin directory submission follows after V1 stabilizes.

## How it compares

### How is Draft Bench different from Longform?

[Longform](https://github.com/kevboh/longform) is the original Obsidian writing plugin and the closest spiritual ancestor; Draft Bench owes a real debt to its prior art. Longform handles scene-as-note + drag-to-reorder + compile-to-single-file with quiet single-author maintenance.

Draft Bench extends that model with chapter as a first-class note type, drafts as a `dbench-type` (not a side-effect), compile presets that are themselves vault notes, bidirectional linking with an integrity service, and Bases-native starter views. See [the comparison page](comparison.md) for a side-by-side.

### How is it different from StoryLine?

[StoryLine](https://github.com/PixeroJan/obsidian-storyline) is much broader — a Scrivener-in-Obsidian that handles plotting (corkboard, kanban, plotgrid, subway map, timeline), entity management (characters, locations, codex), beat-sheet templates, plot-hole detection, pacing analysis, and Scrivener `.scriv` import.

Draft Bench is narrow on purpose. It handles the manuscript spine and stays out of the rest. If you want one plugin that covers the whole writing-tool surface, StoryLine is excellent at that. If you want a focused tool for the structural editing of a manuscript with everything else in plain notes or in [Charted Roots](https://github.com/banisterious/charted-roots), Draft Bench is built for that.

### Can it replace Scrivener?

For the manuscript-organization and compile parts, often yes — Draft Bench's project / chapter / scene / draft model maps cleanly to how most novelists use Scrivener's binder, and the compile pipeline supports the four formats writers actually submit (Markdown, PDF, ODT, DOCX). For corkboard plotting, character sheets, research-folder management, and Scrivener-specific features, no — Draft Bench doesn't try to replicate them. Some writers will want a focused plugin alongside other Obsidian tools; some will stay in Scrivener. Both choices are reasonable.

## Scope and compatibility

### Does Draft Bench manage characters or locations?

No. Auxiliary content — characters, locations, research, worldbuilding — stays user-managed in plain markdown notes, or moves to [Charted Roots](https://github.com/banisterious/charted-roots), the sibling plugin that owns world-building. Two focused plugins in one shared vault.

This is a design commitment, not an unfinished scope. Writers who want everything in one plugin should look at StoryLine.

### Does it import from Scrivener?

Not in V1. Scrivener `.scriv` import is the strongest post-V1 candidate (writers coming from Scrivener are a real audience), but V1 is for writers starting fresh in Obsidian or already vault-native.

### Does it lock my notes into a plugin format?

No. Every Draft Bench artifact is a regular markdown file with `dbench-` frontmatter properties — standard Obsidian properties, visible in each note's Properties panel and queryable from Bases, Dataview, or Templater. The `dbench-` prefix is namespaced so the plugin's keys can't collide with your own conventions or another plugin's. A vault opened without the plugin still reads cleanly: scenes are notes, drafts are notes, compile presets are notes. Uninstalling Draft Bench leaves your manuscript intact; the only thing you lose is the plugin's UI surfaces (Manuscript Builder, compile, integrity).

### Does it work with other Obsidian writing plugins?

Generally yes. Draft Bench's `dbench-` frontmatter prefix is namespaced so it doesn't collide with other plugins' properties, and the plugin opts in to standard Obsidian APIs (FileManager, Bases, Style Settings) rather than parallel mechanisms.

Specific compatibility: Draft Bench is built to coexist with [Charted Roots](https://github.com/banisterious/charted-roots) (sibling plugin, no overlap by design). Coexistence with Longform or StoryLine in the same vault is technically possible but not a tested configuration — those plugins overlap with Draft Bench's manuscript-spine scope, so most writers will pick one.
