# Changelog

All notable changes to Draft Bench are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
