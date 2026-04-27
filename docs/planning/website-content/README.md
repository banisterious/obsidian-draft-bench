# Website content drafts

Source-of-truth drafts for [draftbench.io](https://draftbench.io). The website itself lives in a separate repo (Hugo + Blowfish, GitHub Pages via Actions); these files are the content the website session ports over.

This directory follows the two-repo split codified in [website-strategy-reference.md § 1](../website-strategy-reference.md): drafts live next to the code that authored them; the website repo handles Hugo concerns (frontmatter, shortcodes, deploy).

---

## Phase 0 (pre-V1) inventory

These are what's drafted now, ahead of V1:

| File | Purpose | Status |
|---|---|---|
| [homepage.md](homepage.md) | Landing page. What Draft Bench is, what it does, where it sits, when it ships. | Draft |
| [faq.md](faq.md) | Prospect-facing FAQ. ~6-10 questions, 3 sections. | Draft |
| [comparison.md](comparison.md) | Side-by-side with Longform / StoryLine / Scrivener-in-Obsidian. Lifts from [branding.md § Positioning](../branding.md). | Draft |
| [media-plan.md](media-plan.md) | Asset inventory + capture-session priorities. Stub for Phase 0; real plan lands closer to V1. | Stub |
| `handoff-prompt.md` *(gitignored)* | Standalone prompt to paste into a website-repo session for the Phase 0 port. Local-only; regenerate per handoff. | Live |

## Deferred until V1

- `features-page.md` — full track-based features grouping. Pending Step 8 + Steps 9-15 of chapter-type so the surface is stable enough to write to.
- `changelog-page.md` — cluster-spotlight format. Empty until V1 ships a real first cluster.
- Track pages (`novelists.md`, `short-fiction.md`, `longform-migrants.md`) — Phase 2, post-V1, driven by BRAT-tester feedback.
- Motion captures — Phase 2. Tier-1 candidates: project creation, scene-to-draft snapshot, Manuscript view, compile flow.

---

## Voice conventions

Anything written here should pass the checks from [website-strategy-reference.md § 2](../website-strategy-reference.md) and [branding.md § Voice and tone](../branding.md):

- Concrete over abstract. Describe behavior, not outcomes.
- No marketingese. Banned: "robust," "powerful," "seamless," "leverage," "empower," "blazingly fast," "industry-leading," "next-generation," "world-class," "best-in-class," "revolutionary."
- No second-person plural ("you and your team"). One reader, one craft.
- No AI attribution anywhere — commits, copy, comments, captions.
- Minimize em-dashes. Prefer parentheses, semicolons, colons. ASCII `->` not Unicode arrows.
- "The plugin is Draft Bench, not 'we.'" Single-author plugin; royal we is a tell.

## Pre-V1 honesty handle

Per the locked planning decision (2026-04-26 session), the site uses **re-pointed CTA** rather than site-wide banner or pretend-shipped framing. The hero CTA reflects pre-V1 status; everything else reads as natural product copy.

Specifically: **the GitHub repo is private until V1.** No "Star on GitHub" / "Watch on GitHub" CTA until the repo goes public. The pre-V1 site has informational status sections, no follow-action CTA.

When the repo goes public (close to V1 BRAT release), update the homepage's status section + add CTAs across the site in a single sweep.

---

## Handoff to website session

When these drafts are ready to port:

1. The website session reads each file from this directory verbatim — no rewriting.
2. Adds Hugo frontmatter (title, date, layout, weight) per the Blowfish theme.
3. Sets up the menu structure (top-level: Home / FAQ / Comparison / GitHub-when-public).
4. Configures `markup.goldmark.renderer.unsafe = true` in `hugo.toml` if any raw HTML lands.
5. Sets up the deploy workflow (GitHub Pages via Actions, mirror chartedroots.com pattern).
6. Sets up monthly link-check CI via [lychee](https://github.com/lycheeverse/lychee).

Voice corrections, copy improvements, structural reshaping all happen back in this directory, not in the Hugo repo. Keep the source-of-truth split clean.
