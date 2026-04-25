# Chapter type (V1 scope expansion)

Planning doc for the addition of `dbench-type: chapter` to V1's vocabulary. Originally scoped as Phase 5+ in [specification.md](specification.md), promoted to V1 on 2026-04-25 to make novelists comfortable at first contact rather than tolerating them.

**Status:** Design pending ratification. No code yet. Ratify each section below, then implementation begins.

---

## Why this is in V1 now

The V1 audience pivot (2026-04-25) made novelists the lead V1 audience based on Discord-community signal that novelists dominate Obsidian writing discussion. Without chapter type, novelists hit four pain points within the first hour:

1. **Manuscript view doesn't scale.** A 30-chapter / 150-scene novel becomes a flat 150-row list with no collapse. Daily-writing surface becomes unusable.
2. **Compile output is wrong.** Every scene gets H1, so a reader sees 150 "chapters" instead of 30. Section-break decorations help but don't fix the heading-scope rule.
3. **Mental model mismatch.** Novelists think in chapters; the data model has no chapter concept. Status / word-count rollups happen at scene-or-project, never at the level a novelist plans by.
4. **Auxiliary content gap** — addressed separately by the [Charted Roots boundary decision](#charted-roots-boundary-recap), not by this expansion.

Promoting chapter type to V1 closes pain points 1-3. Pain point 4 is explicitly out of scope.

### Charted Roots boundary recap

[Locked 2026-04-25.](../../) Draft Bench owns narrative (manuscript / scenes / drafts / chapters / compile). Charted Roots owns world (entities / relationships / characters / locations / timelines). Auxiliary content stays user-managed in V1 — writers keep characters / locations / research as plain markdown notes. This is by design, not a missing feature.

---

## What's locked at the meta level

Before the section-by-section design, three things are already fixed:

- **Chapter type joins V1 vocabulary.** New types: `project` / `chapter` / `scene` / `draft` / `compile-preset`. The current 4-type set becomes 5.
- **Backward compatibility for chapter-less projects is non-negotiable.** Existing flat `project → scene` projects must continue to work. Writers who don't want chapters never have to create one. The Manuscript view, compile pipeline, and integrity service all treat `project → scene` and `project → chapter → scene` as equally legitimate shapes.
- **Auxiliary content stays out.** No character / location / research types in V1 (or beyond, per the Charted Roots boundary).

---

## Sections requiring ratification

Each section below presents a design decision: the question, options considered, recommendation, and rationale. Ratify each before moving to the next.

### 1. Chapter modeling: note, folder, or virtual grouping?

**Question:** What is a "chapter" on disk?

**Options:**

| Option | Disk shape | Pros | Cons |
|---|---|---|---|
| **A. Chapter-as-note** (recommended) | A markdown note with `dbench-type: chapter`, has its own body | Consistent with project / scene / draft (all notes); body holds chapter intro / outline / notes; standard frontmatter machinery applies; integrity / linker / Bases all already work for note types | One more file per chapter (30 chapters = 30 chapter notes); writers must understand "the chapter note is real, the scenes are inside it" |
| **B. Chapter-as-folder** | A folder; metadata lives in `_chapter.md` or similar | Matches Scrivener; folder visualization in file explorer | Inconsistent with the existing project (note-in-a-folder, not folder) / scene / draft pattern; metadata location is awkward (where does `dbench-id` live for a folder?); Obsidian doesn't have first-class folder metadata |
| **C. Chapter-as-virtual-grouping** | Scenes carry a `dbench-chapter` string label; no chapter file at all | Lightest touch; no new type | No chapter-level body / outline / status / word-target; no place for chapter-specific writer notes; loses the symmetry with project (which is a note) |

**Recommendation: A (chapter-as-note).** Three reasons:

1. **Pattern consistency.** Every other plugin-managed entity in DB is a note. Adding a non-note type for the new V1 entity is a category mismatch that would surface in retrofit, integrity, linker, and Bases code.
2. **Body utility.** Novelists routinely jot chapter-level notes (this chapter's POV, the beat structure, the open questions). A chapter note's body is the natural home for that, mirroring how scenes hold per-scene planning sections under the V1 template.
3. **Forward-compat.** If chapter type later grows status / target-words / synopsis fields, those go in chapter frontmatter naturally. Option C would require schema-on-scene contortions to support chapter-level rollups.

**Counter-consideration:** Option C is genuinely lighter. If we later regret the file-count cost, virtual grouping is a fallback. But the file-count cost is small (1 chapter note per 5 scene notes is a rounding error against typical novelist vault sizes), and the body-utility argument makes Option A worth its modest weight from day one.

**Decision:** TBD — ratify before moving on.

---

### 2. Chapter frontmatter shape

**Question:** What fields does a chapter note carry?

**Recommendation:** Mirror the project / scene shape with chapter-specific additions. Locked subset:

```yaml
dbench-type: chapter
dbench-id: <stamped at creation>
dbench-project: "[[<project basename>]]"
dbench-project-id: <project's dbench-id>
dbench-order: <integer; chapter position within project>
dbench-status: <from settings.statusVocabulary; default = first entry>
dbench-target-words: <optional; integer>
# Reverse arrays — plugin-maintained
dbench-scenes: ["[[Scene A]]", "[[Scene B]]"]
dbench-scene-ids: ["abc-...", "def-..."]
```

Rationale per field:

- **`dbench-project` + `dbench-project-id`** — direct parent reference; matches scene's parent-reference pattern.
- **`dbench-order`** — chapter position within the project; integer; sole source of truth for chapter ordering.
- **`dbench-status`** — chapters have their own status (see § 5 for status rollup discussion).
- **`dbench-target-words`** — optional; lets novelists set per-chapter word targets and see progress in the Manuscript view's chapter-level rollup.
- **`dbench-scenes` / `dbench-scene-ids`** — reverse arrays of scenes belonging to this chapter; plugin-maintained.

**Open question:** Does a chapter need a synopsis field (`dbench-synopsis`)? Useful for index-card display in a future Bases view; optional in V1. **Recommendation: defer** — add when Bases gets a chapter-summary view. Until then, the chapter note's body opening paragraph serves the same purpose.

**Decision:** TBD.

---

### 3. Scene parent: project or chapter?

**Question:** When a scene lives inside a chapter, what does its `dbench-project` / `dbench-chapter` reference look like? Today, every scene has `dbench-project` pointing to its project. With chapter type added:

**Options:**

- **A. Scene's `dbench-project` always points to project; new `dbench-chapter` points to chapter.** Project remains the always-authoritative root. Chapter is a secondary reference. O(1) project membership lookup is preserved (matters for the Manuscript view's "show all my projects" call).
- **B. Scene's `dbench-project` is dropped when the scene is in a chapter; only `dbench-chapter` is set.** Project membership becomes transitive (scene → chapter → project). Less data per scene, but every "what project does this scene belong to" lookup must resolve through the chapter.

**Recommendation: A.** The redundancy is intentional. Querying "all scenes in project X" is a hot path (used by every Manuscript view render); making it a single-hop lookup keeps performance simple and preserves the existing discovery pattern. The cost is a few extra bytes of frontmatter per scene; the win is a much simpler discovery / Bases / integrity story.

**Concrete fields on a scene-in-chapter:**

```yaml
dbench-type: scene
dbench-id: ...
dbench-project: "[[<project>]]"
dbench-project-id: ...
dbench-chapter: "[[<chapter>]]"      # NEW for V1 chapter-type
dbench-chapter-id: ...                # NEW for V1 chapter-type
dbench-order: <integer; scene position within chapter>
# ... rest unchanged
```

For scene-in-project (chapter-less, the V1-as-shipped case): `dbench-chapter` and `dbench-chapter-id` are absent. The scene continues to live with `dbench-project` only.

**`dbench-order` semantic** is **scene-within-its-immediate-parent**: within-chapter for chapter-children scenes, within-project for chapter-less scenes. The Manuscript view sorts by walking the hierarchy, not by a global flat sort.

**Decision:** TBD.

---

### 4. Drafts: chapter-level or scene-only?

**Question:** Can a writer take a "chapter draft" snapshot — a single file capturing the entire chapter at a point in time?

**Options:**

- **A. Scene-only drafts (recommended).** Drafts continue to attach only to scenes. No new chapter-level draft type.
- **B. Add chapter-level drafts.** New use case: writer revises a whole chapter, snapshots it, then iterates.

**Recommendation: A.** Three reasons:

1. **Use case is rare in practice.** Writers iterate at the scene level; cross-scene revisions are usually about editing several scenes' bodies, not snapshotting a chapter as one artifact.
2. **Workaround is clean.** A writer who wants a chapter snapshot can compile the chapter (via a single-chapter compile preset) to MD/vault. The output is a markdown file at a stable path.
3. **Adds complexity disproportionate to value.** Chapter drafts would need their own filename convention, snapshot mechanic (concat scenes? read-as-of-time?), and reverse-array on chapters. The V1 cost outweighs the demand.

**Decision:** TBD.

---

### 5. Status and word-count rollups

**Question:** Does a chapter have its own status field (writer-set), or is it derived from the chapter's scenes? Same question for word counts.

**Status options:**

- **A. Chapter has its own writer-set `dbench-status` (recommended).** Mirrors the project's pattern.
- **B. Chapter status is derived from majority-of-scenes-status.** Smart but error-prone: a 5-scene chapter with 3 scenes in `revision` and 2 in `final` derives as `revision`, but the writer may consider it `final` (since the holdouts are stylistic polish).
- **C. No chapter status.** Status only at scene level.

**Recommendation: A.** Status is intent, not a sum. Writers want to mark "this chapter is in revision" independently of whether every scene happens to be tagged that way. Derived status fights writer intent.

**Word-count rollup options:**

- **A. Chapter shows `sum(scenes' word counts)` (recommended).** Simple, accurate, no chapter-level word storage.
- **B. Chapter has its own `dbench-word-count` cached.** Risks staleness; no clear write trigger.

**Recommendation: A.** Word counts are computed live by `WordCountCache` already; extending it to compute chapter rollups is a small projection over existing aggregates. No new persistence.

**Targets:**

- Chapter `dbench-target-words` is optional. When set, the Manuscript view shows a per-chapter progress bar. Project-level target remains the project's `dbench-target-words`.
- Project target = explicit only, not sum-of-chapter-targets. The target is a writer commitment, not a derivation.

**Decision:** TBD.

---

### 6. Manuscript view hierarchy

**Question:** How does the Manuscript leaf display projects with chapters?

The current leaf shows: project meta row, status breakdown, ordered scene list with status chips and word counts, toolbar.

**Options for chapter-aware rendering:**

- **A. Collapsible chapter cards with nested scene rows (recommended).** Each chapter renders as a card: chapter title + chapter status chip + chapter word-count progress + collapse toggle. Expanded card shows scene rows below. Per-chapter collapse state persisted (see below).
- **B. Two-level indented list.** Chapters as headers; scenes as indented rows beneath. Simpler but loses the chapter-card affordance for rollup data.
- **C. Two separate panes.** Top pane: chapter list. Click a chapter; bottom pane shows that chapter's scenes. More clicks, less scannable.

**Recommendation: A.** Card-with-collapse balances information density with progressive disclosure. Writers see all chapters at a glance; expand the one they're working on. Chapter cards reuse the existing scene-row visual idiom (status chips, word-count progress) at one level up.

**Per-chapter collapse state — where persisted:**

- **A. Plugin settings (`data.json`) keyed by chapter id (recommended).** Survives reload; per-chapter persistence; matches the [feedback memory on state persistence](../../) lesson.
- **B. Per-leaf state via `getState`.** Diverges across detached leaves; doesn't survive reload reliably.

**Recommendation: A.** Adds a `chapterCollapseState: Record<DbenchId, boolean>` to settings. Default = expanded. Writer's collapse choices stick across reloads.

**Chapter-less projects:** Manuscript view falls back to today's flat scene list — no card hierarchy when there are no chapters. The two display modes coexist; the view adapts to the project's actual shape.

**Decision:** TBD.

---

### 7. Compile pipeline: chapter-aware heading scope

**Question:** When compiling a chapter-aware project, how does the heading hierarchy emit?

Today, `dbench-compile-heading-scope` has values `draft` (only `## Draft` body) and `full` (whole scene body). Both emit each scene with `# Scene Title` as H1. For a chapter-aware project, this produces 150 H1s where a reader expects 30.

**Recommendation:** Add a third value to the heading-scope rule.

| Value | Emits | When to use |
|---|---|---|
| `draft` (existing) | `# <scene title>` per scene; only body below `## Draft` | V1 short-fiction default |
| `full` (existing) | `# <scene title>` per scene; whole scene body | Internal-review compiles |
| `chapter` (NEW) | `# <chapter title>` per chapter; scene titles **omitted**; bodies concatenated below the chapter heading | Novel compile (recommended default for chapter-aware projects) |

In `chapter` mode, scene boundaries within a chapter become invisible in the output (no scene title H1; just continuous prose with the chapter's section breaks marking transitions). This matches how published novels read: chapter heading, then prose; no scene-titles surfaced to the reader.

**Default selection:**

- New compile presets created via `Create compile preset` modal: if the source project has chapters, default `heading-scope: chapter`; otherwise default `heading-scope: draft` (current default for chapter-less). The Compile tab exposes the override.
- Existing presets: stay on whatever value they have. Chapter-less heading-scope rules continue to work.

**Section-break interaction:** Within a chapter, scenes can still emit section breaks via `dbench-section-break-title` / `dbench-section-break-style` — those become inter-scene dinkuses or page breaks within the chapter, as today. Unchanged.

**Compile walking:** `CompileService.generate` walks `project → chapters in dbench-order → scenes in dbench-order` (two-level). For chapter-less projects, walks `project → scenes in dbench-order` (one-level). The walker dispatches on project shape.

**Decision:** TBD.

---

### 8. Two-level ordering and reordering

**Question:** Chapters have `dbench-order` within their project; scenes have `dbench-order` within their chapter (or within their project, if chapter-less). How does the writer reorder?

**Options:**

- **A. One Reorder modal that handles both levels (recommended).** Modal opens scoped to a parent (project for chapter-reordering; chapter or project for scene-reordering). Drag-handle + keyboard reorder of children. Same primitive both ways.
- **B. Separate "Reorder chapters" and "Reorder scenes" modals.** More commands; more menu items.

**Recommendation: A.** Reuse the existing reorder primitive with a parent-scope parameter. New palette commands:

- **Draft Bench: Reorder chapters in project** — opens reorder modal scoped to the project's chapters.
- **Draft Bench: Reorder scenes in chapter** — opens reorder modal scoped to the active chapter's scenes (or active project's scenes if chapter-less).

The existing `Reorder scenes` command becomes context-aware: if the active file is in a chapter, it reorders within-chapter; if chapter-less, within-project. The new `Reorder chapters in project` command is the explicit chapter-level affordance.

**Cross-chapter scene moves** (writer wants to move a scene from Chapter 3 to Chapter 5):

- **V1: handled via retrofit** — "Set as scene of chapter X" or a bulk "Move to chapter" action. Reorder modal stays single-parent-scoped; cross-parent moves are a separate operation.
- **Post-V1:** consider drag-across-chapters in the Manuscript view if writers ask for it.

**Decision:** TBD.

---

### 9. Backward-compat: chapter-less projects coexist forever

**Question:** What happens to existing flat-scene projects when chapter type lands?

**Locked answer:** Nothing happens automatically. Existing projects continue to work as today. The Manuscript view, compile pipeline, integrity service, retrofit actions, and Bases all support both shapes:

- **Flat shape** (chapter-less): `project → scenes`. Today's V1-as-shipped state.
- **Hierarchical shape** (chapter-aware): `project → chapters → scenes`.

A writer can:

- Stay flat forever (short-fiction collection, single-novella project).
- Convert flat to hierarchical via a "Group scenes into chapter" retrofit action (post-V1 candidate; V1 acceptable answer is "create a chapter, then move scenes via Set-as-scene-of-chapter").
- Have a project with mixed children — some scenes directly under project, some under chapters? **Recommendation: NO.** A project's children are either chapters or scenes, not both. This keeps the Manuscript view's render logic and the compile walker simple. If a writer wants a mid-novel "interlude" outside chapters, they create a single-scene chapter for it.

**Decision:** TBD on the "no-mixed-children" rule. The recommendation is to enforce this; if pushed back on, the alternative is a "loose chapters" mode where the project's `dbench-scenes` reverse array can include both scene and chapter ids.

---

## Implementation sequence

Once design is ratified, implementation in this order:

1. **Model + types.** [src/model/types.ts](../../src/model/types.ts) extended with `chapter` in `DbenchType`. New [src/model/chapter.ts](../../src/model/chapter.ts) with `ChapterFrontmatter` + `isChapterFrontmatter`. [src/core/essentials.ts](../../src/core/essentials.ts) gets `stampChapterEssentials`.
2. **Discovery.** [src/core/discovery.ts](../../src/core/discovery.ts) extended with `ChapterNote`, `findChapters`, `findChaptersInProject`, `findScenesInChapter`. Existing `findScenesInProject` updated to walk through chapters.
3. **Core operations.** New [src/core/chapters.ts](../../src/core/chapters.ts) with `createChapter`, `resolveChapterPaths`, `nextChapterOrder`. `createScene` extended to optionally accept a `chapter` parent.
4. **Linker.** [src/core/linker.ts](../../src/core/linker.ts) gains `RelationshipConfig` entries for project↔chapter and chapter↔scene. Existing project↔scene relationship still works for chapter-less projects.
5. **Integrity.** [src/core/integrity.ts](../../src/core/integrity.ts) extends `scanProject` with chapter relationship passes. New issue kinds: `CHAPTER_MISSING_IN_PROJECT`, `STALE_CHAPTER_IN_PROJECT`, `SCENE_MISSING_IN_CHAPTER`, `STALE_SCENE_IN_CHAPTER`, `PROJECT_CHAPTER_CONFLICT`, `CHAPTER_SCENE_CONFLICT`.
6. **Settings.** Add `chapterCollapseState: Record<DbenchId, boolean>` to `DraftBenchSettings`.
7. **Manuscript view rework.** Hierarchical render with collapsible chapter cards. Section module split into `chapter-card-section.ts` + scene rows-within-chapter. Chapter-less projects keep today's flat render.
8. **Compile pipeline.** `compile-service` walks two-level. New `chapter` heading-scope value in `compile-rules`. Default heading-scope updated for chapter-aware project preset creation.
9. **Modals + commands.** `NewChapterModal`, `Draft Bench: Create chapter` palette command, `Reorder chapters in project` command, retrofit "Set as chapter" action, "Move to chapter" bulk action. Context menu entries on chapter notes (Reorder scenes in this chapter; Run compile scoped to chapter).
10. **Bidirectional sync hooks.** All chapter-modifying operations run inside `linker.withSuspended(...)`.
11. **Tests.** Each new module gets unit + integration coverage. Estimate: +200-300 tests over current 664.
12. **Dev-vault validation.** Walkthrough scenarios for chapter creation, scene-to-chapter assignment, reordering, status rollup, compile output. Add to `dev-vault/00 Compile walkthrough.md`.
13. **Spec rewrites.** Specification.md updates per § Note Types, § Project Structure on Disk, § Manuscript view, § Book Builder, § Bidirectional linking, § Development Phases (chapter moves to V1).
14. **Wiki content.** New page or extended Manuscript-Builder.md / Projects-And-Scenes.md sections explaining the chapter shape. Getting-Started.md updates for novelist flow.

Realistic estimate: 3-5 weeks of focused work for code + tests; 1 week for spec + wiki. Total ~4-6 weeks.

---

## Out of scope for V1 chapter type

- **Auxiliary content** (character / location / research / faction / timeline-event). Per [Charted Roots boundary](../../). Writers maintain plain notes.
- **Chapter-level drafts.** Scene-only drafts stay; see § 4.
- **Chapter synopsis field.** Add when Bases gets a chapter-summary view; see § 2.
- **Cross-chapter drag-reorder** in Manuscript view. Use retrofit "Move to chapter" for V1.
- **Mixed-children projects** (chapter and direct scene under same project). Enforced no by V1; see § 9.
- **Smart chapter-status derivation.** Status is writer intent; see § 5.
- **Chapter-level word-count cache.** Computed live; see § 5.
- **Auto-grouping retrofit** ("convert this flat project to chapters by section-break boundaries"). Manual retrofit only.

---

## Open questions

- **Chapter naming / numbering convention.** Default chapter title is `Chapter N` (numeric)? Or empty / writer-set? My instinct: writer sets a free title (e.g., "The Lighthouse" or "Chapter 1"); plugin doesn't impose. Default placeholder in `NewChapterModal` is `Chapter <next-order>` for the writer to override.
- **Compile preset's "Excludes" interaction with chapters.** Today excludes are scene-name strings or `[[wikilinks]]`. With chapters, does excluding a chapter exclude all its scenes? Or only directly-named scenes?
- **Default `heading-scope` for chapter-aware projects' compile presets.** § 7 recommends `chapter` as default for new presets when the source project has chapters. Confirm.
- **`Move to chapter` action — single-scene or bulk?** Probably both: context-menu single-file moves; multi-select bulk moves.
- **Chapter creation from Manuscript view toolbar.** Add a "New chapter" button to the toolbar (alongside "New scene" / "New draft" / "Reorder")? Or only in the chapter-card UI?

---

## Decision log

(Populate as ratification happens.)

| Section | Decision | Date | Notes |
|---|---|---|---|
| 1. Chapter modeling | TBD | | Recommendation: A (chapter-as-note) |
| 2. Frontmatter shape | TBD | | Recommendation: project/scene-mirror with reverse arrays |
| 3. Scene parent | TBD | | Recommendation: A (project always referenced; chapter as secondary) |
| 4. Drafts | TBD | | Recommendation: A (scene-only) |
| 5. Status + word-count rollups | TBD | | Recommendation: writer-set status; live-computed word sums |
| 6. Manuscript view hierarchy | TBD | | Recommendation: collapsible cards; collapse-state in settings |
| 7. Compile heading-scope | TBD | | Recommendation: add `chapter` value; default for chapter-aware projects |
| 8. Reordering | TBD | | Recommendation: parent-scoped reorder modal; cross-chapter via retrofit |
| 9. Backward-compat / mixed-children | TBD | | Recommendation: dual shape supported; no mixed children |
