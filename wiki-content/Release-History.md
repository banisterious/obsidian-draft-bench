# Release History

Version history for Draft Bench. For the canonical changelog with full detail, see [CHANGELOG.md](https://github.com/banisterious/obsidian-draft-bench/blob/main/CHANGELOG.md).

---

## 0.1.4: 2026-04-30 — property-type registration + scene context-menu parity

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.4)

Two fixes:

- **Property-type registration**: tells Obsidian's `metadataTypeManager` to treat `dbench-*` relationship fields and their ID companions as text / multitext. The principled root-cause fix for the 0.1.1 → 0.1.3 wikilink-reshape chain — Properties panel now writes wikilinks as quoted strings from the start, and `processFrontMatter` round-trips them stably. Defense-in-depth: the 0.1.3 canonicalization in the linker stays as a safety net. Refs #8.
- **Scene context-menu parity**: right-clicking a scene file now surfaces a `New draft of this scene` entry in the `Draft Bench` submenu, matching the existing `New draft of this chapter` affordance on chapter notes. Refs #9.

947 unit + integration tests, all green. Desktop-only.

## 0.1.3: 2026-04-30 — YAML-shape polish for wikilink fields

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.3)

Single-fix patch. After the linker backfilled an ID companion for a wikilink-only relationship edit (per 0.1.1 / 0.1.2), the on-disk YAML for the wikilink field ended up in block-style nested-array form (`dbench-scene:\n  - - Some Scene`) rather than the canonical quoted-string form (`dbench-scene: "[[Some Scene]]"`). Same data, ugly rendering. The linker now re-canonicalizes the wikilink field in the same callback that writes the companion. Refs #7.

938 unit + integration tests, all green. Desktop-only.

## 0.1.2: 2026-04-30 — wikilink-only retrofit fix (frontmatterLinks)

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.2)

Follow-up to the wikilink-only retrofit fix from 0.1.1. The 0.1.1 fix parsed the raw frontmatter value, which works for YAML-quoted wikilinks (`dbench-scene: "[[Some Scene]]"`) but missed the unquoted form Obsidian's Properties panel writes by default (`dbench-scene: [[Some Scene]]`). YAML parses the unquoted form as a nested array, which the parser didn't recognize.

Highlights:

- The linker now consults Obsidian's `frontmatterLinks` cache when backfilling the ID companion. That cache holds the resolved link target regardless of how the YAML stored the value, so the backfill works for both quoted and unquoted forms. Refs #6.
- The raw-value parser stays as a defense-in-depth fallback and now also handles the nested-array form for cases where `frontmatterLinks` isn't populated.

935 unit + integration tests, all green. Desktop-only.

## 0.1.1: 2026-04-30 — context-menu refactor + retrofit fixes

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.1)

First incremental release after the 0.1.0 launch. Surfaced from real-vault migration testing on a writer's existing four-project Fiction folder.

Highlights:

- **Draft Bench submenu for context-menu actions**: all plugin entries now live under a single `Draft Bench` submenu in Obsidian's right-click menu (icon `scroll-text`), instead of cluttering the top level. Mobile fallback ships as a flat `Draft Bench:`-prefixed list since Obsidian doesn't support submenus on mobile yet. Refs #5.
- **Editor-menu support**: right-clicking inside an open editor now surfaces the same actions as right-clicking the file in the explorer. Refs #5.
- **Wikilink-only relationship edits now work**: setting a relationship wikilink (e.g., `dbench-scene: [[Some Scene]]` on a retrofitted draft) via the Properties panel previously required also hand-copying the parent's `dbench-id` into the companion field. The linker now resolves the wikilink against the candidate-parent pool and backfills the companion automatically, then proceeds with normal reverse-array reconciliation. Affects all relationship retrofits. Refs #4.
- **Folder-scope `Set as project` is folder-note-aware**: previously, right-clicking a project folder and picking `Set as project` would batch-stamp every markdown file inside (including scene siblings) as a project. The action now only appears when the folder contains an untyped markdown file matching the folder's name (case-insensitive), and stamps only that file. Other folder-scope retrofits keep their batch behavior. Refs #3.

929 unit + integration tests, all green. Desktop-only.

## 0.1.0: 2026-04-29 — first BRAT-public release

[Release on GitHub](https://github.com/banisterious/obsidian-draft-bench/releases/tag/v0.1.0)

<p align="center">
  <img src="https://draftbench.io/img/dbench-bases-projects.png"
       alt="A Draft Bench Bases view listing projects with their type, status, target word count, and other dbench- frontmatter columns."
       width="800">
</p>

Ships the full V1 feature set per the [specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md). API and data shape may still adjust between minor versions during the 0.x phase; see [VERSIONING.md](https://github.com/banisterious/obsidian-draft-bench/blob/main/VERSIONING.md).

Highlights:

- Project, chapter, scene, draft, and compile-preset note types with `dbench-` frontmatter and bidirectional linking.
- Manuscript view with chapter cards, scene rows, status chips, word-count rollups, optional subtitles, wikilink-style title affordances, and active-note-sync.
- Manuscript Builder modal with multi-section compile-preset editor.
- Compile pipeline: Markdown / ODT / PDF / DOCX output, three heading-scope modes (full / draft / chapter), per-preset content-handling rules.
- Drafts: scene drafts, chapter drafts (concatenated body + scenes with boundary markers), single-scene-project drafts.
- Templates: built-in scene + chapter templates, plugin-token substitution, Templater pass-through, multi-template discovery via `dbench-template-type` frontmatter.
- Linker + integrity service with batch repair via the `Repair project links` command.
- Retrofit actions (`Set as project / chapter / scene / draft`, complete essential properties, add identifier) with folder-based inference.
- Bases starter views, Style Settings integration, configurable status vocabulary.
- Onboarding: welcome modal, example-project generator, first-project auto-reveal.

896 unit + integration tests, all green. Desktop-only (`isDesktopOnly: true`); mobile re-evaluation is post-V1.

## 0.0.1: 2026-04-16 — scaffolding

Initial scaffolding. No user-facing features.

- Project scaffolding: configs, stubs, MIT license, build/lint/deploy pipeline.
- Coding standards document.
- Specification document.

---

For the development roadmap, see the [specification § Development Phases](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md).
