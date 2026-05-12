# Manuscript leaf design refinement

Planning doc for a deliberate design pass on the Manuscript leaf — the dockable right-sidebar view that writers see every session. Two goals: fix consistency / information-architecture issues that accumulated as the leaf grew feature-by-feature, and move the visual identity to harmonize with the rest of the plugin.

**Status:** ✅ Complete. Direction D3 (single-row inline status, Builder-aligned) shipped in 0.3.3, superseding the 2026-04-24 lock on Direction B (Ulysses warm). Tracked via [#30](https://github.com/banisterious/obsidian-draft-bench/issues/30). Mockups for both passes live gitignored at [docs/mockups/](../../mockups/). Archived 2026-05-11.

## Locked decisions (2026-05-05 — current)

- **Aesthetic direction: D3 — single-row inline status, Builder-aligned.** No semantic status colors anywhere. No status chips, no status dots, no per-scene progress bars, no hero gradient on the project section. Scene rows are single-row (number · title · status · count) with status as inline small-caps muted text and right-aligned tabular numerics for the count column. Section headings rendered as 11px small-caps `--text-muted`, matching the Manuscript Builder's section-divider style. Compile button uses Obsidian's stock `.mod-cta` (no gradient override). Hairline 1px borders define rhythm throughout.
- **Status colors: removed.** The semantic-status palette (brainstorm/idea = blue, draft = gray, revision = amber, final = green) is dropped. Every status reads in the same `--text-muted` color. The five `--dbench-status-*` Style Settings variables are removed; theme authors no longer override per-status colors. Trade-off: writers lose at-a-glance status differentiation; gain a leaf that doesn't fight the rest of the plugin's visual language.
- **Tab strip placeholder.** The mockups included a `List / Continuous` tab strip below the project picker, anticipating the Scrivenings-style continuous-view milestone. The strip was **not** added in this restyle milestone — single-tab UI reads as broken. **Update (2026-05-06):** the Continuous-mode work shipped in 0.4.0 ([#31](https://github.com/banisterious/obsidian-draft-bench/issues/31)) and introduced the strip alongside the second tab. See [archive/manuscript-view-continuous-mode.md](archive/manuscript-view-continuous-mode.md).
- **Ordering: design pass before onboarding.** Phase 3 onboarding still lands on a polished leaf; the polish is just D3-flavored now.
- **Empty state: brand-mark variant unchanged.** The 2026-04-24 lock on the brand-mark accent-tinted empty state stays. Pure visual change; no D3-specific tweaks needed.

## Why revised (2026-05-05)

The 2026-04-24 lock on Direction B (Ulysses warm) shipped through 0.3.x. Two things changed since:

1. **The Manuscript Builder marquee shipped (0.3.0 / 0.3.1).** The Builder's aesthetic register — minimal form-and-prose surfaces, no semantic chrome, hairline rhythm, stock `.mod-cta` — set DB's de-facto visual language.
2. **The leaf in production read as visually busier than its sibling.** The maintainer used both surfaces in real workflow and consistently preferred the Builder's restraint.

D3 is the spirit-of-A revisit aligned to the Builder, not a return to A. Mockups built 2026-05-05 at [docs/mockups/Manuscript View 20260505/](../mockups/Manuscript%20View%2020260505/) compared three D candidates (D1 strict quiet, D2 Builder-pill status, D3 single-row inline-text status). D3 won on the trade-off of scannability + vertical density + visual quietness without introducing pill chrome.

## Superseded decisions (2026-04-24, kept for record)

- ~~**Aesthetic direction: B — Ulysses warm.** Semantic status colors (muted palette), status chips on scene rows + colored dots in breakdown, rounded corners, gradient progress fills, warmer background tint, small-caps section heads. Compile button promoted to a primary CTA above the 3-button toolbar with a soft shadow.~~ Superseded by D3 lock on 2026-05-05.
- ~~**Status colors: on by default, Style Settings exposure.**~~ Superseded by D3's "status colors removed" decision. The five `--dbench-status-*` variables are removed in the restyle implementation.

**Scope:** The Manuscript leaf only. The Manuscript Builder modal (which replaced the retired Control Center, see [control-center-reference.md § Draft Bench's current direction](control-center-reference.md#draft-benchs-current-direction)) and the settings tab are explicitly out of scope for this pass — they get their own design reviews when they grow enough content to warrant it.

**Non-goals:** Replace Obsidian's native theming, ship a proprietary visual identity that fights user themes, or block shipping while the design is being iterated on. The inherit-first meta-rule from [ui-reference.md § 0](ui-reference.md) still applies; this pass is about picking a *few* deliberate accents, not overriding the theme.

---

## Reference aesthetics

Writing tools get visual care historically. Evaluating four reference points to pick the one that fits DB's voice:

| Tool | Visual character | What it does well |
|---|---|---|
| iA Writer | Quiet, typographic, monochrome-with-accent (blue / amber). Generous whitespace. Minimal chrome. | Signals "this is a serious writing tool" without distracting from prose. Every element earns its pixels. |
| Ulysses | Warm, literary. Soft neutral palette with a single muted accent. Serif flavor. | Feels inviting, not sterile. Pleasant to spend hours in. |
| Scrivener | Information-dense, considered. More chrome than iA; less than a full IDE. Desktop-appy. | Handles complex metadata without feeling cluttered. |
| Longform (Obsidian) | Workmanlike, no visible aesthetic identity. Inherit-all. | Doesn't fight the theme; also doesn't express any opinion. |

DB currently sits closest to Longform. Moving toward iA Writer / Ulysses is achievable without abandoning inherit-first — pick a small set of deliberate accents (typography rhythm, semantic color for statuses, progress-bar treatment, section-heading style) and lean into them consistently.

**Direction to pick (TBD, pending maintainer preference):**

- **Direction A — iA Writer flavor.** Quiet monochrome with a single strong accent (Obsidian's `--interactive-accent`). Generous whitespace. Typography does most of the heavy lifting. No status chips; status as muted small-caps text. Progress bars thin + accent-colored.
- **Direction B — Ulysses flavor.** Warmer. Semantic status colors (muted blue/amber/green/neutral). Larger line-height on scene titles. Section headings could use a slight serif or italic treatment for contrast. Progress bars with a subtle gradient.
- **Direction C — Stay inherit-first, polish IA only.** Fix the consistency observations below but don't push into new aesthetic territory. Least visual disruption; least reward.

Recommendation pending; see Open questions.

---

## Consistency and information-architecture observations

Captured from the 2026-04-24 screenshot review of `The Salt Road` project with 4 scenes.

### 1. Compile button placement (toolbar)

**Observation.** The "Compile" button occupies a full-width row by itself, separate from the 3-button row above it (`New scene`, `New draft of current scene`, `Reorder scenes`). Either a flex-wrap glitch caused by a narrow sidebar, or an intentional "primary action" emphasis that reads as broken.

**Proposal.** Either

- (a) Join the toolbar row as a 4th button (widths may need CSS adjustment to fit four icons in a narrow sidebar), or
- (b) Promote Compile to a distinct primary CTA above the row with `.mod-cta` styling, clearly signaling "this is what you do after writing."

(b) is the more designed choice; (a) is the cleanup choice. Prefer (b) if the design pass embraces hierarchy.

### 2. Project summary technical metadata

**Observation.** `Identifier: oox-083-oym-471` and `Shape: folder` are technical metadata. Writers don't need to see their project id day-to-day; the shape field distinguishes folder-projects from single-scene-projects but is rarely actionable once a project is created.

**Proposal.** Hide both behind a collapsible "Details" disclosure or a "More" affordance, surfacing only Status as the primary meta row. Keep them one click away for debugging / support.

### 3. Duplicate word-count display

**Observation.** `1,553 / 5,000 words (31%)` with a progress bar appears at the top of the Word count sub-section, and `1,553 words` (big type) appears immediately below. Both convey the total count.

**Proposal.** Consolidate into one. When a target is set, show only the progress view (`1,553 / 5,000 words (31%)`). When no target is set, show the big-number display. Never both.

### 4. Ragged scene-list rows

**Observation.** Scenes with `dbench-target-words` show a mini progress bar (e.g., `400 / 1,000 words (40%)`); scenes without show a plain word-count badge (e.g., `53 words`). The two layouts have different row heights and visual weight.

**Proposal.** Use the mini bar for every scene. When no target is set, show the bar at 0% with the plain count label above it (`53 words`). Keeps row rhythm consistent; targets become an "opt-in to progress tracking" rather than an "opt-in to different row layout."

Alternative: drop the bar entirely from scene rows — the project-level progress bar already covers the "progress" role; scene-level targets could surface on hover / click-through instead.

### 5. Heading hierarchy in a narrow column

**Observation.** "Project summary" section heading, "Word count" sub-heading, and "Manuscript" section heading create three heading levels stacked in a sidebar that might be 250-320px wide. Feels heavy.

**Proposal.** Drop the "Word count" sub-heading — the progress display + breakdown rows are self-explanatory within the Project summary section. Reduces visual weight; doesn't lose information.

### 6. Status labels under scene titles

**Observation.** Scene rows show `Brainstorm` / `Draft` / `Revision` / `Final` as plain text below the title. Readable but visually identical to any other small-font text.

**Proposal.** Treat status as a semantic chip — either always (Direction B), or never (Direction A treats it as muted small-caps text). Current plain-text treatment is neither; it's information carrying no visual signal.

---

## Aesthetic opportunities

Going beyond consistency fixes into the "attractive" ambition. Each of these is a standalone decision; they don't all have to land.

### Typography rhythm

Define a consistent type scale for the leaf using Obsidian's native `--font-ui-*` variables:

- Section heading: larger, semibold (project / manuscript names)
- Sub-heading: smaller, uppercase or small-caps (status vocabulary labels)
- Body: default UI size
- Meta rows: smaller, muted color

Currently sizes / weights are mostly ad-hoc. A defined scale read across the whole leaf feels more considered.

### Semantic status color (Direction B only)

Assign each status a muted color tint via Style Settings variables. Default palette:

- `idea` / `brainstorm`: neutral blue
- `draft`: neutral gray (writing mode)
- `revision`: amber (iteration mode)
- `final`: green (completion mode)
- Out-of-vocabulary statuses: neutral fallback

Applied to status chips in the scene list + status-breakdown rows + (optionally) progress-bar segments in the project summary.

### Progress-bar treatment

Current: thin solid accent color. Options for a more designed treatment:

- **Gradient end-cap.** Subtle gradient from a lighter tint to the accent color.
- **Segmented.** Project progress bar segments by status buckets (blue for idea scenes, gray for draft, amber for revision, green for final). Visual breakdown at a glance without reading numbers.
- **Animated fill on first paint.** Small detail; Ulysses-style delight. Disable on reduced-motion.

### Scene-list row polish

- Larger click target (whole row, not just the title link).
- Subtle hover state beyond the default link color shift.
- Clear visual separator between rows (hairline divider with `--background-modifier-border-hover`).
- Scene-order number treatment: currently a plain `1` / `2` / `3` / `4` leading column. Could be styled as a small capsule or muted small-caps digit.

### Section-heading style

Current: lucide icon + text + chevron. Options:

- Keep and refine spacing / weight.
- Add a subtle bottom-border for visual separation.
- Use small-caps for section headings to echo the writing-tool tradition.

### Empty states

When no project is selected (or no scenes exist yet), the leaf currently shows placeholder text. Opportunities:

- A short evocative line ("Pick a project to get started" → "Your manuscript begins here" or similar).
- A small illustration or quote (Ulysses-style warmth). Guard against overdoing it — Obsidian plugins generally avoid decorative imagery, and theme compatibility matters.

### Toolbar icon consistency

Current icons are lucide: `square-pen` / `copy-plus` / `arrow-up-down` / `book-open-check`. All fine; worth auditing as a set to ensure visual rhythm (some icons are denser than others, which can make the toolbar feel uneven).

---

## Constraints

- **Inherit-first remains the meta-rule.** Every CSS custom property should reach for Obsidian's `--*` token first. Opinionated values land in `variables.css` only when no native token fits the semantic.
- **Theme-respectful.** The leaf must look reasonable on default-dark, default-light, Minimal, Things 2, and at least one high-contrast theme. No hard-coded colors outside `variables.css` and `style-settings.css`.
- **Style Settings surfaces the knobs.** Every deliberate aesthetic choice (status colors, progress-bar treatment, section-heading weight) should be a Style Settings variable writers can tune — especially for palette choices where a writer's theme dictates preference.
- **Accessibility.** Status colors must pass contrast against both light and dark backgrounds, or be supplemented by an icon / label so color isn't the only channel. Reduced-motion queries disable any animated fills.
- **No imposed identity.** DB is a writing plugin *inside Obsidian*, not a rebrand of Obsidian. The redesign should feel like "Obsidian, with taste" — not "a different app."

---

## Implementation sequence (D3, 2026-05-05)

Small reversible commits. Most of this is CSS-only; the scene-row layout change is the only TypeScript touch (and a small one).

1. **Drop the `.mod-cta` gradient override.** Compile button uses Obsidian's stock solid-accent fill. CSS only.
2. **Drop the project-section hero gradient.** Section reads as plain section heading + meta. CSS only.
3. **Flatten the project progress bar to 2px hairline solid accent.** Remove the gradient fill. CSS only.
4. **Remove status chips and dots from scene rows + breakdown.** No `.dbench-status-chip` rendering, no `.dbench-status-dot` markup. TypeScript: remove the chip/dot DOM nodes from scene-row builders. CSS: delete the chip/dot rules.
5. **Remove per-scene mini progress bars.** Per-scene `dbench-target-words` no longer surfaces in the leaf; targets stay in scene frontmatter and the writer can see them in the Properties panel or via Bases. TypeScript: remove the bar DOM nodes. CSS: delete the bar rules.
6. **Switch scene rows to single-row layout: num · title · status (small-caps muted) · count.** TypeScript: rebuild the scene-row DOM to the new shape. CSS: grid-template-columns matching the mockup; tabular-numerics for the count column; ellipsis truncation on overflow.
7. **Section-head treatment to 11px small-caps `--text-muted`.** CSS only.
8. **Remove the `--dbench-status-*` Style Settings variables.** Update [styles/style-settings.css](../../styles/style-settings.css) to drop the five status-color knobs.
9. **Address the IA observations** that haven't already been fixed (likely #2 technical-metadata disclosure, #3 duplicate-word-count consolidation, #5 heading hierarchy in narrow column). Each its own commit.
10. **CHANGELOG entry under [Unreleased].** Headline: "Manuscript leaf restyle (D3)."
11. **Release prep.** Cut [Unreleased] -> [0.3.3] in CHANGELOG, add Release-History entry, version bump, README Status update. Same release-prep pattern as 0.3.2.

Manual dev-vault walkthroughs at each step; screenshots checked against the D3 mockup. No automated visual regression tests.

Estimated effort: 1-2 days of focused work plus dogfood pass.

---

## Alternatives considered (not picked, 2026-05-05)

D3 won the second-pass mockup comparison over D1 and D2:

- **D1 — strict quiet.** Most minimal of the three. Rejected: two-row scene layout costs vertical density and trades scannability for purity. Good reference for "no chrome at all" but D3 hits a better trade-off.
- **D2 — Builder-pill status.** Single-row layout with status as a small pill literally borrowing the Builder's status filter pill (#25). Rejected: pill chrome adds visual mass that the leaf doesn't need; status-pill-as-display-affordance is a slightly different role from status-pill-as-toggle-control, so the literal reuse is less load-bearing than it looks. Good reference if writer feedback says D3's small-caps status is too quiet.

Original 2026-04-24 alternatives (preserved):

- **Direction A — iA Writer quiet.** Monochrome + single accent. Rejected at the time as too restrained; D3 is essentially A's spirit re-aligned to Builder tokens.
- **Direction C — polish only.** Fix IA, stop there. Rejected at the time; the D3 implementation sequence does pick up the IA observations as part of its scope.

## Open questions still

- **Mobile prep.** Mobile-supported as of 0.3.2 (Android verified). Aesthetic choices baked in now apply on phone form-factor too; worth a pass on scene-list readability at ~320px when implementation is done.

---

## Follow-up now that direction is locked

- Implementation proceeds per the sequence in the implementation section (small reversible commits per observation, aesthetic opportunities after, Style Settings manifest last).
- Each commit lands incrementally; the leaf remains usable at every step.
- Manual dev-vault walkthrough screenshot at each surface to confirm the real rendering matches the mockup intent; recorded as a short note in each commit body if divergent.
