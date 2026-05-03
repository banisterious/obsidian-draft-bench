# FAQ

Common questions about Draft Bench. Add your own via [GitHub Discussions](https://github.com/banisterious/obsidian-draft-bench/discussions).

---

## How is Draft Bench different from Longform?

Draft Bench and Longform share core ideas — scene-based writing, project structure in Obsidian. Draft Bench differs in:

- **Per-scene versioned drafts as first-class files.** Every "new draft" creates a real markdown file you can open, link, tag, and query.
- **Frontmatter-native data model.** Membership and relationships live in `dbench-*` properties. No index file, no parallel JSON store. Native Obsidian Bases compatibility.
- **Flexible folder structure.** Scenes can live anywhere in your vault; the plugin identifies them by frontmatter, not folder location.
- **Compile without JavaScript.** A form-based Book Builder supports compile presets, scene selection, and multi-format export.

## How is Draft Bench different from StoryLine?

Draft Bench is narrow on purpose. It handles the manuscript spine — projects, chapters, scenes, drafts, compile — and stays out of the rest. If you want one plugin that also tracks characters, locations, plot grids, beat sheets, timelines, and stats, [StoryLine](https://github.com/PixeroJan/obsidian-storyline) is excellent at that and very actively shipping.

If you want a focused tool for organizing scenes, snapshotting drafts, and compiling a manuscript — with Bases for everything else and your own notes (or a sibling plugin like [Charted Roots](https://github.com/banisterious/charted-roots)) for world-building — Draft Bench is built for that.

The two coexist fine: namespaces don't collide, and a vault can run both. Choose by which scope feels right for your workflow.

## Do I have to use chapters?

No. Chapters are optional. Short-story collections, novellas without chapter divisions, and any project you'd rather keep flat can stay chapter-less — scenes attach directly to the project as in earlier Draft Bench builds. Choose the shape that matches the work.

## Can I add chapters to a project I already started without them?

Yes, but the conversion is manual. The plugin enforces a no-mixed-children rule (a project's top-level children are *either* all chapters *or* all direct scenes, never both), so you'll need to:

1. Create the chapter notes you want (**New chapter in project** is refused until step 2 below; you can stage them in a different folder first, or create the project's first chapter only after step 2).
2. Move every direct scene into a chapter using **Move to chapter** (right-click a scene in a chapter-aware project), or by editing each scene's `dbench-chapter` and `dbench-chapter-id` properties manually.

Going the other direction (flattening a chapter-aware project) is the same in reverse: remove `dbench-chapter` from each scene, then delete the empty chapter notes. The integrity service (**Repair project links**) flags any mismatches along the way.

See [Projects, Chapters, Scenes, and Sub-scenes § Converting between shapes](Projects-And-Scenes#converting-between-shapes).

## What's a sub-scene? Do I need them?

A **sub-scene** is a unit of prose smaller than a scene — useful when one scene has multiple distinct narrative units that you want to track independently (per-unit status, per-unit drafts, reorderable). A memoir scene with six vignettes; an act broken into beats; a montage of moments. Each sub-scene is its own note.

Most scenes don't need them. Internal beats inside a flat scene live as headings in the body — that's the lighter-weight option and remains the default. Reach for sub-scenes only when the per-unit tracking is actually worth it. The choice is per-scene, not per-project: flat scenes coexist with hierarchical scenes inside the same chapter or project. See [Projects, Chapters, Scenes, and Sub-scenes § Sub-scenes](Projects-And-Scenes#sub-scenes).

## What's the difference between a scene draft, a chapter draft, and a sub-scene draft?

- **Scene draft** — snapshots one scene's body. For flat scenes, that's the whole scene. For [hierarchical scenes](Projects-And-Scenes#sub-scenes) (those with sub-scenes), it concatenates the scene's intro `## Draft` + each sub-scene's body in order.
- **Chapter draft** — snapshots the chapter body plus every child scene's body, concatenated in order with HTML-comment scene boundaries. For a structural pass that touches multiple scenes.
- **Sub-scene draft** — snapshots one sub-scene's body. For polishing one unit in isolation.

All three share the same `Drafts/` folder; their frontmatter parent ref (`dbench-scene` / `dbench-chapter` / `dbench-sub-scene`) disambiguates them. See [Drafts and Versioning](Drafts-And-Versioning).

## Does it work on mobile?

V1 is desktop-only. Mobile support is under post-V1 evaluation — the primary UX (Manuscript view, Manuscript Builder, reorder modal, Style Settings integration) was designed for a desktop form factor.

## Can I use existing notes?

Yes. Right-click any note (or folder, or multi-selection) and use one of the [retrofit actions](Context-Menu-Actions): **Set as project / scene / draft**, **Complete essential properties**, or **Add identifier**. All are idempotent and never overwrite existing data.

## Where does my draft history live?

In a `Drafts/` folder. Default placement is inside each project folder; three options are configurable (project-local, per-scene, vault-wide). Draft files are plain markdown with frontmatter — you own them, and they're readable without the plugin.

## What happens if I rename a project note?

Obsidian automatically updates wikilinks in all scenes' `dbench-project` properties. Draft Bench additionally carries a `dbench-project-id` stable identifier as a backup reference, so the relationship survives renames even in edge cases (non-Obsidian renames, sync races). If any inconsistency occurs, the **Repair project links** command reconciles forward and reverse references.

## What happens if I move scenes to a different folder?

Nothing breaks. Draft Bench identifies scenes by their `dbench-project` frontmatter, not by folder location. You can reorganize your vault however you want — by date, by status, by part — and the plugin continues to work.

## Can I remove the plugin and keep my files?

Yes. Every note is plain markdown with YAML frontmatter. Disabling or uninstalling the plugin doesn't alter your notes — they remain human-readable and editable in any markdown editor. Other frontmatter readers (Bases, Dataview) continue to see the `dbench-*` properties as normal frontmatter.

## Is there an AI writing assistant?

No. Draft Bench is deliberately not an AI writing assistant and does not call language models, generate prose, or rewrite your text. The plugin provides structural and workflow scaffolding; the words are yours. See the [specification § Non-goals](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md).

## Why doesn't file-explorer order match story order?

Story order is determined by the `dbench-order` frontmatter property, not by filename. This lets you reorder scenes cheaply (no file or folder renames, no wikilink cascade) and organize files by any other criterion (status, POV, date) without breaking manuscript order. The **Manuscript view** (the dockable pane in the right sidebar) is the canonical ordered view.

## Can I use Draft Bench alongside other Obsidian plugins?

Yes. Draft Bench stays out of the way of other plugins: it uses namespaced properties (`dbench-*`), namespaced CSS classes (`.dbench-` / `.draft-bench-`), and does not modify Obsidian's editor behavior beyond applying CSS classes. Known-compatible plugins include Templater, Style Settings, Bases, Dataview, and any community sort-plugin that reads frontmatter.

---

*More questions and answers will be added based on real user questions in GitHub Discussions.*
