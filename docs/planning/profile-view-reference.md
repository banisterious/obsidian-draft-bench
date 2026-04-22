# Profile view reference: Charted Roots architecture

**Status:** Reference material. **Not** a design spec for Draft Bench's Manuscript view.

**Purpose.** Captures Charted Roots' (CR) Entity Profile Views architecture so the Draft Bench Manuscript-leaf work (per [D-07](decisions/D-07-control-center-split.md)) starts from a concrete prior-art baseline rather than designing the dockable-view plumbing from scratch. The content below distills the patterns that matter for a port, omits CR-specific business logic (genealogy domain, map / media surfaces), and gives LOC estimates scaled for Draft Bench's smaller type vocabulary.

**How to use this document.**

- **The scope D-07 describes is smaller than CR's profile view.** CR's view profiles a single active-note entity with pin, breadcrumbs, inline editing, 5 entity types, media grid, Leaflet map, tree visualizations. DB's Manuscript leaf is a project-scoped workspace companion: project overview + scene list for the selected project, with per-scene word-count progress. One project at a time; the list doesn't need the per-entity dispatch matrix.
- **Port selectively.** The ItemView lifecycle, the collapsible section primitive, the `getState()` / `setState()` persistence, the activate-view helper, the theme-variable CSS convention, and the debounced `vault.on('modify')` listener are all directly reusable. The discriminated-union entity dispatch, breadcrumb stack, auto-sync-to-active-note, pin state, and inline edit machinery largely don't apply to DB's use case — but are documented here in case a future DB feature (e.g., a per-scene inspector, per-project compile-preset editor) does want them.
- **Mechanism over feature.** Read this as "how do you build a dockable view that shares a theme and state with the host" rather than "how do you build a profile per active note."

**Related docs.**

- [D-07](decisions/D-07-control-center-split.md): the Control Center / Manuscript-leaf split decision record. Lists locked vs. open questions specific to DB.
- [control-center-reference.md](control-center-reference.md): sibling reference capturing CR's Control Center (modal) architecture. Complements this document — together they sketch both halves of the post-split DB UI.
- [ui-reference.md](ui-reference.md): breadth-first UI/UX patterns adapted for DB.
- [docs/developer/architecture.md](../developer/architecture.md): DB's source layout. The Manuscript view will likely live under `src/ui/manuscript-view/` (parallels `src/ui/control-center/`).

---

## What the feature is

A dockable `ItemView` that auto-syncs to the active note and renders a structured, card-style read-mostly profile. Opens alongside notes (like a sidebar) or as a pinned primary view. Supports:

- Multiple entity types dispatched via discriminated union (CR: 5 types — person / place / event / source / organization).
- Per-entity sections composed from a shared collapsible base.
- Auto-sync with debounce on active-leaf change and vault modify.
- Pin / unpin state to lock the view to one entity regardless of active note.
- Section collapse state persistence (workspace state API).
- Breadcrumb navigation between entities via in-profile wikilinks.
- Inline editing for a handful of header-level fields (name, type, etc.).

Phase 1 scope for CR was read-only + identity-field inline edit. Everything else (scheduling writes through services, bulk edit) was out of scope.

**How this maps onto DB's Manuscript-leaf scope:**

- Not "profile the active entity" — instead "show the selected project's overview + scene list." Auto-sync-to-active-note is not the primary driver.
- No per-entity dispatch — the leaf renders one project-shaped layout. Discriminated unions aren't needed for the MVP.
- Section primitive still applies (Project summary, Manuscript list, maybe Recent drafts) — even without entity dispatch, the collapsible/lazy/state-persistent accordion is useful.
- Inline editing is out of scope for the initial port; the Properties panel handles `dbench-target-words` and the Statuses settings section handles status values. A future "set target here" inline control could reuse CR's inline-edit pattern.

---

## Total size snapshot (CR, reference)

- `src/profile-view/` + `src/profile-view/sections/`: **~3,976 LOC** across 18 files.
- `styles/profile-view.css`: **~1,102 LOC**.
- Planning doc: `docs/planning/archive/entity-profile-views.md` (~200 lines).
- Developer guide: `docs/developer/implementation/profile-view.md`.

DB's Manuscript leaf, with one layout (no entity dispatch) and fewer sections, should land considerably smaller. See "LOC estimate for Draft Bench" below.

---

## File layout (CR)

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

---

## Main view class (CR)

Single file, extends `ItemView`. Minimum API:

```ts
export const VIEW_TYPE_ENTITY_PROFILE = 'your-plugin-entity-profile';

export class ProfileView extends ItemView {
  getViewType() { return VIEW_TYPE_ENTITY_PROFILE; }
  getDisplayText() { return this.currentEntityName ? `Profile: ${this.currentEntityName}` : 'Profile'; }
  getIcon() { return 'id-card'; }

  async onOpen() {
    this.initDom();
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleSyncToActiveNote()));
    this.registerEvent(this.app.vault.on('modify', (file) => this.onFileModify(file)));
    this.scheduleSyncToActiveNote();
  }

  async onClose() {
    this.clearDebounceTimers();
    this.cleanupEntitySpecificResources();  // e.g., Leaflet, observers
  }

  getState() { return { pinnedCrId, sectionStates, breadcrumbs }; }
  setState(state, result) { /* restore + re-render */ }
}
```

