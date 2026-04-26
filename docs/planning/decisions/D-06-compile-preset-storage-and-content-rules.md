# D-06: Compile preset storage and content-handling rules

**Status:** Locked — V1 scope complete; ready for Phase 3 implementation
**Related:** [specification.md § Compile / Book Builder](../specification.md), [D-01](D-01-draft-modeling.md), [D-04](D-04-folder-flexibility.md)

---

## Context

Phase 3 ships Book Builder (see [specification.md § Compile / Book Builder](../specification.md)). Two implementation questions need deliberate decisions before Phase 3 starts, and they're coupled closely enough that one ADR captures both:

1. **Where compile presets live.** Named compile configurations are user-facing writer artifacts. They need to persist somewhere — plugin settings, sidecar file, or first-class vault note. The choice affects how presets are edited, shared, versioned, and how they travel when a project folder is moved between vaults.

2. **How Book Builder handles content-level constructs.** When concatenating scene bodies, the compile pipeline encounters constructs (headings, horizontal rules, dinkuses, footnotes, HTML, Obsidian embeds, wikilinks, callouts, Tasks, tags) that have multiple reasonable interpretations in compiled output. V1 needs explicit defaults and a decision on which rules are user-overridable at which scope.

Both decisions are parked here because each touches Book Builder's UI and preset-edit surface. Locking them together avoids re-opening the preset schema when content-rule overrides are added.

## Prior art

Three existing tools frame the design space:

### Longform (kevboh/longform)

Inspirational parent for DB's scene-as-note model. Compile is minimal: scenes concatenate in manuscript order into a single markdown note. No preset concept, no multi-format output, no content-handling rules; compile is a one-shot action triggered from the scene list.

- **DB inherits:** plain-markdown substrate, scene-as-note atomicity, concatenation-in-order as baseline behavior.
- **DB extends:** first-class presets, multi-format output (MD / PDF / ODT), content-handling rules for submission-grade output.

### Scrivener

Commercial incumbent for long-form writing. Full compile with Section Types + Section Layouts decoupling editorial role from rendering treatment; portable Compile Formats (`.scrformat`) independent of projects; filter-by-status, inclusion trees, front/back matter folders, replacements, live preview. Feature parity is extraordinary; UX is widely described as overwhelming ("tabbed, deep, intimidating").

- **DB inherits as principles:** portable presets, filter-by-status, front/back matter as a first-class concern (post-V1), compile-as-artifact (see § Design principles below).
- **DB deliberately rejects:** the combinatorial surface of Compile Format x Section Type x Section Layout x Replacements. The "open wizard, make 30 decisions, hope" shape. DB's capped content-rule table and markdown-first pipeline aim at a surface small enough to reason about.
- **Architectural differentiator:** Scrivener's proprietary `.scriv` bundle vs. DB's plain-markdown scenes. Compile is an export for DB, not the primary artifact.

### Charted Roots Book Builder

Sibling plugin; architectural reference for DB. 4-step wizard, `BookDefinition` serialized as `.book.json`, per-chapter try/catch pipeline, djb2 change detection, partial success, progress callbacks; delegates markdown-to-PDF/ODT to the CR Reports system. Full reference in [book-builder-reference.md](../book-builder-reference.md) and [report-generation-reference.md](../report-generation-reference.md).

- **DB inherits:** pipeline shape, progress callbacks, per-chapter try/catch, schema versioning, djb2 change detection, JSZip-for-ODT, pdfmake+VFS for PDF.
- **DB diverges:** `.book.json` sidecar becomes first-class preset notes; genealogy-specific report chapter types become `scene` + section-break decorations only for V1; CR's Book-Builder-as-thin-layer-over-Reports becomes a single compile service (DB has no Reports substrate).

## Design principles

### Compile-as-artifact (not compile-as-session)

