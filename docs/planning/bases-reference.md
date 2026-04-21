# Bases integration reference: Charted Roots patterns

**Status:** Reference material. **Not** a design spec for Draft Bench's Bases integration.

**Purpose.** Captures Charted Roots' (CR) Bases integration architecture so that P2.C's `.base` starter views ship with prior-art-backed patterns rather than first-principles re-derivation. The summary below was drafted in a previous session by reading CR's source; file paths are accurate as of CR's April 2026 state, so treat them as search starting points, not stable anchors.

**How to use this document.**

- **P2.C is scoped to Bases starter views.** Architecture.md commits to shipping `.base` files for a starter set (all projects, scenes by project, scenes by status, draft history) plus an optional "Install starter Bases views" command. See [architecture.md § P2.C](../developer/architecture.md).
- **This document captures the full CR model.** DB doesn't need all of it — CR has 5+ entity types, ~22 views per base, and a property-alias system DB lacks. The DB-specific scope is in "DB commitments for later design" at the bottom.
- **Fresh eyes intended.** DB's 3 entity types (project, scene, draft), tighter relationships (via bidirectional linker), and absence of a property-alias system mean the DB implementation will be noticeably smaller and simpler than CR's ~2000 LOC. Adopt the orchestration pattern wholesale; rethink the per-view palette.

**Related docs.**

- [specification.md § Bases Integration](specification.md): authoritative design — property schema is sufficient, no custom view type registration, template `.base` files ship in Phase 2.
- [architecture.md § P2.C](../developer/architecture.md): starter view list and implementation notes.
- [control-center-reference.md](control-center-reference.md) and [wizards-reference.md](wizards-reference.md): companion depth-first references for other CR surfaces.

---

## TL;DR

- **~2000 lines across 9 files** — one orchestration module plus one template module per entity type.
- **Programmatic `.base` file generation, not bundled templates.** User invokes a command / context menu action; CR writes a fresh `.base` file to a configurable folder and opens it.
- **Read-only integration.** Bases views read CR's existing frontmatter schema as-is. No bidirectional sync; Bases don't write back to notes.
- **Optional enhancement.** Bases plugin availability is detected; CR degrades gracefully if it's not installed.
- **Property-alias-aware.** Templates interpolate the user's configured property aliases at generation time — baked in, not re-read on use.
- **Filtered by `cr_type` discriminator.** Each base scopes itself to one entity type via the canonical type property.

---

## Architecture

### File structure

```
src/
├── plugin/
│   └── base-templates.ts          # Orchestration: create, detect, resolve folder
└── constants/
    ├── base-template.ts           # People / individuals
    ├── places-base-template.ts
    ├── organizations-base-template.ts
    ├── sources-base-template.ts
    ├── universes-base-template.ts
    ├── notes-base-template.ts
    ├── research-base-template.ts
    └── events-base-template.ts
```

Separation of concerns: `base-templates.ts` knows *how to create* `.base` files; each `*-base-template.ts` module knows *what* a base for its entity type should contain.

### Two template styles

- **Static templates** — hardcoded YAML string constants for entity types where property names are stable and aliases aren't applied (in CR: Organizations, Sources, Research, Notes).
- **Generated templates** — functions that interpolate the user's `propertyAliases` into a template string (in CR: People, Places, Events, Universes). Generator signature: `(aliases: Record<string, string>) => string`.

The distinction is pragmatic: if no aliases apply to the properties a given base references, use a static template. Otherwise, use a generator.

### Orchestration module (`base-templates.ts`) public surface

```ts
export async function createBaseTemplate(plugin: Plugin): Promise<void>
export async function createPlacesBaseTemplate(plugin: Plugin): Promise<void>
export async function createOrganizationsBaseTemplate(plugin: Plugin): Promise<void>
export async function createSourcesBaseTemplate(plugin: Plugin): Promise<void>
export async function createUniversesBaseTemplate(plugin: Plugin): Promise<void>
export async function createNotesBaseTemplate(plugin: Plugin): Promise<void>
export async function createResearchBaseTemplate(plugin: Plugin): Promise<void>
export async function createEventsBaseTemplate(plugin: Plugin): Promise<void>
export async function createAllBases(plugin: Plugin): Promise<void>  // batch

export function isBasesAvailable(app: App): boolean  // availability check
```

