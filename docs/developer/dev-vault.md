# Dev vault

**Purpose:** a local test vault at `dev-vault/` (gitignored) with dummy projects covering the V1 feature surface. Use it for manual testing during implementation without touching your real writing vault.

**Why gitignored:** the vault accumulates test state (new drafts, reordered scenes, retrofitted notes) during development. We don't want that churn in commits. Recreate the seed content locally from the structure below.

## Seed structure

```
dev-vault/
├── .obsidian/                                (auto-created on first open)
│   └── plugins/
│       └── draft-bench/                      (symlink or deploy target)
├── Demo Novel/                               (folder project, multi-scene)
│   ├── Demo Novel.md                         dbench-type: project
│   ├── Chapter 1 - The arrival.md            dbench-type: scene, dbench-order: 1
│   ├── Chapter 2 - Old habits.md             dbench-type: scene, dbench-order: 2
│   ├── Chapter 3 - The choice.md             dbench-type: scene, dbench-order: 3, dbench-status: idea
│   └── Drafts/
│       ├── Chapter 1 - The arrival - Draft 1 (20260115).md
│       ├── Chapter 1 - The arrival - Draft 2 (20260128).md
│       └── Chapter 2 - Old habits - Draft 1 (20260120).md
├── Demo Short Story/                         (folder project, minimal)
│   ├── Demo Short Story.md                   dbench-type: project
│   ├── The meeting.md                        dbench-type: scene
│   └── Drafts/
│       └── The meeting - Draft 1 (20260301).md
├── A Small Thing.md                          dbench-project-shape: single
└── Retrofit Candidate.md                     (untyped note, useful for testing "Set as..." actions)
```

## Sample frontmatter

Use clearly-fake IDs so test data can't be mistaken for real project IDs. Pattern: `dem-<project>-tst-<n>`.

**Demo Novel.md:**

```yaml
---
dbench-type: project
dbench-id: dem-nov-tst-000
dbench-project: "[[Demo Novel]]"
dbench-project-id: dem-nov-tst-000
dbench-project-shape: folder
dbench-status: draft
dbench-scenes: ["[[Chapter 1 - The arrival]]", "[[Chapter 2 - Old habits]]", "[[Chapter 3 - The choice]]"]
dbench-scene-ids: [dem-nov-tst-001, dem-nov-tst-002, dem-nov-tst-003]
---
```

**Chapter 1 - The arrival.md** (with two prior drafts):

```yaml
---
dbench-type: scene
dbench-id: dem-nov-tst-001
dbench-project: "[[Demo Novel]]"
dbench-project-id: dem-nov-tst-000
dbench-order: 1
dbench-status: revision
dbench-drafts: ["[[Chapter 1 - The arrival - Draft 1 (20260115)]]", "[[Chapter 1 - The arrival - Draft 2 (20260128)]]"]
dbench-draft-ids: [dem-nov-tst-101, dem-nov-tst-102]
---

## Source passages

## Beat outline

## Open questions

## Draft

Lorem ipsum dolor sit amet, consectetur adipiscing elit...
```

**A Small Thing.md** (single-scene project):

```yaml
---
dbench-type: project
dbench-id: dem-fla-tst-000
dbench-project: "[[A Small Thing]]"
dbench-project-id: dem-fla-tst-000
dbench-project-shape: single
dbench-status: draft
---

A single flash-fiction piece. Body is the whole story.

Lorem ipsum dolor sit amet...
```

**Retrofit Candidate.md** (no `dbench-*` frontmatter at all — useful for exercising the "Set as..." retrofit flow):

```yaml
---
title: A pre-existing note
created: 2025-12-01
tags: [fiction, draft]
---

This note predates Draft Bench. Right-click -> Draft Bench -> Set as scene (or project, or draft) should type it without clobbering the existing fields.
```

## Using it

1. Create `dev-vault/` at the project root.
2. Populate with the structure above (frontmatter templates included).
3. Run `./dev-deploy.sh` (or manually copy the built plugin) into `dev-vault/.obsidian/plugins/draft-bench/`.
4. Open `dev-vault/` as a vault in Obsidian; enable Draft Bench.

The deploy scripts (`deploy.sh`, `dev-deploy.sh`) are gitignored and personal; if you want `dev-vault/` wired in, add it as a target there.

## Coverage goals

The seed covers:

- **Folder projects** of two sizes (3 scenes, 1 scene).
- **Single-scene project** (flash fiction).
- **Prior drafts** for testing split-pane review and integrity scans.
- **Different statuses** (`draft`, `revision`, `idea`).
- **A retrofit candidate** with non-Draft Bench frontmatter for "Set as..." testing.

What's intentionally *not* seeded:

- **Broken integrity** (stale reverse arrays, missing ID companions). Build these manually when testing the repair service.
- **Chapter groupings.** Chapters are post-V1.
- **Large scale.** For performance testing against thousands of scenes, use a separate generated vault.