Compile presets are persistent vault notes writers open, edit, and return to over time. The preset note is the canonical compile surface; the Book Builder UI is one of several editing surfaces on top of that artifact (Obsidian Properties panel, direct frontmatter edit, Bases views, our own form UI).

This is a deliberate inversion of the session-oriented compile UX shared by Scrivener, CR Book Builder, and Longform. In those tools, config is transient UI state: open a wizard, walk through decisions under time pressure, click Generate, lose the state. In DB, config is a tracked, editable artifact that survives across sessions and never needs reconstructing.

**Implications:**

1. **Wizard role changes.** A multi-step wizard is no longer the canonical compile surface; it becomes first-run onboarding for creating a new preset with sensible defaults. Subsequent editing is a form view of the preset's current state, with "Run compile" as one action among several (compile, duplicate, rename, archive).
2. **Progressive disclosure comes for free.** A new preset can start as a near-empty note (`dbench-type: compile-preset`, `dbench-project: [[...]]`, defaults elsewhere). Writers run it, see output, tweak one property, run again. No "commit to 30 decisions before seeing the result."
3. **Multiple presets per project become cheap.** "Workshop draft with comments preserved," "Final submission manuscript," "Kindle sample: chapters 1-3," "Synopsis-only." Each is a separate preset note; writers pick one at compile time.
4. **Git-vault versioning works natively.** A preset note is a tracked markdown artifact. Writers with git-synced vaults diff preset changes, roll back, merge from collaborators.
5. **Shareability is automatic.** Drop a preset note into another vault and it works. No export/import. Community-shared presets (e.g., "Shunn manuscript standard") travel as plain `.md` files.
6. **Failure mode inverts.** Scrivener-shape: "Output is wrong, let me re-walk the wizard and re-find the setting." DB-shape: "Output is wrong, let me open the preset note and read the current state."

This principle is the primary reason DB chose first-class preset notes over `data.json` or sidecar storage. The choice is not just about file location; it's about what "editing a compile preset" means as a user activity.

## Decision

V1 scope locked across six dimensions: preset storage, preset schema, inclusion model, UI surfaces, output format, and content-handling rules. Each subsection below captures the locked decision plus rationale; post-V1 extensions are called out inline.

### Preset storage format

**Candidates under consideration:**

- **A. Plugin `data.json`**, keyed by project id (`compilePresets: { [projectId]: Preset[] }`).
  - Pros: simple persistence; invisible to users who don't want vault clutter; consistent with other plugin settings.
  - Cons: presets don't travel with the project folder when moved between vaults; sharing a preset requires manual JSON export; no version-control granularity per preset.

- **B. Sidecar file in the project folder** (e.g., `<project>/.compile-presets.yaml`).
  - Pros: travels with the project; user-readable if they want; can be checked into version control.
  - Cons: extra plugin-managed files in the vault; Obsidian may hide dotfiles or not; needs explicit handling for project-shape=single (no folder to own the sidecar).

- **C. First-class preset notes** (`dbench-type: compile-preset`).
  - Pros: most aligned with the plugin's notes-as-data philosophy; queryable via Bases; shareable as part of the vault; editable via Obsidian's Properties panel; naturally supports multi-project presets and sharing across vaults.
  - Cons: adds a new type to the V1+ vocabulary; blurs the fiction-vs-plugin-data line for writers who expect only prose notes in their vault; more complex than option A for a first implementation.

**Criteria to decide on:** travelability when project folder is relocated, shareability between writers, ease of edit, fit with the plugin's data-model philosophy, implementation complexity.

**Decision: Option C — first-class preset notes** (`dbench-type: compile-preset`). Presets participate in bidirectional linking via a new `RelationshipConfig` entry: `preset.dbench-project` <-> `project.dbench-compile-presets` / `project.dbench-compile-preset-ids` reverse arrays, following the same pattern as scene <-> project. Rationale: compile-as-artifact principle (see § Design principles above); the preset-as-canonical-surface model only coheres if presets are vault-native notes, not plugin-private data.

