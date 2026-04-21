# UI/UX Reference

**Purpose:** Patterns, conventions, and architectural guidance for building Draft Bench's interface. Adapted from the [Charted Roots](https://github.com/banisterious/obsidian-charted-roots) codebase, which has several years of production use and a cohesive UI/UX language. This document captures those patterns so Draft Bench can follow them consistently — including the known gaps CR has documented so we can close them at build time rather than retrofit later.

**Relationship to the specification:** This is reference material for *how* to build the plugin's UI, not *what* the plugin does. The [specification](specification.md) is authoritative for features and behavior; this document captures the component patterns those features should use. When the specification says "a modal that does X," this document describes how that modal should look, behave, and integrate with the rest of the UI.

**Scope:** Nine sections covering Control Center, modals, settings UI, batch operations, notices, shared components, CSS conventions, accessibility, and empty/loading states. Each section names the CR file paths to consult during implementation, the DB-specific adaptations to apply, and any gap CR has documented that DB should close.

**A note on line numbers.** Line numbers in this document are approximate and based on the Charted Roots codebase as of April 2026. They will drift as CR evolves. Use them as starting points for search within CR's files, not as stable anchors.

---

## 1. Control Center: tabbed plugin hub

**Shape (from CR):** A persistent-feeling modal with a sidebar nav on the left and tab content on the right. Sticky header with title and global actions. Desktop shows the sidebar inline; mobile hides it behind a drawer toggle.

**Key CR files:**

- `src/ui/control-center.ts`: `ControlCenterModal` class. `onOpen()` at ~line 79 builds the shell. `showTab()` at ~line 448 dispatches to tab-specific render methods. State caching (family graph, place graph, universes) at lines 66–96 — expensive services computed once per modal session, cleared in `onClose()`.
- `src/ui/lucide-icons.ts`: `TAB_CONFIGS` (array of `{id, name, icon, group}`) and `NAV_GROUPS` (groups tabs into sections with dividers).
- `styles/control-center.css`: `.crc-control-center-modal`, `.crc-sticky-header` (~line 250), `.crc-drawer` and `.crc-drawer--mobile` modifier (~line 270+).

**DB adaptation:**

- Class name: `DraftBenchControlCenterModal` extending Obsidian's `Modal`.
- Tab config (per specification): **Project**, **Manuscript**, **Templates**, **Compile**, **Settings**. Icons via lucide-icons.
- Cache the current project's scene list (from the project's `dbench-scenes` reverse array) on the modal instance to avoid re-scanning on tab switches. Clear on `onClose()`.
- Manuscript tab hosts a toolbar (New scene / New draft / Reorder scenes / Compile) along the top, per specification § User Interface.
- Mobile drawer behavior: hide sidebar via `Platform.isMobile` check; toggle button in header.

**Gap in CR to close in DB:** Explicit arrow-key navigation between tabs. CR relies on browser-default Tab key. DB's keyboard accessibility section ([specification § Keyboard accessibility](specification.md)) commits to keyboard-first navigation, so implement arrow-up/arrow-down within the sidebar tab list, with Home/End for first/last tab.

**Further reading:** [control-center-reference.md](control-center-reference.md) — depth-first architectural summary of CR's Control Center (drawer shell, tab dispatcher, two-tier cache, Tools group, extension model). Reference material for a later DB Control Center design pass; not a blueprint for Phase 1.

---

## 2. Modal patterns

**Shape (from CR):** All modals extend Obsidian's `Modal`. Actions row at the bottom with primary button on the right (`.mod-cta` class, accent color) and secondary/cancel to its left. Preview-before-apply for destructive operations. Multi-step flows persist state to settings so users can resume across restarts.

**Exemplars in CR:**

- `src/ui/merge-wizard-modal.ts`: field-by-field diff comparison, radio-button choice per field. Button layout ~lines 108–127 (Cancel, Preview, Merge).
- `src/ui/family-creation-wizard.ts`: multi-step wizard with state persistence via `ModalStatePersistence`. `SerializableWizardState` strips `TFile` references before JSON storage so sessions can resume across restarts.
- `src/ui/data-quality-modals.ts`: `DuplicateRelationshipsPreviewModal` at line 24+ is the canonical preview-modal pattern: search/filter/sort controls (~lines 62–101), table (~104–116), warning callout (~121–127), action buttons with disabled-during-execution (~142–147), empty-state text (~242).
- `src/ui/create-person-modal.ts`: form-based modal with complex relationship-field types, state persistence, and a resume banner if state exists on reopen.

