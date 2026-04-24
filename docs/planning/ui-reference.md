# UI/UX Reference

**Purpose:** Patterns, conventions, and architectural guidance for building Draft Bench's interface. Adapted from the [Charted Roots](https://github.com/banisterious/obsidian-charted-roots) codebase, which has several years of production use and a cohesive UI/UX language. This document captures those patterns so Draft Bench can follow them consistently — including the known gaps CR has documented so we can close them at build time rather than retrofit later.

**Relationship to the specification:** This is reference material for *how* to build the plugin's UI, not *what* the plugin does. The [specification](specification.md) is authoritative for features and behavior; this document captures the component patterns those features should use. When the specification says "a modal that does X," this document describes how that modal should look, behave, and integrate with the rest of the UI.

**Scope:** Eleven sections covering styling philosophy, Control Center, modals, settings UI, batch operations, notices, shared components, CSS conventions, accessibility, empty/loading states, and an Obsidian-native class and API inventory. Each section names the CR file paths to consult during implementation, the DB-specific adaptations to apply, and any gap CR has documented that DB should close.

**A note on line numbers.** Line numbers in this document are approximate and based on the Charted Roots codebase as of April 2026. They will drift as CR evolves. Use them as starting points for search within CR's files, not as stable anchors.

---

## 0. Styling philosophy: inherit first, customize last

**The meta-rule:** When building UI, reach for Obsidian's built-in CSS classes and component APIs first. Only add custom markup or CSS when the native pattern doesn't fit the use case — and be able to state specifically why.

This is the rule that makes every other section in this document coherent. CR's UI feels cohesive with Obsidian's core because CR inherits from Obsidian wherever possible and only diverges with justification. DB should do the same.

**Why the default must be "inherit":**

| Benefit | Explanation |
|---------|-------------|
| Theme compatibility | Obsidian's native classes work in every community theme. Hand-rolled CSS often breaks in popular themes (Minimal, Things, AnuPpuccin) that customize spacing, borders, or typography. |
| Light/dark mode for free | Using Obsidian's CSS variables (`--text-normal`, `--background-primary`, etc.) means your UI switches correctly with the app. Hardcoded colors silently break dark mode. |
| Mobile responsive defaults | Obsidian's Settings, Modals, and core components already handle narrow viewports. Custom markup requires you to re-implement mobile behavior from scratch. |
| Accessibility defaults | Obsidian's Setting API produces labeled form controls with correct focus behavior. Hand-rolled DOM skips the focus styles, ARIA attributes, and keyboard handling users expect. |
| Maintenance inheritance | When Obsidian updates its default setting-item styles (padding, border-radius, focus rings), your plugin inherits the update automatically. Custom CSS drifts. |
| User familiarity | Users already know how Obsidian's Settings look and feel. Custom-styled settings require them to re-learn your plugin's visual vocabulary. |

**The decision framework.** Before writing a custom class or component, walk this checklist:

1. **Does Obsidian already provide this?** Check the Obsidian API (`Setting`, `Modal`, `ButtonComponent`, etc.) and the native CSS classes (see §10 inventory below).
2. **Does an Obsidian-native class work with minor extension?** If the Setting API gives you 80% of what you need, extend it (inject into `.controlEl`, apply a `crc-*` modifier class) rather than replacing it.
3. **Is the gap genuinely not served by native patterns?** Dense multi-column forms, custom field types (entity pickers), non-standard visual widgets (color picker with variants) — these are real gaps, and custom markup is justified.
4. **When you diverge, state why in the code or in this reference.** A comment like `// Custom header: Obsidian's titleEl doesn't support icon + themed variant` is enough. The divergence is durable; the rationale should be too.

**The cost of diverging without justification.** The worst failure mode is: someone builds a custom settings interface that looks fine on their machine, ships it, and users discover it's broken on mobile, unreadable in the AnuPpuccin theme, and inaccessible by keyboard. That's the preventable case this rule exists for.