### Preset schema shape

Preset notes use a flat frontmatter schema following DB's `dbench-*` naming convention. Every field has a sensible default so a near-empty preset (just identity, project link, and schema version) compiles successfully against its target project. The canonical schema:

```yaml
---
# Identity and linkage
dbench-type: compile-preset
dbench-id: <generated>
dbench-project: "[[Novel Name]]"
dbench-project-id: <project-id>
dbench-schema-version: 1

# Book-output metadata
dbench-compile-title: ""
dbench-compile-subtitle: ""
dbench-compile-author: ""
dbench-compile-date-format: iso         # iso | mdy | dmy | ymd

# Inclusion model (V1: implicit-auto only)
dbench-compile-scene-source: auto       # V1 value; explicit reserved post-V1
dbench-compile-scene-statuses: []       # [] = all; ["final"] = status filter
dbench-compile-scene-excludes: []       # wikilink array of scenes to skip

# Output
dbench-compile-format: md               # md | pdf | odt
dbench-compile-output: vault            # vault | disk (vault meaningful only when format=md)
dbench-compile-page-size: letter        # letter | a4 (pdf/odt only)
dbench-compile-include-cover: false
dbench-compile-include-toc: false
dbench-compile-chapter-numbering: none  # none | numeric | roman
dbench-compile-include-section-breaks: true

# Content-handling overrides (per-preset subset; see § Content-handling rules)
dbench-compile-heading-scope: draft     # draft = below ^## Draft only; full = full body
dbench-compile-frontmatter: strip       # strip | preserve
dbench-compile-wikilinks: display-text  # display-text | strip | preserve-syntax
dbench-compile-embeds: strip            # strip | resolve (V1: strip-only for notes; images always strip-with-notice)
dbench-compile-dinkuses: preserve       # preserve | normalize (to * * *)

# Compile state (plugin-managed; updated via processFrontMatter)
dbench-last-compiled-at: ""
dbench-last-output-path: ""
dbench-last-chapter-hashes: []          # array of "<scene-id>:<djb2-hash>" strings
---

(note body is free-form; writers can jot notes about the preset itself)
```

**Locked structural decisions:**

1. **`dbench-compile-*` prefix on preset-scoped properties.** Redundant with the `dbench-type: compile-preset` discriminator but claims namespace cleanly and prevents cross-type collisions if we ever add a `dbench-title` on another note type later.
2. **Implicit chapter list for V1.** `dbench-compile-scene-source: auto` = all scenes of the project in `dbench-order`, optionally filtered by status and excludes. Explicit-array mode (`dbench-compile-scene-source: explicit` + `dbench-compile-chapters: [...]`) reserved post-V1 for fine-grained control.
3. **5 per-preset content-handling rules:** heading-scope, frontmatter, wikilinks, embeds, dinkuses. The other 11 rules in the content-handling table are hardcoded. See § Content-handling rules below.
4. **Compile state stored in frontmatter, not `data.json`.** Coheres with the compile-as-artifact principle: the preset note is a self-contained record of what was last compiled. Writers see the edits in git diffs and file history, consistent with existing plugin-managed property writes elsewhere (reverse arrays, `dbench-id` stamping).
5. **Schema versioning from V1** (`dbench-schema-version: 1`). Reserves a migration slot for post-V1 additions (image handling, explicit chapter lists, chapter-type pairing for post-V1 `chapter` note type, etc.).

**All frontmatter is flat.** No nested objects or mappings; this is an explicit hard rule because Obsidian's Properties panel does not round-trip nested structures (see [media-management-reference.md](../media-management-reference.md) for the same rule spelled out for media). Two places in the schema needed restructuring to hold the rule: section-break decorations moved to scene properties (not preset-side nested-object entries), and `dbench-last-chapter-hashes` became a flat array of `"<id>:<hash>"` strings (not a YAML mapping).

