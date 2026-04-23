# D-03: Parent-child relationship naming

**Status:** Accepted 2026-04-19
**Related:** [D-01](D-01-draft-modeling.md), [specification.md](../specification.md)

---

## Context

SPEC's core data model listed `dbench-parent` as a generic, type-agnostic "hierarchical parent" property alongside `dbench-project` (the project a note belongs to). [D-01](D-01-draft-modeling.md) introduced `dbench-scene` on draft notes to express "I am a draft of this scene." This created two relational patterns in the same plugin:

- `dbench-parent`: generic, type-agnostic
- `dbench-<type>`: typed, specific (established by `dbench-project`, extended by `dbench-scene`)

Before post-V1 types (`chapter`, `character`, `location`) land, the plugin needs a single consistent pattern for expressing relationships between note types — otherwise every new type risks adding a third or fourth paradigm.

## Decision

**Use typed-relationship properties exclusively: `dbench-<target-type>: <target-wikilink>`. Drop `dbench-parent` from the core data model.**

Relationships in V1 and anticipated post-V1:

| Relationship | Property | Value |
|---|---|---|
| Any note -> project | `dbench-project` | wikilink to project note |
| Draft -> scene | `dbench-scene` | wikilink to scene note |
| Scene -> chapter (post-V1) | `dbench-chapter` | wikilink to chapter note |
| Chapter -> project | `dbench-project` | wikilink to project note |

`dbench-project` stays on every note in a project for O(1) project membership, independent of the immediate typed parent.

## Rationale

- **Extends an existing pattern.** `dbench-project` was already the typed form in SPEC; this generalizes it rather than introducing a second paradigm.
- **Clearer Bases queries.** `dbench-scene is [[Tempting Waters]]` is self-documenting. The `dbench-parent` equivalent would require `dbench-parent is [[Tempting Waters]] and dbench-type is draft`: type disambiguation in every query.
- **Human-readable property names.** A writer inspecting frontmatter sees "this draft belongs to scene Tempting Waters" at a glance. Less mental indirection than a generic "parent" field.
- **O(1) project membership preserved.** Walking up a chain of parents to discover project membership would be expensive for large projects once chapters and other layers exist. `dbench-project` on every note keeps project-scoped queries cheap.

## Alternatives considered

- **Unify on `dbench-parent`** (drop `dbench-project`'s typed form, use `dbench-parent` everywhere). Rejected: loses the semantic clarity of typed property names and forces type-filtering in every Bases query. Also contradicts an already-shipped SPEC convention (`dbench-project`).
- **Keep both `dbench-parent` and typed properties.** Rejected: two ways to express the same relationship invites user inconsistency and tool ambiguity. Typed-only is easier to document and easier to validate.

## Implications for SPEC

- Remove `dbench-parent` from the core properties table in SPEC § Note Types.
- Add note: typed `dbench-<type>` properties will be added as the type registry expands post-V1.
- `dbench-project` remains mandatory on every plugin-managed note.

## Open follow-ups

- **Many-to-many relationships** (e.g., a scene references multiple characters, a character appears in multiple scenes) are not covered by this pattern. Post-V1 types like `character` may need a different mechanism (arrays of wikilinks, or backlink-driven discovery). Flag for D-??  when character/location types are specified.
