# Dockable view reference: Obsidian patterns + Charted Roots architecture

**Status:** Reference material. **Not** a design spec for Draft Bench's Manuscript view.

**Purpose.** Captures the Obsidian `ItemView` / dockable-view mechanics that apply to any future DB workspace-leaf feature, plus Charted Roots' (CR) Entity Profile Views architecture as a worked example of a non-trivial dockable view. The immediate consumer is the Draft Bench Manuscript-leaf work planned in [D-07](decisions/D-07-control-center-split.md); downstream consumers include any later DB leaf (per-scene inspector, compile-status panel, etc.).

**How to use this document.**

- The first half (**Dockable views in Obsidian**) is generally applicable — mechanism, lifecycle, registration, leaf creation semantics, state persistence, mobile considerations, anti-patterns. Read this for any dockable-view work.
- The second half (**Profile view: one specialization**) layers CR-specific patterns over the foundation: entity-type dispatch, section-base primitive, data loader, inline editing, breadcrumbs. DB's Manuscript leaf uses some of these (section-base, state persistence) and skips others (entity dispatch, pin, breadcrumbs, active-note-following as primary driver). Each section carries a "DB mapping" note that's specific to the Manuscript leaf.
- **Mechanism over feature.** Read this as "how do you build a dockable view, and here's one non-trivial example of what you might build" rather than "here's the final design for DB."

**Related docs.**

- [D-07](decisions/D-07-control-center-split.md): the Control Center / Manuscript-leaf split decision record.
- [control-center-reference.md](control-center-reference.md): sibling reference capturing CR's Control Center (modal) architecture. Together they sketch both halves of the post-split DB UI.
- [ui-reference.md](ui-reference.md): breadth-first UI/UX patterns adapted for DB.
- [docs/developer/architecture.md](../developer/architecture.md): DB's source layout. The Manuscript view will likely live under `src/ui/manuscript-view/` (parallels `src/ui/control-center/`).

---

# Part 1 — Dockable views in Obsidian

## What "dockable" means in Obsidian

A **dockable view** is a registered view type that the user can open in any workspace leaf — right sidebar, left sidebar, main tab group, a split, a popout window. Obsidian handles the docking UI entirely; the plugin's job is to:

1. Register a view type.
2. Provide a factory that produces an `ItemView` instance for a given leaf.
3. Expose a command (and often a ribbon icon) that opens or reveals a leaf of that type.

Once registered, the view participates in all the usual Obsidian mechanics — split / move / popout / tab rearrangement, workspace-layout save/restore, `Ctrl/Cmd+Click` to open in new pane, `Ctrl/Cmd+W` to close, pin, lock, etc.

## Base classes: `ItemView` vs `FileView`

Two base classes in the Obsidian API, and they make different assumptions:

- **`ItemView`** — generic dockable view. The view is its own content; it doesn't represent a file. Use for dashboards, navigators, chart views, profile panels, map/timeline visualizations, etc.
- **`FileView`** — file-backed view. The view is bound to a specific `TFile` and follows Obsidian's file-navigation rules (e.g., the view appears when you click the file in the file explorer). Used for things like the canvas, graph, or custom file-type renderers.

**For most plugin features, use `ItemView`.** It gives you dockable behavior without tying the view to a specific file identity. You can still auto-sync to the active note by listening to workspace events — that's separate from being a `FileView`.

**DB mapping.** The Manuscript leaf is `ItemView` — it's scoped to a selected project, not a file identity. A future per-scene inspector might *consider* `FileView` (scene notes are files) but `ItemView` + active-note-sync is usually the better fit because it handles the "I clicked a non-scene note" case gracefully.

## Minimum view class

```ts
import { ItemView, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_EXAMPLE = 'your-plugin-example-view';

export class ExampleView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: YourPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_EXAMPLE;
  }

  getDisplayText(): string {
    // Shown in the tab. Can be dynamic based on view state.
    return this.currentTitle ?? 'Example view';
  }

  getIcon(): string {
    // Any Lucide icon name. Shown in tab + ribbon.
    return 'layers';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    // ... render UI
  }

  async onClose(): Promise<void> {
    // Clean up listeners, observers, timers, injected DOM.
  }
}
```

`containerEl.children[1]` is the view's content container. `children[0]` is the header. Don't touch the header directly — extend via `addAction()` instead.