Key invariants:

- Auto-sync is **debounced** (~150ms) to coalesce rapid leaf changes.
- Active-note dispatch calls `detectEntityType(file)` and short-circuits when the active note isn't an entity — sets a `stale` indicator rather than blanking the view.
- Pin state overrides active-note dispatch (pinned entity stays rendered even if user navigates away).
- `getState()` / `setState()` is how the view survives workspace-layout save/restore.

---

## Entity-type dispatch (CR)

Discriminated union keeps the type safety without runtime reflection:

```ts
export type ProfileEntityType = 'person' | 'place' | 'event';

export type ProfileEntityData =
  | { entityType: 'person'; node: PersonNode; /* ...person-specific */ }
  | { entityType: 'place'; node: PlaceNode; /* ...place-specific */ }
  | { entityType: 'event'; node: EventNode; /* ...event-specific */ };
```

Detection piggybacks on the existing `detectNoteType()` helper:

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

**DB mapping.** For the Manuscript leaf's MVP, this layer isn't needed — one layout for the "project + scenes" surface. The pattern stays documented here for a later per-scene or per-draft inspector leaf that might want to dispatch on `dbench-type`.

---

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

---

## Data loading (CR)

A dedicated `ProfileDataLoader` coordinates service calls per entity type and caches by `cr_id`:

```ts
class ProfileDataLoader {
  private cache = new Map<string, ProfileEntityData>();

  async loadEntity(file: TFile, entityType: ProfileEntityType): Promise<ProfileEntityData> {
    const crId = getCrId(file);
    if (this.cache.has(crId)) return this.cache.get(crId);

    let data: ProfileEntityData;
    switch (entityType) {
      case 'person': data = await this.loadPerson(file); break;
      case 'place':  data = await this.loadPlace(file); break;
      // ...
    }
    this.cache.set(crId, data);
    return data;
  }

  invalidate(crId: string) { this.cache.delete(crId); }
}
```

Invalidate on `vault.on('modify')` for the specific file. Don't bulk-clear; that defeats the point.

Per-entity loaders fan out to existing services (person graph, events, sources, media) and bundle into the entity-specific discriminated union member.

**DB mapping.** DB already has a `WordCountCache` with per-file mtime invalidation. The Manuscript leaf should reuse it directly rather than introduce a second cache layer. A dedicated `ProfileDataLoader` equivalent isn't needed; `context.plugin.wordCounts.countForProject(project)` is the existing entry point.

---

## State persistence (CR)

Three things to persist across sessions:

- `pinnedCrId?: string` — which entity is pinned, if any.
- `sectionStates: Record<string, boolean>` — per-section collapse state, keyed by `sectionId`.
- `breadcrumbs: string[]` — stack of crIds for back-navigation within the view.

All three go through Obsidian's `getState()` / `setState()` leaf-state API. Keep the shape flat and JSON-safe.

**DB mapping.** The Manuscript leaf wants at least:

- `selectedProjectId?: string` — which project is currently selected. Subject to D-07's "selection-state ownership" decision (leaf-authoritative, shared with modal, or independent).
- `sectionStates: Record<string, boolean>` — per-section collapse state (Project summary / Manuscript list).

Pin and breadcrumbs aren't needed for the MVP. Add them if a future iteration needs cross-project navigation history.

---

## Registration (CR pattern)

```ts
// main.ts
this.registerView(
  VIEW_TYPE_ENTITY_PROFILE,
  (leaf) => new ProfileView(leaf, this)
);

// plugin/commands.ts (or inline in onload)
plugin.addCommand({
  id: 'open-entity-profile',
  name: 'Open entity profile',
  callback: () => plugin.activateProfileView()
});
```

`activateProfileView()` pattern:

```ts
async activateProfileView() {
  const { workspace } = this.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_ENTITY_PROFILE)[0];
  if (!leaf) {
    leaf = workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_ENTITY_PROFILE, active: true });
  }
  workspace.revealLeaf(leaf);
}
```

**DB mapping.** Direct port, with:

- `VIEW_TYPE_MANUSCRIPT = 'draft-bench-manuscript'` (namespaced with plugin prefix).
- `plugin.addCommand({ id: 'show-manuscript-view', name: 'Show manuscript view', callback: ... })` — exact text per D-07.
- Activate-view helper named `activateManuscriptView`.
- Right vs. left sidebar is a D-07 open question (recommended direction: right sidebar, matching Longform).

---

## CSS patterns (CR)

