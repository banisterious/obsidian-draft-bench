# Control Center reference: Charted Roots architecture

**Status:** Reference material. **Not** a design spec for Draft Bench's Control Center.

**Purpose.** Captures the full Charted Roots (CR) Control Center model so that later DB Control Center work — when the plugin has enough content to justify it — starts from a concrete, well-understood prior art rather than a blank page. The summary below was drafted in a previous session by reading CR's source; file paths and line numbers are approximate and reflect CR's state around April 2026, so treat them as search starting points, not stable anchors.

**How to use this document.**

- **V1 ships the minimal Control Center skeleton** described in [specification.md § Control Center](specification.md#control-center): a tabbed modal with Project / Manuscript / Templates / Compile / Settings tabs and basic rendering. That remains the authoritative design for Phase 1 and Phase 2.
- **This document is for the later pass**, once DB has real content to surface (word counts, project summaries, recent scenes, compile status), and a DB-specific Control Center design becomes worth doing as its own design exercise.
- **Fresh eyes intended.** Draft Bench will adopt some CR patterns and reject others; the decision of *which* ones belongs to a future, DB-focused design discussion, not to this document. Everything below is context for that discussion, not a prescribed adoption list. In particular, CR's Dashboard tab, Tools group, and tier-two caching may or may not fit DB — that's a call for later.

**Related docs.**

- [specification.md § Control Center](specification.md#control-center): authoritative V1 tab list and invocation surfaces.
- [ui-reference.md § 1 Control Center](ui-reference.md#1-control-center-tabbed-plugin-hub): breadth-first CR UI/UX patterns; companion to this doc.
- [docs/developer/architecture.md](../developer/architecture.md): DB's intended source layout, including the P1.D Control Center skeleton step.

---

## Role and design intent

The Control Center is the plugin's central operations hub. Not a dashboard that summarizes state, not a settings panel — a workspace where the user performs the plugin's operations. Think "IDE command center" rather than "tool palette": users open it, do work across multiple tabs in a single session, then close it.

Positioning relative to other plugin surfaces:

- The Settings tab (Obsidian's native plugin settings panel) handles plugin configuration — toggles, defaults, folder paths.
- Dedicated Views (workspace leaves like Family Chart, Statistics, Maps) handle visualizations that want their own pane.
- The Control Center sits between them — a modal that hosts task-oriented tabs (People, Places, Sources, Data Quality, Trees & Reports, etc.) and launches into dedicated views when needed.

## Invocation and discoverability

Three entry points, all landing in the same modal:

- **Ribbon icon** — the plugin's primary ribbon button opens directly to the Dashboard tab. The "always-available" path. Registered at `src/plugin/commands.ts:71-73` with the `users` Lucide icon.
- **Command palette** — the `open-control-center` command, plus a family of `open-*-view` commands for dedicated views. Registered at `src/plugin/commands.ts:90-96`.
- **Programmatic invocation** — any code in the plugin can open the modal to a specific tab via `new ControlCenterModal(app, plugin, 'tab-id').open()`. Used by various commands that need to deep-link into a specific tab (e.g., the Staging Area management path). Signature at `src/ui/control-center.ts:71-77`.

Custom Obsidian workspace events also work: any code can fire `charted-roots:open-control-center` to open the modal (see `src/plugin/commands.ts:339-342` for the listener). Lets non-plugin code (hotkeys, buttons in rendered notes) request the Control Center without importing the class.

## Container shape

A **modal**, not a view. Extends Obsidian's `Modal` class rather than `ItemView`. Rationale:

- **Modal pros**: doesn't consume a workspace leaf, can be opened from any context, naturally centers and sizes itself, native Escape-to-close, native overlay / focus handling.
- **Modal cons**: can't be docked alongside a note, closes when another modal opens, doesn't persist across Obsidian restarts.
- **Why the tradeoff favored modal**: Control Center is task-oriented — user opens it, does work, closes it. Not something to keep open while also reading a note. The view/leaf pattern is reserved for visualizations (Family Chart, Statistics, Maps) that benefit from side-by-side with a note.

Root class: `ControlCenterModal extends Modal` at `src/ui/control-center.ts:58`.

Internal shell structure (built in `createModalContainer()` at `src/ui/control-center.ts:150-170`):

```
crc-control-center-modal (modal root, class added to modalEl)
└── crc-modal-container
    ├── crc-sticky-header          ← title + icon + menu toggle (mobile)
    └── crc-main-container
        ├── crc-drawer              ← navigation sidebar
        │   ├── crc-drawer__header  ← "Navigation" title
        │   └── crc-drawer__content
        │       └── (navigation groups)
        ├── crc-drawer-backdrop     ← mobile overlay
        └── crc-content-area        ← active tab renders here
```

## Navigation architecture

Three-level hierarchy:

- **Groups** — logical clusters of tabs (e.g., "Entities," "Data & Structure"). Rendered as visual dividers with an optional label above each group. Defined in `NAV_GROUPS` at `src/ui/lucide-icons.ts:218-225`.
- **Tabs** — individual surfaces that render content in the main area. Each tab has `{id, name, icon, description, group}`. Defined in `TAB_CONFIGS` at `src/ui/lucide-icons.ts:295-392`. Currently 12 tabs: Dashboard, People, Events, Places, Sources, Organizations, Universes, Collections, Data Quality, Schemas, Relationships, Trees & Reports, Maps.
- **Tools** — nav entries that launch external surfaces instead of switching the main content — modals or workspace leaves. Rendered at the bottom of the drawer under a "Tools" group label with a ↗ indicator. Defined in `TOOL_CONFIGS` at `src/ui/lucide-icons.ts:252-289`.

**Why the Tools distinction matters:** some actions don't fit the tab model — Family Chart opens its own leaf, Media Manager is a separate modal, Create Family is a multi-step wizard. Treating these as "tools" that launch rather than "tabs" that render prevents forcing unrelated workflows into the same layout. The ↗ indicator visually communicates "this takes you elsewhere."

**Group configuration pattern** (`src/ui/control-center.ts:286-337`):

- Iterate `NAV_GROUPS` in order.
- For each group, filter `TAB_CONFIGS` where `tab.group === group.id`.
- Skip groups with no tabs (allows feature-flagged groups to vanish).
- Add a divider before every group except the first.
- Render group label if set (Dashboard is ungrouped and label-less).

**Active state tracking:** `activeTab` is a string field on the modal instance. `switchTab(tabId)` at `src/ui/control-center.ts:421-443` updates the DOM classes and calls `showTab()` to swap content. Scroll position resets to top on tab switch. On mobile, the drawer auto-closes.

## Tab content model — lazy rendering via dispatcher

Tab content is **not** pre-rendered. `showTab(tabId)` at `src/ui/control-center.ts:448+` empties the content container and calls a tab-specific render method (`showPeopleTab()`, `showPlacesTab()`, etc.). Switch statement dispatches by ID.

Implications:

- Tabs can be heavy without affecting modal open time.
- Cross-tab state is the modal's responsibility (via cached services), not shared DOM.
- Each tab's render function is free to be async — the dispatcher awaits where needed.

**Render function pattern:** each tab has a `renderXxxTab()` function that accepts `(container, plugin, ...context)`. The Control Center's `showXxxTab()` methods call these. This keeps tab logic isolated in its own file (e.g., `people-tab.ts`, `dashboard-tab.ts`) rather than bloating `control-center.ts`.

## State management and caching

Two-tier caching strategy on the modal instance:

- **Service caches** — expensive-to-construct services (`FamilyGraphService`, `PlaceGraphService`) are created once on first use and reused across tab switches within the session. Methods `getCachedFamilyGraph()` etc. at `src/ui/control-center.ts:99-135`. Cleared on `onClose()`.
- **Derived-data caches** — combinations of service output (e.g., merged universe list from places + people). Computed lazily, cached alongside the services.

**Invalidation:** `invalidateCaches()` at `src/ui/control-center.ts:141-145` clears all caches. Called whenever a tab does work that changes underlying data (e.g., data-quality batch ops modify files). Tab render functions receive an `invalidateCaches` callback so they can signal cache invalidation without importing the modal class directly.

**Why this matters:** without caching, every tab switch reloaded the family graph — which scans the entire vault. With caching, tab switches are instant.

Cache lifetime is strictly per-session. Closing the modal clears everything, so data is always fresh on reopen. No stale state accumulating across sessions.

## Cross-tab coordination

Tabs are not entirely isolated — some operations naturally cross tabs. Two mechanisms:

- **Shared callbacks injected at render time.** Tabs receive callback functions (`showTab`, `invalidateCaches`, batch-op wrappers) bound to the modal instance, exposed as an object of methods. See `src/ui/control-center.ts:926-977` for the pattern.
- **Programmatic tab switching.** A tab can request the Control Center switch to another tab via the `showTab(tabId)` callback — used when a data-quality preview modal's "Apply" button wants to send the user to the People tab to see results.

## Responsive behavior

**Desktop:** sidebar drawer is always visible inline.

**Mobile:** drawer is hidden by default, toggled via a hamburger button in the sticky header. A backdrop overlay appears behind the drawer when open; clicking the backdrop or selecting a tab closes it.

Detection: `isMobileMode()` at `src/ui/control-center.ts:212-214` uses `Platform.isMobile || document.body.classList.contains('is-mobile')`. The body-class check allows Obsidian's desktop "simulate mobile" mode to work too.

**State classes applied at construction:**

- `crc-drawer--mobile` (structural)
- `crc-drawer--open` / `crc-drawer-backdrop--visible` (open state)
- `crc-mobile-mode` on the modal root

Mobile drawer toggle handlers at `src/ui/control-center.ts:258-281`. `switchTab()` auto-closes the drawer on mobile after a selection — desktop users keep it visible for navigation.

## Styling

**CSS file:** `styles/control-center.css` — ~5700 lines. Dedicated stylesheet concatenated into the plugin's single `styles.css` bundle via `build-css.js`.

**Class naming:**

- Prefix `.crc-` (Charted Roots Control Center). Isolates Control Center styles from other plugin UI.
- BEM-like structure: `.crc-drawer__header`, `.crc-drawer__content`, `.crc-nav-item__icon`.
- State modifiers: `.crc-drawer--open`, `.crc-drawer--mobile`, `.crc-nav-item--active`, `.crc-nav-item--tool`, `.crc-nav-group--with-divider`.

**Theming:** all colors reference Obsidian CSS variables (`--background-primary`, `--interactive-accent`, `--text-normal`, etc.). No hardcoded colors. Dark/light mode handled automatically by Obsidian's theme system.

**Spacing:** uses plugin-level CSS variables from `styles/variables.css` (`--cr-spacing-md`, `--cr-radius-md`, etc.) for consistency across plugin UI.

## Extension model — adding a new tab

The model is genuinely extension-friendly. To add a new tab:

1. Define the tab config in `TAB_CONFIGS` with `{id, name, icon, description, group}`.
2. Create a render function in a new file: `renderXxxTab(container, plugin, ...)`. Keep render logic isolated.
3. Add a dispatcher case in `showTab()` at `src/ui/control-center.ts:448+`. One-line addition: `case 'xxx': this.showXxxTab(); break;`.
4. Add a `showXxxTab()` method that calls the render function.

That's it. No changes to navigation rendering logic (it iterates `TAB_CONFIGS`), no group-registration boilerplate, no cross-tab coupling unless the new tab explicitly requests it.

## Known constraints and tradeoffs

**1. Modal-only — no docked or split-view mode.** Intentional for Charted Roots, but worth understanding: if you want the Control Center to live alongside another pane (e.g., a note + control center side by side), you'd need to rework it as a view/leaf.

**2. Tabs render single-threaded in the content area.** If two tabs want to display simultaneously, they can't. The design assumes users focus on one tab at a time.

**3. State is session-only.** Cache clears on close; scroll position, filter state, selected rows, etc. are all lost. For persistent state (e.g., remembering which filter the user had on People tab across sessions), you'd need to persist to settings explicitly — some tabs do this, most don't.

**4. The dispatcher has to be maintained centrally.** Every new tab adds a case to the `showTab()` switch. Could be refactored to a registry (`Map<tabId, renderFn>`) for cleaner extensibility at the cost of some concrete readability — but the current switch is readable and the plugin is single-owner.

**5. Tools group is hardcoded alongside tabs.** `TOOL_CONFIGS` and `renderToolsGroup()` are parallel to tab rendering. If you want a third type of nav entry (say, an external URL link), it would need its own parallel path. Fine for three categories, less elegant if you need more.

## File map (all the pieces)

| File | Lines | Purpose |
|---|---|---|
| `src/ui/control-center.ts` | ~1466 | Modal class, navigation rendering, tab dispatcher, cache management, tab-specific render methods |
| `src/ui/lucide-icons.ts` | ~428 | Tab configs, nav group configs, tool configs, icon helpers, custom SVG icon registration |
| `styles/control-center.css` | ~5700 | All visual styling |
| `src/plugin/commands.ts` | — | Invocation points (ribbon, commands, workspace events) |
| `src/ui/{people,places,sources,...}-tab.ts` | varies | Per-tab render functions (one file per tab) |

## Pattern to adopt for Draft Bench (reference, not prescription)

If a future DB Control Center pass ends up tracking CR's model closely, the **minimum viable kernel** to adopt would be:

- Modal subclass with sticky header + sidebar drawer + content area shell.
- `TAB_CONFIGS` array of `{id, name, icon, group}` objects.
- `NAV_GROUPS` array for logical clustering.
- Navigation renderer that iterates groups + filters tabs per group.
- `showTab(tabId)` dispatcher that empties content and calls tab-specific render.
- Instance-level cache for expensive services, cleared in `onClose()`.

Everything else — mobile drawer, tool entries, workspace-event invocation, programmatic deep-linking, cross-tab callbacks — layers on top of that kernel as features mature.

**Again: whether DB follows this model, reshapes it, or takes a different approach is a future design call.** The kernel above is worth noting because it's what CR distilled to; it's not a commitment for DB.
