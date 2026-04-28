# Settings and Configuration

Draft Bench's settings are organized into groups in Obsidian's **Settings -> Draft Bench** panel.

---

## General

- **Default project shape**: `folder` or `single`. Applied when creating new projects; can be overridden per-project in the creation modal.
- **Default status vocabulary**: the set of status values (TBD pre-V1; likely a choice between hardcoded and user-configurable).

## Folders

Default locations where the plugin creates new notes. All support the `{project}` token.

- **`projectsFolder`**: default: `Draft Bench/{project}/`.
- **`chaptersFolder`**: default: alongside the project note (empty string). Chapter notes are created at `<project folder>/{chaptersFolder}/<title>.md`.
- **`scenesFolder`**: default: alongside the project note (empty string). Scene notes are created at `<project folder>/{scenesFolder}/<title>.md`.
- **`draftsFolder`**: default: `Drafts/` inside each project. Three placement options: inside each project, per-scene/chapter subfolder, or vault-wide.

These settings are **creation defaults only**. Moving notes later never breaks the plugin's ability to find them — discovery is frontmatter-based.

## Templates

- **Templates folder**: path to the folder containing scene and chapter templates. Default: `Draft Bench/Templates/`.
- **Scene template**: optional override path to a custom scene template file. Default: `<Templates folder>/scene-template.md` (auto-seeded on first scene creation).
- **Chapter template**: optional override path to a custom chapter template file. Default: `<Templates folder>/chapter-template.md` (auto-seeded on first chapter creation).

## Relationship Integrity

Draft Bench keeps relationships between notes consistent across renames, moves, and edits. See [Essential Properties § Rename safety](Essential-Properties).

- **`enableBidirectionalSync`**: master toggle for the live sync service. Default: on.
- **`syncOnFileModify`**: listen to live file-modify events. Default: on. Can be disabled for performance in very large vaults.
- **Repair project links**: button invoking the batch repair command. Scans the current project and reconciles any inconsistencies; use after unusual events like a mass file move or sync conflict.

## Style Settings

If the [Style Settings plugin](https://github.com/mgmeyers/obsidian-style-settings) is installed, Draft Bench exposes variables for scene and draft styling:

- **Scene leaf**: font family, font size, line height, max width, background, text color.
- **Draft leaf (archival cue)**: background, text color, left border. Defaults to a visually distinct appearance signaling "this is an archived snapshot, not the live scene."

Without Style Settings, the CSS classes (`.dbench-scene`, `.dbench-draft`) are still applied; you can style them via your theme or a CSS snippet.

## About

Version information, link to the [specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md), repair actions, debug info.

---

*Per-setting documentation and screenshots coming once V1 ships.*
