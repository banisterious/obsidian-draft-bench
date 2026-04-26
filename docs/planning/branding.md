# Branding and Visual Identity

> **Canonical guidance lives in [brand-guidelines.md](../assets/branding/brand-guidelines.md).** This document is the design-exploration record — name selection, ribbon-icon reasoning, early logo iterations. For current asset inventory, clearspace rules, and placement guidance, use brand-guidelines.md.

**Purpose:** A single reference for Draft Bench's visual identity — name, tagline, logo, ribbon icon, and where each asset is used. Produced so placement and treatment decisions are captured once and don't have to be re-derived from conversation history.

**Relationship to the specification:** Orthogonal. The [specification](specification.md) defines what the plugin does; this document defines how it presents itself. When the specification says "the Control Center header shows the plugin name," this document specifies what appears next to that name.

**Status:** Initial draft. Logo assets produced. Social card composition deferred until closer to community submission.

---

## Name

**Working title:** Draft Bench.

The name has settled after exploration through several alternatives (*Plotted Scenes*, *Scriptorium*, *Drafting Table*, *Drafted Works*, *Draft to Proof*) and is now considered final. No rename is planned before community submission.

**Decision notes kept for posterity:**

- *Scriptorium* was the strongest alternative and held the working title for a brief period. It was set aside after a uniqueness check surfaced an existing GitHub project (cgueret/Scriptorium, a GTK/Flatpak desktop writing app) with both the same name and a substantially overlapping concept: scene management, plotting, chapter assignment, EPUB publishing. The collision is small in the Obsidian ecosystem (no plugin shares the name) but non-trivial in the adjacent open-source writing-tool space. *Draft Bench* cleared the same check with no collisions in any space.
- *Drafting Table* was briefly considered but felt slightly too static — a piece of furniture rather than an active workspace. *Draft Bench* carries the workshop-practical register while implying work in progress.
- *Plotted Scenes* was an early candidate for portfolio coherence with *Charted Roots* (past participle + domain noun). Rejected as too narrow once the plugin's scope grew to cover the full writing workflow rather than scene ordering alone.

**Pronunciation and capitalization:**

- Two words, both capitalized: *Draft Bench*.
- Plugin ID and repository name: `obsidian-draft-bench` (kebab-case).
- Class prefix: `dbench-` short, `draft-bench-` long (per coding-standards.md).
- Never *DraftBench*, *draft-bench* as display text, or *DB* in user-facing copy. *DB* is acceptable shorthand in code comments and internal discussion.

## Tagline

> A writing workflow for Obsidian.

Six words, no capitalization past the first, period at the end. Used in the README header, the GitHub repo description, the social card, and the Obsidian Community Plugin directory entry.

**Design notes:**

- *Workflow* is the operative word. It distinguishes Draft Bench from single-purpose plugins (word counters, focus-mode themes, outline tools) and signals the end-to-end scope (project -> scene -> draft -> compile).
- *For Obsidian* is load-bearing. It positions the plugin as native-citizen rather than a port or an approximation of Scrivener/Longform/etc., which matters for the frontmatter-native, Bases-integrated design philosophy.
- Ends with a period, not an em dash or ellipsis. The plugin does one thing well and says so simply.

**Variants for specific contexts:**

- GitHub repo description (one line, no period needed): *A writing workflow for Obsidian*
- Manifest `description` field: *A writing workflow for writers — projects, scenes, drafts, and compile, built for Obsidian's frontmatter-native world.* (Longer, more descriptive; shows in the Community Plugins directory.)
- Social card subtitle: *A writing workflow for Obsidian* (identical to the primary tagline).

## Logo

### Concept

A desk viewed from a three-quarter angle, with documents at three levels of granularity arranged on the surface: a chapter stack in the back, a scene page overlapping in front, and a small beat slip tucked to the side. Line-art style with opacity variation for depth. The composition communicates the plugin's structural hierarchy (chapter -> scene -> beat) in a single image and evokes a writer mid-session rather than a sterile catalog of documents.

