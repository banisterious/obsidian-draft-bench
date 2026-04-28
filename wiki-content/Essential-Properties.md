# Essential Properties

Draft Bench manages notes via frontmatter properties prefixed with `dbench-`. This page is a cheat sheet. For the full data model, see the [specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md).

---

## Core properties (on every plugin-managed note)

| Property | Type | Description |
|---|---|---|
| `dbench-type` | string | Note role: `project`, `chapter`, `scene`, `draft` (V1). Future: `character`, `beat`, etc. |
| `dbench-id` | string | Stable identifier, format `abc-123-def-456`. Stamped at creation; never changes. |
| `dbench-project` | wikilink | The project this note belongs to. |
| `dbench-project-id` | string | Stable-ID companion to `dbench-project`. |

## Project (`dbench-type: project`)

| Property | Type | Description |
|---|---|---|
| `dbench-project-shape` | string | `folder` or `single`. |
| `dbench-status` | string | `idea`, `draft`, `revision`, `final` (default workflow). |
| `dbench-scenes` | array of wikilinks | Reverse array of direct scene notes (chapter-less projects), maintained by the linker. |
| `dbench-scene-ids` | array of strings | Stable-ID companions for `dbench-scenes`. |
| `dbench-chapters` | array of wikilinks | Reverse array of chapter notes (chapter-aware projects), maintained by the linker. |
| `dbench-chapter-ids` | array of strings | Stable-ID companions for `dbench-chapters`. |

A project's top-level children are *either* all chapters *or* all direct scenes — never both. See [Projects, Chapters, and Scenes](Projects-And-Scenes).

## Chapter (`dbench-type: chapter`)

| Property | Type | Description |
|---|---|---|
| `dbench-order` | number | Sort position within the project. |
| `dbench-status` | string | Workflow status per default vocabulary. |
| `dbench-target-words` | number (optional) | Per-chapter authoring target, surfaces as a chapter-card progress bar. |
| `dbench-synopsis` | string (optional) | Short summary surfaced as a chapter-card subline. |
| `dbench-scenes` | array of wikilinks | Reverse array of scenes in this chapter, maintained by the linker. |
| `dbench-scene-ids` | array of strings | Stable-ID companions for `dbench-scenes`. |
| `dbench-drafts` | array of wikilinks | Reverse array of chapter-level draft snapshots. |
| `dbench-draft-ids` | array of strings | Stable-ID companions for `dbench-drafts`. |

## Scene (`dbench-type: scene`)

| Property | Type | Description |
|---|---|---|
| `dbench-order` | number | Sort position within the scene's immediate parent (the project for chapter-less, the chapter for chapter-aware). |
| `dbench-status` | string | Workflow status per default vocabulary. |
| `dbench-chapter` | wikilink (optional) | Parent chapter, on scenes-in-chapters only. Absent / empty on direct scenes in chapter-less projects. |
| `dbench-chapter-id` | string (optional) | Stable-ID companion to `dbench-chapter`. |
| `dbench-target-words` | number (optional) | Per-scene authoring target; surfaces as a per-scene progress bar in the Manuscript view. |
| `dbench-subtitle` | string (optional) | Short second-line text under the scene title in the Manuscript view. Useful for POV markers, time stamps, setting cues, or descriptors that disambiguate similarly-titled scenes. |
| `dbench-drafts` | array of wikilinks | Reverse array of prior scene draft snapshots. |
| `dbench-draft-ids` | array of strings | Stable-ID companions for `dbench-drafts`. |

## Draft (`dbench-type: draft`)

| Property | Type | Description |
|---|---|---|
| `dbench-scene` | wikilink | The parent scene (for scene-level drafts). Empty for chapter or single-scene-project drafts. |
| `dbench-scene-id` | string | Stable-ID companion to `dbench-scene`. |
| `dbench-chapter` | wikilink | The parent chapter (for chapter-level drafts). Empty for scene or single-scene-project drafts. |
| `dbench-chapter-id` | string | Stable-ID companion to `dbench-chapter`. |
| `dbench-draft-number` | number | Sequential draft number per parent; plugin-managed. |

A draft's target type is implicit: scene drafts carry `dbench-scene`, chapter drafts carry `dbench-chapter`, single-scene-project drafts carry only the project ref. See [Drafts and Versioning](Drafts-And-Versioning).

---

## ID format

Stable identifiers follow the pattern `abc-123-def-456` — three lowercase letters, three digits, three lowercase letters, three digits. The format is:

- Visually legible at a glance (unlike UUIDs).
- Collision-resistant at realistic vault sizes.
- Line-of-sight stable (not time-encoded; rearranging notes doesn't reshape IDs).
- Shared with Charted Roots for cross-plugin consistency.

## Rename safety

When you rename a note inside Obsidian, the app automatically updates wikilinks in frontmatter. Draft Bench additionally carries stable-ID companions (`-id` suffix) for every wikilink relationship, so references survive moves made via non-Obsidian tools or sync relocations. If any inconsistency occurs, the **Repair project links** command (see [Settings and Configuration](Settings-And-Configuration)) reconciles forward and reverse references.

## How properties are written

The plugin writes all properties through Obsidian's `FileManager.processFrontMatter` — safe, non-destructive, and preserves other tools' properties alongside `dbench-*`. You can also edit properties directly via Obsidian's Properties panel.

## Empty values after retrofit

When you use **Set as scene** (or similar) on a note that's not yet associated with a project, `dbench-project` is stamped as an empty string. Fill it in via the Properties panel to attach the scene to a project. A Phase 2 picker modal will streamline this. See [Context Menu Actions](Context-Menu-Actions).
