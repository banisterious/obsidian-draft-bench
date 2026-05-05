# How Draft Bench compares

Writers evaluating tools will compare. This page lays out where Draft Bench sits next to its closest neighbors — Longform, StoryLine, Scrivener, and plain-Obsidian-without-a-plugin — without slamming any of them. All four are reasonable choices for different writers.

The short version: Draft Bench is narrow on purpose. It handles the manuscript spine (projects, chapters, scenes, sub-scenes, drafts, compile) and stays out of plotting, entity management, and analytics. If you want one tool that covers the whole writing-craft surface, Draft Bench probably isn't it. If you want a focused tool for organizing scenes and compiling a manuscript, with Bases for queries and your own notes for world-building, Draft Bench is built for that.

---

## Draft Bench vs Longform

[Longform](https://github.com/kevboh/longform) is the original Obsidian writing plugin. Scene-as-note model, drag-to-reorder manuscript view, compile to single-file output. Quiet single-author maintenance, slower release cadence, and a solid track record with writers who want a minimal scene-and-compile tool.

Draft Bench is the closest spiritual descendant. The `Drafts/` and compile concepts owe a real debt to Longform's prior art. What Draft Bench adds:

- **Chapter as a first-class note type.** Longform's manuscript is a flat list of scenes; Draft Bench supports both the flat shape (chapter-less projects) and a two-level project -> chapter -> scene shape, with chapter-aware compile output.
- **Sub-scene as a first-class note type.** Break a scene into per-unit narrative blocks (the setpieces of an auction night, the movements of a trial sequence) when the scene-as-atom granularity isn't fine enough. Each sub-scene has its own status, drafts, word count, and reorder position; the Manuscript view renders hierarchical scenes as collapsible cards; compile descends into sub-scenes in narrative order.
- **Drafts as `dbench-type: draft`.** A noun, not a side-effect. Snapshots of scenes, chapters, sub-scenes, or single-scene projects live in a configurable `Drafts/` folder, queryable via Bases like any other note.
- **Compile presets as notes.** A preset is a `dbench-type: compile-preset` note with content-handling rules editable in the Properties panel. Multiple presets per project — workshop draft, agent submission, final manuscript — each with their own overrides.
- **Bidirectional linking with integrity service.** Stable IDs, plugin-maintained reverse arrays, batch repair UI for the cases that drift.
- **Bases-native discovery.** Starter `.base` views ship for projects, scenes, and drafts.

If Longform's minimal surface fits your workflow and you don't need chapters, sub-scenes, or draft-as-noun, stay with Longform. If you want the chapter shape, the sub-scene shape, the draft model, or the integrity service, Draft Bench is the fit.

---

## Draft Bench vs StoryLine

[StoryLine](https://github.com/PixeroJan/obsidian-storyline) (Jan Sandström) is a much broader Scrivener-in-Obsidian — kitchen-sink in the best sense. Multi-view (Corkboard, Kanban Board, Plotgrid, Timeline, Plotlines subway map, Manuscript Scrivenings-style continuous editor, Characters, Locations, Navigator, Stats), Codex hub for entity types, beat-sheet templates, plot-hole detection, pacing analysis, Scrivener `.scriv` import, six export formats, series mode. Very actively shipping.

Draft Bench and StoryLine answer different questions:

- **StoryLine asks: what if every Scrivener feature lived in Obsidian?** And ships an answer with breadth and pace.
- **Draft Bench asks: what's the minimum a novelist needs for the manuscript spine, in a way that respects Obsidian's frontmatter-native conventions?** And stays narrow.

Concrete differences:

| | Draft Bench | StoryLine |
|---|---|---|
| Manuscript spine (projects, chapters, scenes) | ✓ | ✓ |
| Sub-scenes (per-unit narrative blocks within a scene) | ✓ (first-class type) | — |
| Drafts as snapshots | ✓ (first-class type) | Limited |
| Compile to MD / PDF / ODT / DOCX | ✓ | ✓ (six formats) |
| Plotting (corkboard, plotgrid, timeline) | — | ✓ |
| Character / location / entity management | — | ✓ |
| Analytics (pacing, plot-hole, prose) | — | ✓ |
| Scrivener `.scriv` import | Post-V1 candidate | ✓ |
| Bases-native discovery | ✓ | — |
| Frontmatter properties | ✓ (`dbench-` namespaced) | ✓ (un-prefixed keys) |
| Bidirectional-link integrity service | ✓ | — |

If you want one plugin that does everything, StoryLine is the right choice. If you want a focused tool that handles the manuscript spine and leaves the rest to Bases queries, plain notes, or sibling plugins like [Charted Roots](https://github.com/banisterious/charted-roots), Draft Bench is built for that.

---

## Draft Bench vs Scrivener

[Scrivener](https://www.literatureandlatte.com/scrivener/overview) is the established industry tool, and for many novelists it remains the best fit. Its binder, corkboard, and compile pipeline are mature in ways no Obsidian plugin will match in V1.

The real question isn't "Draft Bench vs Scrivener." It's "do I want my writing to live in my Obsidian vault?" If the answer is yes — because your research, journal, daily notes, and reference material are already there, or because you value markdown portability over Scrivener's project-format lock-in — then Draft Bench is one option for the manuscript-organization piece.

Where Draft Bench fits Scrivener users:

- **Project / chapter / scene / sub-scene / draft model maps cleanly to Scrivener's binder.** Most novelist binder structures port over without conceptual translation; nested binder items (a scene with multiple beats) map to scene -> sub-scene.
- **Compile to Markdown, PDF, ODT, and DOCX** covers the formats writers actually submit.
- **Snapshots become drafts.** Scrivener's per-document snapshots have a near-equivalent in Draft Bench's `dbench-type: draft`.

Where it doesn't:

- **Corkboard plotting, character sheets, research-folder management, label/keyword cross-referencing, name-generator, project-statistics dashboards.** None of these are V1 scope. Some are post-V1 candidates; some are explicitly out of scope (entity management belongs to [Charted Roots](https://github.com/banisterious/charted-roots) or to user-managed plain notes).
- **Scrivener `.scriv` import.** Post-V1 candidate, not V1.

Some writers will run both: Scrivener for the writing-room work, Obsidian + Draft Bench for everything else. Some will move fully into Obsidian. Both are reasonable.

---

## Draft Bench vs plain Obsidian

The "do nothing" alternative is also a reasonable choice. Obsidian without a writing plugin still gives you markdown files, frontmatter, links, and Bases — enough to manage a manuscript by hand if you're disciplined about conventions.

What Draft Bench adds over plain Obsidian:

- **Convention enforcement.** A scene is a `dbench-type: scene` note with a `dbench-project` link and a `dbench-order` integer. The plugin maintains the conventions; you don't have to remember them.
- **Manuscript view + Manuscript Builder.** A workspace view that shows your manuscript in order with word-count rollups and status chips, plus a Builder surface for tuning compile presets and previewing output — instead of a Bases table you have to set up and maintain and a manual compile script.
- **Reverse arrays.** When you link a scene to a project, the project's `dbench-scenes` array updates automatically. Maintaining bidirectional links by hand is the kind of vault chore that drifts within a week.
- **Compile.** Concatenating 60 scene files into one manuscript with frontmatter stripped, footnotes renumbered, embeds handled, and section breaks normalized — possible by hand, painful in practice.
- **Drafts.** A snapshot system that lives as queryable notes rather than git-history blobs you only retrieve when something goes wrong.

If you're a one-novel writer who prefers minimal tooling and doesn't mind hand-rolling conventions, plain Obsidian works. If you're managing multiple projects, juggling many drafts, or want compile output for submission, Draft Bench is the time-saver.

---

## What about coexistence with another writing plugin?

Draft Bench's `dbench-` frontmatter prefix is namespaced so it doesn't collide with other plugins' properties. Coexisting with Longform or StoryLine in the same vault is technically possible — nothing in Draft Bench fights them — but the manuscript-spine scope overlaps, and most writers will pick one tool to drive the manuscript.

The exception: [Charted Roots](https://github.com/banisterious/charted-roots) is the sibling plugin, designed to coexist with Draft Bench by design. Charted Roots owns world-building (entities, relationships, characters, locations, timelines); Draft Bench owns the narrative spine (projects, chapters, scenes, sub-scenes, drafts, compile). Two focused plugins, one shared vault, no overlap.
