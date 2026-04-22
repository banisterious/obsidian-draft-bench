# Draft Bench: Code Architecture

**Purpose:** a sketch of the `src/` layout and how the pieces fit together. Written ahead of implementation so the first code goes into predictable places. Expect this document to evolve as patterns emerge; treat it as a starting point rather than a contract.

**Scope:** V1 Phase 1 features (project creation, scene creation, drafts, linker, integrity service, control center, reorder modal, retrofit actions, CSS classes, Style Settings integration). Phases 2+ extend the same shape.

**Companion docs:**

- [specification.md](../planning/specification.md): what the plugin does.
- [ui-reference.md](../planning/ui-reference.md): how the UI should look and behave (Charted Roots patterns).
- [coding-standards.md](coding-standards.md): TypeScript, CSS, and Obsidian-API conventions.

---

## Directory layout

```
src/
  main.ts                             Plugin class; registers commands, menus, event listeners

  core/                               Pure domain logic; no Obsidian UI, no DOM
    id.ts                             generateDbenchId(); format validation (abc-123-def-456)
    essentials.ts                     stampProjectEssentials, stampSceneEssentials, stampDraftEssentials
    discovery.ts                      Vault-wide scan + frontmatter filter utilities
    linker.ts                         DraftBenchLinker: live sync service
    integrity.ts                      DraftBenchIntegrityService: batch repair
    drafts.ts                         New-draft snapshot flow (scene body + frontmatter)
    reorder.ts                        dbench-order writes across multiple scenes
    status.ts                         Hardcoded V1 status vocabulary + helpers

  model/                              TypeScript types + small domain helpers
    types.ts                          DbenchType, DbenchId, forward/reverse relationship types
    project.ts                        Project frontmatter shape + guard functions
    scene.ts                          Scene frontmatter shape + guard functions
    draft.ts                          Draft frontmatter shape + guard functions
    settings.ts                       DraftBenchSettings interface + DEFAULT_SETTINGS

  ui/                                 Obsidian UI surfaces (modals, tabs, styling hooks)
    control-center/
      control-center-modal.ts         Tabbed modal shell
      tabs/
        project-tab.ts                Overview, word count, metadata
        manuscript-tab.ts             Ordered scene list + toolbar
        templates-tab.ts              Template management
        compile-tab.ts                Placeholder (Phase 3+)
    modals/
      new-project-modal.ts            Create-project flow
      new-scene-modal.ts              Create-scene flow
      new-draft-modal.ts              Confirm-and-snapshot flow
      reorder-scenes-modal.ts         Keyboard-first reorder UI
      repair-project-modal.ts         Preview / confirm / execute repair
      set-as-type-modal.ts            Optional project-shape prompt for "Set as project" retrofit
    leaf-styles.ts                    Adds .dbench-project / .dbench-scene / .dbench-draft classes to the active leaf
    notices.ts                        Notice formatting helpers (success checkmark, batch summary, pluralize)

  commands/                           Command palette entries (also bound by context menu)
    register.ts                       Central registration called from main.ts
    create-project.ts                 Opens new-project-modal
    new-scene.ts                      Opens new-scene-modal
    new-draft.ts                      Runs the snapshot flow
    reorder-scenes.ts                 Opens reorder modal
    repair-project.ts                 Runs batch repair
    retrofit/
      set-as-project.ts
      set-as-scene.ts
      set-as-draft.ts
      complete-essentials.ts
      add-id.ts
    navigation/
      jump-to-scene.ts                Next/previous scene commands

  context-menu/                       File-explorer / editor context menu integration
    register.ts                       Hooks workspace.on('file-menu') / ('files-menu')
    file-menu.ts                      Single-file menu items (smart visibility)
    files-menu.ts                     Multi-selection menu items
    folder-menu.ts                    Folder-scope menu items

  settings/                           Obsidian Settings tab
    settings-tab.ts                   DraftBenchSettingTab extends PluginSettingTab
    groups/                           Collapsible settings sections
      general.ts
      folders.ts
      templates.ts
      integrity.ts
      style-settings.ts
      about.ts

styles/                               CSS (processed via build-css.js)
  variables.css                       Spacing, radius, transition scales; --dbench-scene-*, --dbench-draft-*
  base.css                            Utility classes; keyframes (@keyframes dbench-spin)
  control-center.css
  modals.css
  reorder-modal.css
  notes.css                           .dbench-scene, .dbench-draft, .dbench-project styling
  build-css.js                        Concatenates styles/*.css into styles.css

tests/                                Vitest suites (mirrors src/ structure)
  core/
    id.test.ts
    essentials.test.ts
    linker.test.ts
    integrity.test.ts
    ...
  model/
    project.test.ts
    ...
  mocks/
    obsidian.ts                       Mocks for Vault, MetadataCache, FileManager, App, TFile
```

