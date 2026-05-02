# Sub-scene type (pre-1.0 promotion)

Planning doc for the addition of `dbench-type: sub-scene` to Draft Bench's vocabulary. Originally scoped as the post-V1 `beat` type in [specification.md § Architected For (Post-V1)](specification.md), promoted to pre-1.0 on 2026-05-02 after the maintainer's own real-vault use surfaced the friction the spec entry anticipated.

**Status:** Design pending ratification. Sections below mirror [chapter-type.md](chapter-type.md)'s template (the most recent V1-scope-expansion precedent). Ratify each section before moving to the next.

**Naming decision (locked 2026-05-02):** the type is `sub-scene`, not `beat`. Rationale captured in § 1 below; in short: genre-neutral, self-explanatory, no collision with the existing `dbench-section-break-*` vocabulary.

---

## Why this is in pre-1.0 now

The maintainer hit it in their own writing on 2026-05-02. A scene in *Going Down* has at least six distinct narrative units that work better in relative isolation. The V1 beats-as-headings approach surfaces four costs:

1. **No visibility into which parts of a scene are complete.** Status is per-scene; sub-scenes have no first-class state.
2. **Drafts attach to scenes, not sub-scenes.** A draft that snapshots only "sub-scene 6" can't be tracked as such — it's "Draft 4 of the scene" with no per-sub-scene record of what's actually in it.
3. **No way to track which sub-scenes need rewriting vs. are stable.** Sub-scenes that were cut in an earlier draft, sub-scenes that exist in one draft but not another — all invisible at the data-model level.
4. **No isolation for working on a single sub-scene.** Writers want to focus on one unit at a time; the V1 approach has them all in one scene file.

The spec's [Resolved Open Questions § Beat granularity](specification.md) entry explicitly framed this as: V1 = beats-as-headings; the separate type "stays available if you want it, not first-class UI" until a writer pushes against the seams. The maintainer's real-vault friction is that signal.

---

## What's locked at the meta level

Before the section-by-section design, three things are already fixed:

- **Sub-scene type joins V1 vocabulary.** The 5-type set (`project` / `chapter` / `scene` / `draft` / `compile-preset`) becomes 6 with `sub-scene`.
- **Backward compatibility for sub-scene-less scenes is non-negotiable.** Today's scene-as-the-prose-container model continues to work. Writers who don't want sub-scenes never have to create one. The Manuscript view, compile pipeline, and integrity service all treat `scene → prose` and `scene → sub-scenes` as equally legitimate shapes.
- **Same Charted Roots boundary applies.** Auxiliary content (character / location / research) stays out — sub-scene is narrative-spine territory.

---

## Sections requiring ratification

Each section below presents a design decision: the question, options considered, recommendation, and rationale. Ratify each before moving to the next.

### 1. Terminology: sub-scene vs. beat vs. section

**Question:** What do we call this type?

**Options:**

| Option | Pros | Cons |
|---|---|---|
| **A. sub-scene** (recommended) | Self-explanatory; genre-neutral; no vocabulary collision | Slightly less elegant than a single word |
| **B. beat** | Shorter; established craft term | Screenwriting-coded; weak recognition among literary / memoir writers; "beat" already appears in spec scene-template `## Beat outline` section heading |
| **C. section** | Universal | Collides with existing `dbench-section-break-*` (dinkus thematic-break) vocabulary; would overload the term |
| **D. vignette** | Lovely for memoir | Implies short standalone piece; doesn't fit dramatic mid-scene units |
| **E. unit** | Generic | Cold, abstract |

**Recommendation: A (sub-scene), ratified 2026-05-02.**

Three reasons:

1. **No learning curve.** A reader who knows what a scene is gets "sub-scene" immediately. "Beat" requires craft fluency the writer may or may not have.
2. **Genre-neutral.** Memoir, literary, short-fiction, and screenwriting workflows all read it the same way. "Beat" tilts toward plot-grid / structure-heavy traditions.
3. **No vocabulary collision.** DB already uses `dbench-section-break-title` / `dbench-section-break-style` for dinkus-marked thematic breaks within a scene. Adopting `section` as a type name would overload "section." "Sub-scene" stays unambiguous.

The frontmatter type identifier is `dbench-type: sub-scene` (hyphenated lowercase, matching `compile-preset`).

The craft term "beat" stays valid in user-facing copy where it fits — the spec's scene-template `## Beat outline` heading stays as-is, and the post-V1 [Beat-sheet templates pack](post-v1-candidates.md) keeps "beat" in the name (Save the Cat, Three-Act, etc. are beat-sheet methods by craft convention; the templates ship beats-as-structure inside a sub-scene template).