**CR's adherence report — the short version:**

- **Settings tab:** Pure `new Setting()` chain everywhere. No custom replacement.
- **Simple modals:** `extends Modal` + `new Setting()` in `contentEl`. No divergence.
- **Dense wizard forms:** Divergence via `.crc-form-row-inline` grid wrapper — native one-row-per-setting was too tall.
- **Modal headers:** Divergence via `.crc-modal-header` — native `titleEl` doesn't support icon + state variants.
- **Entity pickers:** Divergence via `*PickerModal` classes — `FuzzySuggestModal` doesn't support domain filtering (sex, person type, family groups).
- **Custom field types (pronouns chips, color variant grid):** Surgical divergence via `.controlEl` access — extending Setting rather than replacing it.
- **Notices, icons (where Obsidian's set suffices), buttons (`.mod-cta`, `.mod-warning`), state classes (`is-active`, `is-selected`):** Full inheritance.

The divergences are real and documented. The inheritance is the default.

**Further reading:** §10 (Obsidian-native class and API inventory) catalogs the specific classes CR consumes. §3 (Settings UI) and §7 (CSS conventions) both have "when to break out" subsections covering the specific divergence patterns.

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

**Further reading:** [wizards-reference.md](wizards-reference.md) — depth-first architectural summary of CR's wizard-modal patterns (step model, validation gates, step indicators, footer layout, `ModalStatePersistence<T>` for resume-across-restart, branching vs. linear flows). Reference material for Phase 3+ wizard work (onboarding, compile preset editor if D-06 resolves that way); not a blueprint for Phase 1 or Phase 2.

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

### When to break out of the Setting API

The Setting API is the right default for settings tabs and most modal forms. CR diverges in four specific cases. Each divergence has a concrete pattern; the decision to diverge has a specific rationale.

**Divergence 1: Dense multi-column form rows.** When a wizard step needs two or three short fields on one row (Sex + Birth date, or Street + City + Zip), Obsidian's one-field-per-row layout is too tall.

- CR exemplar: [`src/ui/family-creation-wizard.ts:529-544`] — two Settings in a `.crc-form-row-inline` grid wrapper.
- Pattern: wrap a `div.crc-form-row-inline` with `display: grid; grid-template-columns: 1fr 1fr;`, then construct Settings inside it. The Settings still use the API; only the container is custom.
- Rationale: one-field-per-row × 3 fields = ~360px; two-column × 2 rows = ~240px. Native Setting layout doesn't offer a columns mode.

**Divergence 2: Manual `.setting-item` DOM for modal density.** When a modal-embedded form has many small fields and the overhead of `new Setting()` per field is wasteful, CR constructs `.setting-item` / `.setting-item-info` / `.setting-item-control` DOM directly.

- CR exemplar: [`src/organizations/ui/organization-type-manager-card.ts:428-446`] — name + order + color inputs built as manual Setting DOM.
- Pattern: use Obsidian's native class names on raw `div` elements. Styles still inherit from Obsidian; only the Setting API scaffolding is bypassed.
- Rationale: each `new Setting()` registers listeners and constructs its own internal state; in a modal with many fields, that's unnecessary overhead. Manual `.setting-item` DOM preserves the visual consistency without the API tax.

**Divergence 3: Extending a Setting's `.controlEl` with custom children.** When a Setting control needs more than the API's built-in components (Text/Toggle/Dropdown/Slider/Button), reach into `.controlEl` directly and inject custom children.

- CR exemplar: [`src/ui/create-person-modal.ts:1357-1408`] — pronouns chips + custom input + preset buttons injected into `setting.controlEl`.
- CR exemplar: [`src/organizations/ui/organization-type-editor-modal.ts:199-222`] — color picker grid with `is-selected` state injected into `.controlEl`.
- Pattern: call `new Setting()` for the label + description, then skip `.addX()` and manipulate `setting.controlEl` directly.
- Rationale: the Setting's label/description/layout are still inherited; only the control surface is custom. Surgical extension, not replacement.

**Divergence 4: Custom modal header with icon + state.** Obsidian's `Modal.titleEl` is a single text span. For modals that want an icon next to the title, a state modifier (e.g., success state on completion), or a structured header, CR builds a custom `.crc-modal-header`.

- CR exemplar: [`src/ui/create-person-modal.ts:347-352`] — header with Lucide icon + title text, and a `.crc-modal-title--success` modifier at `:2513` for the post-save success state.
- Pattern: in `onOpen()`, create a `div.crc-modal-header` as the first child of `contentEl`, leaving `titleEl` unused.
- Rationale: icon-beside-title and state-variant-per-stage aren't possible with `titleEl`. The escape is worth the cost.

**DB adaptation:**

- Phase 1 settings should be pure `new Setting()` chains. No divergence justified for V1 settings.
- If Phase 2 introduces a wizard with compact multi-field rows (compile preset editor, onboarding flow), use Divergence 1's pattern.
- If Phase 2+ introduces custom-type managers (scene templates, compile presets), use Divergence 2's pattern for dense modal-embedded forms.
- Reach into `.controlEl` only when a Setting genuinely can't express the control — first check whether the problem is solvable with a ButtonComponent chain or an ExtraButton.
- If a DB modal header needs an icon or state variant, use Divergence 4's pattern.

**Rule of thumb:** if you catch yourself writing more than ~30 lines of custom control DOM for one field, that's a signal to step back and consider whether the native pattern really doesn't fit — or whether a smaller divergence (wrapping a Setting, not replacing it) would do.

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

### When custom CSS is justified

The color/spacing/radius rules in the main §7 body assume you're writing custom CSS. But the prior question — *should this surface have custom CSS at all* — deserves its own framing.

**Default:** apply an Obsidian native class, write no CSS. This works for:

- Buttons that fit `.mod-cta` / `.mod-warning` / `.clickable-icon` / `.mod-muted`
- Form controls that fit `Setting`'s Text/Toggle/Dropdown/Slider/Button/TextArea
- State rendering that fits `is-active` / `is-selected` / `is-disabled` / `is-hidden`
- Callouts that fit Obsidian's `.callout` / `.callout-title` / `.callout-content` pattern
- Suggestion dropdowns that fit Obsidian's autocomplete/suggest UI
- Icon-only buttons that fit `.clickable-icon` (already includes hover/focus styling)

**Custom CSS is justified when:**

1. **A layout doesn't exist in Obsidian's vocabulary.** Multi-column form grids, canvas-overlay tool palettes, custom stat-grid dashboards. Obsidian doesn't provide these primitives.
2. **A visual modifier on an existing element isn't available.** Tinted cards, colored status badges, archived-state dimming. You can still use Obsidian's layout classes, just add a `.dbench-*` modifier for the variant.
3. **A domain-specific component doesn't have an Obsidian analog.** Entity picker cards, draft-leaf archival styling, scene-status badges. Build these custom; name them `.dbench-{component}__{element}--{modifier}`.
4. **A composition is too complex for the Setting API.** Pronouns chips, color-variant grids, multi-entity pickers. Extend via `.controlEl`; don't replace the Setting shell.

**Custom CSS is NOT justified when:**

- You want a button to be "a little bigger" — use `.mod-cta` and adjust the container spacing instead
- You want a border-radius that "looks nicer" — use `var(--radius-s)` / `var(--radius-m)` / `var(--radius-l)` (Obsidian provides these)
- You want a slightly different color — `var(--text-accent)`, `var(--text-muted)`, `var(--background-modifier-border)` cover most needs
- You want a drop shadow on a card — use `var(--shadow-s)` / `var(--shadow-m)` / `var(--shadow-l)`

**The litmus test:** before writing a custom class, search your draft CSS for hardcoded values. Every `color:`, `background:`, `border-radius:`, `box-shadow:`, `padding:`, `margin:` that isn't `var(--obsidian-variable)` or `var(--dbench-scale)` is a signal that you might be drifting from the inheritance rule.

**CR's divergence principle:** when CR writes custom CSS, it's almost always a *layout wrapper* (flex/grid container) or a *modifier on a native class* — not a full replacement of Obsidian's styling. The Setting rows still look like Setting rows; CR just arranges them differently.

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

## 10. Obsidian-native class and API inventory

Reference catalog of the Obsidian-native classes and component APIs that CR consumes. Not exhaustive — focused on the ones that come up most often in modal / form / settings construction. File references point to canonical CR usage.

### Native CSS classes

**Setting primitives** (used in settings tabs AND when constructing modal-embedded form rows by hand):

| Class | Purpose | CR canonical usage |
|---|---|---|
| `.setting-item` | One row in a setting list | [`src/organizations/ui/organization-type-manager-card.ts:428`] |
| `.setting-item-info` | Left side (name + description) | Same file |
| `.setting-item-name` | The label | Same file |
| `.setting-item-description` | Optional descriptive text below the name | Produced by `setDesc()` |
| `.setting-item-control` | Right side where inputs/buttons go | [`src/ui/create-person-modal.ts:1358`] (pronouns chip injection) |

**Button modifiers** (applied to `<button>` or directly to `ButtonComponent` output):

| Class | Purpose | CR canonical usage |
|---|---|---|
| `.mod-cta` | Primary/call-to-action button (accent color) | [`src/trees/ui/trees-tab.ts:259`] |
| `.mod-warning` | Destructive action button | [`src/organizations/ui/organization-type-manager-card.ts:377`] |
| `.mod-destructive` | Stronger destructive variant | Less common; verify in Obsidian docs |
| `.clickable-icon` | Icon-only button with hover state | Widely used — e.g., dockable view header actions |

**State modifiers** (applied via `classList.add()` as appropriate):

| Class | Purpose | CR canonical usage |
|---|---|---|
| `.is-active` | Current tab / selected nav item | [`src/ui/split-wizard-modal.ts:243`] (wizard step indicator) |
| `.is-selected` | Currently-selected item in a list or grid | [`src/organizations/ui/organization-type-editor-modal.ts:255`] |
| `.is-disabled` | Disabled control (non-interactive) | Applied to buttons during async operations |
| `.is-hidden` | Display-none toggle | [`src/organizations/ui/organization-type-manager-card.ts:253`] |
| `.is-loading` | Async loading state | Layered onto custom `.crc-*-loading` containers |

**Modal / view scaffolding:**

| Class | Purpose | Provenance |
|---|---|---|
| `.modal` | Root modal container | Applied by `Modal` base class |
| `.modal-container` | Outer modal wrapper | Same |
| `.modal-content` | Inner content area (populated by `contentEl`) | Same |
| `.modal-close-button` | The `×` close affordance | Same — CR trusts this (no override). See [`src/ui/control-center.ts:206`] comment. |

**Other useful natives:**

| Class | Purpose | Note |
|---|---|---|
| `.callout`, `.callout-title`, `.callout-content` | Obsidian's info/warning boxes | Use these before building custom `.cr-info-box` equivalents |
| `.tag` | Hashtag styling | Use for scene-status badges if the visual fits |
| `.internal-link`, `.external-link` | Link styling | Use for any wikilink or URL presentation |
| `.search-input-container`, `.search-input` | Filter input styling | Wraps `<input>` elements in pickers and filter rows |

### Native component APIs

**`new Setting(container)` chain** — the backbone of all settings and most modal forms:

```typescript
new Setting(container)
  .setName('Label')
  .setDesc('Optional description')
  .addText(text => text
    .setPlaceholder('hint')
    .setValue(currentValue)
    .onChange(async (value) => { /* save */ }));
```

Canonical example: [`src/settings.ts:1060-1068`]. Can chain multiple `addX()` calls for compound controls (toggle + text field + button on one row).

**Component types CR uses via the Setting chain:**

| API | CR usage example |
|---|---|
| `addText(cb)` -> `TextComponent` | [`src/ui/family-creation-wizard.ts:517`] |
| `addToggle(cb)` -> `ToggleComponent` | [`src/settings.ts:1063`] |
| `addDropdown(cb)` -> `DropdownComponent` | [`src/settings.ts:1074`] |
| `addSlider(cb)` -> `SliderComponent` | [`src/settings.ts:1241`] |
| `addTextArea(cb)` -> `TextAreaComponent` | [`src/sources/ui/custom-source-type-modal.ts:238`] |
| `addButton(cb)` -> `ButtonComponent` | Ubiquitous |
| `addExtraButton(cb)` -> `ExtraButtonComponent` (icon button with tooltip) | [`src/settings.ts:2314`] |
| `setHeading()` | Renders as a section header rather than a field row |

**`extends Modal` lifecycle:**

```typescript
class MyModal extends Modal {
  constructor(app: App) { super(app); }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    // populate
  }
  onClose(): void {
    // cleanup (e.g., clearTimeout, unregister listeners)
  }
}
```

Canonical examples: [`src/trees/ui/unified-tree-wizard-modal.ts:191-384`], [`src/ui/person-picker.ts:167-191`]. Note that CR mostly avoids `titleEl.setText()` in favor of a custom `.crc-modal-header` — see §3's Divergence 4.

**Icon helper:**

```typescript
import { setIcon } from 'obsidian';
setIcon(element, 'settings');  // Obsidian's icon set, ~16-18px
```

Canonical example: [`src/settings.ts:1030`]. For modals/custom UI that want larger or genealogy-specific icons, CR uses Lucide via a local wrapper ([`src/ui/lucide-icons.ts`] — see §3's Divergence noted under custom modal headers).

**Notice helper:**

```typescript
new Notice('Message');
```

Used directly throughout — no wrapper function. See existing §5 Notices and feedback for the full convention.

**Tooltip helper (on ExtraButtonComponent):**

```typescript
new Setting(container).addExtraButton(button => button
  .setIcon('x')
  .setTooltip('Clear alias')
  .onClick(() => { /* ... */ }));
```

Canonical example: [`src/settings.ts:2314`]. For standalone tooltips on non-Setting elements, `setTooltip(el, text)` can be imported from obsidian.

**`MarkdownRenderer.render()`** — when you need to render markdown (wikilinks, formatting) into a DOM element:

```typescript
import { MarkdownRenderer } from 'obsidian';
await MarkdownRenderer.render(app, markdownString, targetEl, sourcePath, component);
```

Canonical example: [`src/dynamic-content/renderers/extractions-renderer.ts:148-154`].

### DB adaptation checklist

When building a new UI surface in Draft Bench, walk this list before writing any `.dbench-*` class:

1. **Is this a form or settings row?** -> `new Setting()` chain first.
2. **Is this a button?** -> Plain `<button>` + `.mod-cta` / `.mod-warning`, or `ButtonComponent` via `addButton()`.
3. **Is this an icon-only affordance?** -> `.clickable-icon` class + `setIcon()` or `ExtraButtonComponent`.
4. **Is this a modal?** -> `extends Modal` + `contentEl` population in `onOpen()`.
5. **Is this a notification?** -> `new Notice(msg)`.
6. **Is this an info/warning box?** -> Obsidian's `.callout` before building custom.
7. **Is this a state toggle (active, selected, disabled)?** -> Use `.is-*` classes; don't invent new ones.

If the answer to all of the above is "no, the need is genuinely different," then a `.dbench-*` custom class is justified. Document the divergence inline in the code (a one-line comment is fine) so future maintainers know the native alternatives were considered.

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
