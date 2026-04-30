# Release History

Version history for Draft Bench. For the canonical changelog with full detail, see [CHANGELOG.md](https://github.com/banisterious/obsidian-draft-bench/blob/main/CHANGELOG.md).

---

## 0.1.0: 2026-04-29 — first BRAT-public release

Ships the full V1 feature set per the [specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md). API and data shape may still adjust between minor versions during the 0.x phase; see [VERSIONING.md](https://github.com/banisterious/obsidian-draft-bench/blob/main/VERSIONING.md).

Highlights:

- Project, chapter, scene, draft, and compile-preset note types with `dbench-` frontmatter and bidirectional linking.
- Manuscript view with chapter cards, scene rows, status chips, word-count rollups, optional subtitles, wikilink-style title affordances, and active-note-sync.
- Manuscript Builder modal with multi-section compile-preset editor.
- Compile pipeline: Markdown / ODT / PDF / DOCX output, three heading-scope modes (full / draft / chapter), per-preset content-handling rules.
- Drafts: scene drafts, chapter drafts (concatenated body + scenes with boundary markers), single-scene-project drafts.
- Templates: built-in scene + chapter templates, plugin-token substitution, Templater pass-through, multi-template discovery via `dbench-template-type` frontmatter.
- Linker + integrity service with batch repair via the `Repair project links` command.
- Retrofit: `Set as project / chapter / scene / draft`, complete-essential-properties, add-identifier — all with folder-based inference.
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