---

## Layering rules

Dependencies flow one way. Breaking this in a PR should be a red flag reviewed explicitly.

```
styles/   (static; no imports)
  
model/    -> (nothing plugin-internal; may import from obsidian types)
  
core/     -> model/
  
ui/       -> core/, model/
  
commands/ -> core/, ui/, model/
  
context-menu/ -> commands/
  
settings/ -> core/, ui/, model/
  
main.ts   -> all of the above
```

**Allowed:** lower layers imported by higher layers.
**Not allowed:** circular imports; `core/` importing from `ui/`; `model/` importing from anywhere but `obsidian` types.

---

## Key flows

### Create a scene

```
Command: "Draft Bench: New scene in project"
  -> commands/new-scene.ts
     -> opens ui/modals/new-scene-modal.ts
        -> user submits form
        -> core/essentials.ts stampSceneEssentials(frontmatter)
        -> ui/notices.ts success notice
     -> (suspended-sync window) writes scene file + updates project's dbench-scenes array
     -> (linker re-sync after suspend) verifies consistency
```

### Take a new draft

```
Command: "Draft Bench: New draft of this scene"
  -> commands/new-draft.ts
     -> opens ui/modals/new-draft-modal.ts (confirm)
        -> core/drafts.ts snapshot flow:
           - core/id.ts generateDbenchId() for the draft
           - write snapshot file with frontmatter
           - update scene's dbench-drafts reverse array (suspend window)
           - scene note body carries forward unchanged
        -> ui/notices.ts "\u2713 Created Draft N of <Scene>"
```

### Repair project links

```
Command: "Draft Bench: Repair project links"
  -> commands/repair-project.ts
     -> opens ui/modals/repair-project-modal.ts (preview)
        -> core/integrity.ts scan:
           - walk project scenes (discovery.ts)
           - compare forward refs + reverse arrays + ID companions
           - collect mismatches; classify (auto-repairable vs. conflict)
        -> preview table in modal
        -> on confirm: core/integrity.ts apply fixes
        -> ui/notices.ts batch summary
```

---

## Testing strategy

**Unit-testable (high priority for Phase 1 test coverage):**

- `core/id.ts`: format generation, validation, collision-handling.
- `core/essentials.ts`: idempotent stamping, property preservation, filename defaults.
- `core/linker.ts`: forward/reverse sync, suspend/resume, delete cascade.
- `core/integrity.ts`: mismatch detection, repair correctness, conflict flagging.
- `core/discovery.ts`: vault scan + frontmatter filter.
- `core/drafts.ts`: snapshot, carry-forward, auto-numbering.
- `core/reorder.ts`: multi-scene order writes.

**Integration-testable (Phase 1 or Phase 2 depending on effort):**

- Create-project -> create-scene -> new-draft -> reorder flow.
- Repair service against injected inconsistencies.
- Retrofit actions over a mixed folder.

**Manual only:**

- Control Center rendering and modals.
- Context menu visibility on real files.
- Ribbon and command palette integration.
- Style Settings variable wiring.

**Vitest setup:** see `vitest.config.ts` and `tests/mocks/obsidian.ts`. The mock module intercepts `import 'obsidian'` in tests and provides a minimal implementation of `Vault`, `MetadataCache`, `FileManager`, `TFile`, and `Notice` sufficient for unit tests. Plugin integration tests that need a real vault run against `dev-vault/` (gitignored).

---

## Implementation order for Phase 1

Recommended order, minimizing branch churn:

1. **`core/id.ts`, `core/essentials.ts`** (plus tests). Smallest, pure, building blocks for everything else. *(done)*
2. **`model/types.ts`, `model/project.ts`, `model/scene.ts`, `model/draft.ts`, `model/settings.ts`**. Lock down the shapes. *(done)*
3. **`core/discovery.ts`** (plus tests). Vault scan + frontmatter filter. *(done)*
4. **`commands/create-project.ts`, `ui/modals/new-project-modal.ts`**. First end-to-end user-visible feature. *(done)*
5. **`core/linker.ts`, `core/integrity.ts`** (plus tests). Core correctness infrastructure before more features pile on. *(linker scaffold only; handler bodies + integrity service land in P1.A-C below)*
6. **`commands/new-scene.ts`, `ui/modals/new-scene-modal.ts`**. Second user-facing command; exercises the linker. *(done)*
7. **`ui/control-center/control-center-modal.ts`** + Project/Manuscript tabs (basic rendering only). *(deferred — lands in P1.D below)*
8. **`commands/new-draft.ts`, `core/drafts.ts`**. Snapshot flow. *(done)*
9. **`ui/modals/reorder-scenes-modal.ts`, `commands/reorder-scenes.ts`, `core/reorder.ts`**. Ordering UI. *(done)*
10. **`context-menu/*`, `commands/retrofit/*`**. Retrofit surface. *(done)*
11. **`ui/leaf-styles.ts`, `styles/notes.css`**. CSS class tagging + base styles. *(done)*
12. **`settings/*`**. Settings tab. *(done)*
13. **Style Settings integration**. Last polish before Phase 1 cap. *(deferred — lands in P1.E below)*

---

## Phase 1 remainder

Three Phase 1 items from the list above were skipped or scaffolded-only during the initial implementation pass. Finish them before any Phase 2 work so the bidirectional-linking invariant and the Control Center hub are in place.

**P1.A — Linker handlers (scene ↔ project).**

Implement real bodies for `DraftBenchLinker.handleModify` / `handleDelete` / `handleRename` covering the project-owned reverse arrays (`dbench-scenes` / `dbench-scene-ids`).

- *On modify*: read the scene's declared `dbench-project-id`; ensure that project's reverse arrays include this scene (append if missing). Scan other projects for stale references to this scene's id and remove them (scene moved to a different project).
- *On delete*: find the declared parent by id, remove the deleted scene from its reverse arrays. No cascade to drafts — leave them orphaned and let the repair service surface them.
- *On rename*: update the wikilink entry in the parent's reverse array (the id companion is stable and doesn't need touching).

Drive with unit tests modeled on `tests/core/linker.test.ts` (which already covers lifecycle, suspend/resume, and listener counts).

**P1.B — Linker handlers (scene ↔ draft and project ↔ draft single-scene).**

Extend the handler bodies to draft relationships:

- *Scene → Draft*: `dbench-drafts` / `dbench-draft-ids` on scenes, forward refs `dbench-scene` / `dbench-scene-id` on drafts. Same modify/delete/rename semantics.
- *Project → Draft (single-scene)*: drafts with empty `dbench-scene` but non-empty `dbench-project-id` attach directly to the project's `dbench-drafts` / `dbench-draft-ids` arrays. The handlers dispatch on "does the draft have a scene parent?" before deciding which array to touch.

**P1.C — Integrity service + "Repair project links" command.**

- `src/core/integrity.ts` — `DraftBenchIntegrityService`:
  - `scanProject(projectId)` returns an `IntegrityReport` listing inconsistencies: missing reverse-array entries, orphan children (id companion points at non-existent note), conflicting refs (wikilink points at A, id companion at B).
  - Classifies each entry as `auto-repairable` or `conflict`. Auto-repairable cases have an obvious fix; conflicts need user judgment.
  - `applyRepairs(report)` executes the auto-repairable subset, returns a summary.
- `src/ui/modals/repair-project-modal.ts` — preview modal per the canonical `preview → confirm → execute → summary` pattern in [ui-reference.md](../planning/ui-reference.md). Shows the report grouped by category, marks conflicts as unrepairable with an explanation.
- `src/commands/repair-project.ts` — palette command (needs an active project note or a project picker). Also surface via project context menu entry.

**P1.D — Control Center skeleton.**

- `src/ui/control-center/control-center-modal.ts` — tabbed modal shell, accessible via:
  - Ribbon icon (lucide `pencil-line`) — registered in `main.ts`.
  - Palette command: "Draft Bench: Open Control Center".
  - Project note context menu entry.
