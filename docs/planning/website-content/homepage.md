# Draft Bench

> A writing workflow for Obsidian.

Draft Bench is a writing plugin for novelists working in Obsidian. It manages the manuscript spine — projects, chapters, scenes, sub-scenes, drafts, and compile — as first-class note types in your vault, using the frontmatter conventions Obsidian writers already know.

The plugin stays narrow on purpose. Plot grids, character databases, beat-sheet templates, and pacing analytics live elsewhere. Draft Bench handles the structural editing of a manuscript: organizing scenes into chapters, snapshotting drafts at any point, and compiling the finished work to Markdown, PDF, ODT, or DOCX.

## What it does

- **Projects, chapters, scenes, sub-scenes, drafts, and compile presets are notes.** Every Draft Bench artifact is a regular markdown file with `dbench-` frontmatter properties. A vault opened without the plugin still reads cleanly: scenes are notes, drafts are notes, presets are notes. Nothing is locked behind plugin-only state.
- **Manuscript Builder.** A workspace view that lists chapters and scenes for a selected project, in `dbench-order`. Word-count rollups per chapter and per project. Status chips per scene. Reorder via the Reorder Scenes / Reorder Chapters modals. Click a scene title to open the file; collapse a chapter to focus elsewhere.
- **Drafts as a first-class type.** Snapshots of scenes, chapters, or single-scene projects, stored in a configurable `Drafts/` folder. Capture the state of the work at any moment — before a major revision, after a workshop session, when a beat finally lands. Drafts are notes, so they're searchable, taggable, and Bases-queryable like everything else.
- **Compile presets are notes too.** A preset is a `dbench-type: compile-preset` note in your vault, with content-handling rules (frontmatter strip, heading scope, footnote renumbering, embed handling, dinkus normalization) editable in the Properties panel or the Compile tab. Multiple presets per project — one for workshop submission, one for the agent draft, one for the final manuscript file.
- **Bidirectional linking with integrity service.** Stable IDs, plugin-maintained reverse arrays, live sync on vault events, and a batch-repair UI for the cases that drift. SNAKE_CASE issue codes so the same problem reads the same way every time.
- **Bases-native discovery.** Starter `.base` views for projects, scenes, and drafts. Filter, group, and surface your manuscript with the same Bases setup you use for everything else in your vault.
- **Theme-respectful styling.** Class hooks and minimum defaults, opt-in via Style Settings. The plugin doesn't impose chrome on writers who customize their vault's appearance.

## See it in action

Five short loops on the [features page](/features/) walk through new projects, the Manuscript view, versioned drafts, compile, and the integrity service — captured from a real vault.

## Where it sits

Draft Bench is one of several Obsidian writing plugins. The closest spiritual ancestor is [Longform](https://github.com/kevboh/longform); the plugin's `Drafts/` and compile concepts owe a real debt to Longform's prior art. The closest contemporary is [StoryLine](https://github.com/PixeroJan/obsidian-storyline), a much broader Scrivener-in-Obsidian that handles plotting, characters, locations, timelines, and analytics in addition to the manuscript.

Draft Bench's scope is deliberately smaller. The narrative spine, well, and nothing else. Auxiliary content — characters, locations, research notes — stays user-managed in plain markdown, or moves to the sibling [Charted Roots](https://github.com/banisterious/charted-roots) plugin which owns world-building. Two focused plugins, one shared vault.

For a longer comparison, see [How Draft Bench compares](comparison.md).

## Status

The current release is **0.2.3** (2026-05-04). The first BRAT-public release shipped 0.1.0 on 2026-04-29; subsequent 0.1.x and 0.2.x releases have hardened the integrity service, added chapter-aware folder defaults, reorganized the settings tab, and shipped the sub-scene note type. Install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) by adding `banisterious/obsidian-draft-bench` as a beta plugin; community-plugin directory submission follows after the 0.x phase stabilizes.

What's in the plugin today:

- Project, chapter, scene, sub-scene, draft, and compile-preset note types
- Manuscript Builder with chapter and scene cards, word-count rollups, status chips, and collapsible sub-scene cards
- Drafts as snapshots of scenes, chapters, sub-scenes, or single-scene projects
- Compile to Markdown, PDF, ODT, and DOCX with per-preset content-handling overrides; the pipeline descends into sub-scenes in narrative order
- Bidirectional linking + integrity service with batch repair, length-mismatch convergence, and pairing-preserving splice
- Chapter-aware folder defaults: scenes nest under their chapter folder, sub-scenes nest under their scene folder
- Bases-native starter views for projects, scenes, and drafts
- Style Settings integration for opt-in theming

For the full release history, see the [Release History wiki page](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History) or the [CHANGELOG](https://github.com/banisterious/obsidian-draft-bench/blob/main/CHANGELOG.md).

API and data shape may still adjust between minor versions during the 0.x phase; see [the versioning policy](https://github.com/banisterious/obsidian-draft-bench/blob/main/VERSIONING.md).

## Get involved

- **[View the source on GitHub](https://github.com/banisterious/obsidian-draft-bench)** — public repo; star or watch for release notifications.
- **[Read the wiki](https://github.com/banisterious/obsidian-draft-bench/wiki)** — Getting Started, Manuscript Builder, FAQ, and the rest of the user docs.
- **[File an issue](https://github.com/banisterious/obsidian-draft-bench/issues)** — bug reports and feature requests both welcome; the BRAT-public phase is when feedback shapes V1.x most.