- **BEM naming** rooted on a plugin prefix: `.db-profile__header`, `.db-profile__section`, `.db-profile__section--expanded`, etc.
- **Theme variables only** — no locally-defined custom properties. Use `var(--background-primary)`, `var(--text-accent)`, `var(--size-4-3)`, `var(--font-ui-smaller)`, `var(--radius-s)`, `var(--background-modifier-border)`. Makes the view adapt to every Obsidian theme without overrides.
- **Sticky header:** `position: sticky; top: 0; z-index: 10;` on `.{prefix}-profile__header`.
- **Mobile layout:** apply a `.{prefix}-profile--mobile` class when `Platform.isMobile` is true; layout adjustments in CSS rather than conditional markup.
- **Collapsible accordion:** CSS transitions only on `.section-body`'s `max-height` and `opacity`, not `display: none`. Expanded state adds a class modifier, not inline styles.

For Draft Bench with a single Manuscript-view layout (no entity dispatch) and the sections enumerated below, CSS will land around **~400-500 LOC** (vs. CR's ~1,100).

**DB mapping.** DB already standardizes on `.dbench-` short-form prefix with long-form `.draft-bench-` siblings (per [coding-standards.md](../developer/coding-standards.md)). The Manuscript leaf's prefix is `.dbench-manuscript-view__*`. Theme-variables-only is already a DB convention.

---

## Inline editing (CR, lightweight)

One active edit at a time is the only discipline you need. CR's `inline-edit.ts` (192 LOC) covers:

- Text, number, select inputs.
- Save on blur + Enter; revert on Escape.
- After write, always re-quote wikilinks in frontmatter (`app.fileManager.processFrontMatter` strips quotes from `"[[X]]"`; values rendered back from frontmatter without quotes round-trip differently).
- Respect property aliases via the plugin's alias service when writing — write to the user's configured property name, not the canonical one.

For a port, start with text fields only. Add select / date pickers as specific entity fields require them.

**DB mapping.** **Skip for the Manuscript leaf MVP.** DB writers use the Properties panel for `dbench-target-words` and the Settings -> Statuses section for status values. Adding inline editing is a separate, later decision. If an inline "set target here" button lands on the Manuscript view, the CR pattern is the reference to pull from. DB has no property-alias system, so the alias-respect logic is moot.

---

## Optional surfaces worth considering (or skipping)

CR has these; DB's Manuscript-leaf MVP likely skips most of them:

| Surface | CR has it | DB Manuscript-leaf MVP |
|---|---|---|
| Breadcrumb navigation between entities | Yes | Skip — one project at a time, no history stack |
| Pin state | Yes | Skip — selection is explicit via dropdown, not auto-sync |
| Auto-sync to active note | Yes | Optional: auto-select the project the active file belongs to, but don't force re-render on every leaf change (D-07 open question) |
| Stale indicator (non-entity active note) | Yes | Skip — leaf defaults to "select a project" empty state |
| Map preview (Leaflet) | Yes for places | N/A |
| Media grid with thumbnails | Yes | N/A |
| Tree visualizations (source hierarchy) | Yes for sources | N/A |
| Research activity cross-project | Yes for persons | N/A |
| Citation notes linkage | Yes for persons | N/A |

**What DB does want that CR doesn't have:**

- Project dropdown / picker at the top (equivalent to CR's pin-one-entity for discoverability).
- Toolbar buttons: New scene, New draft, Reorder scenes, Compile (matches the current modal's Manuscript-tab toolbar).
- Scene-list entries as navigation links (clicking opens the scene in the main editor).

---

## LOC estimate for Draft Bench Manuscript leaf

Scaled down from CR's Phase 1 for fewer sections (no per-entity dispatch, no map/media/tree/inline-edit):

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

That's roughly **42% the size of CR's profile-view Phase 1**. Porting effort: ~1 week of focused work, assuming the existing Control Center's Project-tab and Manuscript-tab rendering code can be largely lifted into the new section modules (the rendering primitives already exist; this is moving + adapting, not writing from scratch).

---

## Things to port intact (high ROI)

1. **`sections/section-base.ts`** — the collapsible / ARIA / lazy-render primitive. API is reusable across any future DB leaf.
2. **Activate-view helper** (`activateManuscriptView`) — direct port.
3. **Auto-sync debounce pattern** — 150ms on `active-leaf-change`, coalesced. Relevant if the leaf auto-selects the project the active file belongs to.
4. **`getState()` / `setState()` for section state** — JSON-flat shape.
5. **BEM + theme-variables CSS convention** — already DB standard.

## Things that don't apply to DB's Manuscript leaf

- Discriminated-union `ProfileEntityData` (only one layout in the MVP).
- Dedicated `ProfileDataLoader` (reuse `WordCountCache`).
- Pin state, breadcrumbs, inline editing (scope out of MVP).
- Leaflet / map / media grid / tree surfaces (domain mismatch).
- Property-alias respect on writes (DB has no aliases).

---

## Planning + developer docs to produce alongside (pattern from CR)

- **Planning doc**: [D-07](decisions/D-07-control-center-split.md) already locks the scope and flags open questions. Before coding, vote on the "Candidates under consideration" block and enumerate the three sections (Project summary / Manuscript list / Toolbar) with their state keys.
- **Developer guide**: after the leaf ships, document the section-base API and how to add a new section (for example, a future "Recent drafts" section or "Compile status" hint when Book Builder lands). Target `docs/developer/manuscript-view.md`.

Both are maintenance-multipliers; cheap to write, expensive to retrofit.