**Decision:** ✅ **A (sub-scene), ratified 2026-05-02.**

---

### 2. Sub-scene modeling: note, virtual grouping (heading), or hybrid?

**Question:** What is a sub-scene on disk?

**Options:**

| Option | Disk shape | Pros | Cons |
|---|---|---|---|
| **A. Sub-scene-as-note** (recommended) | A markdown note with `dbench-type: sub-scene`, has its own body | Consistent with project / chapter / scene / draft (all notes); body holds prose + planning sections; standard frontmatter machinery applies; integrity / linker / Bases all already work for note types | One more file per sub-scene; writers must understand "the sub-scene note is real, the scene's body becomes intro-only when sub-scenes exist" |
| **B. Sub-scene-as-heading** | Headings inside the scene note (current V1 behavior) | Zero new files; current state | The exact friction the maintainer hit — no isolation, no per-sub-scene status, drafts can't attach |
| **C. Hybrid** (some sub-scenes as notes, some as headings) | Both shapes coexist within a single scene | Maximum flexibility | Two render paths, two compile paths, two integrity surfaces; complexity tax not justified by any concrete use case |

**Recommendation: A (sub-scene-as-note).** Same reasoning as chapter-type § 1:

1. **Pattern consistency.** Every plugin-managed entity in DB is a note. Adding a non-note type for the new entity would be a category mismatch surfacing in retrofit, integrity, linker, and Bases code.
2. **Body utility.** Each sub-scene's body holds its own planning sections + draft prose, mirroring the scene template. Writers gain isolation when they want it.
3. **Forward-compat.** Status / target-words / synopsis / draft chains all live in sub-scene frontmatter naturally.

**Counter-consideration:** Option B is genuinely lighter — it's the V1 status quo. Writers who don't want per-sub-scene metadata stick with headings (backward compat per § 8 below). Option A is opt-in, not mandatory.

**Decision:** ⏳ Pending ratification.

**Implications if ratified:**

- Sub-scene notes follow the same planning-sections-plus-`## Draft` template shape as scenes (Source passages / Beat outline / Open questions / Draft). Settings gain a `subSceneTemplatePath` parallel to `sceneTemplatePath`; Templater pass-through applies.
- The scene's `## Draft` section (when sub-scenes exist) becomes scene-introductory prose only — it emits before the sub-scenes in compile, not interleaved. Mirrors how chapters relate to their scenes (chapter-type § 7).
- Most scenes-with-sub-scenes will have an empty scene-level `## Draft` — the body's value is the planning sections plus *optional* scene-introductory prose. Empty `## Draft` emits nothing in compile.

---

### 3. Sub-scene frontmatter shape

**Question:** What fields does a sub-scene note carry?