The design explored many alternatives before settling on this form — explicit pages-on-a-surface arrangements, bookbindery metaphors (quires, signatures, stitching), craft-tool imagery (composing sticks, marking gauges, paper cutters), and abstract geometric marks. The three-quarter desk view was chosen because it is legible without requiring the viewer to decode a metaphor, is visually distinctive in the Obsidian plugin ecosystem (most plugin icons are single glyphs or monochrome symbols), and maps directly to the plugin's core concepts.

### Assets

Two SVG variants live in this directory:

| File | Size | Purpose |
|---|---|---|
| [`assets/logo-full.svg`](assets/logo-full.svg) | 64-unit viewBox, 512px default render | Full composition with desk, chapter stack, scene page, beat slip, and text lines on the scene. Use at 96px and up. |
| [`assets/logo-mark.svg`](assets/logo-mark.svg) | 64-unit viewBox, 256px default render | Simplified composition — drops the beat slip and text lines, keeps heavier strokes. Use at 24-64px where the full logo's detail would collapse. |

Both files use `currentColor` for strokes, so they inherit the surrounding text color. In Obsidian contexts this means the logo adapts automatically to light and dark themes without a color-scheme media query. On GitHub's README, the logo renders in whatever color the viewer's theme sets for text.

The scene page and beat slip use `var(--background-primary, white)` as their fill so they visually sit in front of the chapter stack (without the fill, the stack's lines would show through). The `white` fallback is for contexts that don't set Obsidian's CSS variables (GitHub README, social cards).

### Color

Draft Bench does not have a brand color. The logo is monochrome by design and inherits its color from context. When the logo appears in a context that needs to set a specific color (e.g., a social card with a custom background), use the theme's primary text color or its nearest equivalent. Avoid hardcoding hex values in any context where the logo might be re-themed later.

## Ribbon icon

**Decision:** Draft Bench uses Lucide's `pencil-ruler` glyph for the ribbon icon, not a custom SVG.

```typescript
this.addRibbonIcon('pencil-ruler', 'Open Draft Bench', () => {
  this.openControlCenter();
});
```

**Rationale:**

Custom-icon exploration produced several workable 16px derivatives of the T5 composition, but none felt as confident or as legible as Lucide's stock glyphs at ribbon scale. The pencil-ruler glyph — a pencil crossed with a ruler — communicates craft and precision, which map directly to Draft Bench's structural-editing purpose. It is visually distinguishable from the other pencil-family Lucide icons (`pencil`, `pencil-line`, `pencil-off`) that other plugins commonly use, giving Draft Bench a recognizable ribbon presence without a custom icon registration.

Lucide icons in Obsidian are vector-perfect at every size, theme-aware via `--icon-color` with no extra work, and visually consistent with Obsidian's native UI. The ribbon is where reliability matters most; the ribbon is not where brand identity is established.

This decision is revisitable. Swapping the ribbon icon from Lucide to a custom SVG is a one-string code change (`addRibbonIcon('custom-id', ...)` plus an `addIcon()` registration). Revisit after V1 ships and real-user feedback is available.

**Candidates considered and rejected:** `pencil-line` (current pre-finalization default, reads as generic "writing tool"), `notebook-pen` (too workbook-specific), `file-stack` (good draft-multiplicity metaphor but loses the craft dimension), `clipboard-pen-line` (read as check-off task rather than creative work).

## Placement inventory

Where each asset appears across Draft Bench's surfaces:

### Inside the plugin

| Surface | Asset | Treatment |
|---|---|---|
| Obsidian ribbon | `pencil-ruler` (Lucide) | Registered via `addRibbonIcon()`. Tooltip: "Open Draft Bench". Theme colors handled automatically. |
| Control Center header | `logo-mark.svg` at 24–32px | Inline `<img>` or inline SVG next to the "Draft Bench" title at the top of the modal. |
| Settings tab header | `logo-mark.svg` at 20–24px (optional) | Small mark inline with the plugin name at the top of the settings panel. Omittable if it feels redundant with Obsidian's settings UI. |
| Modal dialogs | None | Individual modals (new project, new scene, reorder) do not carry the logo. Obsidian's native modal chrome is sufficient. |

### Repository and distribution

| Surface | Asset | Treatment |
|---|---|---|
| GitHub README header | `logo-full.svg` at 200–300px wide | Centered at the top of the README, above the plugin name (H1) and tagline. |
| GitHub repo description | None | Text only: "A writing workflow for Obsidian". |
| GitHub social preview | Social card composition (deferred) | 1280×640 PNG with `logo-full.svg` on the left, plugin name and tagline as large type on the right. Generated before community submission. |
| Obsidian Community Plugins directory | Handled by Obsidian | Displays whatever icon/thumbnail Obsidian extracts (typically the plugin name and description). No separate asset required. |
| BRAT beta listings | None | BRAT displays the README's GitHub-rendered preview; no separate BRAT-specific asset. |

### Documentation

| Surface | Asset | Treatment |
|---|---|---|
| `docs/user/` markdown pages | None by default | Docs are prose-first. If a landing page or homepage is added later, `logo-full.svg` may appear in the header. |
| GitHub wiki | `logo-full.svg` at 200–300px wide on the wiki home page | Mirrors the README treatment. |
| `docs/developer/` markdown pages | None | Developer docs don't need branding. |

## Typography

Draft Bench inherits typography from its context and does not define its own type stack.

- **Inside Obsidian:** The plugin's UI uses Obsidian's native font variables (`--font-interface`, `--font-text`, `--font-monospace`). No custom fonts are loaded.
- **In the README:** GitHub's markdown rendering uses the viewer's system font. Draft Bench does not ship README-specific fonts or font-face declarations.
- **In the social card (when produced):** The plugin name uses the same sans-serif the README would render with (Inter, system-ui, or the social-card designer's preferred equivalent). The tagline uses the same family at a smaller size.

The reasoning: Draft Bench is a tool inside a larger environment (Obsidian), and writers who use it have already chosen their own font preferences via their vault theme, their OS, and their personal Style Settings. Imposing a Draft Bench-specific typeface would fight those preferences for no gain.

## Voice and tone

Brief notes for copy across README, docs, notice messages, and release notes. The specification's [§ Notice conventions](specification.md#notice-conventions) is authoritative for in-app notice text; these are the cross-surface conventions.

- **Plain, unfussed prose.** Prefer short sentences. Avoid marketing-copy intensifiers ("blazingly fast," "revolutionary," "powerful"). The plugin is useful; the writing about it should be, too.
- **Writer-first language.** The user is always "the writer" or "you," never "the user." Domain terms: *project*, *scene*, *chapter*, *draft*, *beat*. Internal terms (frontmatter, linker, reverse array) stay in developer docs.
- **No apology language.** Errors start with "Could not..." rather than "Sorry, we couldn't...". Failures state what happened and what the writer can do next.
- **Understatement over enthusiasm.** Release notes describe what changed, not how great it is. Bug fixes say what was broken. Features say what they do. Exclamation marks are not used except in genuinely celebratory contexts (first release, 1.0, major milestones).
- **The plugin is "Draft Bench," not "we."** Release notes and README copy use the plugin name or the passive voice rather than a royal "we," since the plugin has one author.

## Positioning relative to adjacent Obsidian plugins

Draft Bench is one of several Obsidian writing plugins. The space is small but no longer empty, and writers evaluating tools will compare. Capturing the positioning here so the README, wiki, and community-submission copy stay consistent and don't have to re-derive it from conversation.

**Adjacent plugins (as of 2026-04):**

- **[Longform](https://github.com/kevboh/longform)** — the original Obsidian writing plugin. Scene-as-note model, drag-to-reorder manuscript view, compile to single-file output. Single-author maintenance, slower release cadence. The closest spiritual ancestor; Draft Bench's `Drafts/` and compile concepts owe a real debt to Longform's prior art.
- **[StoryLine](https://github.com/PixeroJan/obsidian-storyline)** (Jan Sandström) — kitchen-sink Scrivener-in-Obsidian. Multi-view (Corkboard, Kanban Board, Plotgrid, Timeline, Plotlines subway map, Manuscript Scrivenings-style continuous editor, Characters, Locations, Navigator, Stats), Codex hub for entity types, beat-sheet templates, plot-hole detection, pacing analysis, Scrivener `.scriv` import, six export formats, series mode. Very actively shipping (v1.9.5 in ~2 months from public start).

**Where Draft Bench sits:**

Deliberately narrow. The narrative spine — projects, chapters, scenes, drafts, compile — and not the surrounding world. Auxiliary content (characters, locations, research) stays user-managed in V1; the [Charted Roots](https://github.com/banisterious/charted-roots) plugin is the sibling that owns world-building. This is a design commitment, not an unfinished scope. (See `feedback_cross_plugin_scope` in personal memory: "DB owns narrative; CR owns world; auxiliary content stays user-managed.")

**What's distinctive about Draft Bench against this landscape:**

1. **Drafts as a first-class type.** `dbench-type: draft` is a noun, not a side-effect. Snapshots of scenes, chapters, and single-scene projects live in a configurable `Drafts/` folder, disambiguated by which parent ref is present. Neither Longform nor StoryLine has a comparable archived-snapshot model.
2. **Compile-as-artifact with first-class preset notes.** Compile presets are vault notes (`dbench-type: compile-preset`), not modal-only configuration. Includes content-handling rules with per-preset overrides, footnote renumbering across scenes, section-break decorations, djb2 chapter hashing for compile-state drift tracking.
3. **Bidirectional linking + integrity service.** Stable IDs, dual-stored forward refs, plugin-maintained reverse arrays, live sync on vault events, batch repair UI with SNAKE_CASE issue codes. A long-term vault-hygiene commitment that surfaces drift writers might otherwise miss.
4. **Markdown-first with frontmatter discipline.** All plugin-managed properties carry the `dbench-` namespace prefix. A vault opened without Draft Bench installed still reads cleanly: scenes are notes, drafts are notes, compile presets are notes. Nothing locked behind plugin-only state.
5. **Theme-respectful styling.** Opt-in via Style Settings; the plugin ships class hooks and minimum defaults, not opinionated chrome. Writers who customize their vault's appearance don't have to fight the plugin to keep it.
6. **Bases-native.** Starter `.base` views ship for projects, scenes, and drafts. Discovery, filtering, and grouping use the writer's own Bases setup rather than custom view registrations.

**Where Draft Bench doesn't compete (and isn't trying to):**

- Plotting tools (plot grids, subway maps, beat-sheet templates, timeline modes). StoryLine's territory; out of scope for V1 per spec § Non-goals.
- Entity management (characters, locations, custom categories). Belongs to Charted Roots or to user-managed plain notes.
- Analytics (pacing, echo finder, plot-hole detection, prose readability). Genuinely useful; not what Draft Bench is for.
- All-format export. Draft Bench targets MD, PDF, ODT for V1 — the formats writers actually submit and share. DOCX is on the post-V1 list.
- Migration importers. Scrivener `.scriv` import is on the post-V1 list as a possible feature (writers coming from Scrivener are a real audience), but V1 is for writers starting fresh in Obsidian or already vault-native.

**Short answer for the README / wiki ("How is Draft Bench different from StoryLine?"):**

Draft Bench is narrow on purpose. It handles the manuscript spine — projects, chapters, scenes, drafts, compile — and stays out of the rest. If you want one plugin that also tracks characters, locations, plot grids, beat sheets, and stats, StoryLine is excellent at that. If you want a focused tool for organizing scenes, snapshotting drafts, and compiling a manuscript, with Bases for everything else and your own notes for world-building, Draft Bench is built for that.

## Related documents

- [specification.md](specification.md): Plugin specification
- [ui-reference.md](ui-reference.md): UI patterns and conventions
- [../developer/coding-standards.md](../developer/coding-standards.md): CSS prefixes, class naming, and code conventions
