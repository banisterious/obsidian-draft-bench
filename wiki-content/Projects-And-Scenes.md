# Projects, Chapters, Scenes, and Sub-scenes

Projects are the top-level container for a writing work. Scenes are the units of manuscript content within them. **Chapters** are an optional grouping layer between projects and scenes — natural for novels, but never required. **Sub-scenes** are an optional layer below scenes — useful when a scene has internal beats that warrant their own status, drafts, or reordering. Both layers are opt-in; flat scenes inside chapter-less projects are still a first-class shape.

---

## Project shapes

Draft Bench supports two project shapes, distinguished by the `dbench-project-shape` property on the project note.

### Folder project (default)

A folder containing a project note and its child notes. Suitable for novels, novellas, short-story collections, and any project where you'll have multiple scenes. Drafts of individual scenes (or chapters) live in a configurable subfolder (default `Drafts/`).

A folder project comes in two flavors that you can choose at creation time and convert between later:

- **Chapter-less** (flat). Scenes attach directly to the project. The simpler shape; suitable for short-story collections, novellas without chapter divisions, or anyone who doesn't want chapter-level structure.
- **Chapter-aware**. Scenes attach to chapters, and chapters attach to the project. The novel shape; gives you per-chapter word-count rollups, per-chapter status, chapter-level draft snapshots, and chapter-aware compile output.

The plugin enforces a **no-mixed-children** rule: a project's top-level children are *either* all chapters *or* all direct scenes, never both. Prologues, interludes, and epilogues in a chapter-aware project are modeled as single-scene chapters (a chapter note with one scene as its sole child) rather than as orphan scenes alongside chapters.

### Single-scene project

A single note that *is* the whole project. Suitable for flash fiction, poems, or short pieces that don't need scene structure. The project note's body holds the current working draft directly. When you take a new draft, the plugin creates a drafts folder at that moment.

A writer can graduate a single-scene project into a folder project later by creating a project folder around the note and adding scene notes.

---

## Chapters

Chapter notes carry a body in the same shape as scene notes — planning sections (Source passages / Beat outline / Open questions) plus a `## Draft` section. The chapter's `## Draft` is for **chapter-introductory prose only**: epigraphs, opening framing, time-of-year setting. It emits before the chapter's scenes in compile output, not interleaved between them. Most chapters leave it empty; the planning sections are usually where the chapter body earns its keep.

### Creating chapters

- Palette: **Draft Bench: New chapter in project**
- Right-click a project note (or a folder inside the project) -> **Draft Bench** -> **New chapter in project**

Refused (with a notice) on chapter-less projects that already have direct scenes — the no-mixed-children rule requires moving those scenes into a chapter first via the **Move to chapter** action.

### Chapter ordering

Chapter order is at the project level, on the chapter note's `dbench-order` property. Reorder via the **Reorder chapters in project** modal, opened from:

- The Manuscript view's toolbar.
- The command palette: **Draft Bench: Reorder chapters in project**.

### Chapter properties

Beyond the standard `dbench-type: chapter`, `dbench-id`, `dbench-project`, `dbench-status`, `dbench-order`, chapters support two optional fields:

- `dbench-target-words` — chapter-level authoring target. Surfaces a per-chapter progress bar in the Manuscript view's chapter card.
- `dbench-synopsis` — short summary surfaced as an index-card subline in the chapter card.

Both are writer-set via the Properties panel; neither is stamped at creation.

### Converting between shapes

Chapter-less and chapter-aware projects coexist forever. Conversion is manual — there is no auto-grouping retrofit:

- **Add chapters to a chapter-less project**: first move every direct scene into a chapter (via **Move to chapter** on each scene, or by editing `dbench-chapter` in the Properties panel), then create chapters with **New chapter in project**.
- **Flatten a chapter-aware project**: remove each scene's `dbench-chapter` and `dbench-chapter-id` properties, then delete the chapter notes. The integrity service can flag any inconsistencies via **Repair project links**.

---

## Scenes

A scene is a single unit of manuscript content. Scenes live as standalone markdown notes with `dbench-type: scene`.

### Creating scenes

- Palette: **Draft Bench: New scene in project** (chapter-less project) or new scene inside the active chapter
- Right-click context menu inside a project folder

In a chapter-aware project, scene creation prompts for the parent chapter (or scopes to it automatically when invoked from a chapter note).

### Scene ordering

Story order comes from the `dbench-order` property. **Order is within the scene's immediate parent** — within the project for chapter-less scenes, within the chapter for scenes-in-chapters.

Reordering happens in a dedicated modal, opened from:

- The Manuscript view's toolbar.
- The scene's right-click context menu.
- The command palette: **Draft Bench: Reorder scenes**.

The modal is context-aware: invoked on a scene-in-chapter, it scopes to that chapter; invoked on a chapter-less project, it scopes to the project's flat scene list. Cross-chapter scene moves use **Move to chapter** instead.

File and folder names are **never** renamed on reorder — only `dbench-order` changes. This keeps wikilinks, git history, and sync relationships intact.

**Important:** file-explorer alphabetical sort will not match story order. The Manuscript view (the dockable pane in the right sidebar) is the canonical ordered view.

### Moving a scene between chapters

Right-click a scene in a chapter-aware project -> **Draft Bench** -> **Move to chapter**. A modal opens with a chapter picker; on confirm, the scene's `dbench-chapter` and `dbench-chapter-id` are updated and both the source and target chapters' reverse arrays sync via the linker.

