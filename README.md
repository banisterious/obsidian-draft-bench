<p align="center">
  <img src="docs/assets/branding/draft-bench-graphite-on-ivory-1024.png" alt="Draft Bench" width="280">
</p>

**A writing workflow for Obsidian.** Manage projects, scenes, and versioned drafts in plain markdown, with flexible folder structure and native compatibility with Obsidian Bases.

Draft Bench is inspired by [Longform](https://github.com/kevboh/longform), with added emphasis on per-scene draft history as first-class files, rich metadata via frontmatter, and a compile system that requires no JavaScript knowledge.

<p align="center">
  <video controls width="800"
         src="https://draftbench.io/img/dbench-manuscript-view.webm"
         aria-label="The Manuscript view in action: a chapter card expands smoothly, a scene title opens in a new tab via Cmd-click, scene order is updated via the Reorder Scenes modal, and word counts tick live as prose is added.">
    Your browser doesn't support embedded video.
    <a href="https://draftbench.io/img/dbench-manuscript-view.webm">Watch the loop on draftbench.io</a>.
  </video>
</p>

> **Status:** 0.3.1 — current release. The full V1 feature set has shipped, plus the sub-scene note type (0.2.0), the Manuscript Builder Preview tab (0.3.0), and the dockable Manuscript Builder leaf (0.3.1). API and data shape may still adjust between minor versions during the 0.x phase. See [VERSIONING.md](VERSIONING.md), the [CHANGELOG](CHANGELOG.md), or the [Release History wiki page](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History) for full detail.

## What it is

- **Frontmatter-native.** Every project, scene, and draft is a plain markdown file with `dbench-*` properties. No index files, no parallel JSON stores. The vault *is* the database.
- **Versioned per-scene drafts.** Each "new draft" command snapshots a scene's current prose into its own file, carries the working draft forward, and lets you keep revising. Every prior draft remains a real file, openable in split panes for side-by-side comparison.
- **Flexible folder structure.** Scenes can live anywhere in your vault; the plugin identifies them by frontmatter, not folder location. Organize by status, POV, date, or any other scheme; nothing breaks.
- **Obsidian Bases compatible.** Every property is Bases-queryable out of the box. Build manuscript tables, status queues, and corkboards without custom configuration.
- **Compile without JavaScript.** A form-based Book Builder supports compile presets, scene selection, and multi-format export (Markdown, ODT, PDF, DOCX).

<p align="center">
  <img src="https://draftbench.io/img/dbench-bases-projects.png"
       alt="A starter Bases view in Draft Bench showing the projects table — title, status, scene count, target word count, and progress bar columns — populated with three example projects."
       width="800">
</p>

## Install

- **BRAT** (recommended for now): Install [BRAT](https://github.com/TfTHacker/obsidian42-brat), then add `banisterious/obsidian-draft-bench` as a beta plugin. Enable in **Settings -> Community plugins**.
- **Community Plugins** (when approved): Settings -> Community plugins -> Browse -> "Draft Bench" -> Install -> Enable. Directory submission follows after the 0.x phase stabilizes.
- **Manual**: Download `main.js`, `manifest.json`, `styles.css` from [GitHub Releases](https://github.com/banisterious/obsidian-draft-bench/releases) into `<vault>/.obsidian/plugins/draft-bench/`.

See [Getting Started](https://github.com/banisterious/obsidian-draft-bench/wiki/Getting-Started) for the first-project walkthrough.

## Documentation

User documentation lives at the [GitHub Wiki](https://github.com/banisterious/obsidian-draft-bench/wiki). Developer and design documentation is in the repo:

- [Specification](docs/planning/specification.md): plugin features and behavior.
- [UI/UX Reference](docs/planning/ui-reference.md): component patterns adapted from Charted Roots.
- [Coding Standards](docs/developer/coding-standards.md): TypeScript and CSS conventions.
- [Code Architecture](docs/developer/architecture.md): `src/` layout and layering.

## Community & Support

- [Report a bug or request a feature](https://github.com/banisterious/obsidian-draft-bench/issues)
- [GitHub Discussions](https://github.com/banisterious/obsidian-draft-bench/discussions)
- [Release notes](https://github.com/banisterious/obsidian-draft-bench/releases)

## Non-goals

Draft Bench is deliberately not an AI writing assistant, a grammar checker, a text-editor replacement, a collaboration tool, or a submission tracker. It provides structural and workflow scaffolding; the words are yours. See [the specification](docs/planning/specification.md) for the full list.

## License

[MIT](LICENSE.md).