## Registration

```ts
// main.ts — in onload()
this.registerView(
  VIEW_TYPE_EXAMPLE,
  (leaf) => new ExampleView(leaf, this)
);
```

`registerView()` handles unregistration on plugin unload automatically. No cleanup needed.

## Activating / revealing a view

The canonical pattern. Every dockable view uses some variation:

```ts
async activateExampleView(preferredSide: 'right' | 'left' | 'root' = 'right'): Promise<void> {
  const { workspace } = this.app;

  // Check if a leaf of this type already exists.
  const existing = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE);
  if (existing.length > 0) {
    workspace.revealLeaf(existing[0]);
    return;
  }

  // Create a new leaf in the preferred location.
  let leaf: WorkspaceLeaf;
  switch (preferredSide) {
    case 'left':  leaf = workspace.getLeftLeaf(false); break;
    case 'root':  leaf = workspace.getLeaf('tab'); break;
    case 'right':
    default:      leaf = workspace.getRightLeaf(false); break;
  }

  await leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });
  workspace.revealLeaf(leaf);
}
```

Leaf-creation semantics:

| Call | Behavior |
|---|---|
| `getRightLeaf(false)` / `getLeftLeaf(false)` | Reuse sidebar's existing leaf if possible, create if not. Pass `true` to force-create a new split. |
| `getLeaf('tab')` | New tab in the active tab group (main pane). |
| `getLeaf('split')` | New split pane in the main area. |
| `getLeaf(false)` | Reuse active leaf (replaces current view). Rare; usually not what you want. |

**Default side matters.** A profile panel belongs on the right. A navigator belongs on the left. A visualization dashboard belongs in `'tab'`. Match the convention users expect from similar plugins.

**DB mapping.** The Manuscript leaf's default is `'right'` per D-07 (matches Longform, conventional home for companion panes). Direct port of the `activateExampleView` shape — rename to `activateManuscriptView`.

## Command + ribbon integration

```ts
// Command
this.addCommand({
  id: 'open-example-view',
  name: 'Open example view',
  callback: () => { void this.activateExampleView(); }
});

// Ribbon icon — optional; keep scarce
this.addRibbonIcon('layers', 'Open example view', () => {
  void this.activateExampleView();
});
```

For plugins with multiple dockable views, use a consistent naming pattern (`open-{view-name}`), and keep ribbon icons scarce (only the most-used 1-2 views).

**DB mapping.** Post-split (per D-07):

- Palette gains `Draft Bench: Show manuscript view`.
- Palette keeps `Draft Bench: Open control center` (still opens the modal for Templates / Compile actions).
- Ribbon `pencil-ruler` icon is repointed: it reveals the leaf instead of opening the modal.
- No new ribbon icon for the modal — writers reach it via palette.

## View header actions

