# Manuscript leaf design refinement

Planning doc for a deliberate design pass on the Manuscript leaf — the dockable right-sidebar view that writers see every session. Two goals: fix consistency / information-architecture issues that accumulated as the leaf grew feature-by-feature, and move the visual identity from "functional" toward "attractive."

**Status:** Direction locked 2026-04-24. Implementation starting with observation 1 (Compile button placement). Mockups used to make the call live gitignored at [docs/mockups/](../mockups/).

## Locked decisions (2026-04-24)

- **Aesthetic direction: B — Ulysses warm.** Semantic status colors (muted palette), status chips on scene rows + colored dots in breakdown, rounded corners, gradient progress fills, warmer background tint, small-caps section heads. Compile button promoted to a primary CTA above the 3-button toolbar with a soft shadow.
- **Status colors: on by default, Style Settings exposure.** Each default-vocabulary status ships with a muted color (brainstorm/idea = muted blue, draft = neutral gray, revision = amber, final = green). Out-of-vocabulary statuses fall back to `--text-muted`. Style Settings exposes each color as a tunable variable so writers who dislike the palette (or have custom vocabulary values) can override.
- **Ordering: design pass before onboarding.** Phase 3 onboarding is the next Phase 3 item after this refinement; onboarding lands on a polished leaf rather than one mid-redesign.
- **Empty state: brand-mark variant, option 2 (accent-tinted).** Uses [draft-bench-favicon-mark.svg](../assets/branding/draft-bench-favicon-mark.svg) inlined with `stroke="currentColor"` tinted via `color: var(--text-accent)`. Copy: "Your manuscript begins here" + "Create your first project to start tracking scenes, drafts, and compile presets." Primary "Create project" button + secondary "Learn more" button. Applies to the Manuscript leaf's empty state when no project is selected. No custom illustration work; the brand mark was already designed.

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

## Implementation sequence (once direction is picked)

Small commits, bisectable. One commit per observation / opportunity:

1. Consistency fixes first (observations 1-6). Each commit is small and reversible.
2. Aesthetic opportunities, picked from the direction section. Each commit adds one deliberate element (status chips, progress-bar treatment, typography scale).
3. Style Settings manifest update consolidating new variables. Shipped as a separate doc-update commit.

Manual dev-vault walkthroughs at each step; screenshots checked against the reference aesthetics. No automated visual regression tests (DB doesn't have that harness yet).

---

## Alternatives considered (not picked)

Preserved for future-context; the reasoning behind the lock.

- **Direction A — iA Writer quiet.** Monochrome + single accent. Rejected: aesthetically restrained to the point of not reading as "designed" to writers expecting visual warmth from a writing tool. Good reference for typography rhythm; its whitespace and hierarchy discipline carry into B.
- **Direction C — polish only.** Fix IA, stop there. Rejected: addresses the consistency observations but doesn't answer the "I want the leaf to feel more attractive" brief. Fine as a fallback if Direction B produces unforeseen theme-compatibility issues.

## Open questions still

- **Mobile prep.** V1 is desktop-only, but any aesthetic choices baked in now will carry to mobile if/when it lands. Worth a pass on scene-list readability at ~320px when implementation is done.

---

## Follow-up now that direction is locked

- Implementation proceeds per the sequence in the implementation section (small reversible commits per observation, aesthetic opportunities after, Style Settings manifest last).
- Each commit lands incrementally; the leaf remains usable at every step.
- Manual dev-vault walkthrough screenshot at each surface to confirm the real rendering matches the mockup intent; recorded as a short note in each commit body if divergent.
