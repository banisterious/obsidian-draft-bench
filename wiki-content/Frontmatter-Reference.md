# Frontmatter Reference

Complete inventory of every `dbench-` frontmatter property the plugin reads or writes. Use this for Bases query authoring, Templater scripts, Linter sort-order configuration, sync tools, or any other surface that needs to know about every key in the schema.

For the everyday cheat sheet (project / chapter / scene / sub-scene / draft, common case), see [Essential Properties](Essential-Properties).

---

## Conventions

- **Prefix.** Every plugin-managed key starts with `dbench-`. Properties without the prefix are not Draft Bench's; the plugin never reads or writes them.
- **ID format.** Stable identifiers follow the pattern `abc-123-def-456` (three lowercase letters, three digits, three lowercase letters, three digits). Stamped at note creation; never changes for the lifetime of the note.
- **Plugin-managed vs user-editable.** Most properties are user-editable through Obsidian's Properties panel; some are plugin-managed (stamped by creation flows or maintained by the linker / compile pipeline) and should not be hand-edited. Each entry below labels which.
- **Where stored.** All properties are written through Obsidian's `FileManager.processFrontMatter`, which preserves other tools' frontmatter alongside `dbench-*` keys. Both the Properties panel and direct YAML editing round-trip cleanly.
- **Wikilink + ID pairs.** Every relationship reference is a pair: a wikilink (`dbench-scene: "[[Sc01 - The Crossing]]"`) plus a stable-ID companion (`dbench-scene-id: "abc-123-def-456"`). The wikilink survives renames; the ID survives moves done outside Obsidian.

---

## 1. Identity and status

Properties that classify a note and hold its workflow state. Most apply to all plugin-managed types.

| Property | Type | Applies to | Plugin-managed | Description |
|---|---|---|---|---|
| `dbench-id` | string (`abc-123-def-456`) | all | yes | Stable identifier. Stamped at creation; never changes. |
| `dbench-type` | string | all | yes | Note role. One of `project`, `chapter`, `scene`, `sub-scene`, `draft`, `compile-preset`. |
| `dbench-schema-version` | number | compile-preset only | yes | Schema version of the compile-preset shape. Currently `1`. Distinct from plugin version; reflects the preset format only. |
| `dbench-status` | string | project, chapter, scene, sub-scene | no (writer-set) | Workflow status. Default vocabulary: `idea`, `draft`, `revision`, `final`. User-configurable in settings. |
| `dbench-order` | number | chapter, scene, sub-scene | no (writer-set; modal-assisted) | Sort position within the immediate parent. Each parent resets to 1, 2, 3... |
| `dbench-target-words` | number (optional) | project, chapter, scene, sub-scene | no (writer-set) | Opt-in authoring target. Drives progress-bar rendering in the Manuscript view. |
| `dbench-subtitle` | string (optional) | scene, sub-scene | no (writer-set) | Short second-line text under the title in Manuscript view rows. POV markers, time stamps, setting cues, descriptors that disambiguate similarly-titled scenes. |
| `dbench-synopsis` | string (optional) | chapter, sub-scene | no (writer-set) | Short summary surfaced in Manuscript view cards. On chapters, a one-line summary shown as the card subline; on sub-scenes, a short "what this unit does" tag. |
| `dbench-project-shape` | string | project only | yes (set on creation) | One of `folder` (project is a folder containing scene notes; the default) or `single` (project is a single note that is the whole work; for flash fiction, poems). |

---

## 2. Forward refs (parent pointers)

Wikilink + ID pairs that point a child note up to its parent. Empty string allowed for "orphan" notes created via retrofit before being attached to a parent.

| Property | Type | Applies to | Plugin-managed | Description |
|---|---|---|---|---|
| `dbench-project` | wikilink | chapter, scene, sub-scene, draft, compile-preset | yes (set on creation; writer can edit) | Wikilink to the parent project. May be `""` on retrofitted notes not yet attached. |
| `dbench-project-id` | string | chapter, scene, sub-scene, draft, compile-preset | yes (linker maintains pairing with `dbench-project`) | Stable-ID companion to `dbench-project`. |
| `dbench-chapter` | wikilink | scene (optional), draft (optional) | yes (set when creating into a chapter) | Wikilink to the parent chapter. On scenes, present only for scenes-in-chapters; absent for chapter-less projects. On drafts, present only for chapter-level drafts. |
| `dbench-chapter-id` | string | scene (optional), draft (optional) | yes | Stable-ID companion to `dbench-chapter`. |
| `dbench-scene` | wikilink | sub-scene, draft | yes | On sub-scenes, wikilink to the parent scene. On drafts, wikilink to the parent scene (scene-level drafts) or empty (chapter / sub-scene / single-scene-project drafts). |
| `dbench-scene-id` | string | sub-scene, draft | yes | Stable-ID companion to `dbench-scene`. |
| `dbench-sub-scene` | wikilink | draft (optional) | yes | Wikilink to the parent sub-scene. Present only for sub-scene-level drafts; absent for scene / chapter / single-scene-project drafts. |
| `dbench-sub-scene-id` | string | draft (optional) | yes | Stable-ID companion to `dbench-sub-scene`. |

