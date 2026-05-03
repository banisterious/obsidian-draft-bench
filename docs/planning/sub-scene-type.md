# Sub-scene type (pre-1.0 promotion)

Planning doc for the addition of `dbench-type: sub-scene` to Draft Bench's vocabulary. Originally scoped as the post-V1 `beat` type in [specification.md § Architected For (Post-V1)](specification.md), promoted to pre-1.0 on 2026-05-02 after the maintainer's own real-vault use surfaced the friction the spec entry anticipated.

**Status:** §§ 1-10 ratified 2026-05-02. Sections below mirror [chapter-type.md](chapter-type.md)'s template (the most recent V1-scope-expansion precedent). Implementation pending per the sequence at the end of this doc; tracked via [#10](https://github.com/banisterious/obsidian-draft-bench/issues/10).

**Naming decision (locked 2026-05-02):** the type is `sub-scene`, not `beat`. Rationale captured in § 1 below; in short: genre-neutral, self-explanatory, no collision with the existing `dbench-section-break-*` vocabulary.

---

## Why this is in pre-1.0 now

The maintainer hit it in their own writing on 2026-05-02 — a scene with at least six distinct narrative units that work better in relative isolation. The V1 beats-as-headings approach surfaces four costs:

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

**Counter-consideration:** Option B is genuinely lighter — it's the V1 status quo. Writers who don't want per-sub-scene metadata stick with headings (backward compat per § 9 below). Option A is opt-in, not mandatory.

**Decision:** ✅ **A (sub-scene-as-note), ratified 2026-05-02.**

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
dbench-synopsis: ''     # optional, one-line "what this unit does" for Manuscript view (e.g., "the lot's provenance falls apart", "two bidders escalate past reason")
```

**Why both project and scene refs?** Matches the draft schema precedent — drafts carry both project + scene refs (or both project + chapter refs for chapter drafts) so project-scoped queries don't have to walk through scenes. Same logic here: `findSubScenesInProject` is O(n) over sub-scenes filtering by `dbench-project-id`, not O(n × m) walking through scenes.

**Decision:** ✅ **Ratified 2026-05-02.** Mirror scene shape with parent refs to scene + project; `dbench-synopsis` retained for Manuscript view sub-scene-cards (concrete use case: short "what this unit does" tags like "the lot's provenance falls apart" or "the buyer breaks the silence" for sub-scenes in a hierarchical scene).

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

**Snapshot semantics — drafts are immutable historical state.** Reorder operations affect current state only, not historical drafts. A whole-scene draft snapshots sub-scene order at capture time; later reordering of the live scene does not propagate to existing drafts. This is correct (the draft *is* the historical state, ordering and all), but writers using diff tools to compare drafts will see structural reshuffling alongside prose changes when the live scene's sub-scene order has changed since an earlier snapshot. Worth surfacing in user-facing docs; not worth special-casing in code.

**Transition from flat to hierarchical.** When "Set as sub-scene" runs on a note whose parent scene already has whole-scene drafts, the action surfaces a one-time notice explaining that the choice applies to *future* drafts only — existing snapshots stay as-is since they're historical. After the transition, the writer can produce either whole-scene drafts (concatenated, including sub-scenes via the existing "New draft of this scene" command) or per-sub-scene drafts (via the new "New draft of this sub-scene" command); both remain available indefinitely.

**Decision:** ✅ **Ratified 2026-05-02.** YES, both — sub-scene drafts and concatenated whole-scene drafts. Snapshot semantics frozen at capture; flat→hierarchical transition surfaces a one-time notice.

---

### 5. Status + word-count rollups

**Question:** How does scene-level status / word count work when sub-scenes exist?

**Recommendation:** Same shape as chapter-type § 5.

- **Status** stays writer-set, never derived. A scene with three "final" sub-scenes and three "draft" sub-scenes is whatever the writer marks the scene as. Sub-scenes carry their own `dbench-status`.
- **Word count** lives in `WordCountCache`; computed live (no persistence). Scene total = scene body + sum of sub-scene bodies. Project / chapter rollups walk through to sub-scenes when present.
- **Per-sub-scene target** is optional (`dbench-target-words` on a sub-scene note, defaults unset). Project-level target (already in V1) stays the canonical writer commitment; sub-scene targets are local checkpoints.

**Decision:** ✅ **Ratified 2026-05-02.** Status writer-set, never derived; word count live (no persistence); per-sub-scene target optional.

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

**Scene-card affordances.** A collapsible scene-card (one with sub-scenes) includes a "New sub-scene" button paralleling the chapter-card's "New draft of this chapter" affordance. Removes a Manuscript-view → command-palette context switch when the writer is in the middle of structuring a hierarchical scene.

**Decision:** ✅ **Ratified 2026-05-02.** Three-level rendering with collapsible scene-cards mirroring chapter-cards; "New sub-scene" affordance on scene-card; mixed shape is normal.

---

### 7. Compile pipeline: scene assembly when sub-scenes exist

**Question:** How does compile output handle a scene with sub-scenes?

**Recommendation:** Parallel to chapter-aware compile (chapter-type § 7).

- **`dbench-compile-heading-scope` gains no new value.** The existing `full` / `draft` / `chapter` modes still apply. `chapter` is two-level (chapters → scenes); for sub-scene-aware compile, `chapter` walks chapters → scenes → sub-scenes when sub-scenes are present, otherwise scenes → prose.
- **Scene body emits as scene-introductory prose** when sub-scenes exist (mirrors how chapter body emits as chapter-introductory prose). Empty scene `## Draft` with sub-scenes present = no scene-level prose, sub-scenes flow directly under the scene heading.
- **Walker is now potentially three-level**: `walkChapterAware` extended to descend into sub-scenes when scenes have them. Single dispatch point in `compile-service`; chapter-less / sub-scene-less projects use `walkFlat` (byte-identical for backward compat).
- **Heading levels** — chapter = H1, scene = H2 (in chapter mode), sub-scene = H3. In `draft` mode (chapter-less), scene = H1 and sub-scene = H2. Rules in `chapter-rules.ts` and existing scene-rules extend to handle sub-scene headings.
- **Sub-scene wikilink excludes** — `dbench-compile-scene-excludes` extended (or new `dbench-compile-sub-scene-excludes` field) to support filtering at sub-scene granularity.

