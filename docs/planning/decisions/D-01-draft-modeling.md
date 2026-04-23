# D-01: Draft modeling: scene-as-note, drafts-as-archived-files

**Status:** Accepted 2026-04-19
**Related:** [specification.md](../specification.md), [D-03](D-03-parent-child-relationship-naming.md)

---

## Context

Walking through UC-01 (short-story writer drafting *Too Good to Pass Up*) surfaced a fork that SPEC did not resolve: is a scene a single note, a folder containing drafts, or something else? The writer's original vault pattern was folder-per-scene with draft files inside, but this imposed a two-files-per-scene minimum even on simple cases and provided no stable home for per-scene metadata (ordering, status, synopsis, planning sections).

The decision affects the shape of every command that creates or modifies scene content, so it had to be resolved before SPEC-level data-model edits or implementation.

## Decision

**Scene = a single top-level note inside the project folder. Draft = a timestamped snapshot file in a configurable `Drafts/` subfolder.**

V1 type vocabulary: `project`, `scene`, `draft`.

**Frontmatter:**

- Scene: `dbench-type: scene`, `dbench-project`, `dbench-order`, `dbench-status`, plus (eventual) `dbench-synopsis`.
- Draft: `dbench-type: draft`, `dbench-project`, `dbench-scene` (wikilink to parent scene), `dbench-draft-number`.

**Behavior:**

- The scene note's body holds the current working draft, with planning sections above the prose.
- "New draft of this scene" command snapshots the scene's current body into `<drafts-folder>/<Scene> - Draft N (YYYYMMDD).md`, then carries the scene note's prose forward as the new working draft.
- Draft numbers are plugin-managed. `N` is inferred from existing drafts for that scene.
- Drafts folder is configurable (default: `Drafts` inside the project folder). Settings offer project-local, per-scene, and vault-wide folder placement.

## Rationale

- **Minimal case is dead simple.** One scene = one note. A writer who never revises never sees a Drafts folder.
- **Emergent complexity.** The Drafts folder appears on first "new draft" invocation, not on scene creation. Users don't pay the structural tax until they need it.
- **Preserves Obsidian's file-based strengths.** Prior drafts are real files: openable in split panes, linkable with wikilinks, queryable via Bases, versioned by Git. A Scrivener-style invisible snapshot model would discard this.
- **Planning lives with stable identity.** Template-provided planning sections stay on the scene note and are not duplicated into every draft snapshot.
- **Scene metadata is single-sourced.** Order, status, project membership live on the scene note once, not on each draft.

## Alternatives considered

- **Folder-per-scene with a scene-index note + draft files inside** (the writer's original pattern, formalized). Rejected: every scene requires at least two files, imposing a structural tax on single-draft cases and doubling the project's file count.
- **Draft-as-section within one scene file** (each draft is a `## Draft N` heading). Rejected: defeats side-by-side comparison across drafts, makes per-draft metadata awkward, produces unwieldy notes.
- **Scrivener-style invisible snapshots** (plugin-managed, not surfaced as files). Rejected: discards Obsidian's file-based strengths.

## Open follow-ups

- **Unsaved buffer at snapshot time.** When "new draft" is invoked with an unsaved editor buffer, plugin must flush first. Implementation detail.
- **Name collisions.** If two scenes share a title (rare but possible across a long career), draft filenames collide. Mitigation: detect and append a short random suffix. Edge case, not MVP-blocking.
- **Dirty scene, clean new draft?** When "new draft" fires, does the new working draft start blank or carry the prose forward? Decided: carry forward. Writers typically revise, not restart.
