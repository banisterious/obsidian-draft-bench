# Onboarding (Phase 3)

Planning doc for the last Phase 3 deliverable: onboarding new writers when they first install Draft Bench. Spec § Phase 3 lists three sub-items (welcome modal, guided first-project creation, example-project generator); this doc scopes which ship in V1 and which defer.

**Status:** Scope locked 2026-04-25. Implementation pending.

---

## Locked scope (2026-04-25)

- **Tier 1 — Welcome modal.** Ships in V1.
- **Tier 2 — Example-project generator.** Ships in V1.
- **Tier 3 — Guided first-project wizard.** Deferred. The existing `NewProjectModal` (3 fields) + `firstProjectRevealed` auto-reveal + brand-mark empty state already cover this surface. Building wizard infrastructure for one wizard fights [wizards-reference.md](wizards-reference.md)'s own DB commitment ("don't abstract until 3+ wizards exist"). Revisit when a second wizard candidate appears or real users report friction with the current flow.

**Why this scope:** the spec sub-items are listed; the spec's own onboarding language (§ Onboarding: deferred, line 509) calls a wizard shape "likely," not "required." Tiers 1+2 deliver the user-facing onboarding without prematurely abstracting wizard scaffolding. Tier 3 is genuinely the lowest-leverage of the three given the existing affordances.

---

## Tier 1: Welcome modal

### Trigger

First plugin enable on a vault. Gated by a new setting `welcomeShown: boolean` (default `false`). Fires after `workspace.onLayoutReady` so the rest of the plugin (ribbon, leaf, settings tab) is in place when the modal appears.

Resurfaceable via a new palette command `Draft Bench: Show welcome screen` for writers who dismissed it and want to revisit, or for screenshot purposes.

**Why a separate flag from `firstProjectRevealed`:** different lifecycle events. `welcomeShown` fires before any project work; `firstProjectRevealed` fires after the first `Create project` command. They can interleave in either order depending on whether the writer dismisses the welcome modal or clicks one of its CTAs.

### Content

One screen, no steps. Layout:

- **Brand mark** (favicon SVG, accent-tinted via `currentColor`, matching the leaf empty state).
- **Tagline:** "A writing workflow for Obsidian" (already established in the brand guidelines and README banner).
- **Pitch paragraph:** ~2 sentences. What the plugin does (projects, scenes, drafts, compile) + the mental model (it's all just markdown with `dbench-*` properties; nothing proprietary).
- **Three CTAs (buttons, primary action first):**
  1. **Create your first project** — runs the `Create project` palette command (opens `NewProjectModal`).
  2. **Try it with an example project** — runs the `Create example project` command (T2; see below).
  3. **Show the manuscript view** — runs `Show manuscript view` (so writers see where their work will live, even if they're not creating a project right now).
- **Documentation link** (text link, not button): "Read the getting-started guide -> [link to wiki Getting-Started page]".
- **Auto-flip on close:** any close path (any CTA, the X, escape key) sets `welcomeShown = true` and saves settings. The "Don't show again" affordance is implicit — clicking anything dismisses for good. No checkbox needed.

### Implementation outline

- `src/ui/modals/welcome-modal.ts` — `WelcomeModal extends Modal`. Composition-only, no state machine. Buttons are `setting.addButton(...)` chains so native styling carries.
- `src/model/settings.ts` — add `welcomeShown: boolean` to `DraftBenchSettings` and `DEFAULT_SETTINGS`.
- `src/commands/show-welcome.ts` — `Draft Bench: Show welcome screen` palette command.
- `main.ts` — in `onload`, after `workspace.onLayoutReady`, check `welcomeShown` and open the modal if false. Register the palette command.

### Out of scope (V1)

- Multi-step flow (deferred to T3).
- Tutorial overlay or tooltip-tour shape.
- Persistent first-run dock pin.

---

## Tier 2: Example-project generator

### Surfaces

- Palette command: `Draft Bench: Create example project`.
- Welcome modal CTA #2: "Try it with an example project".
- (Considered, declined for V1) Settings-tab button. Adds clutter to a settings tab a writer revisits often. The palette is enough.

### Shape

A 3-scene short-story project showing the full V1 workflow. Default vocabulary statuses span across the scenes so writers see how status flows through the manuscript view's chips and breakdown:

| Scene | Status | Body | Drafts |
|---|---|---|---|
| Scene 1 | `final` | Full short prose (~300-500 words). | 1 prior draft snapshot showing earlier wording. |
| Scene 2 | `revision` | Partial draft with planning sections still visible. | None. |
| Scene 3 | `idea` | Empty draft section; planning sections (Source passages / Beat outline / Open questions) populated. | None. |

Plus:

- **One compile preset:** `Workshop MD`, format `md`, destination `vault`. MD/vault is the cheapest format to demo (no save dialog; output lands at `<project>/Compiled/Workshop MD.md` so writers can open it immediately). Title + author + date format set so the heading carries through.
- **Project frontmatter:** `dbench-target-words` set to a round number (e.g., 2000) so the progress hero block populates with a meaningful percentage.
- **Folder shape:** `dbench-project-shape: folder`. Single-scene shape would skip half the model.

**Project name:** `Example - The Last Lighthouse`. Literary-flavored short-story title; "Example -" prefix marks it unmistakably as a demo. Distinct from the dev-vault's `Lighthouse Keeper` project (used for compile walkthrough scenarios, gitignored) — no folder collision.

### Idempotency

If the example project already exists (detected by exact folder match in the configured `defaultProjectFolder`), the command surfaces a Notice ("Example project already exists. Open <name>?") with confirm/cancel rather than overwriting. Writers who deleted the example and want it back can run the command again from a clean state.

Detection by folder name rather than `dbench-id` so a writer who deleted the example folder + frontmatter can resurrect cleanly.

### Implementation outline

- `src/core/example-project.ts` — pure orchestration. Calls existing `createProject` -> N x `createScene` -> 1 x `createDraft` -> 1 x `createCompilePreset`. Wraps everything in `linker.withSuspended(...)`. Returns the project file ref.
- `src/core/example-project-content.ts` (or inline constants) — fictional prose for the scenes + drafts. Authored at implementation time; can be revised post-ship without breaking anything.
- `src/commands/create-example-project.ts` — palette command + the welcome modal's CTA target.
- Smoke test only. Underlying `createProject` / `createScene` / `createDraft` / `createCompilePreset` are already covered.

### Defaults respected

The example project respects the writer's settings: it lands in their configured `defaultProjectFolder`, uses their configured `scenesFolder` / `draftsFolderPlacement` / `sceneTemplatePath`, and uses their first status-vocabulary entry as the default. No hardcoded paths.

If a writer has Templater enabled with a custom scene template that uses `tp.file.*`, the example respects that too — it goes through the standard `createScene` flow, including the Templater pass-through path.

---

## Wiki sweep (separate sub-task)

The Manuscript Builder refactor (commit `d4d3377`) made the existing `wiki-content/` partially stale. Onboarding's welcome modal links to the wiki, so the wiki should be fresh before the modal ships. Surface area:

- **`Getting-Started.md`:** § "Add a scene" still says "From the Control Center's Manuscript tab" -> Manuscript leaf. § "Work in the Control Center" needs full rewrite as "Work in the Manuscript view and Manuscript Builder" — describes the leaf (ordered scene list, status breakdown, compile CTA) and the modal (preset editor, Run button) as separate surfaces with distinct purposes.
- **`Home.md`:** any Control-Center mentions -> Manuscript view / Manuscript Builder.
- **`Control-Center.md`:** rename to `Manuscript-Builder.md` via `git mv` and rewrite. The CC concept is parked in `docs/planning/control-center-reference.md`; the wiki page should describe the Manuscript Builder modal, not the retired CC. Leave a one-line stub at the old path pointing at the new page so any external links survive.
- **`_Sidebar.md`:** Control Center sidebar entry -> Manuscript Builder.
- **`Settings-And-Configuration.md`:** spot-check for any CC references.

Order this last (Step 5 of the implementation plan) so the welcome modal's wiki link points at fresh copy when it ships.

---

## Implementation order

1. **Step 1 — This planning doc.** ✅ (this file).
2. **Step 2 — Example-project core.** `src/core/example-project.ts` orchestration + smoke test.
3. **Step 3 — Example-project palette command.** `Draft Bench: Create example project`.
4. **Step 4 — Welcome modal + setting flag + resurface command.** Wires CTA #2 to Step 3's command.
5. **Step 5 — Wiki sweep.** Getting-Started + Home + Control-Center rename + sidebar.

T2 ships before T1 so the welcome modal CTA wires to a working command on first creation, not a stub.

---

## Locked content decisions (2026-04-25)

- **Example-project name:** `Example - The Last Lighthouse` (locked above in § Tier 2 § Shape).
- **Example-project content authorship:** drafted at implementation time. Tone target: literary-friendly, generic enough not to feel like it's prescribing genre, concrete enough to feel like real writing rather than lorem ipsum.
- **Welcome modal pitch:** two short paragraphs (one `<p>` each) so the obsidianmd lint rule's `enforceCamelCaseLower: true` doesn't flag the second sentence's leading "Compile" as title-case mid-string. "Markdown" canonical-cased per the brand list. `dbench-*` jargon dropped from the welcome screen — too technical for first-run; the writer sees the actual frontmatter when the example project opens.

  > Draft Bench manages projects, scenes, and versioned drafts as plain Markdown notes.
  >
  > Compile your manuscript to MD, ODT, or PDF when you're ready to share it.

---

## Out of scope (V1)

- **Tier 3: Guided first-project wizard.** Deferred. Revisit when (a) a second wizard candidate appears, or (b) real users report struggling with the current `NewProjectModal` + auto-reveal flow. The wizards-reference's "don't abstract until 3+" commitment governs.
- **Onboarding for advanced features.** Compile presets, templates, Bases, status vocabulary, etc. all stay in the wiki. The welcome modal is a starting line, not a tutorial.
- **Telemetry on welcome-modal interactions.** No telemetry anywhere in the plugin (per SECURITY.md); no exception for onboarding.
- **Post-update changelog modal.** Different feature; revisit if there's a v0.x -> v1.0 transition worth surfacing in-app. Wiki Release-History.md handles version-to-version reporting today.
