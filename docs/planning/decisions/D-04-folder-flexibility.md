# D-04: Folder flexibility: discovery is frontmatter-based

**Status:** Accepted 2026-04-19
**Related:** [specification.md § Project Structure on Disk](../specification.md), [D-01](D-01-draft-modeling.md), [D-03](D-03-parent-child-relationship-naming.md)

---

## Context

The SPEC's original Project Structure section coupled project membership to folder location: "A project is a folder. Every note inside that folder with `dbench-project` set to the project belongs to that project." This language reads as enforcement — scenes must live in the project folder to count as part of the project.

That conflicts with the frontmatter-native design principle ("The vault is the database") and with writers' legitimate desire to organize their vaults however they prefer. Some writers organize by status (`Drafted/`, `Revising/`, `Final/`); some by POV; some mix Draft Bench notes with unrelated vault content; some have idiosyncratic personal systems. A plugin that requires a specific folder structure imposes a cost on all of them.

Charted Roots solved this problem with a well-tested pattern: discovery is frontmatter-based, creation uses settings-provided defaults, and an optional folder filter lets users scope scans in mixed-purpose vaults. See [charted-roots — `src/utils/note-type-detection.ts`, `src/core/folder-filter.ts`, `docs/developer/implementation/entity-system.md`](https://github.com/banisterious/charted-roots) for the reference implementation.

## Decision

**Draft Bench identifies plugin-managed notes by frontmatter, not by folder location. Folder structure is a creation convention, not a structural enforcement.**

The plugin's read path — services that scan the vault to populate Control Center tabs, run the linker, compile projects, or repair integrity — calls `app.vault.getMarkdownFiles()` and filters by:

- `dbench-type` for the note's role (`project`, `scene`, `draft`).
- `dbench-project` (+ `dbench-project-id` companion) for project membership.
- `dbench-scene`, `dbench-chapter`, etc. for typed relationships.

Nothing in the read path checks folder paths.

**Creation defaults** are exposed via three settings:

| Setting | Default | Token support |
|---|---|---|
| `projectsFolder` | `Draft Bench/{project}/` | `{project}` |
| `scenesFolder` | `{project}/` (i.e., inside the project folder) | `{project}` |
| `draftsFolder` | `Drafts/` inside the project folder | varies by placement option |

These settings are write targets only. A scene created in the default location and later moved to `Writing/Archive/2026/` remains a scene of its original project because its frontmatter didn't change.

**`dbench-project-shape: folder`** is retained as a value but now means "creation defaults to the folder-based layout," not "scenes are enforced to live in a single folder." The value remains meaningful because it signals the plugin's creation behavior.

**Optional folder filter** is deferred to Phase 5+. Matches Charted Roots' `FolderFilterService`: off by default, lets writers with mixed-purpose vaults restrict scans to include/exclude folder lists.

## Rationale

- **Aligns with the frontmatter-native design principle.** "The vault is the database" means relationships live in properties, not paths. Folder-based membership was a design inconsistency.
- **Matches Obsidian's philosophy.** Obsidian does not dictate folder structure; plugins that do feel out of place.
- **Writer autonomy.** Writers come to Obsidian specifically for the flexibility to organize their own way. A plugin that enforces folder layout loses that appeal.
- **Sync resilience.** OneDrive, iCloud, and other sync services sometimes relocate files. Frontmatter-based discovery survives these relocations; folder-based would not.
- **Mixed-use vaults work.** Writers who keep DB projects alongside journals, research notes, or other Obsidian work don't need a dedicated vault.
- **Proven pattern.** Charted Roots runs this model in production across hundreds of users with no known scaling issues.

## Alternatives considered

- **Strict folder enforcement** (the original SPEC language). Rejected: conflicts with frontmatter-native principle; imposes a cost on organizing writers; fragile to sync relocations.
- **Folder-based membership with "escape hatch" property.** Scenes live in the project folder by default, but a writer can set a special property to override folder membership. Rejected: adds conceptual complexity; two membership mechanisms to explain; testing surface doubles.
- **Folder filter on by default.** All scans default-scoped to the configured project folders. Rejected: users with unconventional setups would hit "why doesn't my scene show up?" as a first-run failure mode. Better to ship permissive and offer filtering opt-in.

## Implications

- **Performance.** Vault-wide scans via `getMarkdownFiles()` + frontmatter filter are O(n) over the vault. For vaults with < 10,000 notes this is trivially fast; Obsidian's metadata cache means no filesystem reads. Larger vaults may benefit from the optional folder filter (Phase 5+).
- **UX consideration.** Writers who move scenes far from the project folder may later wonder "which project is this scene part of again?" Mitigations:
  - The scene's `dbench-project` frontmatter is always visible in the Properties panel.
  - Obsidian's backlinks view surfaces the project from any scene.
  - The Manuscript tab is the authoritative project-scoped view.
- **Repair service importance.** With scenes potentially anywhere, integrity repair (see § Relationship Integrity) is more important than it would be under strict folder membership. Broken wikilinks, missing reverse-array entries, and orphaned scenes are more likely when folders aren't constrained. The repair service already handles these scenarios.
- **Creation UX remains simple.** New writers who don't customize settings still get the default folder layout. Power users who want custom organization can reconfigure without the plugin breaking.

## Open follow-ups

- **Folder filter settings design.** When Phase 5+ brings the optional folder filter, the settings UI should match Charted Roots' pattern (mode: disabled / include / exclude, plus folder list). Deferred until implemented.
- **Migration path for users who reorganize.** None needed for V1: frontmatter survives any move. If the plugin later adds folder-aware features (e.g., "archive this project" moving files to a specific location), those features will need to accommodate users who have already moved notes around.
