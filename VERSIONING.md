# Versioning Policy

Draft Bench follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (MAJOR.MINOR.PATCH). SemVer's general rules apply, but a writing plugin's "public API" includes more than just code interfaces: the `dbench-*` frontmatter schema, command IDs, settings keys, drafts folder layout, and on-disk data shape are all things users build workflows around. This document spells out what each digit means in that context.

For the actual changelog of what shipped in each version, see [CHANGELOG.md](CHANGELOG.md).

## During 0.x.x (current phase)

- API and data-shape can change between minor versions.
- BRAT users should expect breaking changes and may need small migrations.
- `0.MINOR.0` lands new features (`0.1.0` first BRAT release, `0.2.0` adds the Control Center, etc.).
- `0.0.PATCH` is fixes only, no new features.
- The 0.x phase signals "we're iterating; not a stability guarantee."

## When 1.0.0 ships

Two criteria, both about the code itself:

1. V1 features per [specification](docs/planning/specification.md) are all implemented.
2. The plugin has been used in real writer workflows (BRAT testers, our own dev-vault use) long enough to surface and fix the rough edges. Realistically, weeks to months after feature-completeness, not the same day.

## After 1.0.0

- **MAJOR** (1.x -> 2.0): breaking changes to `dbench-*` property names, the ID format, drafts folder layout, or any user-vault-modifying behavior change. Triggers a migration story in release notes.
- **MINOR** (1.0 -> 1.1): new features (Phase 2 templates and word counts; Phase 3 compile; Phase 5+ chapter type). Backward-compatible.
- **PATCH** (1.0.0 -> 1.0.1): bug fixes, performance improvements, docs, tests, and dependency bumps that don't surface to users.

## What does *not* count as breaking

- Adding new optional `dbench-*` properties.
- Adding new commands, context-menu items, or settings (with sensible defaults).
- UI changes that don't alter data on disk.
- Dependency or build-tool changes invisible to users.

## Community Plugins submission is independent of versioning

We submit to Obsidian's Community Plugins directory when Draft Bench feels ready for general distribution. That submission may take weeks or months to be reviewed (the queue is long; an in-progress redesign of Obsidian's "Community directory" may shorten that in future).

BRAT users get every release as it's tagged on GitHub, including 1.0, regardless of submission status. When Community Plugins approval lands, the listed plugin will be on whatever current version exists at the time — could be 1.0.0, could be 1.2.4 if we've shipped fixes during the queue wait.

By convention, plugin authors usually submit when they'd consider their work production-ready (at or just before 1.0). We follow the same convention without making it a hard rule.

## `manifest.json` and `versions.json`

Obsidian uses two files to track plugin versions:

- `manifest.json` carries the current version and plugin metadata.
- `versions.json` maps each plugin version to its required Obsidian `minAppVersion` (e.g., "Draft Bench 1.2.0 needs Obsidian >= 1.7.2").

Both files are kept in sync by `npm version X.Y.Z --no-git-tag-version` (which invokes [version-bump.mjs](version-bump.mjs)). Bump `minAppVersion` in `manifest.json` first if a release requires a newer Obsidian; the version-bump script preserves whatever's there.