**Section-break decorations live on scenes, not the preset.** A scene that should have a named break rendered before it declares:

```yaml
# On the scene note:
dbench-section-break-title: "II."
dbench-section-break-style: visual      # visual | page-break; optional, default visual
```

Presence of `dbench-section-break-title` triggers the break; absence means no break. Preset-level `dbench-compile-include-section-breaks: true | false` (default true) suppresses all breaks for variant-compile flexibility (workshop compile with breaks off, final compile with breaks on, all from the same scene structure).

### Inclusion model

V1 inclusion model has three flat knobs on the preset:

```yaml
dbench-compile-scene-source: auto
dbench-compile-scene-statuses: []       # [] = all; ["final"] = filter
dbench-compile-scene-excludes: []       # wikilink array of scenes to skip
```

**Compile pipeline order:**

1. Collect all scenes in the project (sorted by `dbench-order`).
2. If `dbench-compile-scene-statuses` is non-empty, keep only scenes whose status matches. Scenes with missing or empty `dbench-status` are **excluded** when the filter is non-empty (strict match; missing status = not ready). A future Data Quality surface will flag missing-status scenes as a fixable pre-compile issue; see [data-quality-reference.md](../data-quality-reference.md) § V1 compile touchpoint.
3. Remove any scene whose wikilink appears in `dbench-compile-scene-excludes`.
4. Result = compile set, passed to the rendering pipeline.

**Default status filter:** empty (all statuses). First-time compile on a new preset produces visible output even during early drafting. A compile-completion notice names the scene count and mentions the filter as a tuning option (`"Compiled 17 scenes. Filter by status in the preset to narrow the set."`).

**Post-V1 extensions:** explicit include list (`dbench-compile-scene-source: explicit` + `dbench-compile-chapters: [...]`), scene-order range filters, draft-version cross-section ("compile Draft 2 across all scenes"), manual ordering override per preset.

### UI surfaces

Book Builder has three V1 surfaces, mirroring the three operations writers perform:

**Create — minimal modal.** Palette command `Draft Bench: Create compile preset` + a "New preset" button in the Compile tab open a small modal with three fields: preset name (becomes note title), project (auto-filled from active file context, dropdown fallback), output format (radio md / pdf / odt, default md). Everything else stamped with defaults on the new preset note. Matches DB's existing pattern for `NewProjectModal` / `NewSceneModal` / `NewDraftModal`. No wizard.

**Edit — form view in the Compile tab.** The Control Center modal's Compile tab (currently a stub) becomes a form view of the active project's presets. Header: preset picker dropdown + "New preset" button + "Run compile" button. Body: grouped collapsible sections (Metadata, Inclusion, Output, Content-handling, Last compile), with Metadata / Inclusion / Output expanded by default. Fields use appropriate affordances:

- Freeform (title, subtitle, author): text inputs.
- Enum (format, page-size, chapter-numbering): radio groups.
- Boolean (include-cover, include-toc, include-section-breaks): toggles.
- Status filter: multi-select over the current status vocabulary.
- Scene excludes: scene picker modal (pattern reused from other DB flows).
- Content-handling rules: dropdowns per field.
- State fields (last-compiled-at, last-output-path, hashes): read-only display ("Last compiled 2026-04-22 14:32; 3 scenes changed since").

Saves via `processFrontMatter` on change. Obsidian's Properties panel remains a valid alternative surface for direct frontmatter editing; both surfaces reflect the same artifact.

**Run — palette command + Compile tab button + context menu entries.**

