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
        settings-tab.ts               Inline settings (mirrors main Settings tab)
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

1. **`core/id.ts`, `core/essentials.ts`** (plus tests). Smallest, pure, building blocks for everything else.
2. **`model/types.ts`, `model/project.ts`, `model/scene.ts`, `model/draft.ts`, `model/settings.ts`**. Lock down the shapes.
3. **`core/discovery.ts`** (plus tests). Vault scan + frontmatter filter.
4. **`commands/create-project.ts`, `ui/modals/new-project-modal.ts`**. First end-to-end user-visible feature.
5. **`core/linker.ts`, `core/integrity.ts`** (plus tests). Core correctness infrastructure before more features pile on.
6. **`commands/new-scene.ts`, `ui/modals/new-scene-modal.ts`**. Second user-facing command; exercises the linker.
7. **`ui/control-center/control-center-modal.ts`** + Project/Manuscript tabs (basic rendering only).
8. **`commands/new-draft.ts`, `core/drafts.ts`**. Snapshot flow.
9. **`ui/modals/reorder-scenes-modal.ts`, `commands/reorder-scenes.ts`, `core/reorder.ts`**. Ordering UI.
10. **`context-menu/*`, `commands/retrofit/*`**. Retrofit surface.
11. **`ui/leaf-styles.ts`, `styles/notes.css`**. CSS class tagging + base styles.
12. **`settings/*`**. Settings tab.
13. **Style Settings integration**. Last polish before Phase 1 cap.
