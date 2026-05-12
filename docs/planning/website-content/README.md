# Website content drafts

Source-of-truth drafts for [draftbench.io](https://draftbench.io). The website itself lives in a separate repo (Hugo + Blowfish, GitHub Pages via Actions); these files are the content the website session ports over.

This directory follows the two-repo split codified in [website-strategy-reference.md § 1](../website-strategy-reference.md): drafts live next to the code that authored them; the website repo handles Hugo concerns (frontmatter, shortcodes, deploy).

---

## Live drafts

These are the drafts currently informing the site:

| File | Purpose | Status |
|---|---|---|
| [homepage.md](homepage.md) | Landing page. What Draft Bench is, what it does, where it sits, what's currently shipped. | Live |
| [faq.md](faq.md) | Prospect-facing FAQ. Four sections (Getting started, How it compares, Scope and compatibility, Getting help). | Live |
| [comparison.md](comparison.md) | Side-by-side with Longform / StoryLine / Scrivener / plain Obsidian. Lifts from [branding.md § Positioning](../archive/branding.md). | Live |
| [scrivener-import.md](scrivener-import.md) | Features-page section (or standalone feature page) for the Scrivener 3 importer. Slot decision deferred to the website session. | Live |
| [media-plan.md](media-plan.md) | Asset inventory + capture-session log. Tier 1 motion loops + Tier 2 stills captured. | Live |
| [guides-plan.md](guides-plan.md) | Master plan for the `/guides/` recipe section. Enumeration table + authoring rules + phased rollout. P0 batch in progress; site section not yet scaffolded. | Live |
| `handoff-prompt.md` *(gitignored)* | Standalone prompt to paste into a website-repo session for each port. Local-only; regenerate per handoff. | Live |

## Source-truth gaps

Pages live on the site without a source-of-truth draft in this repo. Backfill is pending; until then, edits to these pages happen directly in the Hugo repo (deviating from the two-repo split):

- `features-page.md` — features page is live on the site (top nav, weight 5), authored directly in the Hugo repo. Backfill so future edits round-trip through this repo per [website-strategy-reference.md § 1](../website-strategy-reference.md). Until then, the homepage's "See it in action" section is the only source-truth-controlled link into the features page.

## Deferred

- `changelog-page.md` — cluster-spotlight format. Could be drafted now that 0.1.x and 0.2.x have natural narrative shape; deferred pending decision on whether to maintain it separately from the wiki Release-History page.
- Track pages (`novelists.md`, `short-fiction.md`, `longform-migrants.md`) — driven by BRAT-tester feedback as the audience clarifies.
- Tier 3 motion captures — track-page hero shots; deferred until track pages exist.

---

## Voice conventions

Anything written here should pass the checks from [website-strategy-reference.md § 2](../website-strategy-reference.md) and [branding.md § Voice and tone](../archive/branding.md):

- Concrete over abstract. Describe behavior, not outcomes.
- No marketingese. Banned: "robust," "powerful," "seamless," "leverage," "empower," "blazingly fast," "industry-leading," "next-generation," "world-class," "best-in-class," "revolutionary."
- No second-person plural ("you and your team"). One reader, one craft.
- No AI attribution anywhere — commits, copy, comments, captions.
- Minimize em-dashes. Prefer parentheses, semicolons, colons. ASCII `->` not Unicode arrows.
- "The plugin is Draft Bench, not 'we.'" Single-author plugin; royal we is a tell.

## Site posture

The repo went public on 2026-04-29 with the 0.1.0 BRAT release. The site can carry standard "View on GitHub" / "Star" / "Watch for releases" CTAs in the Status section and footer-style blocks without misrepresenting status. Voice and tone otherwise stay per [website-strategy-reference.md § 2](../website-strategy-reference.md): factual, behavior-described, not pitched.

The original "pre-V1 honesty handle" rule (locked 2026-04-26, retired 2026-05-04) was the no-CTA-while-private convention; it no longer applies.

---

## Handoff to website session

The plugin repo authors the source-of-truth markdown; a separate session opened in the Hugo repo does the port. Two handoff shapes, depending on what's being shipped.

### Initial setup (one-time, complete)

1. The website session reads each file from this directory verbatim — no rewriting.
2. Adds Hugo frontmatter (title, date, layout, weight) per the Blowfish theme.
3. Sets up the menu structure (top-level: Home / FAQ / Comparison / GitHub).
4. Configures `markup.goldmark.renderer.unsafe = true` in `hugo.toml` if any raw HTML lands.
5. Sets up the deploy workflow (GitHub Pages via Actions, mirror chartedroots.com pattern).
6. Sets up monthly link-check CI via [lychee](https://github.com/lycheeverse/lychee).

Voice corrections, copy improvements, structural reshaping all happen back in this directory, not in the Hugo repo. Keep the source-of-truth split clean.

### Recurring port: version-bump callouts

The most common handoff. Whenever a new plugin release ships, three callouts in this directory get bumped (here in `homepage.md` + `faq.md`); the website session ports the same three callouts to the Hugo repo verbatim.

**The three callouts (locked pattern):**

1. **Homepage Status opening line** — `The current release is **<v>** (<YYYY-MM-DD>).`
2. **Homepage Status history paragraph** — append one sentence describing the new release after the prior-version sentence. Recast the previously-current version sentence to past tense (e.g., "0.5.3 is..." -> "0.5.3 was...").
3. **FAQ "When can I install it?" install callout** — `The current release is **<v>** (<YYYY-MM-DD>);`

**The handoff prompt itself** is drafted in chat per port (the gitignored `handoff-prompt.md` file is never actually committed — the prompt lives in conversation context). Each prompt should:

- Name the version + date.
- Point at the plugin-side commit hash that landed the drafts here.
- Enumerate the three callouts above + their exact target locations in the Hugo site.
- Specify a conventional-commit style for the website commit (e.g., `docs(homepage,faq): Bump current-release callouts to <v>`).
- Ask the website session to return its commit hash so the plugin-side session-restore can record it.

**Prior runs:**

- **0.5.3 port (2026-05-12 AM):** plugin drafts in `5aaf982` + `65bba55`; website commit `dc7a69a`.
- **0.5.4 port (2026-05-12 PM):** plugin drafts in `10d130a`; website commit `6930bf6`.

If a release also introduces new functionality that warrants more than a one-line history sentence (a marquee 0.6.0 / 1.0 release, a brand-new feature page, a screenshot swap), expand the homepage Status section + add per-feature copy in the plugin-side drafts first, then enlarge the handoff prompt accordingly. The three-callout pattern is the minimum; everything above it is per-release.