**DB adaptation — modals expected in V1:**

| Modal | Pattern | Notes |
|---|---|---|
| New project | Form modal with title, location, shape (folder / single) | Stamp all essentials via the shared helper. |
| New scene in project | Form modal with title, position in order, initial status | Applies scene template. |
| New draft of this scene | Simple confirm ("Snapshot current scene as Draft N?") + executing state + summary notice | Two-file write per § Relationship Integrity. |
| Reorder scenes | List + up/down buttons + move-to-position + keyboard shortcuts | Per specification § Scene reordering: dedicated modal, keyboard-first. |
| Repair project links | Preview -> confirm -> execute -> summary | Canonical preview-modal pattern. |
| Set as project / scene / draft (retrofit) | Form modal if project-shape selection or similar is needed; otherwise direct action + summary notice | Follows CR's addEssential* pattern. |
| Complete essential properties | Direct action + summary notice | Idempotent; no preview needed. |

**Pattern to adopt:**

- Primary button uses `.mod-cta`.
- Destructive/bulk operations use preview -> confirm -> execute -> summary.
- Disable action buttons during async work and update button text ("Applying changes...").
- For multi-step flows (none in V1 but likely in Phase 3 compile UI), persist form state to settings; strip `TFile` references before serialization.

---

## 3. Settings UI

**Shape (from CR):** Collapsible `<details>` sections grouped under headings with dividers. Searchable filter at top to narrow visible settings. All controls use Obsidian's `Setting` API.

**Key CR files:**

- `src/settings.ts`: `CanvasRootsSettingTab` extends `PluginSettingTab` at ~line 891. `CanvasRootsSettings` interface at lines 212–517.
- `styles/settings.css`: `.cr-settings-section` styling, custom chevron on `<summary>::before` that rotates 90° when `[open]`, `.cr-info-box` for inline callouts, `.cr-preferences-callout` for cross-references to the Preferences tab.

**DB adaptation — settings groups for V1:**

- **General**: Default project shape, default status vocabulary (once resolved).
- **Folders**: `projectsFolder`, `scenesFolder`, `draftsFolder` (with `{project}` token support per specification § Default creation folders).
- **Templates**: Scene template folder, built-in vs. user-defined toggle (Phase 2 surface).
- **Relationship Integrity**: `enableBidirectionalSync`, `syncOnFileModify`, Repair project links action.
- **Style Settings**: If Style Settings plugin is installed, a note pointing to its configuration panel. Otherwise a minimal fallback CSS-variable list.
- **About**: Version, links to specification, repair actions, debug info.

**Pattern to adopt:**

- Use `<details>` + `<summary>` for collapsible feature groups with custom chevron indicators.
- Add a search input at top that filters sections by label/description keyword match.
- Use Obsidian's `Setting` class for all controls (native theme compatibility).
- Group related settings under one section with a one-line description.
- For settings that cross-reference another tab or section, use a callout-style box.

---

## 4. Batch-operation UX

**Shape (from CR):** Preview -> confirm -> execute -> summarize. Preview modal shows all planned changes in a filterable table. Execution modal shows progress by phase with running counters. Result notice summarizes success / skip / error counts.

**Key CR files:**

- `src/ui/data-quality-batch-ops.ts`: `previewRemoveDuplicateRelationships()` (~lines 29–117) builds the preview, `removeDuplicateRelationships()` (~122–200) executes and tracks modified + errors arrays. Final notice at line ~197 uses `pluralize()`.
- `src/ui/export-progress-modal.ts`: `ExportPhase` enum (`loading | filtering | privacy | events | sources | places | generating | writing | complete`), phase-to-label mapping in `PHASE_CONFIG` (~lines 31–41), progress bar + running stats display.

**DB adaptation — batch operations in V1:**

- **Retrofit actions over a folder / multi-selection.** Preview: show counts per file of what would change. Execute: progress by scanning + applying phase. Summary: "Set as scene: 5 updated, 3 already typed, 1 error."
- **Repair project links.** Preview: show each detected inconsistency with proposed fix. Execute: apply fixes. Summary: "Repaired 4 scenes; 1 conflict flagged for manual review."
- **New-draft on multiple scenes (Phase 2+).** If we add "New draft across selected scenes," it's a batch op.