- Tabs (Phase 1 scope — rendering only; Phase 2 adds content):
  - **Project**: project title, status, synopsis placeholder.
  - **Manuscript**: ordered scene list (read-only; sorted by `dbench-order`). Status and draft-count badges per row. Toolbar along the top with buttons: "New scene", "New draft of current scene", "Reorder scenes", "Compile" (Phase 3+ placeholder). Buttons invoke the existing commands.
  - **Templates**: placeholder ("Template management — Phase 2").
  - **Compile**: placeholder ("Book Builder — Phase 3").
- Plugin settings stay at Options -> Community plugins -> Draft Bench; no Settings tab is embedded in the Control Center. A later Dashboard surface will launch the native settings panel via `app.setting.open()` + `openTabById('draft-bench')`; see [control-center-reference.md](../planning/control-center-reference.md) for the commitment.
- `src/ui/control-center/tabs/*.ts` — one file per tab for clarity, even if the Templates and Compile tabs are placeholders.
- The modal caches the active project's scene list on construction to avoid re-scanning on tab switches; clear on `onClose()` per [ui-reference.md § Control Center conventions](../planning/ui-reference.md).

**P1.E — Style Settings integration (deferred step 13).**

Pair two pieces that should land together:

- `styles/style-settings.css` — Style Settings manifest block wrapping the variable declarations in `variables.css`. Declares the variable groups (Shared / Scene / Draft) per [specification.md § Style Settings integration](../planning/specification.md).
- `styles/notes.css` additions — consuming rules for the previously-declared-but-unused variables: scene font-family / font-size / line-height / max-width, draft background, draft text-color. Ship opinionated defaults that read sensibly in Obsidian's default light/dark themes.

After P1.E, Phase 1 is cap-complete and release-eligible.

---

## Phase 2

With Phase 1 actually complete, Phase 2 adds writer-polish features. Same layering rules apply.

**P2.A — User templates.** ✅ Shipped (P2.A.1/2/3 in prior sessions, P2.A.4 in 2026-04-22).

Composable with Templater rather than a replacement for it. Writers without Templater still get default template application; writers with Templater get rich body scripting on top.

- `src/core/templates.ts` — scene-template resolution:
  - `ensureSceneTemplateFile` reads `settings.sceneTemplatePath` (override) or `<settings.templatesFolder>/scene-template.md`; seeds the built-in default on first use.
  - `loadSceneTemplateBody` composes `ensureSceneTemplateFile` + `vault.read`.
  - `substituteTokens` resolves six plugin tokens: `{{project}}`, `{{project_title}}`, `{{scene_title}}`, `{{scene_order}}`, `{{date}}`, `{{previous_scene_title}}`. Unknown `{{token}}` sequences pass through untouched.
- `src/core/templater.ts` — Templater adapter:
  - `isTemplaterEnabled(app)` checks `app.plugins.getPlugin('templater-obsidian')`.
  - `renderTemplateThroughTemplater(app, templateFile, targetFile)` calls Templater's `templater.create_running_config(template, target, 0)` + `templater.read_and_parse_template(config)` and returns the parsed body string (or `null` on failure).
- `createScene` dispatches via `renderSceneBody`:
  - Templater enabled: create empty scene file (needed for `tp.file.*` resolution) → Templater processes the template → plugin-tokens substituted on Templater's output → written back to the scene file → frontmatter stamped.
  - Templater absent or throws: plain flow — `resolveSceneTemplate` reads + substitutes → `vault.create(path, body)` → frontmatter stamped. On failure the writer sees a Notice; scene creation still completes.
- Settings tab's Templates section ships the scene-template override path with `FileSuggest` autocomplete.
- P2.A.4 stretch goal (Templater): shipped with the scene path only. Projects start empty; drafts snapshot the existing scene body. Neither needs Templater in V1.

**P2.B — Word counts.** ✅ Shipped (P2.B.1/2/3/4/5 in prior sessions, P2.B.2 targets on 2026-04-22).

- `src/core/word-count.ts` — pure counter:
  - Strip frontmatter, fenced code, HTML comments, `%%` inline, wikilink syntax (keep display text); slice to `## Draft` section when present.
  - Return count for a given markdown string.