**Recommendation:** Mirror the scene shape, with parent refs pointing at the scene (and the scene's project) per the draft / chapter precedent.

```yaml
dbench-type: sub-scene
dbench-id: <stamped at creation>
dbench-project: "[[<project basename>]]"
dbench-project-id: <project's dbench-id>
dbench-scene: "[[<scene basename>]]"
dbench-scene-id: <scene's dbench-id>
dbench-order: <integer, within-scene>
dbench-status: <writer-set, default first status from vocabulary>
dbench-drafts: []
dbench-draft-ids: []
dbench-subtitle: ''     # optional, scene-style
dbench-synopsis: ''     # optional, for Manuscript view sub-scene-card consumption
```

**Why both project and scene refs?** Matches the draft schema precedent — drafts carry both project + scene refs (or both project + chapter refs for chapter drafts) so project-scoped queries don't have to walk through scenes. Same logic here: `findSubScenesInProject` is O(n) over sub-scenes filtering by `dbench-project-id`, not O(n × m) walking through scenes.

**Decision:** ⏳ Pending ratification.

---

### 4. Drafts: scene drafts AND sub-scene drafts?

**Question:** Should writers be able to snapshot a sub-scene independently?

**Recommendation: YES, both.** Mirrors the chapter-type § 4 ratified outcome (scene drafts + chapter drafts, both legitimate). The maintainer's stated friction explicitly calls out this need: *"Draft 4 of this scene contains only sub-scene 6"* is unrepresentable today.

Concrete shape:

- **Sub-scene drafts** — snapshot a sub-scene's body (raw, like scene drafts). Lives in the configured `Drafts/` folder; carries `dbench-sub-scene` + `dbench-sub-scene-id` parent refs (parallel to how scene drafts carry `dbench-scene` + `dbench-scene-id`).
- **Scene drafts** — when a scene has sub-scenes, its draft snapshot concatenates the scene body + child sub-scene bodies in `dbench-order`, with `<!-- sub-scene: <basename> -->` HTML-comment boundaries between sections (parallel to chapter-draft scene boundaries from chapter-type § 4). Frontmatter stripped from each piece; planning sections preserved.
- **Linker `RelationshipConfig` extension** — new entry for sub-scene↔draft, paralleling chapter↔draft.
- **Naming convention** — `<Scene> - <Sub-scene> - Draft N (YYYYMMDD).md`. Disambiguates sub-scene drafts from scene drafts in the same folder.

Filename collision concern: a scene draft `<Scene> - Draft N (date).md` and a sub-scene draft `<Scene> - <Sub-scene> - Draft N (date).md` are distinct by basename. No conflict.

**Decision:** ⏳ Pending ratification.

---

### 5. Status + word-count rollups

**Question:** How does scene-level status / word count work when sub-scenes exist?

**Recommendation:** Same shape as chapter-type § 5.

- **Status** stays writer-set, never derived. A scene with three "final" sub-scenes and three "draft" sub-scenes is whatever the writer marks the scene as. Sub-scenes carry their own `dbench-status`.
- **Word count** lives in `WordCountCache`; computed live (no persistence). Scene total = scene body + sum of sub-scene bodies. Project / chapter rollups walk through to sub-scenes when present.
- **Per-sub-scene target** is optional (`dbench-target-words` on a sub-scene note, defaults unset). Project-level target (already in V1) stays the canonical writer commitment; sub-scene targets are local checkpoints.

**Decision:** ⏳ Pending ratification.

---

### 6. Manuscript view hierarchy

**Question:** How does the Manuscript view render scenes that have sub-scenes?

**Recommendation:** Three-level rendering when both chapters and sub-scenes are present:

```
Project (root)
└── Chapter card (collapsible)
    └── Scene card (collapsible, when has sub-scenes; else flat row)
        └── Sub-scene row
```

Reuses the chapter-card pattern from chapter-type § 6. A scene without sub-scenes renders as today (flat row); a scene with sub-scenes renders as a collapsible card mirroring the chapter-card visual idiom.

Settings persistence: new `sceneCollapseState: Record<DbenchId, boolean>` (parallel to existing `chapterCollapseState`). Default empty; collapse state persists per-scene-with-sub-scenes.

Mixed shape — a project where some scenes have sub-scenes and some don't — is normal and expected. No mixed-children rule like chapter-type § 9; sub-scenes are an opt-in per-scene structural choice.

**Decision:** ⏳ Pending ratification.

---

### 7. Compile pipeline: scene assembly when sub-scenes exist

**Question:** How does compile output handle a scene with sub-scenes?

**Recommendation:** Parallel to chapter-aware compile (chapter-type § 7).

- **`dbench-compile-heading-scope` gains no new value.** The existing `full` / `draft` / `chapter` modes still apply. `chapter` is two-level (chapters → scenes); for sub-scene-aware compile, `chapter` walks chapters → scenes → sub-scenes when sub-scenes are present, otherwise scenes → prose.
- **Scene body emits as scene-introductory prose** when sub-scenes exist (mirrors how chapter body emits as chapter-introductory prose). Empty scene `## Draft` with sub-scenes present = no scene-level prose, sub-scenes flow directly under the scene heading.
- **Walker is now potentially three-level**: `walkChapterAware` extended to descend into sub-scenes when scenes have them. Single dispatch point in `compile-service`; chapter-less / sub-scene-less projects use `walkFlat` (byte-identical for backward compat).
- **Heading levels** — chapter = H1, scene = H2 (in chapter mode), sub-scene = H3. In `draft` mode (chapter-less), scene = H1 and sub-scene = H2. Rules in `chapter-rules.ts` and existing scene-rules extend to handle sub-scene headings.
- **Sub-scene wikilink excludes** — `dbench-compile-scene-excludes` extended (or new `dbench-compile-sub-scene-excludes` field) to support filtering at sub-scene granularity.

**Decision:** ⏳ Pending ratification.

---

### 8. Reordering: genericize the reorder modal (the third trigger)

**Question:** How does sub-scene reordering work?

**Background:** chapter-type § 8 explicitly noted that the natural genericize trigger for the reorder modal is "the third reorder context (scenes-in-chapter)." Sub-scenes-in-scene IS that third context. Time to deliver on the deferred genericization.

**Recommendation:** Refactor `ReorderScenesModal` and `ReorderChaptersModal` into a single parameterized `ReorderChildrenModal(parentScope, items, parentField)`. Three palette commands route to it:

- `Draft Bench: Reorder chapters in project` (existing)
- `Draft Bench: Reorder scenes` (existing — context-aware: in-chapter or in-project)
- `Draft Bench: Reorder sub-scenes in scene` (new)

Sub-scene reorder context: active scene resolves the parent. Cross-scene sub-scene moves use a "Move to scene" retrofit action (parallel to chapter-type's "Move to chapter").

**Decision:** ⏳ Pending ratification.

---

### 9. Backward-compat: scenes without sub-scenes coexist forever

**Question:** What happens to existing scenes when sub-scene type lands?

**Locked answer:** Nothing happens automatically. Existing scenes continue to work as today — body holds the prose, planning sections live above `## Draft`, drafts snapshot the whole scene. The Manuscript view, compile pipeline, integrity service, retrofit actions, and Bases all support both shapes:

- **Flat scene** (no sub-scenes): scene body holds the prose. Today's V1 state.
- **Hierarchical scene** (with sub-scenes): scene body becomes intro prose; sub-scenes hold the units.

A writer can:

- Stay flat forever (most short-fiction, most scenes in any project).
- Convert flat to hierarchical via "Set as sub-scene" retrofit on extracted sub-scene notes (manual; the writer splits the prose themselves).
- Have a scene with both intro prose AND sub-scenes — yes, this is fine (parallels chapter intro + scenes). Not a "mixed children" violation; the scene's `## Draft` body is intro, sub-scenes are the units.

**No mixed-children rule.** Unlike chapter-type § 9 (which forbade projects with both chapters and direct scenes), sub-scenes don't introduce a parallel constraint. A scene either has sub-scenes or it doesn't; if it has them, the body is intro; if it doesn't, the body is the prose.

**Decision:** ⏳ Pending ratification.

---

## Implementation sequence

Once design is ratified, implementation in this order:

1. **Model + types.** [src/model/types.ts](../../src/model/types.ts) extended with `sub-scene` in `DbenchType`. New [src/model/sub-scene.ts](../../src/model/sub-scene.ts) with `SubSceneFrontmatter` + `isSubSceneFrontmatter`. [src/core/essentials.ts](../../src/core/essentials.ts) gets `stampSubSceneEssentials`.
2. **Discovery.** [src/core/discovery.ts](../../src/core/discovery.ts) extended with `SubSceneNote`, `findSubScenes`, `findSubScenesInScene`, `findSubScenesInProject`. Existing `findScenesInProject` updated to walk through sub-scenes for word-count purposes.
3. **Core operations.** New [src/core/sub-scenes.ts](../../src/core/sub-scenes.ts) with `createSubScene`, `resolveSubScenePaths`, `nextSubSceneOrder`. `createScene` unchanged (sub-scenes are opt-in).
4. **Linker.** [src/core/linker.ts](../../src/core/linker.ts) gains `RelationshipConfig` entries for scene↔sub-scene and sub-scene↔draft. Existing scene↔draft relationship still works for sub-scene-less scenes.
5. **Integrity.** [src/core/integrity.ts](../../src/core/integrity.ts) extends `scanProject` with sub-scene relationship passes. New issue kinds: `SUB_SCENE_MISSING_IN_SCENE`, `STALE_SUB_SCENE_IN_SCENE`, `SCENE_SUB_SCENE_CONFLICT`.
6. **Settings.** Add `sceneCollapseState: Record<DbenchId, boolean>` to `DraftBenchSettings`. New `subSceneTemplatePath` setting.
7. **Manuscript view rework.** Hierarchical render with collapsible scene cards (mirror of chapter cards) that nest sub-scene rows. Section module extends `chapter-card-section.ts` pattern with `scene-card-section.ts`. Scenes without sub-scenes keep today's flat row render.
8. **Compile pipeline.** `walkChapterAware` extended to descend into sub-scenes; new heading-level rules in `chapter-rules.ts` and `compile-rules.ts` for the third level. Default heading-scope for new presets unchanged (writer's call whether their project is sub-scene-aware).
9. **Modals + commands.** `NewSubSceneModal`, `Draft Bench: New sub-scene in scene` palette command, retrofit "Set as sub-scene" action, "Move to scene" bulk action. Context-menu entries on sub-scene notes (Run compile scoped to sub-scene's parent project; Move to scene).
10. **Sub-scene-level drafts** (per § 4). New [src/core/sub-scene-drafts.ts](../../src/core/sub-scene-drafts.ts) parallel to `src/core/drafts.ts`: `createSubSceneDraft`, `resolveSubSceneDraftPaths`. Linker `RelationshipConfig` entry for sub-scene↔draft. Scene-draft snapshot mechanic extended to concatenate sub-scene bodies when sub-scenes present. New palette command `Draft Bench: New draft of this sub-scene`, context-menu entry.
11. **Reorder modal genericization** (per § 8). Refactor `ReorderScenesModal` + `ReorderChaptersModal` into `ReorderChildrenModal`. New `Draft Bench: Reorder sub-scenes in scene` palette command.
12. **Bidirectional sync hooks.** All sub-scene-modifying operations run inside `linker.withSuspended(...)`.
13. **Tests.** Each new module gets unit + integration coverage. Estimate: +200-300 tests over current 947.
14. **Dev-vault validation.** Walkthrough scenarios for sub-scene creation, scene-to-sub-scene assignment, reordering, status rollup, compile output, sub-scene-draft snapshots. Add to `dev-vault/00 Compile walkthrough.md` (or new walkthrough doc).
15. **Spec rewrites.** Specification.md updates per § Note Types, § Project Structure on Disk, § Manuscript view, § Book Builder, § Bidirectional linking, § Development Phases (sub-scene moves to V1 / pre-1.0).
16. **Wiki content.** New page or extended Manuscript-Builder.md / Drafts-And-Versioning.md sections explaining the sub-scene shape and sub-scene-draft snapshots. Getting-Started.md updates.

Realistic estimate: 4-6 weeks of focused work for code + tests; 1 week for spec + wiki. **Total ~5-7 weeks** (same envelope as chapter-type).

---

## Out of scope for sub-scene type

- **Auxiliary content** (character / location / research / faction / timeline-event). Per [Charted Roots boundary](specification.md). Writers maintain plain notes.
- **Auto-extraction retrofit** ("convert this scene's `## Beat outline` headings into sub-scene notes automatically"). Manual retrofit only — writer splits the prose themselves and runs `Set as sub-scene`. Auto-extract is a post-V1 candidate if writers ask.
- **Cross-scene drag-reorder** in Manuscript view. Use retrofit "Move to scene" for V1.
- **Smart sub-scene-status derivation.** Status is writer intent; no aggregation rules.
- **Sub-scene-level word-count cache.** Computed live; same as chapters.
- **Beat-sheet templates pack.** Stays as a separate post-V1 candidate ([post-v1-candidates.md](post-v1-candidates.md)). Templates pack ships as downloadable `.md` files; not bundled into core.
- **Four-level hierarchy** (project → chapter → scene → sub-scene → ???). Sub-scene is the bottom of the structural unit hierarchy. Beats / units smaller than sub-scenes go in the body, as headings.

---

## Open questions

- **Sub-scene template content.** Same four-section shape as scenes (Source passages / Beat outline / Open questions / Draft)? Or a leaner shape since sub-scenes are smaller? My instinct: same four-section shape for consistency; writers can edit the template if they want leaner.
- **Sub-scene title default.** `Sub-scene <next-order>`? Or empty / writer-set? Same approach as `NewChapterModal`'s `Chapter <next-order>` placeholder.
- **`Move to scene` action — single-scope or bulk?** Probably both, mirror of chapter-type's "Move to chapter" decision.
- **Sub-scene creation from Manuscript view scene-card.** Add a "New sub-scene" button to the scene-card UI (mirror of chapter-card "New draft of this chapter")?
- **What happens to scene drafts when sub-scenes are added later?** A writer has Scene X with Drafts 1-3 (whole-scene drafts). They add sub-scenes. Future drafts could be (a) whole-scene drafts (concatenated), (b) per-sub-scene drafts, or (c) mixed. The model supports all three; UI / writer-guidance question is which is the default and how to surface the choice. My instinct: writer chooses per draft via the New-draft modal (existing scene draft → snapshot whole scene; new "sub-scene draft" command → snapshot one sub-scene).

---

## Decision log

(Populate as ratification happens.)

| Section | Decision | Date | Notes |
|---|---|---|---|
| 1. Terminology | ✅ A (sub-scene) | 2026-05-02 | Genre-neutral; no `dbench-section-break-*` collision; "beat" stays valid in user-facing copy where craft fluency applies |
| 2. Sub-scene modeling | ⏳ Pending | — | — |
| 3. Frontmatter shape | ⏳ Pending | — | — |
| 4. Drafts | ⏳ Pending | — | — |
| 5. Status + rollups | ⏳ Pending | — | — |
| 6. Manuscript view | ⏳ Pending | — | — |
| 7. Compile assembly | ⏳ Pending | — | — |
| 8. Reorder genericization | ⏳ Pending | — | — |
| 9. Backward-compat | ⏳ Pending | — | — |
