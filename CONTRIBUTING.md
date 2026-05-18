# Contributing to Draft Bench

Thank you for your interest in contributing to Draft Bench! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Security](#security)

## Code of Conduct

This project follows a code of conduct to ensure a welcoming and inclusive environment:

- Be respectful and considerate
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect differing viewpoints and experiences
- Accept responsibility for mistakes and learn from them

## Getting Started

### Prerequisites

- **Node.js 20.20.2** (pinned in [`.nvmrc`](.nvmrc); `nvm use` picks it up automatically)
- npm (ships with Node)
- Obsidian 1.7.2 or higher (matches the plugin's `minAppVersion`)
- Git
- A code editor (VS Code recommended)
- WSL2 if you're on Windows (Draft Bench's primary development environment)

### Understanding the Project

Before contributing, familiarize yourself with:

1. **Project goals and scope**: [README.md](README.md) and the canonical [specification](docs/planning/specification.md). The spec is long; treat it as reference, not a from-scratch read.
2. **Coding standards**: [docs/developer/coding-standards.md](docs/developer/coding-standards.md). Authoritative for TypeScript and CSS conventions, naming rules, frontmatter prefixes, and the `FileManager.processFrontMatter` boundary.
3. **Architecture overview**: [docs/developer/architecture.md](docs/developer/architecture.md). Module layout, data flow, key invariants.
4. **Release procedure**: [docs/developer/release-procedure.md](docs/developer/release-procedure.md). Tag-and-publish flow, version-bump checklist, scanner-behavior facts.
5. **Security policy**: [SECURITY.md](SECURITY.md). Draft Bench manages user writing content; the policy describes data handling, network behavior, and how to report vulnerabilities.

## Development Setup

1. **Fork and clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/obsidian-draft-bench.git
   cd obsidian-draft-bench
   ```

2. **Install dependencies (WSL users: see note below)**
   ```bash
   npm install --no-bin-links
   ```

   The `--no-bin-links` flag is required when the repository lives on a Windows drive accessed through WSL2's DrvFS, which doesn't support Linux-style symlinks. Without it, `npm install` fails with `EPERM` errors. Native-Linux and macOS users can use plain `npm install`. The repo's npm scripts invoke tools via direct paths (`node ./node_modules/<pkg>/bin/<entry>`) so an empty `.bin/` directory is fine.

   On install, the `postinstall` hook runs two patch scripts ([`patch-pdfmake.js`](patch-pdfmake.js) and [`patch-docx.js`](patch-docx.js)) that strip dead-code branches from vendored libraries flagged by Obsidian's community-plugin scanner. See [the scripts](patch-pdfmake.js) for what they touch and why.

3. **Build the plugin**
   ```bash
   npm run build
   ```

4. **Set up a development vault**

   See [docs/developer/dev-vault.md](docs/developer/dev-vault.md) for the recommended dev-vault setup. Brief version:

   - Create a separate Obsidian vault for development (do not develop against your real writing vault).
   - Configure [`deploy.sh`](deploy.sh) (gitignored) with your vault path, then run `./deploy.sh` to copy the build output (`main.js`, `manifest.json`, `styles.css`) into `<vault>/.obsidian/plugins/draft-bench/`.
   - For active development, [`dev-deploy.sh`](dev-deploy.sh) watches `main.js` and re-deploys on change (requires `inotify-tools`).

5. **Enable in Obsidian**

   - Open your dev vault.
   - Settings → Community plugins → enable "Draft Bench" (you may need to reload the plugin list).

## Project Structure

Source code lives under `src/`, organized by concern:

| Directory | Concern |
|---|---|
| [`src/commands/`](src/commands/) | Palette command registrations and command-ID constants |
| [`src/context-menu/`](src/context-menu/) | Right-click action wiring (file-explorer, editor, submenu) |
| [`src/core/`](src/core/) | Data model + integrity service + linker + compile pipeline + frontmatter access |
| [`src/import/`](src/import/) | Scrivener 3 project importer (wizard, RTF parser, hierarchy mapping) |
| [`src/model/`](src/model/) | Type definitions and interfaces shared across modules |
| [`src/settings/`](src/settings/) | Settings UI and persistence |
| [`src/ui/`](src/ui/) | Workspace views, modals, Manuscript Builder, Manuscript view |
| [`src/utils/`](src/utils/) | Shared utilities (ZIP adapter, formatting helpers) |

CSS lives under [`styles/`](styles/) as component files concatenated into the `styles.css` bundle at the repo root via [`build-css.js`](build-css.js).

For module-level detail, see [docs/developer/architecture.md](docs/developer/architecture.md) and the data-model section of [docs/planning/specification.md](docs/planning/specification.md).

## Development Workflow

### Daily development

1. **Start watch mode**
   ```bash
   npm run dev
   ```
   Runs esbuild in watch mode, rebuilding `main.js` on save. CSS source is concatenated once at startup; for active CSS work, re-run `npm run build:css` after editing files in `styles/`.

2. **Deploy to your dev vault**
   ```bash
   ./deploy.sh
   ```
   Or use `./dev-deploy.sh` for watch-and-deploy.

3. **Reload Obsidian** (Ctrl/Cmd + R, or use the `Reload app without saving` palette command)

4. **Iterate**: edit, save, deploy, reload.

### Branch strategy

- `main` - Stable; tagged releases come from here
- Feature work: `feature/<short-description>` or task-named (e.g., `runtime-hygiene-pass`)
- Bug fixes: `fix/<short-description>`
- Documentation: `docs/<short-description>`
- Scanner-hygiene / cleanup arcs: `scan-cleanup-v<version>` (e.g., `scan-cleanup-v0.6.2`)

The release-procedure doc covers the branch-based release flow for higher-risk changes.

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) shape:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no behavior change)
- `refactor`: Code restructuring without behavior change
- `test`: Adding or updating tests
- `chore`: Build process, tooling, or release commits

**Guidelines:**

- Use present-tense, imperative mood: "Add scene archive", not "Added scene archive" or "Adds scene archive".
- Sentence case in the description (after the colon).
- Keep the subject line under 72 characters.
- Reference issues with `Refs #N` (not `Closes #N` or `Fixes #N`). Issues are closed manually after verification.
- **Do not mention AI tools or assistants** in commit messages, PR descriptions, or any committed content. No `Co-Authored-By: Claude...` lines, no "Generated with..." footers.

**Examples:**

```
feat(scrivener-import): Add snapshot import wizard step

Implements the Snapshots step in the Scrivener importer wizard,
between Hierarchy and Options. Per-document Scrivener snapshots
become dbench-type: draft files alongside each scene, honoring the
per-scene cap and filename template.

Refs #33
```

```
fix(linker): Capture dbench-id inside processFrontMatter callback

The linker previously read the just-stamped id from the metadata
cache after the callback returned, racing the metadataCache reparse
event in real Obsidian. Pattern is now: stamp + capture id inside
the callback. Existing vaults with empty-string entries continue to
function via the wikilink fallback.

Refs #15
```

## Coding Standards

Authoritative document: [docs/developer/coding-standards.md](docs/developer/coding-standards.md). The notes below surface the most contributor-relevant points.

### TypeScript

- ESLint enforces the project rules; see [`eslint.config.mjs`](eslint.config.mjs).
- TypeScript strict mode is on. Build runs `tsc --noEmit` before bundling.
- The five `@typescript-eslint/no-unsafe-*` rules run at `error` severity. New code that bypasses the frontmatter-access helpers will fail the build.
- All `app.fileManager.processFrontMatter` callbacks route through `adaptProcessFrontMatter` (the typed frontmatter boundary at [`src/core/frontmatter-access.ts`](src/core/frontmatter-access.ts)). Don't hand-parse YAML and don't use `Vault.modify` for property edits.
- Prefer `const` over `let`; avoid `any`; use meaningful names.

### Frontmatter

- All plugin-managed frontmatter keys are namespaced with `dbench-` (e.g., `dbench-type`, `dbench-project`, `dbench-order`, `dbench-status`). Never write a plugin-managed key without the prefix; never read one without using the prefix to disambiguate from user or other-plugin properties.

### CSS

- BEM naming with `dbench-` (short) or `draft-bench-` (long) prefix; enforced by Stylelint via [`.stylelintrc.json`](.stylelintrc.json).
- Prefer Obsidian's CSS variables (`--background-primary`, `--text-normal`, etc.) for theme compatibility.
- Custom variables use `--dbench-` prefix (e.g., `--dbench-status-draft`).

**Example:**

```css
.dbench-manuscript-view {
  background: var(--background-primary);
  color: var(--text-normal);
}

.dbench-manuscript-view__scene-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
}

.dbench-manuscript-view__scene-row--archived {
  opacity: 0.55;
}
```

### TypeScript settings vs. UI display

- **Settings property names** (TypeScript): camelCase (`defaultProjectFolder`, `templatesFolder`, `hiddenStatuses`). Never sentence case or with spaces.
- **UI display text** (Obsidian setting names, button labels, headings): sentence case. `'New project'`, not `'New Project'`. `'Default project folder'`, not `'Default Project Folder'`.

### Linting

Run lint before committing:

```bash
npm run lint           # TypeScript / JavaScript
npm run lint:css       # CSS
npm run lint:fix       # Auto-fix TypeScript / JavaScript
npm run lint:css:fix   # Auto-fix CSS
npm run format:css     # Prettier over styles/
```

The `lint` and `lint:css` scripts pass cleanly on `main`. Keep them green.

### Writing style for documentation and committed content

- Minimize em-dashes. Prefer parentheses for asides, semicolons for joining related independent clauses, commas for short interjections, colons for list-key-value patterns.
- ASCII arrows (`->`) in code-shape contexts; Unicode arrows (`→`) in UI breadcrumbs and prose flow.
- Sentence case in headings.
- Backticks for code identifiers only; don't backtick ordinary technical terms.

## Testing

### Manual testing

Manual smoke tests in your dev vault before submitting a PR. A reasonable baseline:

1. **Plugin loads cleanly**: enable the plugin, confirm no errors in the developer console.
2. **Project creation**: create a fresh project; verify frontmatter, folder structure, Manuscript view.
3. **Scene / chapter / sub-scene creation**: confirm linker reconciliation works.
4. **Compile pipeline**: run a Markdown compile + at least one binary format (PDF, DOCX, or ODT) end-to-end; confirm output renders correctly in the target application.
5. **Integrity service**: run `Draft Bench: Repair project links` on a project with intentionally-broken frontmatter; verify the scan + repair flow.
6. **Theme switching**: toggle light/dark theme; confirm Manuscript view + Builder remain legible.
7. **Mobile** (if applicable): Android is supported. Verify on-device that the affected surfaces still load and operate. iOS / iPadOS is currently untested at ship time; contributors with Apple devices welcome.

For features that touch the Scrivener importer, the RTF parser, or the compile pipeline, exercise against a sample project that mirrors what real users have. The `#38` discussion thread collects sanitized test corpora.

### Automated testing

Draft Bench has a comprehensive automated test suite using [Vitest](https://vitest.dev):

```bash
npm test          # Single run (1389 tests across 78 suites at last count)
npm run test:watch  # Watch mode for active development
```

**Coverage areas:**

- **Core data model**: frontmatter access, identity stamping, reverse-array reconciliation
- **Linker**: bidirectional sync, lifecycle events, wikilink backfill, folder auto-rename
- **Integrity service**: scan kinds, repair flows, length-mismatch convergence
- **Compile pipeline**: heading scope, embed handling, footnote renumbering, section breaks, sub-scene descent
- **Scrivener importer**: hierarchy parsing, RTF-to-markdown conversion, metadata mapping, snapshot import
- **ZIP adapter** ([`src/utils/zip.ts`](src/utils/zip.ts)): DOCX and ODT round-trip
- **Manuscript view**: archive filter, status filtering, scene rendering
- **Settings**: persistence, migration, filter / file-filter helpers

**Expectations for contributions:**

- All tests pass on `main`. CI runs `npm test` on every release tag; merges should keep the suite green.
- New features should land with new tests. Add a `tests/<area>/<feature>.test.ts` file (the test directory mirrors `src/` structure).
- Bug fixes should land with a regression test that fails before the fix and passes after.
- Tests run against an in-memory mock of the relevant Obsidian APIs; they don't require a running Obsidian instance.

Run the suite before committing. If you add or modify tests, include the test files in the same commit as the implementation they cover.

## Documentation

### When to update documentation

Update documentation when:

- Adding new features (CHANGELOG + wiki + possibly README and the spec)
- Changing existing behavior (CHANGELOG + wiki if user-visible)
- Adding settings (CHANGELOG + wiki Settings page + spec data-model)
- Fixing bugs that affect user workflow (CHANGELOG entry under Fixed)
- Changing plugin architecture (architecture.md, possibly specification.md)
- Modifying the release flow (release-procedure.md)

### Where things live

- **[CHANGELOG.md](CHANGELOG.md)**: Keep-a-Changelog format. New entries go under `[Unreleased]`; the release commit moves them under the new version section.
- **[`wiki-content/`](wiki-content/)**: source for the GitHub Wiki. Files here are mirrored to the wiki repository by the maintainer on release.
- **[`docs/developer/`](docs/developer/)**: developer-facing technical docs (architecture, coding standards, release procedure, dev-vault setup, third-party libraries).
- **[`docs/planning/`](docs/planning/)**: planning docs for in-progress and shipped features. Completed plans get a `✅ Complete` status header and move to `docs/planning/archive/`.
- **[README.md](README.md)**: short-form project overview, install path, status summary.

### Documentation standards

- Use kebab-case for new file names.
- Include a table of contents for documents longer than a screen or two.
- Use descriptive headings.
- Add code examples for non-obvious behavior.
- Include screenshots for UI features (stored in [`docs/images/`](docs/images/) as PNGs; webm captures in `docs/images/raw/`).
- Use second person ("you") when addressing users.
- Avoid "we" or "our" in user-facing content.

## Submitting Changes

### Before submitting

- [ ] Code follows the conventions in [docs/developer/coding-standards.md](docs/developer/coding-standards.md)
- [ ] All linters pass: `npm run lint` + `npm run lint:css`
- [ ] Build succeeds: `npm run build`
- [ ] Test suite passes: `npm test`
- [ ] New behavior is covered by tests
- [ ] Manual smoke tests pass in your dev vault
- [ ] Documentation updated where applicable (CHANGELOG, wiki, spec)
- [ ] Commit messages follow the conventions above (no AI attribution, `Refs #N` for issue references)
- [ ] No sensitive data committed (no real project content, no API keys, no personal paths)

### Pull request process

1. **Create the pull request**

   - Use a clear, descriptive title (mirror the Conventional Commit shape if appropriate).
   - Reference the related issue with `Refs #N`.
   - Describe what changed and why.
   - Include screenshots for UI changes.
   - Call out breaking changes explicitly.

2. **PR description shape:**

   ```markdown
   ## Description
   Brief description of changes.

   ## Type of change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Related issues
   Refs #(issue number)

   ## Testing
   What was tested and how.

   ## Screenshots (if applicable)
   Add screenshots here.

   ## Checklist
   - [ ] Code follows project conventions
   - [ ] Linters pass
   - [ ] Build succeeds
   - [ ] Test suite passes
   - [ ] Documentation updated
   - [ ] Tested in dev vault
   ```

3. **Review process**

   - Address review comments promptly.
   - Keep PRs focused and small when possible; split larger changes into reviewable units.
   - Update the PR description if scope changes during review.

4. **After merge**

   - Delete your branch from the fork.
   - Update your fork's `main` branch from upstream.

## Security

### Reporting security issues

**Do not open public issues for security vulnerabilities.**

See [SECURITY.md](SECURITY.md) for the reporting procedure.

### Security considerations

Draft Bench manages user writing content: unpublished drafts of scenes, project notes, and manuscripts. This content can be personal, creative, or commercially sensitive. Treat it accordingly:

- **All data stays local.** Draft Bench makes zero network requests at runtime. No telemetry, no analytics, no cloud sync. Obsidian Sync (if the user has it enabled) handles vault syncing; Draft Bench has no knowledge of or dependency on it.
- **No external connections.** If a contribution introduces any network-adjacent code (fetch, XMLHttpRequest, WebSocket, dynamic imports from remote sources), call it out explicitly in the PR. The default answer is "no."
- **Never log user content** to the console at error level. Sanitized excerpts in debug-level logs are fine if useful for diagnosis; full scene bodies are not.
- **Be cautious with error messages**: don't echo arbitrary user content into notices or error toasts in a way that could expose sensitive prose to other surfaces (screenshots, error reports, sync logs).
- **No dynamic code execution.** The community-plugin scanner flags `new Function(...)`, `eval(...)`, and dynamic-`script`-element creation. The plugin source contains none of these; vendored dependencies are patched at install time to remove them.

### Data handling guidelines

- Read and write user content via Obsidian's vault API (`vault.read`, `vault.modify`, `vault.create`, `FileManager.processFrontMatter`).
- Don't cache user content unnecessarily. The compile pipeline and integrity scans hold transient working sets; persistent caching is reserved for properly-scoped concerns (e.g., word-count cache, which holds counts, not bodies).
- Respect vault privacy: the plugin operates entirely within the user's vault and does not surface vault contents to any external surface.

## Questions

- **General questions**: open a [GitHub Discussion](https://github.com/banisterious/obsidian-draft-bench/discussions).
- **Bug reports**: open a [GitHub Issue](https://github.com/banisterious/obsidian-draft-bench/issues) with the bug-report template.
- **Feature requests**: post in the [Ideas](https://github.com/banisterious/obsidian-draft-bench/discussions/categories/ideas) discussion category; confirmed work gets a follow-up issue when implementation starts.
- **Scrivener import questions / test corpora**: see the [Imports](https://github.com/banisterious/obsidian-draft-bench/discussions/categories/imports) discussion category.
- **Security issues**: see [SECURITY.md](SECURITY.md).

## License

By contributing to Draft Bench, you agree that your contributions will be licensed under the MIT License.

## Acknowledgments

Thank you for contributing to Draft Bench, and for helping make plain-markdown manuscript management in Obsidian better for everyone who writes.
