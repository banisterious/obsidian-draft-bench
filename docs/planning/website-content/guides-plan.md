# Draft Bench guides plan

**Status:** Drafted 2026-05-10. No guides shipped yet; site `/guides/` section not yet created on draftbench.io. P0 batch is the launch target.

**Scope.** Master plan + authoring contract for a `/guides/` surface on draftbench.io. Lists every planned guide with tier and slug, captures the authoring rules + recipe template + port workflow, and tracks status as guides ship. Lifted from the [guides-authoring-reference.md](../guides-authoring-reference.md) Charted Roots pattern; adapted for Draft Bench's single-audience scope.

**Companion docs:**

- [guides-authoring-reference.md](../guides-authoring-reference.md): the source pattern (CR's `/guides/` architecture). This file copies its skeleton verbatim where applicable; differences are flagged inline.
- [port-workflow.md](port-workflow.md): broader website-content drafts conventions (voice, two-repo split, handoff-prompt pattern). Guides authoring extends those conventions; doesn't replace them.
- [website-strategy-reference.md](../website-strategy-reference.md): Hugo + Blowfish stack, deploy lessons, link-check CI.

---

## 1. Why this surface exists

The wiki and the FAQ each serve a specific reader shape:

- **Wiki** answers "what does feature X do?" — feature-by-feature reference. Comprehensive but not workflow-oriented; a writer wanting to bring a Scrivener project across has to assemble the answer from the importer page, the project structure page, and the compile page.
- **FAQ** answers qualifying-prospect questions — "is this for me?", "how does it compare to Longform?", "is it free?". Pre-install audience.

Neither answers "I want to do X" workflow questions for users who've installed the plugin and need to accomplish a concrete task. That gap is what `/guides/` fills: tight recipes (3-10 minutes each) that walk a writer from goal to done.

The launch trigger was the 2026-05-10 community-plugin announcement (PR #12704 filed, Discord post live). Early users are arriving directly into the most workflow-heavy entry point Draft Bench has — the Scrivener importer — and the wiki's reference shape doesn't quite serve them at that moment.

---

## 2. URL structure

Draft Bench is single-audience (fiction writers managing project structure + manuscript compilation), so the CR two-track split (research / worldbuilding) doesn't apply. One cohesive `/guides/` section:

```
/guides/                  -> landing index (start-here + full catalog)
/guides/<slug>/           -> individual recipe
```

No track subdirectory; the `track` frontmatter field from the CR recipe template is omitted.

**Cross-references between guides** use slug-based relative URLs:

```markdown
[I want to compile my manuscript](compile-your-manuscript)
```

**Cross-references into the wiki** use absolute URLs:

```markdown
[Wiki: Frontmatter reference](https://github.com/banisterious/obsidian-draft-bench/wiki/Frontmatter-Reference)
```

The slug-based intra-guide pattern keeps drafts portable between the plugin-repo draft folder and the live Hugo site without rewriting URLs.

---

## 3. Recipe template

Every guide follows the same skeleton. The `## Notes for review` block at the bottom is **stripped during port** to Hugo; it's authoring-side only.

````markdown
---
title: "I want to <goal>"
description: <one-line summary>
difficulty: easy | medium | advanced
time_estimate: ~5 min | ~10-15 min | ~30+ min
last_reviewed: 2026-MM-DD
relevant_releases: 0.5.x
---

# <Guide title — restates the H1 from `title`>

<One-paragraph framing: who this is for, what success looks like, what the
endpoint of the workflow is. 2-3 sentences.>

## What you'll need

- <Prerequisite>
- <Setting that needs to be enabled>
- <Optional but recommended>

## Steps

### 1. <First major step>

<Procedure. Use bold for clickable elements ("**Settings -> ...**"). Use
code blocks for frontmatter or commands. Inline screenshots only where
they're load-bearing.>

### 2. <...>
### 3. <Final step / verification>

## Variations

- **If <variant>**: <adaptation>

## Related guides

- [Other guide](slug)

## Reference

- Wiki: [<page>](https://github.com/banisterious/obsidian-draft-bench/wiki/<page>)

---

*Found something wrong or unclear? [Suggest an edit][issue-link] — opens a pre-filled issue with the `guides` label.*

[issue-link]: https://github.com/banisterious/obsidian-draft-bench/issues/new?labels=guides&title=%5BGuides%5D+<slug>%3A+

---

## Notes for review

- Length: ~XXX words.
- <Decisions made during drafting that future-you might second-guess.>
- <Why a screenshot is or isn't included.>
- <Edit-pass rationale if applied later.>
````

---

## 4. Authoring rules

These rules are a tight subset of the reference doc § 5; the full list there carries forward unless noted.

- **Length cap: 1000 words.** Anything longer is two guides, or it's a wiki page in disguise. Word count includes the body; not the frontmatter or notes-for-review block.
- **Screenshots only where load-bearing.** Text-heavy guides age better than screenshot-heavy ones. Use a screenshot when a visual orientation point is genuinely needed (e.g., "the modal looks like this") rather than when prose would describe the procedure adequately. The plugin already has 12 stills in `docs/images/` from the 0.5.0 ship; reuse those before capturing new ones.
- **No marketing voice.** Em-dash budget 0-1 per paragraph; no adjective triads; no end-of-paragraph wrap-up sentences ("Together these..."); no marketing adjectives ("seamless," "comprehensive," "robust," "elevate," "professional-grade"). ASCII arrows (`->`) not Unicode arrows.
- **Speak in the second person.** "You'll see..." rather than "The user will see..."
- **Fictional fixture data only.** Reuse recurring example projects across guides; per the project's [no-real-personal-writing-names rule](../../../CLAUDE.md), never use actual project / scene titles from the maintainer's own writing. Suggested fixture lineup: a novel-template project named **"Salt Road"** (long-form fiction); a short-fiction project named **"Meridian Drift"** (single-scene); a writer named **"Iris Park."** Continuity helps readers recognize the same data across guides.
- **Difficulty + time-estimate together.** Difficulty = prerequisite knowledge (easy = no prior plugin experience; medium = comfortable with one major area; advanced = touches multiple subsystems). Time-estimate = commitment.
- **Write i18n-friendly.** Avoid idioms, keep sentences short, define jargon on first use.

---

## 5. Index page shape

The `/guides/` landing page on draftbench.io has two sections (no track header — single audience):

1. **Start here** at the top — the P0 picks, one sentence per guide sourced from the guide's `description` frontmatter (no extra authoring).
2. **Full catalog** below — every shipped guide with title + one-line description, listed thematically (entry-points → core workflows → edge cases).

The start-here block IS the P0 list from this plan; no extra curation needed.

---

## 6. Guide enumeration

Status legend: P0/P1/P2 = drafted-and-shipping priority tier; ✅ = shipped; ✏️ = drafted, awaiting port.

### Entry points

| Tier | Title | Slug | Status |
|---|---|---|---|
| P0 | I want to import a Scrivener project | `import-from-scrivener` | P0 |
| P0 | I want to start a writing project from scratch | `start-a-writing-project` | P0 |
| P1 | I want to migrate from Longform | `migrate-from-longform` | P1 |
| P1 | I want to start a short-fiction project | `start-a-short-fiction-project` | P1 |

### Core workflows

| Tier | Title | Slug | Status |
|---|---|---|---|
| P0 | I want to compile my manuscript | `compile-your-manuscript` | P0 |
| P0 | I want to work with drafts of a scene | `work-with-drafts` | P0 |
| P0 | I want to view my project in a Bases table | `view-project-in-bases` | P0 |
| P1 | I want to set up multiple compile presets | `multi-preset-compile` | P1 |
| P1 | I want to work with sub-scenes | `work-with-sub-scenes` | P1 |
| P1 | I want to keep drafts of a chapter | `chapter-drafts` | P1 |

### Edge cases / recovery

| Tier | Title | Slug | Status |
|---|---|---|---|
| P1 | I want to recover after a vault cleanup broke my project | `recover-from-integrity-drift` | P1 |
| P2 | I want to build a custom Base for Draft Bench notes | `custom-base-for-draft-bench` | P2 |
| P2 | I want to write on Android | `writing-on-android` | P2 |

### Tier definitions

- **P0** — first-week workflows. 80%+ of new users hit these. Ship as the section's launch batch.
- **P1** — fills out the catalog. Migration paths, second-week features, alternative entry points. Ship as a second batch shortly after P0.
- **P2** — opportunistic. Specialized methodology, niche workflows. Ship in batches driven by user-research evidence (issue reports, Discord questions, GA scroll data).

---

## 7. Phased rollout

**Phase 1 (P0 launch).** Five guides ship as the section's launch batch:

1. `import-from-scrivener` (medium / ~30+ min)
2. `start-a-writing-project` (easy / ~15 min)
3. `compile-your-manuscript` (easy / ~15 min)
4. `work-with-drafts` (easy / ~5-10 min)
5. `view-project-in-bases` (medium / ~10 min)

Target: ship the P0 batch within 2 weeks of this plan landing. The Scrivener importer guide is the highest-traffic candidate given the 2026-05-10 announcement; prioritize it as the first draft + port.

**Phase 2 (P1 fill-out).** Six guides at P1 above. Ship as a second batch shortly after Phase 1, ideally within 4 weeks. P1 picks lean on what early-user feedback surfaces (issue reports, Discord questions). The plan can promote / demote candidates based on what's actually being asked.

**Phase 3 (P2 opportunistic).** Three candidates currently parked at P2. Ship in batches driven by evidence: a P2 candidate moves to "drafting" when there's concrete user-supplied substance to draw from (a real workflow pattern, a worked example in a Discord thread, a GitHub issue with detail). Skip P2 candidates with no user-supplied substance — they'd have to be drafted from external sources only, which rarely lands.

---

## 8. Per-guide authoring workflow

For each guide, the steps from blank file to live page:

1. **Outline.** Sketch the 3-5 numbered steps + variations + related-guides cross-links. ~1 page; not committed.
2. **Draft.** Fill the recipe template. Aim for under 1000 words. Stay with prose; only add screenshots if they're load-bearing.
3. **Screenshots.** Reuse `docs/images/` first. New captures only when no existing shot covers the moment.
4. **Self-edit.** Read it cold; check every step is unambiguously executable; trim anything that reads like marketing.
5. **Commit.** `docs(planning): Draft <slug> guide` (or batch wording for multi-guide commits).
6. **Port brief** ([port-workflow.md](port-workflow.md) handoff convention). Gitignored, one-shot. Hand off to the parallel website session.
7. **Mark in this plan.** Flip the row's status from P0/P1/P2 to ✏️ after draft commit; to ✅ after port + deploy.

---

## 9. Cross-link map (P0 → P0)

The five P0 guides cross-link as follows when shipped:

- `import-from-scrivener` → `compile-your-manuscript` (next step after import) + `view-project-in-bases` (browse the imported structure).
- `start-a-writing-project` → `compile-your-manuscript` (next step after writing) + `work-with-drafts` (revision loop) + `view-project-in-bases` (alternate view).
- `compile-your-manuscript` → `start-a-writing-project` (prereq if no project yet) + `work-with-drafts` (revising before final compile).
- `work-with-drafts` → `start-a-writing-project` (prereq) + `compile-your-manuscript` (final output).
- `view-project-in-bases` → `start-a-writing-project` (prereq) + `import-from-scrivener` (alternative project source).

P1 / P2 guides will fold in as they ship; dangling cross-references to unwritten P1s in P0 guides are intentional per [reference § 10](../guides-authoring-reference.md). The slug is stable per this plan; the link resolves cleanly when the P1 lands.

---

## 10. Suggest-an-edit footer pattern

Every shipped guide ends with:

```markdown
*Found something wrong or unclear? [Suggest an edit][issue-link] — opens a pre-filled issue with the `guides` label.*

[issue-link]: https://github.com/banisterious/obsidian-draft-bench/issues/new?labels=guides&title=%5BGuides%5D+<slug>%3A+
```

Replace `<slug>` per guide. The `guides` label needs to exist on the repo before the first guide ships; if not, create it (color suggestion: a different shade from `bug` / `enhancement` / `mobile-android`).

Issues with the `guides` label feed editorial decisions: typos, outdated procedures, missing variations, "this confused me" reports.

---

## 11. Feedback loop

Two channels feed editorial decisions for shipped guides:

**(a) GA scroll-depth events.** GA4 fires a `scroll` event when a user reaches 90% of a page (Enhanced Measurement → Scrolls). For recipe content, that's the right granularity: did they reach the bottom?

Build an Explore report:
- Dimension: Page path and screen class
- Metric: Event count, Total users
- Filter: Event name exactly matches `scroll`
- Optional secondary filter: Page path contains `/guides/`

Cross-reference scroll counts against the standard Pages report to derive read-through rate per page. Pages with high views but zero scrolls are bouncing; investigate via the [reference doc § 12 light-edit checklist](../guides-authoring-reference.md).

**(b) Suggest-an-edit issues.** The footer link pre-fills a GitHub issue. Filter the repo's issue list by the `guides` label periodically.

Discussions / Discord for broader workflow questions or guide requests — keep those out of the issue queue (one label per channel, no spam).

---

## 12. Pre-launch checklist

Before the P0 batch goes live on draftbench.io:

- [ ] All 5 P0 drafts committed in `docs/planning/website-content/guides/<slug>.md`.
- [ ] `guides` label exists on the GitHub repo.
- [ ] Hugo `/guides/` section scaffolded (top-nav entry, landing index page, individual page template).
- [ ] GA4 Enhanced Measurement Scrolls event confirmed firing.
- [ ] Cross-links between the 5 P0s resolve correctly in the staging build.
- [ ] Each draft's "Suggest an edit" link points at the right slug.
- [ ] Lychee link-check CI catches dangling links to unwritten P1s gracefully (those are intentional; should not block the build).
- [ ] Port brief drafted and handed off to the website session.
- [ ] First-week Discord pin / forum post drafted to direct new users into `/guides/`.

---

## 13. Open questions

- ~~**Does `/guides/` go in the top nav, or under "Docs" / similar?**~~ **Resolved 2026-05-10**: under a new **Docs ▾** dropdown alongside FAQ + Documentation (wiki link). Port brief carries the implementation. FAQ's URL stays at `/faq/` to preserve inbound links; only the menu reorganizes. The Documentation child points at the wiki (the canonical reference surface) rather than a new on-site page.
- **Should the P0 batch ship together or trickle?** Reference doc says the launch batch ships together to give the section coverage critical mass on launch day. Recommendation: ship together. Confirm at draft-time.
- **Is "I want to write on Android" a P2 or P1?** Currently P2 because it's edge-case. If Android-specific issues continue to surface (post-#34/#35), promote to P1. Re-evaluate in 2 weeks.

---

## 14. Status header (update on each batch ship)

- **2026-05-10.** Plan drafted. No guides shipped. P0 batch authoring not started. `guides` label does not yet exist on repo. Site `/guides/` section not yet created.