- `Draft Bench: Run compile` (palette) with smart file-context resolution: active file is a preset note -> run that preset; active file is scene / project / draft -> list presets for its project, pick one (direct run if exactly one preset); active file is unrelated -> project picker -> preset picker.
- "Run compile" button in the Compile tab header runs the currently-selected preset directly (no prompt; the tab's picker already resolved intent).
- Context menu entries:
  - On preset notes: "Run compile" + "Duplicate preset."
  - On project notes: "Create compile preset" (alongside existing "Show manuscript view" and "Repair project links").
  - On scene / draft notes: "Compile current project."

Each context menu action has a palette-command counterpart for keyboard parity (`Draft Bench: Run compile`, `Draft Bench: Duplicate compile preset`, `Draft Bench: Create compile preset`, `Draft Bench: Compile current project`).

**Explicitly not shipped in V1:**

- **No creation or edit wizard.** Compile-as-artifact eliminates the "walk through 20 decisions in one session" need.
- **No Manuscript leaf compile section.** The leaf stays focused on ongoing manuscript work (project summary + scene list + toolbar).
- **No preset-note-injected action buttons** (code-block renderer or action button). Complexity deferred; palette + tab + context menus cover the action surface.
- **No default-preset marker.** Writers with multiple presets get the picker on palette invocation; in-tab workflow is pick-and-run.
- **No archive preset action** (needs an archive concept DB doesn't have yet).
- **No open-output-folder action** (needs native file-manager integration; V1 notice includes the output path as text).
- **No multi-select batch compile** via `files-menu`.

### Output format

V1 ships four formats. Format and destination are orthogonal, encoded as two flat fields:

```yaml
dbench-compile-format: md           # md | pdf | odt | docx
dbench-compile-output: vault        # vault | disk (vault meaningful only when format=md)
```

**Defaults for a new preset:** `format: md`, `output: vault`. First-time compile produces an immediately-visible vault artifact with no save-dialog interrupt. Writer can switch to PDF / ODT / DOCX for submission work. Aligns with compile-as-artifact ("run it, see what happened, tune, run again").

**Vault-MD output path convention:** `<project folder>/Compiled/<preset name>.md`. Plugin creates the `Compiled/` subfolder on first compile if absent. No preset-level path override in V1 (post-V1 adds `dbench-compile-vault-output-path` if writers want custom locations). Re-compile overwrites the same path silently; writers who want version history use git, vault snapshots, or per-version preset duplicates.

**Disk outputs** (saved-md, pdf, odt, docx): Obsidian's save dialog each compile. `dbench-last-output-path` stores the last-used path for informational display in the Compile tab's Last-compile section; the dialog does not auto-fill based on it, avoiding accidental overwrites of submitted drafts with work-in-progress versions.

**One preset, one output.** Writers wanting multiple outputs (e.g., MD for vault records + PDF for submission) create two presets; cheap under the compile-as-artifact model.

**Out of scope for V1:** EPUB / RTF formats; Kindle / KDP direct-send; auto-versioned output filenames; preset-level output path override.

### Content-handling rules

V1 content-handling table. Five rules are per-preset; the remaining eleven are hardcoded. The "Global setting" override tier from the earlier D-06 skeleton has been dropped (no task-specific or tag-specific settings in V1; can land post-V1 if writers request).

| # | Rule | V1 default | Override |
|---|---|---|---|
| 1 | Scene body scope | Include content below `^## Draft` heading only (V1 default); `full` = whole body including planning sections | **Per-preset** (`dbench-compile-heading-scope`: draft / full) |
| 2 | Heading transformation | Scene title emitted as H1 above each scene's compiled body; `dbench-compile-chapter-numbering` prefix if set (numeric / roman); H1s inside the compiled body shifted to H2 | Hardcoded (numbering format via per-preset field) |
| 3 | Frontmatter stripping | Strip all YAML | **Per-preset** (`dbench-compile-frontmatter`) |
| 4 | Horizontal rules (`---`) | Preserve mid-scene; ignore at file start (frontmatter fence) | Hardcoded |
| 5 | Dinkuses (`* * *`, `⁂`, asterism) | Preserve | **Per-preset** (`dbench-compile-dinkuses`: preserve / normalize to `* * *`) |
| 6 | Footnote renumbering (`[^1]`) | Auto-renumber across concatenated scenes | Hardcoded |
| 7 | Raw HTML | Preserve in MD; strip-with-notice in PDF / ODT | Hardcoded |
| 8a | Note embeds (`![[Some Note]]`) | Strip (V1) | **Per-preset** (`dbench-compile-embeds`: strip / resolve); V1 ships strip-only, post-V1 adds resolve |
| 8b | Image embeds (`![[photo.jpg]]`) | Strip with notice | Hardcoded V1; promotes to per-preset post-V1 via MediaService resolver (see [media-management-reference.md](../media-management-reference.md)) |
| 8c | Base embeds (`![[view.base]]`) | Strip with notice | Hardcoded; post-V1 may add "render as static table" |
| 9 | Wikilinks (`[[target]]`, `[[target\|display]]`) | Keep display text, strip brackets | **Per-preset** (`dbench-compile-wikilinks`: display-text / strip / preserve-syntax) |
| 10 | Obsidian callouts (`> [!note]`) | Strip marker + title line; keep blockquote body | Hardcoded |
| 11 | Obsidian Tasks (`- [ ]`) | Strip checkbox markers; keep task text | Hardcoded |
| 12 | Tags (`#foo`) | Strip inline | Hardcoded |
| 13 | Math / code blocks | Preserve verbatim in MD; monospace in PDF / ODT; math as literal LaTeX source | Hardcoded |
| 14 | Obsidian comments (`%%...%%`) | Strip | Hardcoded |
| 15 | Highlight marks (`==text==`) | Strip marks; keep text | Hardcoded |
| 16 | Markdown tables | Preserve as MD; render natively in PDF (pdfmake) and ODT | Hardcoded |

**Notes on the table:**

- **Audio / video / PDF-file embeds** follow the same treatment as 8b / 8c: strip-with-notice, hardcoded. Edge cases for scene bodies.
- **Batched notice on compile completion** for all strip-with-notice constructs. One message summarizes the count and types (`"12 embeds stripped (8 images, 3 bases, 1 PDF); post-V1 adds include paths for supported types."`); no per-embed notice spam.
- **Section-break rendering** is not a content-handling rule; it lives in pipeline logic reading each scene's `dbench-section-break-*` properties. See § Preset schema shape above.
- **Per-preset rule count: 5** (heading-scope, frontmatter, dinkuses, embeds, wikilinks). Matches the `dbench-compile-*` schema fields one-to-one.

## Rationale

The decision subsections above each carry their own reasoning; synthesizing across them:

- **Preset storage as first-class notes** (Option C) locks in because only notes-as-data makes the compile-as-artifact principle cohere: a preset must survive sessions, travel with vaults, appear in Bases, and be editable via multiple Obsidian-native surfaces simultaneously.
- **Flat schema** (no nested objects) is a hard constraint from Obsidian's Properties panel behavior, not a preference. Every schema decision passes through this filter; two fields required restructuring to hold it (section-breaks moved to scenes; chapter-hashes flattened to `"id:hash"` strings).
- **5 per-preset content-handling rules** reflects a deliberate cap. Too many knobs recreates Scrivener's UX paralysis; too few locks writers into one style. Five covers the workshop / submission / collection variance writers actually encounter, bounded by the compile-as-artifact principle that presets are cheap to duplicate.
- **Implicit chapter list for V1** keeps the near-empty-preset-compiles property intact. Writers never have to build a chapter list manually unless they want to; explicit mode lands when writers ask.
- **Schema versioning from V1** (`dbench-schema-version: 1`) reserves the migration slot before it's needed. Post-V1 additions (explicit chapter lists, image-handling toggles, chapter-type pairing) each get a slot without disturbing existing presets.
- **MD + PDF + ODT with vault-MD as default** covers workshop / submission / archival workflows without committing to ebook formats that writers don't uniformly need.
- **Form + modal UI, no wizard** follows directly from compile-as-artifact. Wizards are session-oriented; forms are truth-reflecting.

## Alternatives considered

- **Plugin `data.json` storage.** Rejected: presets don't travel with the project; no version-control granularity; breaks compile-as-artifact.
- **Sidecar files** (`<project>/.compile-presets.yaml`). Rejected: vault clutter, inconsistent with DB's notes-as-data shape, doesn't work cleanly for single-scene projects.
- **Explicit chapter lists as V1 default** (Shape B in item-2 discussion). Rejected: forces writers to manually build the chapter list on every new preset, fighting the progressive-disclosure goal. Reserved post-V1.
- **Wizard-based edit flow.** Rejected: contradicts compile-as-artifact. Form view is truth-reflecting; wizard is session-oriented.
- **All-hardcoded content rules.** Rejected: removes workshop / submission / collection variance entirely.
- **All-per-preset content rules.** Rejected: recreates Scrivener's UX surface. Five-rule cap + batched notice pattern gives adequate flexibility.
- **Per-preset output path override.** Deferred to post-V1. Default formula (`<project folder>/Compiled/<preset name>.md`) covers the common case; writers with custom paths can move the output manually or wait for the override field.
- **4-value flat format enum** (`vault-md | saved-md | pdf | odt`). Rejected in favor of the 2-field split (`format` + `output`); two orthogonal axes map more cleanly to UI and to the compile pipeline.
- **Nested section-break definitions on presets.** Rejected due to flat-schema constraint; moved to scene-scoped properties (`dbench-section-break-title`, `dbench-section-break-style`) with a preset-level suppression toggle.
- **"Global setting" content-rule tier.** Dropped: added settings surface for marginal value. Hardcoded covers V1 need; global toggles land post-V1 if writers ask.

## Open questions

Design phase resolved. Implementation-level questions remain:

- **ODT serialization library:** JSZip with hand-built XML subset is committed (see [book-builder-reference.md](../book-builder-reference.md) adaptation footer). Open: whether to use `simple-odf` or hand-build the minimal XML. Defer to Phase 3 implementation spike.
- **pdfmake document-definition structure** for DB's specific layout needs (cover page, TOC, chapter numbering, section breaks). Defer to Phase 3 implementation; [report-generation-reference.md](../report-generation-reference.md) covers the patterns.
- **Scene picker modal affordance** for the Compile tab's excludes field. Check whether existing project-scope pickers port directly or need a scenes-only variant.

## Follow-ups for Phase 3 implementation

Design decisions locked above. Phase 3 implementation sequence:

1. **Core pipeline scaffolding.** `CompileService` shell with `generate(preset): Promise<CompileResult>`; markdown-synthesis step applying content-handling rules; djb2 hash computation per scene.
2. **Preset note type + linker integration.** Add `dbench-type: compile-preset` to type vocabulary; add `RelationshipConfig` entry for preset <-> project bidirectional linking; decide retrofit story (likely no "Set as compile preset" retrofit action since presets are always plugin-created).
3. **Create-preset modal + palette command.**
4. **MD renderer** (vault + disk outputs).
5. **PDF renderer** with pdfmake + lazy-loaded VFS fonts.
6. **ODT renderer** with JSZip.
7. **Compile tab form UI** with grouped collapsible sections + per-field affordances.
8. **Run-compile palette command + Compile tab button.**
9. **Context menu entries** (run, duplicate, create-preset-on-project, compile-current-project-on-scene).
10. **Footnote renumbering utility** (port CR pattern near-verbatim).
11. **Strip-with-notice batching** for non-resolvable embeds.

Pre-1.0 forward-compat work orthogonal to Phase 3 (issue codes on existing integrity issues; preserve detect / preview / apply shape in new batch ops) tracked in [data-quality-reference.md](../data-quality-reference.md) adaptation footer.