Single-file scope in V1 — bulk multi-select moves are post-V1.

---

## Sub-scenes

Sub-scenes are an optional third structural level — units of prose smaller than a scene. Useful when a scene has internal beats you want to track separately: a memoir scene with multiple narrative units, an act broken into vignettes, a montage with distinct moments. Each sub-scene is its own note with its own status, draft history, and word count.

Sub-scene-awareness is **per-scene, not per-project**. Any scene in any folder project (chapter-less or chapter-aware) can opt into sub-scenes; flat scenes coexist with hierarchical scenes inside the same chapter or project. There is no project shape called "sub-scene-aware" and no need to commit a whole project to the pattern.

When a scene has sub-scenes, the scene's own `## Draft` becomes **introductory prose** — usually a one-line orientation. The sub-scenes carry the bulk of the manuscript content. Compile output reflects this: in chapter mode, hierarchical scenes get an `## H2` heading and their sub-scenes get `### H3`; in draft / full mode, the scene is `# H1` and sub-scenes are `## H2`.

### When to reach for sub-scenes

Reach for sub-scenes when one of these is true and you want it tracked:

- A scene has multiple distinct narrative units that you want to **revise independently** (status per unit, drafts per unit).
- You want to **reorder** beats within a scene without rewriting the prose to bridge.
- A scene's internal structure is large enough that you want each unit to be its own file in your editor (open one, work on it, close it).

If none of those apply, leave the scene flat. Beats inside a flat scene live as headings in the body — that's the lighter-weight option and remains the default.

### Sub-scene body shape

Sub-scene notes use the same template shape as scenes — planning sections plus a `## Draft` section — with one difference: the planning section is `## Outline` instead of `## Beat outline`. At sub-scene level, beats are body-level structure (headings inside `## Draft`), so a generic "Outline" avoids the recursive feel of "outline beats inside the sub-scene that *is* a beat."

### Creating sub-scenes

- Palette: **Draft Bench: New sub-scene in scene** (only available when the active note is a scene — the parent context is implicit).
- Manuscript view: click the "New sub-scene" icon button on a hierarchical scene-card's header.

### Sub-scene ordering

Sub-scene order is within the parent scene, on the sub-scene note's `dbench-order` property. Reorder via the **Reorder sub-scenes in scene** modal, opened from:

- The command palette: **Draft Bench: Reorder sub-scenes in scene**.
- A right-click on the parent scene or any of its sub-scenes inside the **Draft Bench** submenu.

### Moving a sub-scene between scenes

Right-click a sub-scene -> **Draft Bench** -> **Move to scene**. A modal opens with a scene-picker scoped to the same project; on confirm, the sub-scene's `dbench-scene` and `dbench-scene-id` are updated and both the source and target scenes' reverse arrays sync via the linker.

Single-file scope in V1 — bulk multi-select moves are post-V1.

### Sub-scene folder layout

By default, sub-scenes nest in a folder named after the parent scene (`subScenesFolder: '{scene}/'` setting). For a chapter-less project:

```
Things That Transpired/
├── Things That Transpired.md
├── Too Good To Pass Up.md       ← flat scene
├── The Quiet Hour.md            ← hierarchical scene
├── The Quiet Hour/              ← sub-scene folder
│   ├── The last patron.md       ← sub-scene
│   └── The phone call.md        ← sub-scene
└── Wax And Iron.md              ← flat scene
```

If you rename a parent scene file (e.g., `The Quiet Hour.md` -> `The Quiet Hour (revised).md`), the sub-scene folder auto-renames to match. Rename-watcher gated on the `subScenesFolder` template containing `{scene}` — writers using flat or non-`{scene}` layouts opt out.

For chapter-aware projects, sub-scenes currently land at the project folder level (`<projectFolder>/<sceneName>/`), one level above the chapter folder. A `{chapter}` token to nest them under the chapter folder is a planned pre-1.0 fix.

### Retrofitting an existing note as a sub-scene

Right-click a markdown note -> **Draft Bench** -> **Set as sub-scene**. The note gets `dbench-type: sub-scene` plus parent refs inferred from its folder location (when the immediate folder contains exactly one scene note). Otherwise the parent refs are stamped empty and you fill them in via the Properties panel or **Move to scene**.

When the inferred parent scene already has whole-scene drafts, **Set as sub-scene** surfaces a one-time transition notice clarifying that future drafts can snapshot the whole scene or individual sub-scenes — see the [Drafts and Versioning § Sub-scene drafts](Drafts-And-Versioning) page for what that choice looks like in practice.

---

## Folder flexibility

Draft Bench identifies notes by frontmatter, not folder location. You can organize your vault however you prefer — scenes and chapters can live in any folder. The plugin treats them as part of their project because their `dbench-project` property still points at the project note.

This means you can:

- Group scenes by status in folders like `Drafted/`, `Revising/`, `Final/`.
- Keep all chapter notes flat in the project folder, or nest them in `Chapters/`, `Parts/Part 1/`, etc.
- Mix Draft Bench notes with unrelated vault content.
- Move notes around freely; nothing breaks.
- Work in vaults that also host journals, research, or other plugins' notes.

See the [specification § Project Structure on Disk](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md) for the full discussion.

