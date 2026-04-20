# Changelog

All notable changes to Draft Bench are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning Policy

SemVer's general rules (MAJOR.MINOR.PATCH) apply, but a writing plugin's "public API" includes more than just code interfaces: the `dbench-*` frontmatter schema, command IDs, settings keys, drafts folder layout, and on-disk data shape are all things users build workflows around. This section spells out what each digit means in that context.

### During 0.x.x (current phase)

- API and data-shape can change between minor versions.
- BRAT users should expect breaking changes and may need small migrations.
- `0.MINOR.0` lands new features (`0.1.0` first BRAT release, `0.2.0` adds the Control Center, etc.).
- `0.0.PATCH` is fixes only, no new features.
- The 0.x phase signals "we're iterating; not a stability guarantee."

### When 1.0.0 ships

Two criteria, both about the code itself:

1. V1 features per [specification](docs/planning/specification.md) are all implemented.
2. The plugin has been used in real writer workflows (BRAT testers, our own dev-vault use) long enough to surface and fix the rough edges — weeks to months after feature-completeness, not the same day.

### After 1.0.0

- **MAJOR** (1.x -> 2.0): breaking changes to `dbench-*` property names, the ID format, drafts folder layout, or any user-vault-modifying behavior change. Triggers a migration story in release notes.
- **MINOR** (1.0 -> 1.1): new features (Phase 2 templates and word counts; Phase 3 compile; Phase 5+ chapter type). Backward-compatible.
- **PATCH** (1.0.0 -> 1.0.1): bug fixes, performance improvements, docs, tests, and dependency bumps that don't surface to users.

### What does *not* count as breaking

- Adding new optional `dbench-*` properties.
- Adding new commands, context-menu items, or settings (with sensible defaults).
- UI changes that don't alter data on disk.
- Dependency or build-tool changes invisible to users.

### Community Plugins submission is independent of versioning

We submit to Obsidian's Community Plugins directory when we feel Draft Bench is ready for general distribution. That submission may take weeks or months to be reviewed (the queue is long; an in-progress redesign of Obsidian's "Community directory" may shorten that in future). BRAT users get every release as it's tagged on GitHub, including 1.0, regardless of submission status. When Community Plugins approval lands, the listed plugin will be on whatever current version exists at the time — could be 1.0.0, could be 1.2.4 if we've shipped fixes during the queue wait.

By convention, plugin authors usually submit when they'd consider their work production-ready (at or just before 1.0). We follow the same convention without making it a hard rule.

### `manifest.json` and `versions.json`

Obsidian uses two files to track plugin versions:

- `manifest.json` carries the current version and plugin metadata.
- `versions.json` maps each plugin version to its required Obsidian `minAppVersion` (e.g., "Draft Bench 1.2.0 needs Obsidian >= 1.7.2").

Both files are kept in sync by `npm version X.Y.Z --no-git-tag-version` (which invokes [version-bump.mjs](version-bump.mjs)). Bump `minAppVersion` in `manifest.json` first if a release requires a newer Obsidian; the version-bump script preserves whatever's there.

## [Unreleased]

### Added

- V1 design complete: data model, bidirectional linking, folder flexibility, retrofit actions, styling, keyboard accessibility.
- Planning documents: [specification](docs/planning/specification.md), [UI/UX reference](docs/planning/ui-reference.md), [code architecture](docs/developer/architecture.md).
- Wiki skeleton in [wiki-content/](wiki-content/) with tier-1 content (Home, Getting Started, Essential Properties) and tier-2 stubs.
- GitHub issue templates (bug report, feature request) and `config.yml`.
- `SECURITY.md` for Community Plugins submission readiness.
- Vitest harness with Obsidian mock at [tests/mocks/obsidian.ts](tests/mocks/obsidian.ts).
- CSS build system: `build-css.js` concatenates `styles/*.css` component files into `styles.css` at the project root. Component files seeded: `styles/variables.css` (CSS custom properties for spacing, radius, transitions, scene/draft-leaf styling), `styles/base.css` (utilities, keyframes).
- Phase 1 progress (in flight):
  - `src/core/id.ts` ([5d170a2](https://github.com/banisterious/obsidian-draft-bench/commit/5d170a2)): `generateDbenchId()` and `isValidDbenchId()` for the `abc-123-def-456` ID format. 16 unit tests.
  - `src/core/essentials.ts` ([22610b6](https://github.com/banisterious/obsidian-draft-bench/commit/22610b6)): `stampProjectEssentials`, `stampSceneEssentials`, `stampDraftEssentials`, `stampDbenchId` helpers. Idempotent stamping that backs both Create commands and retrofit context-menu actions. 26 unit tests.

### Changed

- Frontmatter and CSS short-prefix finalized as `dbench-` (from an earlier `db-` that was ambiguous with "database").
- Planning specification renamed from `SPEC.md` to `specification.md` (kebab-case convention).

## [0.0.1] - 2026-04-16

### Added

- Initial project scaffolding (configs, stubs, MIT license).
- Coding standards document.
- Build, lint, and deploy pipeline verified end-to-end.
- Plugin renamed from "Drafting Table" to "Draft Bench."