**Pattern to adopt:**

- Break long-running batches into named phases; show each phase with its own icon + running counter.
- Collect errors into an array; report count in the final notice; offer a follow-up modal for error details.
- Use `pluralize(n, 'file')` (or equivalent helper) so grammar matches count.
- Every batch notice follows a consistent shape: `<action verb>: <n> <result>, <n> <skipped>, <n> errors`.

---

## 5. Notices and feedback

**Shape (from CR):** Direct use of Obsidian's `new Notice()` for all user feedback — no custom toast/snackbar component. Success messages prefixed with Unicode checkmark `\u2713`. Batch operations follow a progress-notice + final-summary-notice pattern.

**Conventions:**

- Single-file result: "Added essential properties" / "File already has all essential properties" / "Failed to add essential properties"
- Multi-file result: "Essential properties: 5 updated, 3 already complete, 1 errors"
- Progress: "Removing duplicate relationships..." (shown while async work runs)
- Success checkmark: `new Notice(`\u2713 Removed duplicates from ${n} ${pluralize(n, 'file')}`)`
- Error handling: Errors caught in `try/catch`, messages extracted via `getErrorMessage()` helper, shown in a final notice or collected for batch reporting.

**DB adaptation:**

- Success checkmark: `\u2713` prefix on success notices.
- Single-file retrofit: "Set as scene" / "Already a scene" / "Failed to apply properties."
- Multi-file retrofit: "Set as scene: 5 updated, 3 already typed, 1 error."
- New-draft: "\u2713 Created Draft 2 of Tempting Waters."
- Repair: "\u2713 Repaired project links: 4 fixes, 1 conflict flagged."

**Pattern to adopt:**

- Use `Notice` directly: no wrapper functions.
- Prefix success with `\u2713`.
- Use a pluralize helper for grammar.
- Show progress notice for operations > 200ms; follow with a result notice on completion.

---

## 6. Common components

**Shape (from CR):** No central `components/` directory. Reusable pieces live as exported utilities or as modal classes per entity type.

**CR utilities worth studying:**

- `src/ui/shared/card-component.ts`: `createStatItem(container, label, value, icon?)` at ~lines 10–22. Used for dashboard stat grids. Structure: optional icon + value (large) + label (small).

**CR picker modals (same shape, different data):**

- `src/ui/person-picker.ts`: search + filter + sort. Loading state (~lines 203–205), empty state (~728–731).
- `src/ui/place-picker.ts`: same pattern with place hierarchy display.
- `src/sources/ui/source-picker-modal.ts`: source selection with category filter.

**CR type-manager cards (for editing custom types):**

- `src/relationships/ui/relationship-type-manager-card.ts`
- `src/places/ui/place-type-manager-card.ts`
- `src/events/ui/event-type-manager-card.ts`

Each shows a card with icon, name, description, and inline edit/delete buttons.

**DB adaptation — V1 needs:**

- **Stat items** on the Project tab (scene count, word count, status breakdown): use CR's `createStatItem` pattern.
- **Reorder modal scene list** (V1): a scrollable list of scenes with keyboard navigation, up/down move affordances, and commit action. The V1 instance of the scrollable-list-with-keyboard-nav pattern that Phase 2 pickers will extend.
- **Project picker** (Phase 2): extends the V1 reorder-list pattern with search and filter controls. Used for "Add this scene to project..." polish on the retrofit flow and the "Open other project's Control Center" command.
- **Scene picker** (Phase 2): same extension pattern, for setting a draft's `dbench-scene` when retrofitting.

**Pattern to adopt:**

- Establish the scrollable-list-with-keyboard-nav primitive in V1 via the reorder modal. Phase 2 entity pickers extend it with search input, filter controls, and sort controls: same foundation, additional affordances.
- For entity pickers, implement as `class extends Modal` with that foundation. Loading state while data fetches; empty state if search yields nothing.
- For custom-type managers (Phase 2+ if we surface scene-template management), render an array of objects as card grid with inline actions.

---

## 7. CSS conventions

**Class naming (from CR):** BEM-like with a plugin-specific prefix. `.crc-{component}__element--modifier`. State modifiers use `--active`, `--open`, `--mobile`, etc., applied via JavaScript `classList.add()`.