The view header (the tab's icon + title + `...` area) can be extended. Don't touch `containerEl.children[0]` directly. Use the `addAction()` API in `onOpen()`:

```ts
async onOpen() {
  this.addAction('pin', 'Pin to current entity', () => this.togglePin());
  this.addAction('refresh-cw', 'Refresh', () => this.refresh());
  // Renders as clickable icons in the tab header, next to the title.
}
```

Each action is an icon + tooltip + callback. Limit to 2-4 actions; anything more belongs in a menu.

For a menu in the header, use:

```ts
onPaneMenu(menu: Menu, source: string): void {
  menu.addItem(item => item.setTitle('Export as...').setIcon('download').onClick(() => this.export()));
  menu.addSeparator();
  menu.addItem(item => item.setTitle('Reset view').setIcon('rotate-ccw').onClick(() => this.reset()));
}
```

`onPaneMenu` is called when the user right-clicks the tab or clicks the `...` button. The `source` argument indicates which surface triggered it (tab-header, more-options, etc.).

**DB mapping.** Manuscript leaf actions for the MVP are the existing Manuscript-tab toolbar items: New scene, New draft, Reorder scenes, Compile. Those can go in the view body (visually prominent) or the header (compact). Probably in the body since writers will use them frequently. Header actions could host secondary utilities (expand-all / collapse-all sections, refresh, jump-to-project-note).

## State persistence across workspace restarts

Views survive workspace save/restore. Your job: serialize the state you care about.

```ts
interface ExampleViewState {
  pinnedEntityId?: string;
  sectionStates: Record<string, boolean>;
  breadcrumbs: string[];
}

getState() {
  const state: ExampleViewState = {
    pinnedEntityId: this.pinnedEntityId,
    sectionStates: { ...this.sectionStates },
    breadcrumbs: [...this.breadcrumbs]
  };
  return state;
}

async setState(state: any, result: ViewStateResult) {
  if (state?.pinnedEntityId) this.pinnedEntityId = state.pinnedEntityId;
  if (state?.sectionStates) this.sectionStates = state.sectionStates;
  if (state?.breadcrumbs) this.breadcrumbs = state.breadcrumbs;
  await this.rerender();
  return super.setState(state, result);
}
```

Rules:

- The serialized state must be JSON-safe. No `TFile` objects, no functions, no `Map`. Use file paths, plain objects, arrays.
- Keep the schema flat. Versioning via a property (e.g., `schemaVersion: 1`) is cheap insurance if the state shape evolves.
- Gracefully handle missing / malformed state — `setState` is called with whatever the workspace-layout file contains, including from older plugin versions.

**DB mapping.** The Manuscript leaf wants at least:

- `selectedProjectId?: string` — which project the leaf is currently showing. Per D-07's selection-state decision, this is mirrored into plugin-level state (single source of truth) and also persisted here so the leaf survives a vault reload at the right project.
- `sectionStates: Record<string, boolean>` — per-section collapse state (Project summary / Manuscript list).
- `schemaVersion: 1` from the start, even though the schema is trivial today.

Pin state and breadcrumbs aren't needed for the Manuscript-leaf MVP. Add them if a future iteration wants cross-project navigation history.

## Following the active note (auto-sync)

Most dockable views that display entity-related data want to track which note the user is viewing. Pattern:

```ts
async onOpen() {
  this.registerEvent(
    this.app.workspace.on('active-leaf-change', () => this.scheduleSyncToActiveNote())
  );
  this.registerEvent(
    this.app.vault.on('modify', (file) => this.onFileModify(file))
  );
  this.scheduleSyncToActiveNote();
}

private syncDebounce?: number;
private scheduleSyncToActiveNote() {
  window.clearTimeout(this.syncDebounce);
  this.syncDebounce = window.setTimeout(() => this.syncToActiveNote(), 150);
}

private async syncToActiveNote() {
  if (this.pinned) return;  // pin locks the view to a specific entity
  const activeFile = this.app.workspace.getActiveFile();
  if (!activeFile) return;
  // ... dispatch based on whether active file is relevant to this view
}
```

Key details:

- **Debounce** on `active-leaf-change`. Rapid navigation fires multiple events; without a debounce you'll trigger redundant loads.
- **Pin should win over active-note dispatch.** If the user pinned an entity, don't re-render when they click away.
- Use `registerEvent()` (Obsidian API) rather than raw `.on()`. It auto-unregisters on view close, preventing zombie listeners after closing/reopening the view.
- Compare `file.path` or a content fingerprint before re-rendering. "Active note changed" doesn't always mean "the entity the view cares about changed."

For `vault.on('modify')`, gate on whether the modified file is the one the view is currently showing. Otherwise every vault edit triggers unnecessary work.

**DB mapping.** The Manuscript leaf's relationship with active-note is looser than CR's profile view:

- Selection is explicit (dropdown picker), not auto-driven.
- A *nice-to-have* active-note sync: when the writer opens a scene file, the leaf auto-selects the project that scene belongs to. This is a light override of the explicit-selection rule, gated on "the active file is a plugin-managed scene in a different project than the current selection." Debounced identically to the profile-view pattern.
- The `vault.on('modify')` listener (already implemented for the existing modal's Manuscript tab) is preserved. Gate on "file belongs to the selected project" before re-rendering.

## Cleanup in `onClose()`

Views can be closed and reopened repeatedly within a session. Every `onOpen()` must have a matching cleanup path in `onClose()`:

```ts
async onClose() {
  window.clearTimeout(this.syncDebounce);
  this.observers.forEach(obs => obs.disconnect());
  this.leafletMap?.remove();
  // Event listeners registered via this.registerEvent() are auto-cleaned.
  // DOM injected into containerEl is removed by Obsidian automatically.
}
```

Common leaks to watch for:

- `setTimeout` / `setInterval` that wasn't cleared.
- `IntersectionObserver` / `ResizeObserver` / `MutationObserver` that wasn't disconnected.
- Third-party library instances (Leaflet, charts, PDF renderers) that hold their own event listeners on window/document.
- Custom event emitters on the plugin class that the view subscribed to via a non-`registerEvent` mechanism.

Rule of thumb: if you set it up manually in `onOpen`, tear it down manually in `onClose`.

## Mobile considerations

Dockable views work on mobile but the UX is different — mobile shows one pane at a time, so "right sidebar" isn't a split but a slide-out drawer. Things to handle:

- **Check `Platform.isMobile`** when deciding layout defaults. Mobile users may benefit from `'tab'` instead of `'right'` as the default activation target.
- **Touch targets** should be at least 44×44 logical pixels.
- **Don't rely on hover-only interactions.** Every tooltip / hover-action needs a tap-equivalent.
- **Scroll containers** behave differently. If the view has internal scrolling, set `overflow-y: auto` explicitly and test on a real device — iOS WebView in particular has momentum-scroll quirks.

Obsidian's mobile app honors the same `ItemView` lifecycle; the registration code is identical.

**DB mapping.** V1 is desktop-only (`isDesktopOnly: true` in `manifest.json`), so mobile is out of scope. But: don't actively fight mobile compatibility in the leaf's code. Prefer tap-friendly hit targets and `overflow-y: auto` even though nothing depends on them today.

## Multiple leaves of the same view type

By default, `getLeavesOfType(VIEW_TYPE_EXAMPLE)[0]` assumes one leaf per view type. Some views benefit from multiple (e.g., two timelines side-by-side for comparison). If you support that:

- Don't call `revealLeaf(existing[0])` in the activate path; always create a new leaf.
- State isolation: each view instance has its own `this.*` fields. Make sure nothing is a plugin-level singleton mutated by each view (would cause two views to clobber each other).
- Consider adding a "Find a leaf" command that lists all open leaves of this view type.

For the typical plugin, single-leaf is the right default. Add multi-leaf support only when users ask.

**DB mapping.** Single-leaf for the Manuscript leaf. Writers who want to compare two projects can detach the leaf to a popout window — no special-case handling needed.

## Command palette discoverability

Each view should have a matching command even if it also has a ribbon icon. Users who've disabled the ribbon won't see it otherwise. Naming convention:

- `Open {view name}` or `Show {view name}` — opens or reveals the view.
- `Close {view name}` — closes all leaves of this type (optional; most users just click the ✕).
- `{Action} in {view name}` — actions scoped to the view.

## Settings integration (optional)

A handful of settings that commonly ship with dockable views:

- **Default open location** — `'right' | 'left' | 'root'` dropdown.
- **Open on startup** — call `activateExampleView()` from a `workspace.onLayoutReady()` callback.
- **Auto-sync enabled** — lets users disable the active-note-following behavior if they prefer manual navigation.
- **Collapse state default** — for views with collapsible sections; set the initial expanded/collapsed default.

All of these are optional. Don't add settings for the sake of it; only ship them if real users want them.

**DB mapping.** Don't ship any of these in the Manuscript-leaf MVP. Obsidian lets writers drag the leaf between sidebars; startup-reveal is governed by D-07's "auto-reveal on first project creation" decision (one-shot, not a recurring setting). Auto-sync is one thin heuristic (select-project-of-active-scene) that doesn't warrant a toggle until a writer complains.

## Patterns that are NOT Obsidian-idiomatic

Things that look tempting but will fight the platform:

- **Don't store view state on the plugin** and expect leaves to pick it up. Each leaf has its own state; use `getState()` / `setState()`.
- **Don't manually manage DOM in `containerEl.children[0]`** — that's Obsidian's header. Use `addAction()` and `onPaneMenu()`.
- **Don't use global event listeners** (`window.addEventListener`) when a workspace or vault event would do. Global listeners leak across plugin reloads and are harder to scope.
- **Don't call `workspace.detachLeavesOfType()` in `onunload`** for views you registered with `registerView()`. The built-in unregistration handles it. Calling detach manually can cause stale-leaf crashes during plugin reload.

The last one is a common anti-pattern from older plugin tutorials. Modern Obsidian API handles cleanup automatically via `registerView`.

**DB mapping.** Note the conflict with D-07's "single source of truth" selection-state decision: plugin-level `selectedProjectId` does need to exist (so the modal can read it too), but the leaf *also* persists `selectedProjectId` via its own `getState()` so a layout reload restores the selection. Pattern: on `onOpen`, if plugin state is empty but leaf state has a project, push it to plugin state; otherwise read from plugin state. Slightly fiddly but not fragile.

## Effort estimate

A minimal dockable view — empty shell + register + activate + command — is **~80 LOC**. With auto-sync debounce, pin state, and state persistence it's **~200-300 LOC**. Beyond that, LOC scales with what the view actually renders, not the dockable plumbing.

For DB's Manuscript leaf specifically, see the LOC table under **Part 3 — DB Manuscript leaf mapping** below.

## Reference CR views worth cribbing from

CR registers multiple dockable views, each a useful pattern reference:

- **Profile view** — active-note-following, pin, breadcrumbs, inline editing. ~800 LOC for the main view file. See Part 2 below for the deep-dive.
- **Family Chart view** — visualization-heavy, resize-responsive. Good example of Leaflet-style library integration inside a view.
- **Geo Map view** — similar to Family Chart; also good for Leaflet teardown in `onClose`.
- **Calendar view** — grid-heavy layout, custom DOM rendering.
- **Data Quality view** — dashboard pattern; data aggregated across the vault rather than tied to active note.

If a future DB view ever needs any of these archetypes, the CR file is a reasonable copy-starting-point.

---

# Part 2 — Profile view: one specialization

The patterns below layer on top of the dockable-view fundamentals in Part 1. Draft Bench's Manuscript leaf will use some of them (section-base primitive, state persistence shape) and skip others (per-entity dispatch, pin, breadcrumbs, inline edit) — the "DB mapping" callouts note which is which.

## What the profile view is

A dockable `ItemView` that auto-syncs to the active note and renders a structured, card-style read-mostly profile. Opens alongside notes (like a sidebar) or as a pinned primary view. Supports:

- Multiple entity types dispatched via discriminated union (CR: 5 types — person / place / event / source / organization).
- Per-entity sections composed from a shared collapsible base.
- Auto-sync with debounce on active-leaf change and vault modify.
- Pin / unpin state to lock the view to one entity regardless of active note.
- Section collapse state persistence.
- Breadcrumb navigation between entities via in-profile wikilinks.
- Inline editing for a handful of header-level fields (name, type, etc.).

Phase 1 scope for CR was read-only + identity-field inline edit.

## Size snapshot (CR reference)

- `src/profile-view/` + `src/profile-view/sections/`: **~3,976 LOC** across 18 files.
- `styles/profile-view.css`: **~1,102 LOC**.
- Planning doc: `docs/planning/archive/entity-profile-views.md` (~200 lines).
- Developer guide: `docs/developer/implementation/profile-view.md`.

## File layout

```
src/profile-view/
  profile-view.ts              ~787 LOC    Main ItemView class
  profile-data-loader.ts       ~488 LOC    Coordinated service loading + crId cache
  profile-types.ts             ~186 LOC    ProfileEntityData discriminated union + state/callback types
  inline-edit.ts               ~192 LOC    Click-to-edit controls (one active at a time)
  sections/
    section-base.ts            ~160 LOC    Collapsible + ARIA accordion + lazy render primitive
    identity-section.ts        ~500 LOC    Sticky header: name, badge, avatar, pin, metadata, stale indicator
    [per-entity sections]      60–275 LOC  Events, sources, media, members, map preview, etc.
```

Sections are **standalone render functions**, not classes. Each takes `(parent, data, options)` and either writes into `parent` or returns early if hidden. No inheritance; composition only.

## Entity-type dispatch

Discriminated union keeps the type safety without runtime reflection:

```ts
export type ProfileEntityType = 'person' | 'place' | 'event';

export type ProfileEntityData =
  | { entityType: 'person'; node: PersonNode; /* ...person-specific */ }
  | { entityType: 'place'; node: PlaceNode; /* ...place-specific */ }
  | { entityType: 'event'; node: EventNode; /* ...event-specific */ };
```

Detection piggybacks on the existing note-type helper:

```ts
private detectEntityType(file: TFile): ProfileEntityType | null {
  const noteType = detectNoteType(fm, cache, this.plugin.settings);
  if (!noteType || !PROFILE_ENTITY_TYPES.includes(noteType)) return null;
  return noteType as ProfileEntityType;
}
```

Render dispatch is a single switch:

```ts
switch (data.entityType) {
  case 'person': this.renderPersonSections(data, opts); break;
  case 'place':  this.renderPlaceSections(data, opts); break;
  case 'event':  this.renderEventSections(data, opts); break;
}
```

**DB mapping.** Not needed for the Manuscript leaf's MVP — one layout for "project + scenes." The pattern stays documented here for a later per-scene or per-draft inspector leaf that might want to dispatch on `dbench-type`.

## Section base primitive

The single most reusable piece. Everything else composes on top.

```ts
export function renderProfileSection(
  parent: HTMLElement,
  options: {
    sectionId: string;
    title: string;
    summary?: string;        // e.g., "3 family, 2 other"
    expanded: boolean;       // from persisted state
    onToggle: (id, expanded) => void;
    icon?: string;
    hidden?: boolean;        // skip rendering entirely
    contentRenderer?: () => void;   // for lazy render
    onCollapse?: () => void;        // e.g., Leaflet cleanup
    onExpand?: () => void;          // e.g., Leaflet invalidateSize
  }
): HTMLElement | null;       // content container or null when hidden
```

Behaviors:

- Chevron toggle with `Enter` / `Space` keyboard support.
- WAI-ARIA accordion: `role="button"`, `aria-expanded`, ArrowUp/Down/Home/End focus nav across section headers.
- **Lazy rendering:** if the section starts collapsed AND `contentRenderer` is provided, defer calling it until first expand. Critical for sections with heavy work (map, tree visualizations).
- `onCollapse` / `onExpand` hooks let sections clean up or re-initialize runtime state (e.g., re-invalidate Leaflet's container size after the accordion animates open).

This one file is worth porting intact; the API scales. **For DB**, the Manuscript list may benefit from lazy-render if large projects' scene lists are slow to paint, and the "collapse Project summary to just the hero" workflow wants per-section state persistence.

## Data loading

A dedicated `ProfileDataLoader` coordinates service calls per entity type and caches by `cr_id`:

```ts
class ProfileDataLoader {
  private cache = new Map<string, ProfileEntityData>();

  async loadEntity(file: TFile, entityType: ProfileEntityType): Promise<ProfileEntityData> {
    const crId = getCrId(file);
    if (this.cache.has(crId)) return this.cache.get(crId);
    // ...load via per-type service calls, fan out
    this.cache.set(crId, data);
    return data;
  }

  invalidate(crId: string) { this.cache.delete(crId); }
}
```

Invalidate on `vault.on('modify')` for the specific file. Don't bulk-clear; that defeats the point.

**DB mapping.** DB already has a `WordCountCache` with per-file mtime invalidation. The Manuscript leaf should reuse it directly rather than introduce a second cache layer. A dedicated `ProfileDataLoader` equivalent isn't needed; `context.plugin.wordCounts.countForProject(project)` is the existing entry point.

## Inline editing (lightweight)

One active edit at a time is the only discipline you need. CR's `inline-edit.ts` (192 LOC) covers:

- Text, number, select inputs.
- Save on blur + Enter; revert on Escape.
- After write, always re-quote wikilinks in frontmatter (`app.fileManager.processFrontMatter` strips quotes from `"[[X]]"`; values rendered back from frontmatter without quotes round-trip differently).
- Respect property aliases via the plugin's alias service when writing — write to the user's configured property name, not the canonical one.

For a port, start with text fields only. Add select / date pickers as specific entity fields require them.

**DB mapping.** **Skip for the Manuscript leaf MVP.** DB writers use the Properties panel for `dbench-target-words` and the Settings -> Statuses section for status values. Adding inline editing is a separate, later decision. If an inline "set target here" button lands on the Manuscript view later, the CR pattern is the reference to pull from. DB has no property-alias system, so the alias-respect logic is moot.

## Optional surfaces worth considering (or skipping)

CR's profile view has these; DB's Manuscript-leaf MVP likely skips most of them:

| Surface | CR has it | DB Manuscript-leaf MVP |
|---|---|---|
| Breadcrumb navigation between entities | Yes | Skip — one project at a time, no history stack |
| Pin state | Yes | Skip — selection is explicit via dropdown, not auto-sync |
| Auto-sync to active note | Yes | Optional — auto-select the project the active file belongs to, but don't force re-render on every leaf change (D-07 open question) |
| Stale indicator (non-entity active note) | Yes | Skip — leaf defaults to "select a project" empty state |
| Map preview (Leaflet) | Yes for places | N/A |
| Media grid with thumbnails | Yes | N/A |
| Tree visualizations (source hierarchy) | Yes for sources | N/A |
| Research activity cross-project | Yes for persons | N/A |
| Citation notes linkage | Yes for persons | N/A |

**What DB does want that CR's profile view doesn't have:**

- Project dropdown / picker at the top.
- Toolbar buttons: New scene, New draft, Reorder scenes, Compile (matches the current modal's Manuscript-tab toolbar).
- Scene-list entries as navigation links (clicking opens the scene in the main editor).

---

# Part 3 — DB Manuscript leaf mapping

This section is the practical guide for the port. Use it as the starting checklist when D-07 lands and coding begins.

## LOC estimate

Scaled down from CR's Phase 1 profile view for fewer sections (no per-entity dispatch, no map/media/tree/inline-edit):

| Component | Estimate |
|---|---|
| `src/ui/manuscript-view/manuscript-view.ts` (main ItemView) | ~300 LOC |
| `src/ui/manuscript-view/sections/section-base.ts` (port intact) | ~160 LOC |
| `src/ui/manuscript-view/sections/project-summary-section.ts` (word counts, status breakdown, targets) | ~150 LOC |
| `src/ui/manuscript-view/sections/manuscript-list-section.ts` (scene list with badges/progress bars) | ~200 LOC |
| `src/ui/manuscript-view/sections/toolbar.ts` (New scene / New draft / Reorder / Compile buttons) | ~80 LOC |
| `src/ui/manuscript-view/project-picker.ts` (header dropdown + selection state) | ~80 LOC |
| CSS (`styles/manuscript-view.css`) | ~450 LOC |
| Tests (section-base, project-picker, sort helpers) | ~250 LOC |
| **Total** | **~1,670 LOC** |

Roughly **42% the size of CR's profile-view Phase 1**. Effort: ~1 week of focused work, assuming the Control Center's current Project-tab and Manuscript-tab rendering can largely be lifted into the new section modules (the rendering primitives exist; this is moving + adapting, not writing from scratch).

## Things to port intact (high ROI)

1. **`sections/section-base.ts`** — the collapsible / ARIA / lazy-render primitive. API is reusable across any future DB leaf.
2. **Activate-view helper** (`activateManuscriptView`) — direct port from the snippet in Part 1.
3. **Auto-sync debounce pattern** — 150ms on `active-leaf-change`, coalesced. Relevant if the leaf auto-selects the project the active file belongs to.
4. **`getState()` / `setState()` for section state** — JSON-flat shape.
5. **BEM + theme-variables CSS convention** — already DB standard (`.dbench-manuscript-view__*` prefix).

## Things that don't apply to DB's Manuscript leaf

- Discriminated-union `ProfileEntityData` (only one layout in the MVP).
- Dedicated `ProfileDataLoader` (reuse `WordCountCache`).
- Pin state, breadcrumbs, inline editing (scope out of MVP).
- Leaflet / map / media grid / tree surfaces (domain mismatch).
- Property-alias respect on writes (DB has no aliases).

## Planning + developer docs to produce alongside

- **Planning doc**: [D-07](decisions/D-07-control-center-split.md) already locks the scope and flags open questions. Before coding, vote on the "Candidates under consideration" block and enumerate the three sections (Project summary / Manuscript list / Toolbar) with their state keys.
- **Developer guide**: after the leaf ships, document the section-base API and how to add a new section (for example, a future "Recent drafts" section or "Compile status" hint when Book Builder lands). Target `docs/developer/manuscript-view.md`.

Both are maintenance-multipliers; cheap to write, expensive to retrofit.