One public function per entity type + one batch function. Each calls into the same internal `createBaseFile(plugin, filename, content)` helper that handles path resolution, existence check, vault write, and editor open.

---

## Availability detection

```ts
export function isBasesAvailable(app: App): boolean {
    // Returns true if the Bases core plugin is enabled in this vault.
    // Exact implementation reads app.internalPlugins or similar.
}
```

CR uses this to decide whether to show a gentle warning notice when the user invokes a Bases command on a vault where Bases isn't enabled. CR does NOT refuse to create the file — the `.base` format is a plain YAML file that remains usable when Bases is later enabled.

Adaptation note: treat availability as a *soft gate* (show a notice, don't block). The file is useful even without the plugin.

---

## User-facing entry points

### Commands

Eight per-type commands + one batch, registered in `src/plugin/commands.ts`:

```ts
this.addCommand({
    id: 'create-base-template',
    name: 'Create people base template',
    callback: () => createBaseTemplate(this)
});
// ... one per entity type
this.addCommand({
    id: 'create-all-bases',
    name: 'Create all bases',
    callback: () => createAllBases(this)
});
```

Command IDs follow the `create-<scope>-base-template` pattern — stable and hotkey-bindable.

### Context menus

Two layers in `src/plugin/context-menus.ts`:

- **File context menu** — a "Charted Roots" submenu offers per-entity-type base creation as menu items.
- **Folder context menu** — same submenu pattern.

The submenu pattern keeps the top-level context menu uncluttered. On mobile, where submenus can be finicky, CR uses a flattened item list.

### Settings tab

One setting — `basesFolder` (default `'Charted Roots/Bases'`). Used by the orchestration module to resolve the target path for every `.base` file. Folder is created if it doesn't exist.

---

## `.base` file generation pattern

Each call to `create*BaseTemplate` follows the same three-step sequence:

### 1. Resolve property aliases

```ts
const getPropertyName = (canonical: string): string =>
    plugin.settings.propertyAliases[canonical] ?? canonical;

const nameProp = getPropertyName('name');
const bornProp = getPropertyName('born');
// ...
```

Aliases are resolved once at generation time. **They are baked into the `.base` file**, not re-read from settings. If the user changes their aliases later, existing `.base` files keep the old aliases.

### 2. Build the YAML template

Templates are multi-view YAML structures. A simplified shape:

```yaml
filters:
  and:
    - note.cr_type == "person"

views:
  - type: table
    name: All members
    order:
      - formula.display_name
      - note.born
      - note.died

  - type: table
    name: Living members
    filters:
      and:
        - note.cr_living != false
        - formula.age < 120
    order:
      - formula.display_name
      - formula.age

formulas:
  display_name: |
    if(note.name, note.name, file.name)
  age: |
    if(note.born,
      if(note.died,
        year(note.died) - year(note.born),
        year(now()) - year(note.born)
      ),
      null
    )
```

Key conventions in CR's templates:

- **Every base filters on `cr_type` at the top level** to scope to one entity type.
- **Computed fields live in `formulas:`** — age calculation, display-name fallback, participant lists, etc.
- **Views are the primary organizing unit**, not files. Twenty-odd views per base covering different slices (by collection, by lineage, missing data, etc.).
- **Order/sort is per-view**, so different slices can sort differently.

### 3. Write and open

```ts
async function createBaseFile(plugin: Plugin, filename: string, content: string) {
    const folder = plugin.settings.basesFolder;
    await ensureFolderExists(plugin.app, folder);

    const path = `${folder}/${filename}.base`;
    if (await plugin.app.vault.adapter.exists(path)) {
        new Notice(`Base already exists: ${path}`);
        return;
    }

    await plugin.app.vault.create(path, content);
    await plugin.app.workspace.openLinkText(path, '', true);
    new Notice(`Created base: ${path}`);
}
```

Notice the "already exists" guard — CR doesn't overwrite. User must delete and recreate if they want a fresh template.

---

## Schema compatibility

### Read-only consumer

Bases read CR's frontmatter as-is. CR doesn't emit anything differently because Bases is watching. This is the single most important architectural decision:

> **Bases adapts to your schema. You don't adapt to Bases.**

This keeps the integration cost bounded and means Bases support never blocks schema decisions.

### The type discriminator property

CR uses `cr_type` (values: `person`, `place`, `event`, `source`, `organization`, etc.) as the filter predicate for every base. Draft Bench would use its equivalent (presumably `dbench-type`: `project`, `scene`, `draft`).

This one property carries all the entity-type routing. No complex type-detection logic; just a string equality filter.

### Formulas fill the gap where frontmatter is shape-only

CR's frontmatter stores raw values (`born: 1888-05-15`). Derived values (display age, parent count, marriage status label) live in base **formulas** — computed on-the-fly when the view renders. This keeps the frontmatter lean and the display logic centralized in one place per base.

---

## Integration philosophy

Four principles worth preserving in any adaptation:

1. **Optional enhancement, not replacement.** CR has its own Canvas, Family Chart, Timeline views. Bases is a fifth way to look at the same data, for users who think in tables. Never make a feature depend on Bases.
2. **Read-only.** Never write back to notes from a Bases view. Users edit via CR's native modals; Bases is for browsing and filtering.
3. **Graceful degradation.** If Bases isn't installed, CR keeps working. The base file creation still works; the file just can't be opened as a Bases view until the plugin is enabled.
4. **Opinionated defaults, overridable.** The generated bases include many pre-configured views (22 for People). Users can edit the generated `.base` file freely — CR never touches it again after creation.

---

## Limitations to inherit (or improve on)

From CR's implementation, known gaps worth deciding about in the sibling plugin:

- **No alias live-updates.** Aliases baked at generation time; changing them doesn't update existing bases. Acceptable for CR because aliases change rarely.
- **No "upgrade my base" command.** If CR ships a new version with improved base templates, users must delete and recreate. A future improvement would be a `refresh-base` command that regenerates while preserving user edits (hard to scope — depends on what "preserving user edits" means).
- **No cross-entity bases.** Each base scopes to one entity type. A project-scoped "all related entities" base would need to span multiple types, which CR's model doesn't do.
- **No Bases API integration.** CR creates `.base` files via the vault API; it doesn't programmatically query or update open Bases views. If Bases exposes a query API in the future, CR would be well-positioned to use it, but doesn't today.

---

## Settings keys to mirror

Adapt these for the sibling plugin:

| Key | Type | Default | Purpose |
|---|---|---|---|
| `basesFolder` | `string` | `'Charted Roots/Bases'` | Where new `.base` files go |
| `propertyAliases` | `Record<string, string>` | `{}` | Canonical → user-custom property name map |

Draft Bench equivalents would presumably be `basesFolder: 'Draft Bench/Bases'` and `dbenchPropertyAliases` (or match CR's naming convention — `propertyAliases` already works for any prefix).

---

## Effort estimate for Draft Bench

Rough breakdown assuming Draft Bench's 3 entity types (project, scene, draft):

| Component | CR LOC | DB estimate |
|---|---|---|
| Orchestration module | ~250 | ~150 (fewer entity types) |
| Per-type templates (3 × ~150-300) | ~1780 | ~450-700 |
| Commands registration | ~90 | ~40 |
| Context menu wiring | ~200 | ~100 |
| Settings additions | ~10 | ~10 |
| **Total** | **~2330** | **~750-1000** |

Roughly **one focused day** for a working implementation with 3-5 views per entity type, or **2-3 days** for a rich implementation with 15+ views per entity type matching CR's depth.

**Biggest time sink in CR was view design**, not code. Deciding *which* slices to offer per entity type (e.g., "Living members," "Multiple marriages," "Without lineage" for People) took more design iteration than the wiring. For Draft Bench, expect similar — think about what views a writer actually wants before building them.

---

## Adaptation checklist for Draft Bench

When you start implementation:

1. **Replace `cr_type` with `dbench-type`** as the discriminator property in every base filter.
2. **Replace `cr_*` property names with `dbench-*`** throughout templates.
3. **Replace CR's entity types** (person/place/event/source/organization) with DB's (project/scene/draft).
4. **Pick your views.** For each entity type, list 5-15 useful slices before writing template YAML. Example starting points: "All projects," "In-progress drafts," "Completed scenes by project," "Scenes needing revision," "Word-count by project," "Recently edited."
5. **Adopt the orchestration module wholesale** — `createBaseFile`, `isBasesAvailable`, `ensureFolderExists`, settings lookup, all directly portable.
6. **Commands and context menus** follow CR's pattern one-to-one; just rename and re-point.
7. **Documentation last.** CR didn't write user-facing Bases docs and regrets it mildly; Draft Bench should at least draft a wiki page when shipping.

---

## Open questions you'll want to answer for Draft Bench

- **Do you want a "refresh base" command?** If yes, decide the merge strategy for user edits early.
- **Do you want cross-entity bases?** E.g., a "project dashboard" base that shows its project + its scenes + its drafts in one file. CR doesn't do this; Draft Bench's tighter entity relationships might benefit from it.
- **Do you want packaged default bases on plugin install?** CR doesn't; all bases are user-triggered. Alternative: "first-run" flow that offers to create a starter set.
- **Are formulas sufficient, or do you want richer computed fields?** CR's formulas handle age, display names, relationship counts — simple string/date math. If Draft Bench needs aggregations across notes (e.g., total word count for a project), check whether Bases formulas can express that or whether the data needs to be denormalized into frontmatter first.

---

## DB commitments for later design

The points below are specific DB decisions (not speculative adoption) that shape how the Bases integration will land in P2.C. Captured here so they survive session ends.

### Adopt the orchestration pattern; rethink the view palette

CR's `createBaseFile` / `isBasesAvailable` / `ensureFolderExists` / path-resolution / open-after-create flow is directly portable and should be adopted wholesale for DB. These patterns aren't domain-specific; they're the right shape for any "generate .base on demand" integration.

The view palette is entirely DB-specific. CR's 22-views-per-base is far too many for DB's scope, and the slices (by lineage, by living status) don't translate. [architecture.md § P2.C](../developer/architecture.md) commits to a starter set of four bases covering the most common writer questions: all projects, scenes in current project, scenes by status, draft history for a scene. Start there; add more only when writers request specific slices.

### No property-alias system in V1

CR's templates interpolate `propertyAliases` at generation time because CR lets users rename frontmatter keys. DB does not — the `dbench-*` prefix is a hard contract per [CLAUDE.md § Code Conventions](../../CLAUDE.md). All DB base templates can be static YAML; no generator functions needed. Drop this entire layer from the CR architecture when adapting.

If DB ever adds an alias system, this decision revisits — until then, the simpler static-template model is correct.

### Soft gate on Bases availability, just like CR

`isBasesAvailable(app)` check before generation. If Bases isn't installed, show a notice explaining what the file is and how to enable Bases; still write the `.base` file. Users can enable Bases later and the file will just work. Matches CR's "graceful degradation" principle.

### "Already exists" guard; no overwrite

Also matching CR. If a base file at the target path already exists, show a notice and skip. Users who want a fresh template delete the file and re-run the command. This is simpler than a prompt-to-overwrite modal and respects user edits: a writer who has customized their base won't lose changes because they ran the command again.

### Entry points: palette command + folder context menu

Per architecture.md, the primary entry point is a palette command `Install starter Bases views`. Skipping file-context-menu entries in V1 — the context menu is already busy with retrofit + Repair links, and there's no obvious file-level trigger for "create bases" (it's a vault-level action, not a file-level one). Folder context menu is optional for V1; can add if writer feedback asks.

### No cross-entity bases in V1

Each base scopes to one `dbench-type`, matching CR. A "project dashboard" base showing project + scenes + drafts in one view is interesting but would require either multi-type filters or a different schema. Defer until writers ask — the four starter bases cover the common cases.

### No "refresh base" command in V1

CR's own regret. Merge strategy for preserving user edits is non-trivial (what if they removed a view? renamed a view? added formulas?). Until DB has shipped enough versions for the template shape to evolve meaningfully, this problem doesn't exist. Revisit if template iterations become frequent.

### Starter bases are user-triggered, not auto-installed

Matches CR. Auto-installing files on first plugin load surprises users and invites conflicts with existing folders. The palette command is a clean opt-in. Can reconsider in Phase 3 onboarding (where an "install starter bases" tile fits naturally into a first-run walkthrough).

### Settings additions

One new setting: `basesFolder: string` (default `'Draft Bench/Bases'`). Added alongside the existing folder settings. No `propertyAliases` since DB doesn't have that system.