- `src/core/word-count-cache.ts` — per-scene cache keyed by file path + mtime; `countForProject` aggregates total, words/scenes by status (lazy buckets), and target fields (`projectTarget`, `sceneTargetSum`, `scenesWithTargets`). Invalidated on `vault.on('modify')`.
- `src/core/targets.ts` — target-word helpers:
  - `readTargetWords(frontmatter)` validates `dbench-target-words` is a positive integer (otherwise returns `null`). Writers opt in via the Properties panel or template frontmatter; not stamped by essentials.
  - `formatProgress(count, target)` returns `{ label, percent (clamped), rawPercent, overage }` for UI rendering.
- Control Center surfaces:
  - Project tab: project total, status breakdown, plus a hero progress bar above the total when `dbench-target-words` is set on the project. Overage (count > target) tints the fill warning-colored; label always shows the raw percentage so writers see the overflow (e.g., `3,200 / 3,000 words (107%)`).
  - Manuscript tab: per-scene row renders a stacked label + mini progress bar when the scene has a `dbench-target-words`, or the plain word badge otherwise.
- V1 authoring: Properties panel or template frontmatter. No inline Set-target input on the Project/Manuscript tabs; revisit if writers ask.

**P2.C — Bases starter views.** Patterns drawn from Charted Roots: see [bases-reference.md](../planning/bases-reference.md) for the orchestration pattern (`createBaseFile`, `isBasesAvailable`, soft availability gate, "already exists" guard) plus the DB commitments section for decisions already locked (static templates, no property aliases, user-triggered install, no cross-entity bases in V1).

- Ship `.base` files in the plugin's repo (not auto-installed):
  - All projects (sorted by status).
  - Scenes in current project (ordered by `dbench-order`).
  - Scenes by status (grouped).
  - Draft history for a scene.
- Document in `wiki-content/` and README how to copy them to a vault.
- Optional: "Draft Bench: Install starter Bases views" command that copies the files to a user-selected folder.

**P2.D — Configurable status vocabulary.** ✅ Shipped.

- `DbenchStatus` widened from a literal union to `string`; the built-in default set is exported as `DEFAULT_STATUS_VOCABULARY` (`idea -> draft -> revision -> final`).
- `settings.statusVocabulary: string[]` persists the active vocabulary; first entry is the default stamped onto new scenes.
- `EssentialsContext` gained an optional `defaultStatus` field so stamp helpers use the configured default rather than the built-in constant. All creation paths (`createProject`, `createScene`) and retrofit actions (`setAsProject`, `setAsScene`, `setAsDraft`, `completeEssentials`, `addDbenchId`) thread settings through.
- `WordCountCache`'s aggregate buckets are now `Record<string, number>` with lazy creation; the Project-tab word-count breakdown iterates settings first, then any out-of-vocab buckets the cache discovered.
- Settings tab Statuses section: ordered row list with drag-handle and keyboard (up/down, j/k) reorder, inline text rename, "Default" badge on row 0, remove button per row (last row's remove is gated). Adding a status appends a "new status" row (counter-suffixed on collision).
- Renaming an in-use status migrates affected notes in place via `core/statuses.renameStatus` inside `linker.withSuspended`. Removing an in-use status opens `RemoveStatusModal` with three options: rename-and-remove (with a dropdown of alternatives), remove-without-migrating, or cancel.
- Core helpers at `src/core/statuses.ts`: `filesWithStatus`, `countStatusUsage`, `renameStatus`.
- `RemoveStatusModal` at `src/ui/modals/remove-status-modal.ts` resolves a `Promise<RemoveStatusResult | null>` for the settings-tab caller.

---

## Ordering rationale

- **P1.A first** because linker stubs are the largest piece of technical debt; every new feature that writes frontmatter compounds the fragility.
- **P1.C right after P1.B** because the integrity service's reconciliation rules are the same rules the linker applies inline — building them together locks the shared semantics.
- **P1.D before Phase 2** because word counts (P2.B) and template management (P2.A) both naturally surface in the Control Center.
- **P1.E before Phase 2** because Phase 2 features may want Style Settings knobs for visual tuning.
- **P2.A before P2.B** because templates are independent and exercise the codebase without depending on other Phase 2 items; word counts are additive on top.
- **P2.C and P2.D** are independent of each other and of the above; can swap order based on writer feedback.