**Decision:** ✅ **Ratified 2026-05-02.** Three-level heading cascade H1/H2/H3 in chapter mode; scene body emits as scene-introductory prose when sub-scenes exist; walker extends via single dispatch in `compile-service`.

---

### 8. Reordering: genericize the reorder modal (the third trigger)

**Question:** How does sub-scene reordering work?

**Background:** chapter-type § 8 explicitly noted that the natural genericize trigger for the reorder modal is "the third reorder context (scenes-in-chapter)." Sub-scenes-in-scene IS that third context. Time to deliver on the deferred genericization.

**Recommendation:** Refactor `ReorderScenesModal` and `ReorderChaptersModal` into a single parameterized `ReorderChildrenModal(parentScope, items, parentField)`. Three palette commands route to it:

- `Draft Bench: Reorder chapters in project` (existing)
- `Draft Bench: Reorder scenes` (existing — context-aware: in-chapter or in-project)
- `Draft Bench: Reorder sub-scenes in scene` (new)

Sub-scene reorder context: active scene resolves the parent. Cross-scene sub-scene moves use a "Move to scene" retrofit action (parallel to chapter-type's "Move to chapter").

**Decision:** ✅ **Ratified 2026-05-02.** Refactor `ReorderScenesModal` + `ReorderChaptersModal` into parameterized `ReorderChildrenModal`; new "Reorder sub-scenes in scene" palette command. Cross-scene moves via "Move to scene" retrofit.

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

**What "Set as sub-scene" does and doesn't.** The retrofit action stamps frontmatter (`dbench-type: sub-scene`, parent-scene refs, `dbench-order`) on the selected note. It does not move prose content. Writers extracting a sub-scene from a flat scene's body are responsible for: (a) creating the new sub-scene note (or splitting an existing note off), (b) cutting the relevant prose from the parent scene's `## Draft` into the sub-scene note's body, (c) running "Set as sub-scene" to stamp the parent refs. After extraction, the parent scene's `## Draft` becomes intro-only or empty. Matches the existing "Set as scene" / "Set as chapter" retrofit semantics — these actions classify, they don't migrate content.

**Decision:** ✅ **Ratified 2026-05-02.** Sub-scene-less scenes coexist forever; no mixed-children rule (intro prose + sub-scenes in same scene is fine); "Set as sub-scene" stamps frontmatter only, prose extraction is manual.

---

### 10. Folder structure / on-disk layout

**Question:** Where do sub-scene notes live on disk?

**Background:** Per [specification.md § Project Structure on Disk](specification.md), Draft Bench discovery is frontmatter-based, not folder-based — a note's project / scene membership comes from `dbench-project` / `dbench-scene` frontmatter refs, not its filesystem location. Discovery works regardless of where the file lives; folder structure is purely a creation default that writers can override per-write or undo by manually moving files.

**Recommendation:** Sub-scenes default to nested under their parent scene — `subScenesFolder: '{scene}/'`. Membership comes from `dbench-scene` frontmatter ref; the folder location is the creation default. (The `{project}` token is supported but omitted from the default because the resolver already joins relative paths to the project folder; `'{project}/{scene}/'` would produce a doubled `<projectFolder>/<projectName>/<sceneName>/` path.)

```
Meridian Drift/
├── Meridian Drift.md              ← project
├── Reception.md                   ← scene without sub-scenes
├── The auction.md                 ← scene with sub-scenes
├── The auction/                   ← sub-scenes nested under parent
│   ├── Lot 47.md                  ← sub-scene (dbench-scene: [[The auction]])
│   ├── The bidding war.md         ← sub-scene
│   └── The walk-out.md            ← sub-scene
└── Drafts/
    ├── The auction - Draft 1 (20260502).md             ← whole-scene draft
    └── The auction - Lot 47 - Draft 1 (20260502).md    ← sub-scene draft
```

The nested layout matches the writer's mental model — sub-scenes are constituents of one specific scene, not floating units that share a parent ref. Visual grouping in the file explorer maps to the structural relationship without requiring writers to scan the project root for naming-prefix patterns.

**Why nested by default (when chapters and chapter-aware scenes default flat).** Two reasons:

1. **Sub-scenes are tighter than chapter→scene relationships.** A sub-scene is structurally meaningless outside its parent scene; a scene can in principle stand alone. The folder grouping reflects that asymmetry.
2. **Sub-scenes are more numerous.** Hierarchical scenes typically split into 3-6+ sub-scenes; a project with several hierarchical scenes adds 20+ files. The project-root density problem hits faster than for chapters/scenes.

The chapter / chapter-aware-scene flat default is itself under separate review — the plugin author dogfooding their own plugin reports they "haven't imposed manual nesting within my personal projects, but my inclination is to do so. Facing friction there, because I want to follow what the plugin suggests." That signal motivates a separate FR ([#11](https://github.com/banisterious/obsidian-draft-bench/issues/11): `scenesFolder` should support a `{chapter}` token; consider nested default for chapter-aware projects); not in scope for sub-scene type, but the same writer-friction reasoning applies.

**Sub-scene drafts** share the existing `Drafts/` folder with scene and chapter drafts; frontmatter parent refs disambiguate, and the naming convention `<Scene> - <Sub-scene> - Draft N (date).md` prevents filename collision. Matches the existing "all drafts share the same folder" pattern from [specification.md § Draft Management](specification.md). Drafts do not nest under their source scene's folder; they remain centralized in `Drafts/`.

**Settings — `subScenesFolder` token support.** New setting paralleling `scenesFolder`, with `{project}` and `{scene}` token support. Default `'{scene}/'`. Writers who prefer flat-at-project-root can set `subScenesFolder: ''`:

```
Meridian Drift/
├── Meridian Drift.md
├── Reception.md
├── The auction.md
├── The auction - Lot 47.md               ← sub-scene at project root (flat opt-out)
├── The auction - The bidding war.md
├── The auction - The walk-out.md
└── Drafts/
```

In the flat layout, the naming convention `<Scene> - <Sub-scene>` provides alphabetical clustering. Either layout works; discovery is frontmatter-authoritative.

**Filename naming in the flat layout.** The `<Scene> - <Sub-scene>` prefix is *writer-applied*, not auto-prefixed by the resolver. The new-sub-scene modal follows the established "what you type is what gets named" convention from the new-scene and new-chapter flows; the writer types the full filename including the parent-scene prefix if they want alphabetical clustering. The default nested layout doesn't need the prefix because the folder name does the grouping work. The flat opt-out is for writers who have their own organizational system, have so few sub-scenes that clustering isn't a concern, or are willing to type the prefix themselves. The new-sub-scene modal can show a one-line tip when `subScenesFolder` is empty (e.g., "Tip: prefix with parent scene name to group sub-scenes alphabetically at the project root"); not auto-applying preserves predictability.

**Auto-rename on parent-scene rename.** Because the default uses `{scene}` in the path template, parent-scene renames need to propagate to the sub-scene folder name to avoid divergence. The rename-watcher (which already updates wikilinks across the vault on scene rename per the linker) extends to: when a scene is renamed, find any sibling folder matching the old scene basename containing files with `dbench-scene-id` matching the renamed scene; rename the folder to the new basename. Edge cases: writer manually renamed the folder to something else (no match → no rename); scene title contains characters not allowed in folder names (resolver sanitizes per `FILENAME_FORBIDDEN_CHARS`, same as new-scene creation).

**Decision:** ✅ **Ratified 2026-05-02.** Default `subScenesFolder: '{project}/{scene}/'` (nested under parent scene); `''` opt-out for flat-at-root; auto-rename on parent-scene rename via the linker rename-watcher; flat-layout filename prefix is writer-applied (not auto-prefixed).

---

## Implementation sequence

Once design is ratified, implementation in this order:

1. **Model + types.** [src/model/types.ts](../../src/model/types.ts) extended with `sub-scene` in `DbenchType`. New [src/model/sub-scene.ts](../../src/model/sub-scene.ts) with `SubSceneFrontmatter` + `isSubSceneFrontmatter`. [src/core/essentials.ts](../../src/core/essentials.ts) gets `stampSubSceneEssentials`.
2. **Discovery.** [src/core/discovery.ts](../../src/core/discovery.ts) extended with `SubSceneNote`, `findSubScenes`, `findSubScenesInScene`, `findSubScenesInProject`. Existing `findScenesInProject` updated to walk through sub-scenes for word-count purposes.
3. **Core operations.** New [src/core/sub-scenes.ts](../../src/core/sub-scenes.ts) with `createSubScene`, `resolveSubScenePaths`, `nextSubSceneOrder`. `createScene` unchanged (sub-scenes are opt-in).
4. **Linker.** [src/core/linker.ts](../../src/core/linker.ts) gains `RelationshipConfig` entries for scene↔sub-scene and sub-scene↔draft. Existing scene↔draft relationship still works for sub-scene-less scenes. Rename-watcher extended: on scene rename, auto-rename a matching sub-scene folder when `subScenesFolder` uses `{scene}` (per § 10).
5. **Integrity.** [src/core/integrity.ts](../../src/core/integrity.ts) extends `scanProject` with sub-scene relationship passes. New issue kinds: `SUB_SCENE_MISSING_IN_SCENE`, `STALE_SUB_SCENE_IN_SCENE`, `SCENE_SUB_SCENE_CONFLICT`.
6. **Settings.** Add `sceneCollapseState: Record<DbenchId, boolean>` to `DraftBenchSettings`. New `subSceneTemplatePath` setting. New `subScenesFolder` setting with `{project}` + `{scene}` token support (per § 10); default `'{scene}/'` (nested under parent scene). Writers can set `''` for flat-at-project-root.
7. **Manuscript view rework.** Hierarchical render with collapsible scene cards (mirror of chapter cards) that nest sub-scene rows; scene-card includes a "New sub-scene" affordance paralleling chapter-card's "New draft of this chapter" (per § 6). Section module extends `chapter-card-section.ts` pattern with `scene-card-section.ts`. Scenes without sub-scenes keep today's flat row render.
8. **Compile pipeline.** `walkChapterAware` extended to descend into sub-scenes; new heading-level rules in `chapter-rules.ts` and `compile-rules.ts` for the third level. Default heading-scope for new presets unchanged (writer's call whether their project is sub-scene-aware).
9. **Modals + commands.** `NewSubSceneModal` (title placeholder `Sub-scene <next-order>`, mirroring `NewChapterModal`); `Draft Bench: New sub-scene in scene` palette command; retrofit "Set as sub-scene" action (surfaces a one-time notice when run on a child of a scene with existing whole-scene drafts, per § 4); "Move to scene" available as both single (context menu on a sub-scene note) and bulk (retrofit modal) actions, mirroring chapter-type's "Move to chapter"; context-menu entry on sub-scene notes for "Run compile scoped to sub-scene's parent project".
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

The five questions originally listed here were resolved during 2026-05-02 ratification:

- **Sub-scene template content** — same four-section shape as scenes (Source passages / Beat outline / Open questions / Draft); writers can edit the template if they want leaner. See § 2 implications.
- **Sub-scene title default** — `Sub-scene <next-order>` placeholder, mirroring `NewChapterModal`. See implementation step 9.
- **`Move to scene` action** — both single (context menu on a sub-scene note) and bulk (retrofit modal), mirroring chapter-type's "Move to chapter". See implementation step 9.
- **Sub-scene creation from Manuscript view scene-card** — yes; "New sub-scene" affordance on the scene-card, parallel to chapter-card's "New draft of this chapter". See § 6.
- **Scene drafts when sub-scenes are added later** — writer chooses per draft via the relevant "New draft" command; "Set as sub-scene" surfaces a one-time notice the first time it runs on a child of a scene with existing whole-scene drafts. See § 4.

New open questions will be added below as design progresses.

---

## Decision log

(Populate as ratification happens.)

| Section | Decision | Date | Notes |
|---|---|---|---|
| 1. Terminology | ✅ A (sub-scene) | 2026-05-02 | Genre-neutral; no `dbench-section-break-*` collision; "beat" stays valid in user-facing copy where craft fluency applies |
| 2. Sub-scene modeling | ✅ A (sub-scene-as-note) | 2026-05-02 | Pattern consistency with project / chapter / scene / draft; body utility for per-unit planning sections; sub-scenes are opt-in per scene |
| 3. Frontmatter shape | ✅ Ratified | 2026-05-02 | Mirror scene shape with parent refs to scene + project; `dbench-synopsis` retained for Manuscript view sub-scene-cards |
| 4. Drafts | ✅ Ratified | 2026-05-02 | YES, both — sub-scene drafts and concatenated whole-scene drafts; drafts freeze sub-scene order at capture; flat→hierarchical transition surfaces a one-time notice |
| 5. Status + rollups | ✅ Ratified | 2026-05-02 | Status writer-set, never derived; word count live (no persistence); per-sub-scene target optional |
| 6. Manuscript view | ✅ Ratified | 2026-05-02 | Three-level rendering with collapsible scene-cards mirroring chapter-cards; "New sub-scene" affordance on scene-card; mixed shape (some hierarchical, some flat) is normal |
| 7. Compile assembly | ✅ Ratified | 2026-05-02 | Three-level heading cascade H1/H2/H3 in chapter mode; scene body emits as scene-introductory prose when sub-scenes exist; walker extends via single dispatch |
| 8. Reorder genericization | ✅ Ratified | 2026-05-02 | Refactor `ReorderScenesModal` + `ReorderChaptersModal` into parameterized `ReorderChildrenModal`; new "Reorder sub-scenes in scene" palette command; cross-scene moves via "Move to scene" retrofit |
| 9. Backward-compat | ✅ Ratified | 2026-05-02 | Sub-scene-less scenes coexist forever; no mixed-children rule; "Set as sub-scene" stamps frontmatter only, prose extraction is manual |
| 10. Folder structure | ✅ Ratified | 2026-05-02 | Default `subScenesFolder: '{scene}/'` (nested under parent scene); `''` opt-out for flat-at-root; auto-rename on parent-scene rename via linker rename-watcher; flat-layout filename prefix is writer-applied. Adjacent FR for chapter/scene parallel: [#11](https://github.com/banisterious/obsidian-draft-bench/issues/11) |
