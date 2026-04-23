# D-05: Property retrofit actions

**Status:** Accepted 2026-04-19
**Related:** [specification.md § Applying Draft Bench properties to existing notes](../specification.md), [D-01](D-01-draft-modeling.md), [D-04](D-04-folder-flexibility.md)

---

## Context

Writers installing Draft Bench frequently have pre-existing notes they'd like to bring under plugin management: project notes drafted in plain markdown, scenes migrated from Longform, draft files created with a custom naming scheme, empty notes created ahead of a writing session with the intent of typing them later. Without a retrofit mechanism, these writers would have to recreate every note from scratch to get plugin properties stamped, losing body content, wikilinks, and backlinks in the process.

Charted Roots solves the equivalent problem with "Add essential properties" and "Add cr_id" context-menu actions. The pattern is well-tested and maps cleanly to Draft Bench's needs, with one plugin-specific complication: Draft Bench's relationship fields (`dbench-project`, `dbench-scene`) are wikilinks to *other specific notes*, not standalone strings or self-contained values. The action has to handle "stamp all essentials but I don't know which project the writer meant" gracefully.

See [charted-roots — `src/plugin/context-menu-helpers.ts`, `wiki-content/Essential-Properties.md`](https://github.com/banisterious/charted-roots) for the reference implementation.

## Decision

**V1 ships Charted-Roots-equivalent context-menu retrofit actions, with empty-placeholder wikilinks for unresolvable targets. A picker modal for target resolution is deferred to Phase 2.**

### Action inventory

Three typed helpers plus one standalone ID helper:

- **Set as project**: stamps project essentials on an untyped note.
- **Set as scene**: stamps scene essentials.
- **Set as draft**: stamps draft essentials.
- **Complete essential properties**: fills in missing fields on a note that already has `dbench-type`.
- **Add dbench-id**: standalone ID stamp, for notes that have `dbench-type` but lack an identifier.

Named "Set as X" (vs. CR's "Add essential X properties") because the action sets the `dbench-type` discriminator in addition to other essentials; from the writer's mental model, the note *becomes* a project/scene/draft.

### Behavior

- **Idempotent.** `if (!frontmatter.xxx) frontmatter.xxx = default` for every field. Running an action twice is identical to running it once.
- **Never overwrites.** Existing values are preserved unconditionally.
- **Empty placeholder for unresolvable wikilinks.** A scene's `dbench-project` is stamped as `''`: the writer fills it in later via the Properties panel or, post-Phase-2, via a picker modal.
- **Filename defaults.** Where a natural default exists (project self-links, scene titles), the action uses `file.basename`.
- **Empty string / empty array, not omit.** Missing fields are added as `''` or `[]`, not left out. Lets the Properties panel display them, invites the user to fill in, and simplifies reader code that would otherwise need "missing or empty" checks.

### Smart menu visibility

The context menu pre-scans the target(s) and only shows actions that would actually do something. A fully-stamped note shows no Draft Bench retrofit menu items; a note missing only `dbench-id` shows only "Add dbench-id."

### Scopes in V1

All three: single-file, multi-file, folder (recursive). The single-file helper does the real work; multi/folder simply iterate with aggregate notices.

### ID format

Matches Charted Roots' `abc-123-def-456` format — three lowercase letters, three digits, three lowercase letters, three digits. Rationale:

- Cross-plugin consistency for writers using both DB and CR.
- Visually legible in frontmatter (ULIDs are denser).
- Line-of-sight stable (not time-encoded; rearranging notes doesn't reshape IDs).
- Collision-resistant at realistic vault sizes (~11 bits × 6 segments = 66 bits of entropy after fixed structure; more than adequate for thousands of notes).

## Rationale

- **Onboarding friction.** Writers with existing content are the most likely new-user segment (UC-01 is literally this pattern). Requiring them to recreate notes to onboard is a non-starter.
- **Matches Obsidian culture.** Writers expect plugins to meet them where they are, not require data migration.
- **Idempotent-by-design is cheap.** The `if (!frontmatter.xxx)` pattern adds no complexity; the action can run on any note in any state without harm.
- **Proven pattern.** Charted Roots runs this model across hundreds of users with no known issues.
- **Pairs with D-04 folder flexibility.** The retrofit action is folder-agnostic: it works on a note regardless of where the note lives. Writers can adopt the plugin gradually, typing notes as they work on them, rather than reorganizing a vault.

## Alternatives considered

- **Require new-project-from-existing-folder migration tool.** Rejected: heavier to build, more friction for writers, and doesn't help writers who want to type individual notes (e.g., a single orphan scene).
- **Auto-apply properties on plugin install.** Rejected: aggressive and opaque; writers wouldn't understand what changed. Opt-in context action is the Obsidian norm.
- **Prompt-based modal for wikilink targets.** The action could open a modal asking "which project does this scene belong to?" every time. Rejected for V1: adds non-trivial UI state (vault-wide project discovery, picker widget, possibly fuzzy-match search). Empty-placeholder V1 lets writers work with Obsidian's Properties panel, which they already know; Phase 2 adds the picker as a polish.
- **ULID or UUID.** Rejected: less readable in frontmatter, breaks cross-plugin consistency with CR.

## Open follow-ups

- **Phase 2 picker modal.** "Add this scene to project…" context-menu action and/or modal invoked on empty `dbench-project` values. Lists all `dbench-type: project` notes in the vault, lets the writer select one, stamps the wikilink and ID companion. Natural pairing with the V1 retrofit flow.
- **Project-shape picker for Set as project.** The V1 action currently defaults `dbench-project-shape: folder`. Should it prompt `folder / single`? Probably, since the two shapes behave differently. Implementation detail; defer to when the action is built.

## Resolved during implementation

- **`dbench-project` / `dbench-project-id` inference for Set as scene and Set as draft (2026-04-20).** Implemented: when the scene's immediate parent folder — or a draft's ancestor folder — contains exactly one `dbench-type: project` note, the retrofit populates the project refs from it. Fails safe to empty placeholders on ambiguity. Complete essentials reuses the same inference to upgrade previously-empty refs.
- **`dbench-order` heuristic for Set as scene (2026-04-20).** Implemented as part of the project-inference work above: when the project is known, `dbench-order` is set to `max(existing scene orders) + 1`. Falls back to `9999` when no project can be resolved.
- **`dbench-draft-number` heuristic for Set as draft (2026-04-20).** Implemented the filename-parse option: match `Draft N` in the basename, fall back to `1`. The alternative ("max existing + 1 within a drafts folder") wasn't pursued — the filename case covers the plugin's own naming convention and is more predictable for writers.