**Color system (from CR):** Always use Obsidian CSS variables (`--background-primary`, `--text-normal`, `--background-modifier-border`, `--interactive-accent`). Never hardcode colors. Custom plugin variables defined at `:root` level in a `variables.css`.

**Key CR files:**

- `styles/variables.css`: spacing scale (`--cr-spacing-xs/sm/md/lg/xl`), radius scale (`--cr-radius-xs/sm/md/lg`), transitions (`--cr-transition-fast/normal/slow`), plus feature-specific variables.
- `styles/base.css`: utility classes (`.crc-inline`, `.crc-block`, `.crc-hidden`, `.crc-clickable`), modal button container (`.cr-modal-buttons` ~lines 79–86), spinner keyframes (`@keyframes cr-spin` ~lines 93–97).
- `build-css.js`: concatenates `styles/*.css` in a defined `componentOrder` array; each component file is self-contained.

**DB adaptation:**

- Class prefix: `.dbench-` (short) + `.draft-bench-` (long). Per DB's coding-standards.md BEM conventions. Both prefixes allowed by the `.stylelintrc.json` regex.
- DB CSS variables: `--dbench-spacing-*`, `--dbench-radius-*`, `--dbench-transition-*`. Plus feature-specific: `--dbench-scene-*` and `--dbench-draft-*` per specification § Styling and Style Settings Integration.
- Reference Obsidian's native color/theme variables everywhere. Theme compatibility for free.
- State modifiers applied via JavaScript (`--open`, `--active`, `--mobile`).
- Keyframe animations defined once in a `base.css`; referenced by name.

**Pattern to adopt:**

- Namespace all classes with `.dbench-` short or `.draft-bench-` long.
- Define spacing/radius/transition scales at `:root` via CSS variables.
- Reference Obsidian's color variables; never hardcode.
- One keyframe-animation file; animate-once, reference-many.
- Dark mode: rely on Obsidian's CSS variables for theme switching; use `@media (prefers-color-scheme: dark)` sparingly.

---

## 8. Accessibility

**Current state (CR):** Basic ARIA support. Icon-only buttons have `aria-label`. Tables use semantic `<thead>/<tbody>`. Obsidian's `Modal` class provides `role="dialog"` and focus management implicitly.

**Representative CR examples:**

- `src/ui/standardize-place-variants-modal.ts:310-323`: icon button: `attr: { 'aria-label': 'Open note in new tab' }`.
- `src/ui/preferences-tab.ts:1004`: `removeBtn.setAttribute('aria-label', 'Remove override')`.
- `src/ui/data-quality-view.ts:92`: refresh button with `aria-label`.
- `src/ui/data-quality-modals.ts:104-116`: semantic table HTML.

**Known gaps in CR that DB should close:**