---

## 3. Reverse arrays (children pointers on parents)

Wikilink-array + ID-array pairs maintained by the linker on parent notes. They mirror the forward refs from children. Hand-editing is unsafe; use the **Repair project links** command to reconcile divergence.

| Property | Type | Applies to | Plugin-managed | Description |
|---|---|---|---|---|
| `dbench-chapters` | array of wikilinks | project | yes (linker) | Reverse array of chapter children. Populated for chapter-aware projects; empty for chapter-less projects (chapters and direct scenes are mutually exclusive at the project level). |
| `dbench-chapter-ids` | array of strings | project | yes (linker) | Stable-ID companions to `dbench-chapters`. Index-paired with the wikilink array. |
| `dbench-scenes` | array of wikilinks | project, chapter | yes (linker) | Reverse array of scene children. On projects, present for chapter-less projects only. On chapters, the chapter's scene children. |
| `dbench-scene-ids` | array of strings | project, chapter | yes (linker) | Stable-ID companions to `dbench-scenes`. |
| `dbench-sub-scenes` | array of wikilinks | scene (optional) | yes (linker) | Reverse array of sub-scene children. Optional because flat scenes (no sub-scenes) never gain the field; existing scenes from before sub-scene-type ratification also lack it until they sprout their first sub-scene. |
| `dbench-sub-scene-ids` | array of strings | scene (optional) | yes (linker) | Stable-ID companions to `dbench-sub-scenes`. |
| `dbench-drafts` | array of wikilinks | chapter, scene, sub-scene | yes (linker) | Reverse array of draft snapshots taken of this note. |
| `dbench-draft-ids` | array of strings | chapter, scene, sub-scene | yes (linker) | Stable-ID companions to `dbench-drafts`. |
| `dbench-compile-presets` | array of wikilinks | project | yes (linker) | Reverse array of compile-preset notes attached to the project. |
| `dbench-compile-preset-ids` | array of strings | project | yes (linker) | Stable-ID companions to `dbench-compile-presets`. |

The linker pairs reverse arrays by index and sorts by each child's `dbench-order` so frontmatter inspection mirrors narrative order.

---

## 4. Sub-scene fields

In addition to the identity, status, and forward-ref fields above, sub-scenes use the same `dbench-section-break-*` fields as scenes (covered in § 5).

A scene with sub-scenes treats its body's `## Draft` as scene-introductory prose only; the sub-scene bodies hold the units themselves. The compile pipeline descends into sub-scenes in `dbench-order`, preserving the parent scene's intro prose at the head of the compiled chapter.

---

## 5. Section break (draft-side)

Per-scene and per-sub-scene overrides that emit a named section break before the scene / sub-scene at compile time. Gated by the preset-level `dbench-compile-include-section-breaks` toggle (§ 6).

| Property | Type | Applies to | Plugin-managed | Description |
|---|---|---|---|---|
| `dbench-section-break-title` | string (optional) | scene, sub-scene | no (writer-set) | Title shown before this scene / sub-scene at compile. Absence means no break; presence triggers the break. |
| `dbench-section-break-style` | `visual` \| `page-break` | scene, sub-scene | no (writer-set) | Render hint for the break. `visual` (default) = centered title between dinkus lines; `page-break` = begin a new page in PDF / ODT output. The markdown intermediate renders both identically; renderers honor `page-break` when supported. |

---

## 6. Draft fields

Draft notes carry one or more parent refs (covered in § 2) plus a draft number. The combination of which parent refs are set tells the draft target type implicitly:

- **Scene draft** — `dbench-scene` set; chapter / sub-scene refs absent.
- **Chapter draft** — `dbench-chapter` set; scene / sub-scene refs absent.
- **Sub-scene draft** — `dbench-sub-scene` set; scene / chapter refs absent (the sub-scene's own scene ref is sufficient context).
- **Single-scene-project draft** — only `dbench-project` set; scene / chapter / sub-scene refs all empty.

| Property | Type | Applies to | Plugin-managed | Description |
|---|---|---|---|---|
| `dbench-draft-number` | number | draft | yes | Sequential draft number per parent (1, 2, 3...). Inferred from existing drafts of the same parent at "new draft" time; writers do not number manually. |

---

## 7. Compile-preset configuration

Compile presets are first-class vault notes (`dbench-type: compile-preset`). The note IS the configuration; editable via the Properties panel, the Manuscript Builder modal's Compile tab, or any other frontmatter surface. The schema is deliberately flat (no nested objects) because Obsidian's Properties panel does not round-trip nested structures.

### 7a. Output

| Property | Type | Default | Description |
|---|---|---|---|
| `dbench-compile-format` | `md` \| `pdf` \| `odt` \| `docx` | `md` | Output format. |
| `dbench-compile-output` | `vault` \| `disk` | `vault` | Where the compiled file is written. `vault` keeps the output inside the project; `disk` opens an OS save dialog. |
| `dbench-compile-page-size` | `letter` \| `a4` | `letter` | Page size for paginated formats (PDF, ODT, DOCX). Ignored for `md`. |

### 7b. Heading control

| Property | Type | Default | Description |
|---|---|---|---|
| `dbench-compile-heading-scope` | `draft` \| `full` \| `chapter` | `draft` | Which body sections of source notes are concatenated. `draft` = `## Draft` only; `full` = the whole body; `chapter` = chapter-level scope. |
| `dbench-compile-chapter-numbering` | `none` \| `numeric` \| `roman` | `none` | Whether to prepend chapter numbers to chapter headings in the output. |

### 7c. Content handling

Per-preset overrides that transform source content during compile.

| Property | Type | Default | Description |
|---|---|---|---|
| `dbench-compile-frontmatter` | `strip` \| `preserve` | `strip` | Whether to keep source-note frontmatter in the compiled output. |
| `dbench-compile-wikilinks` | `display-text` \| `strip` \| `preserve-syntax` | `display-text` | How to render `[[wikilinks]]` in the compiled output. `display-text` keeps the visible label; `strip` removes the link entirely; `preserve-syntax` keeps the brackets. |
| `dbench-compile-embeds` | `strip` \| `resolve` | `strip` | How to handle `![[embeds]]`. V1 ships `strip` only; `resolve` is reserved. |
| `dbench-compile-dinkuses` | `preserve` \| `normalize` | `preserve` | Whether to normalize dinkuses (`* * *`, `* *`, `…`) to a single canonical form. |

### 7d. Inclusion toggles

| Property | Type | Default | Description |
|---|---|---|---|
| `dbench-compile-include-section-breaks` | boolean | `true` | Master switch for the per-scene and per-sub-scene `dbench-section-break-*` mechanism (§ 5). When `false`, all section-break titles are suppressed. |
| `dbench-compile-include-toc` | boolean | `false` | Whether to emit a table of contents in the compiled output. |
| `dbench-compile-include-cover` | boolean | `false` | Whether to emit a cover page (PDF / ODT / DOCX). Ignored for `md`. |

### 7e. Compiled-output frontmatter

Strings that populate the compiled output's title page, header, or document metadata. Empty defaults fall back to the project title and plugin settings at compile time.

| Property | Type | Default | Description |
|---|---|---|---|
| `dbench-compile-title` | string | `""` | Title for the compiled work. Empty falls back to the project title. |
| `dbench-compile-subtitle` | string | `""` | Subtitle for the compiled work. |
| `dbench-compile-author` | string | `""` | Author byline for the compiled work. Empty falls back to the plugin's default author setting. |
| `dbench-compile-date-format` | `iso` \| `mdy` \| `dmy` \| `ymd` | `iso` | Date-format token used in compile-time substitutions (e.g., for filename templates). |

### 7f. Scope narrowing

Filters that narrow which scenes are included in this preset's output.

| Property | Type | Default | Description |
|---|---|---|---|
| `dbench-compile-scene-source` | `auto` | `auto` | How scenes are gathered. V1 ships `auto` only (project's scenes in `dbench-order`); `explicit` is reserved post-V1. |
| `dbench-compile-scene-statuses` | array of strings | `[]` | Whitelist of scene statuses to include. Empty array = include all statuses. |
| `dbench-compile-scene-excludes` | array of strings | `[]` | List of scene wikilinks (or basenames) to exclude even if they otherwise match. |

---

## 8. Template fields

Template notes are markdown files with `dbench-template-*` frontmatter that surface in the New Scene / New Chapter / New Sub-scene modals' template pickers.

| Property | Type | Applies to | Plugin-managed | Description |
|---|---|---|---|---|
| `dbench-template-type` | `scene` \| `chapter` \| `sub-scene` | template | no (writer-set) | Which note type this template applies to. Determines which picker the template appears in. |
| `dbench-template-name` | string (optional) | template | no (writer-set) | Display name shown in the picker. Falls back to the file's basename when absent. |
| `dbench-template-description` | string (optional) | template | no (writer-set) | One-line hint shown in the picker under the name. |

---

## 9. Plugin-managed state

These properties are written by the compile pipeline as run state. They round-trip through frontmatter so post-compile inspection works in Bases or any other reader, but **they should not be hand-edited** — manual changes either get overwritten on the next compile or confuse the change-detection used to surface "what's new since the last compile" in the Manuscript view.

| Property | Type | Applies to | Plugin-managed | Description |
|---|---|---|---|---|
| `dbench-last-compiled-at` | string (ISO timestamp) | compile-preset | yes | When this preset was last successfully compiled. Empty string = never compiled yet. |
| `dbench-last-output-path` | string | compile-preset | yes | Vault path (or absolute path for `output: disk`) to the most recent compile output. |
| `dbench-last-chapter-hashes` | array of strings | compile-preset | yes | Per-chapter content hashes from the last compile, formatted as `"<chapter-id>:<hash>"` strings. Used to surface "changed since last compile" indicators. |

---

## 10. Recommended sort order

A canonical sort order suitable for use with the Linter community plugin (or any tool that enforces frontmatter property ordering). Groups properties by purpose, with forward refs grouped separately from reverse arrays so the parent-child structure of a note's frontmatter is visually scannable.

```
# Identity / classification
dbench-id
dbench-type
dbench-schema-version
dbench-status
dbench-order
dbench-target-words
dbench-subtitle
dbench-synopsis
dbench-project-shape

# Forward refs (parent pointers)
dbench-project
dbench-project-id
dbench-chapter
dbench-chapter-id
dbench-scene
dbench-scene-id
dbench-sub-scene
dbench-sub-scene-id

# Reverse arrays (children pointers)
dbench-chapters
dbench-chapter-ids
dbench-scenes
dbench-scene-ids
dbench-sub-scenes
dbench-sub-scene-ids
dbench-drafts
dbench-draft-ids
dbench-compile-presets
dbench-compile-preset-ids

# Draft-specific
dbench-draft-number

# Section break
dbench-section-break-title
dbench-section-break-style

# Compile preset configuration
dbench-compile-format
dbench-compile-output
dbench-compile-page-size
dbench-compile-heading-scope
dbench-compile-chapter-numbering
dbench-compile-frontmatter
dbench-compile-wikilinks
dbench-compile-embeds
dbench-compile-dinkuses
dbench-compile-include-section-breaks
dbench-compile-include-toc
dbench-compile-include-cover
dbench-compile-title
dbench-compile-subtitle
dbench-compile-author
dbench-compile-date-format
dbench-compile-scene-excludes
dbench-compile-scene-source
dbench-compile-scene-statuses

# Compile last-state (plugin-managed; do not hand-edit)
dbench-last-compiled-at
dbench-last-output-path
dbench-last-chapter-hashes

# Template
dbench-template-type
dbench-template-name
dbench-template-description
```

**Why this order.** Identity first (so the type discriminator is at the top of the YAML for human scanning); then forward refs in hierarchy order (project -> chapter -> scene -> sub-scene), each as a wikilink + ID pair; then reverse arrays in the same hierarchy order, also as paired arrays; then the type-specific groups (draft, section-break, compile, template). The compile-preset configuration is grouped by purpose (output, then heading control, then content handling, then inclusion toggles, then compiled-output frontmatter, then scope narrowing) so a writer scanning a preset can find the knob they want.

A note's frontmatter only contains the keys relevant to its `dbench-type`. The order above is the merged superset; Linter sorts present keys to match it and leaves unknown keys alone.

---

## 11. Examples

What a typical note of each type looks like once stamped. Field values are illustrative; IDs, paths, and titles will differ in your vault.

### Project (chapter-aware)

```yaml
---
dbench-id: prj-481-abc-902
dbench-type: project
dbench-status: draft
dbench-target-words: 80000
dbench-project: "[[The Salt Road]]"
dbench-project-id: prj-481-abc-902
dbench-project-shape: folder
dbench-chapters:
  - "[[Ch01 - The Crossing]]"
  - "[[Ch02 - The Climb]]"
dbench-chapter-ids:
  - chp-122-xyz-453
  - chp-339-xyz-118
dbench-scenes: []
dbench-scene-ids: []
dbench-compile-presets:
  - "[[Workshop]]"
dbench-compile-preset-ids:
  - cmp-779-pqr-201
---
```

### Chapter

```yaml
---
dbench-id: chp-122-xyz-453
dbench-type: chapter
dbench-status: draft
dbench-order: 1
dbench-target-words: 8000
dbench-synopsis: The first descent.
dbench-project: "[[The Salt Road]]"
dbench-project-id: prj-481-abc-902
dbench-scenes:
  - "[[Sc01 - Departure]]"
  - "[[Sc02 - First night]]"
dbench-scene-ids:
  - scn-018-mno-541
  - scn-076-mno-208
dbench-drafts: []
dbench-draft-ids: []
---
```

### Scene (with sub-scenes)

```yaml
---
dbench-id: scn-018-mno-541
dbench-type: scene
dbench-status: draft
dbench-order: 1
dbench-subtitle: POV — Eira
dbench-project: "[[The Salt Road]]"
dbench-project-id: prj-481-abc-902
dbench-chapter: "[[Ch01 - The Crossing]]"
dbench-chapter-id: chp-122-xyz-453
dbench-sub-scenes:
  - "[[01 - The threshold]]"
  - "[[02 - The riverbank]]"
dbench-sub-scene-ids:
  - sub-204-jkl-009
  - sub-204-jkl-118
dbench-drafts: []
dbench-draft-ids: []
---
```

### Sub-scene

```yaml
---
dbench-id: sub-204-jkl-009
dbench-type: sub-scene
dbench-status: idea
dbench-order: 1
dbench-synopsis: Eira hesitates at the threshold.
dbench-project: "[[The Salt Road]]"
dbench-project-id: prj-481-abc-902
dbench-scene: "[[Sc01 - Departure]]"
dbench-scene-id: scn-018-mno-541
dbench-drafts: []
dbench-draft-ids: []
---
```

### Draft (sub-scene-level)

```yaml
---
dbench-id: drf-501-stu-022
dbench-type: draft
dbench-draft-number: 2
dbench-project: "[[The Salt Road]]"
dbench-scene: ""
dbench-scene-id: ""
dbench-sub-scene: "[[01 - The threshold]]"
dbench-sub-scene-id: sub-204-jkl-009
---
```

### Compile preset

```yaml
---
dbench-id: cmp-779-pqr-201
dbench-type: compile-preset
dbench-schema-version: 1
dbench-project: "[[The Salt Road]]"
dbench-project-id: prj-481-abc-902
dbench-compile-format: pdf
dbench-compile-output: vault
dbench-compile-page-size: letter
dbench-compile-heading-scope: draft
dbench-compile-chapter-numbering: numeric
dbench-compile-frontmatter: strip
dbench-compile-wikilinks: display-text
dbench-compile-embeds: strip
dbench-compile-dinkuses: preserve
dbench-compile-include-section-breaks: true
dbench-compile-include-toc: true
dbench-compile-include-cover: true
dbench-compile-title: The Salt Road
dbench-compile-subtitle: A novel
dbench-compile-author: ""
dbench-compile-date-format: iso
dbench-compile-scene-source: auto
dbench-compile-scene-statuses:
  - draft
  - revision
  - final
dbench-compile-scene-excludes: []
dbench-last-compiled-at: 2026-05-04T17:52:00Z
dbench-last-output-path: Draft Bench/The Salt Road/Compiled/Workshop.pdf
dbench-last-chapter-hashes:
  - "chp-122-xyz-453:8e1f2a"
  - "chp-339-xyz-118:b40d77"
---
```

### Template (sub-scene)

```yaml
---
dbench-template-type: sub-scene
dbench-template-name: Beat — interior monologue
dbench-template-description: Sub-scene seed for an internal POV beat.
---

## Draft

<!-- Drop interior-monologue prose here -->
```

---

## See also

- [Essential Properties](Essential-Properties) — curated cheat sheet for the everyday case
- [Projects, Chapters, Scenes, and Sub-scenes](Projects-And-Scenes) — the data-model overview
- [Drafts and Versioning](Drafts-And-Versioning) — how the four draft target shapes work
- [Manuscript Builder](Manuscript-Builder) — what compile-preset configuration drives at compile time
- [Settings and Configuration](Settings-And-Configuration) — status vocabulary and folder conventions that shape several of the values above
- [Specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md) — the authoritative design document
