# D-02: Ordering and filesystem sort

**Status:** Accepted 2026-04-19
**Related:** [D-01](D-01-draft-modeling.md), [specification.md](../specification.md)

---

## Context

Writers working in plain-markdown Obsidian projects commonly use numeric filename prefixes (`01 Tempting Waters/`, `02 The Match Sang/`) to make filesystem sort equal to story order. This gives them an at-a-glance sense of sequence in the file explorer without any plugin. Reordering requires manual folder renames.

D-01 established scene-as-note with `dbench-order` in frontmatter. That decision needs a companion policy on what owns story order and whether the plugin should try to keep filesystem sort in sync.

## Decision

**`dbench-order` on the scene note is the sole source of truth for story order. Files are never renamed on reorder. The Manuscript tab is the canonical ordered view.**

- Reorder via UI (drag in Manuscript tab, or explicit "move up / move down" command) updates `dbench-order` on affected scenes. No file or folder renames occur.
- Filenames contain scene titles, not order prefixes. A scene titled "Tempting Waters" is `Tempting Waters.md`.
- File-explorer alphabetical sort no longer reflects story order.

## Rationale

- **Renames cascade.** Renaming a folder or file breaks markdown links and external URIs, invalidates Bases filters on `file.path`, pollutes git history, and forces sync permission re-prompts on multi-device vaults. Obsidian updates wikilinks automatically, but not all reference types.
- **`dbench-order` is frontmatter-native.** Bases, Dataview, and any property reader get correct story order for free. This matches SPEC's core design principle (the vault is the database).
- **Reorder becomes cheap.** Swapping `dbench-order: 2` and `dbench-order: 3` on two scenes is one `processFrontMatter` call per scene: faster and safer than two folder renames.

## UX consideration (open)

**File-explorer alphabetical sort will not match story order. This breaks the mental model many writers have built around plain-markdown Obsidian workflows.** Mitigations to plan for:

1. **Onboarding must set this expectation.** The welcome modal should explicitly direct users to the Manuscript tab as the canonical ordered view and explain why story order lives in frontmatter rather than filenames.
2. **Optional post-V1 setting — maintain numeric filename prefixes.** A writer who specifically wants filesystem-sort = story-order could opt in. Plugin would rename files on reorder. Trades renames-are-cheap against a stronger mental model. Not MVP; revisit if demand materializes.
3. **Recommend a community sort plugin.** Several community plugins allow custom file-explorer sort based on frontmatter. Documenting one that reads `dbench-order` gives writers story order in the file explorer without plugin-owned renames.

## Alternatives considered

- **Plugin renames files on reorder.** Rejected for MVP: rename cascade is expensive and fragile. Revisit as opt-in setting post-V1 if users ask.
- **Zero-width or invisible-character sort key in filenames.** Rejected: ugly, hard to explain, brittle, and surfaces oddly in many contexts (search results, URL encoding, external tools).
- **Plugin maintains an index file listing scenes in order.** Rejected: violates SPEC's frontmatter-native principle ("no index file, no parallel data store").

## Implications

- Onboarding copy needs to cover the filesystem-sort-is-not-story-order expectation.
- Settings surface for "maintain numeric prefixes" stays off the MVP list but should be considered in the settings schema so it can be added without migration later.