- No explicit arrow-key navigation inside lists or tab groups.
- No `role="listbox"` / `role="option"` on picker results.
- No explicit focus-trap logic inside modals (Obsidian's `Modal` handles this partially).

**DB adaptation — the [specification § Keyboard accessibility](specification.md) commits to closing these:**

- Arrow-key navigation in the Control Center sidebar (up/down between tabs), in the reorder modal (up/down between scenes), and in picker modals (up/down between results with Enter to select).
- Explicit `role="listbox"` on scrollable list surfaces; `role="option"` on items; `aria-selected` on the current item.
- Focus trap on modal open; focus restoration to the triggering element on modal close.
- Every icon-only button has `aria-label`.
- Semantic HTML everywhere (list, table, heading, form).
- Test Tab-only navigation through every modal before shipping.

**Pattern to adopt:**

- `aria-label` on every icon-only button.
- Semantic HTML for lists and tables.
- Explicitly call `.focus()` on the primary interactive element after `onOpen()`.
- Arrow-key nav for any list or tab surface.
- Focus trap + focus restoration for every modal.

---

## 9. Empty and loading states

**Shape (from CR):** Both use consistent class naming (`.crc-{context}-loading` / `.crc-{context}-empty`) and a predictable structure: spinner + text for loading; icon/text + optional helper for empty.

**CR loading-state examples:**

- `src/ui/person-picker.ts:203-205`: `.crc-picker-loading` with `.crc-picker-loading__spinner` + `.crc-picker-loading__text` children. "Loading people..." message.
- `src/ui/place-picker.ts:115-117`: identical pattern.
- `src/ui/dashboard-tab.ts:850-873`: `.crc-dashboard-loading` with "Loading statistics..." text.
- `src/ui/views/family-chart-view.ts:~1213`: `.cr-family-chart-loading` with spinner and text, used as overlay while chart initializes.

**CR empty-state examples:**

- `src/ui/person-picker.ts:728-731`: `.crc-picker-empty` with "No people found".
- `src/ui/data-quality-modals.ts:242`: empty row in `<tbody>` with "No matches found".
- `src/ui/create-note-modal.ts:374`: `.crc-linked-entities-field__empty` with muted text.

**Spinner implementation:** CSS `@keyframes cr-spin` in `styles/base.css` ~lines 93–97. Applied via `animation: cr-spin 1s linear infinite` on any element that needs to spin.

**DB adaptation:**

- Class naming: `.dbench-{context}-loading` / `.dbench-{context}-empty`.
- Spinner: one `@keyframes dbench-spin` in `styles/base.css`; reused via `animation: dbench-spin 1s linear infinite`.
- Empty states for V1:
  - Project tab, no project open: "Open a project from the Manuscript tab or create a new one." + "Create project" button.
  - Manuscript tab, empty project: "No scenes yet. Create your first scene." + "New scene" button.
  - Templates tab, no user templates: "Using the built-in scene template." + link to Templates documentation.
- Loading states for V1:
  - Vault scan (first open of a project after startup): "Loading project..." for Control Center while the linker populates reverse arrays.
  - Long batch operations: phase-specific loading text (see § 4).

**Pattern to adopt:**

- Consistent class naming: `.dbench-{context}-loading` and `.dbench-{context}-empty`.
- Loading = spinner + text.
- Empty = optional icon + message + optional helper text + optional CTA button.
- For tables, render an empty-state row inside `<tbody>` when data is empty.
- Reuse a single spinner animation defined once in the base stylesheet.

---

## Summary: what makes CR's UI cohesive

- **Consistent class prefixing** (`.crc-` / `.cr-`) enables component isolation without a framework.
- **Obsidian CSS variables everywhere**: theme compatibility for free; dark/light handled automatically.
- **Modal-first workflows** with preview -> execute -> summarize for anything destructive.
- **State persistence** for multi-step flows; users resume after Obsidian restarts.
- **Shared utility components** (`createStatItem`, picker modals, type-manager cards) rather than a monolithic component library: copy the pattern, not the framework.
- **Notices via Obsidian native**: no custom toast infrastructure to maintain.
- **Opinionated spacing / radius / transition scales** defined once as CSS variables.

## DB-specific adaptations

Where DB intentionally diverges from or extends CR's patterns:

- **Prefixes.** `.dbench-` short + `.draft-bench-` long (vs. CR's `.crc-` + `.cr-` two-tier). Same two-tier discipline, DB-specific names.
- **Accessibility discipline is stronger.** DB's specification commits to keyboard-first operation with arrow-key nav, focus traps, and explicit ARIA roles. CR documents these as known gaps; DB closes them at build time.
- **Reorder surface.** DB uses a dedicated reorder modal (not drag-in-place). Matches the focused-operation pattern of CR's merge wizard; diverges from many plugins that reorder inline.
- **Manuscript tab toolbar.** Inline primary actions (New scene / New draft / Reorder / Compile) rather than forcing discovery via context menu or command palette alone.
- **Retrofit actions follow CR's `addEssential*` pattern directly.** Named "Set as X" for DB's purposes (because the action sets `dbench-type` as well as other essentials), but the idempotent, smart-menu-visibility, empty-placeholder philosophy is copied verbatim.
- **Draft-leaf archival cue.** DB ships default styling for `.dbench-draft` that visually distinguishes archived snapshots from live scenes. CR doesn't have an analogous archive/live distinction.

---

## Related documents

- [specification.md](specification.md): Plugin specification (authoritative for features and behavior)
- [decisions/D-01](decisions/D-01-draft-modeling.md): Draft modeling
- [decisions/D-03](decisions/D-03-parent-child-relationship-naming.md): Relationship naming
- [decisions/D-04](decisions/D-04-folder-flexibility.md): Folder flexibility
- [decisions/D-05](decisions/D-05-property-retrofit-actions.md): Retrofit actions
