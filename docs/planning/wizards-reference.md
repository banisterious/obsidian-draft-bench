# Wizard modals reference: Charted Roots patterns

**Status:** Reference material. **Not** a design spec for Draft Bench's wizards.

**Purpose.** Captures Charted Roots' (CR) wizard-modal architecture so that when DB adds its first wizard (likely a Phase 3 surface — onboarding or the compile preset editor), the design starts from a concrete, well-understood prior art rather than a blank page. The summary below was drafted in a previous session by reading CR's source; file paths and line numbers are approximate and reflect CR's state around April 2026, so treat them as search starting points, not stable anchors.

**How to use this document.**

- **Nothing in DB is wizard-shape yet.** Phase 1 and Phase 2 ship linear modals (new-project / new-scene / new-draft / reorder / repair-project-links) that don't benefit from a wizard. The nearest wizard candidates are **onboarding** (deferred to Phase 3+ per [specification.md § Onboarding](specification.md#onboarding-deferred)) and the **compile preset editor** (UI pattern flagged as open in [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md)).
- **This document is for the later pass**, when DB actually reaches for a wizard shape. The CR patterns are context for that design pass, not a commitment that DB must track CR one-for-one.
- **Fresh eyes intended.** Wizards in DB might adopt CR's patterns, reshape them for the writing-workflow context, or take a different approach entirely (a settings-style single pane for compile presets, for instance). Those decisions belong to the implementation task, not to this document.

**Related docs.**

- [specification.md § Onboarding](specification.md#onboarding-deferred): the nearest wizard candidate; Phase 3+.
- [D-06 — Compile preset storage and content rules](decisions/D-06-compile-preset-storage-and-content-rules.md): flags the preset-editor UI shape (single-pane vs. wizard vs. inline tab) as an open question.
- [ui-reference.md § 2 Modal patterns](ui-reference.md#2-modal-patterns): breadth-first CR UI/UX patterns, including brief mentions of the wizard patterns captured in depth here.
- [control-center-reference.md](control-center-reference.md): companion depth-first reference for the Control Center modal.

---

## Role and design intent

A wizard is a sequenced data-collection modal that walks a user through a multi-step operation with branching or validation gates. Used when:

- The full task exceeds what can be fit into a single-form modal without overwhelming the user
- Step ordering matters (later choices depend on earlier ones)
- Any step's validity depends on earlier step's data (e.g., "preview" needs "file parsed")
- The operation has meaningful cost and premature submission would be bad (imports, bulk data creation)

**Not for:** simple create/edit flows that fit in one form. Those belong in single-form modals (`create-person-modal.ts`, `create-place-modal.ts`) — wizards are a bigger commitment.

Charted Roots has ~12 wizard modals covering imports, exports, tree generation, reports, family creation, universe creation, map creation, cleanup, merge, split, etc. They share a consistent shape but vary in complexity.

## Two representative wizards

### Linear wizard — Import Data

`src/ui/import-wizard-modal.ts` (~1976 lines)

- 7 steps: Format → File → Options → Preview → Import → Numbering → Complete
- Each step must complete before the next becomes reachable
- No branching; no state persistence (user expected to finish in one session)
- Data flows strictly forward; back button re-enters earlier steps without resetting

### Branching wizard — Create Family

`src/ui/family-creation-wizard.ts` (~1937 lines)

- 7 logical states: start → step1 → step2 → step3 → step4 → step5 → complete
- Start step branches into "from scratch" or "around existing person" mode, which alters later step behavior
- Full state persistence — users can close the modal mid-flow and resume later
- Optional skip flow on some steps ("skip spouses for now")

Together they demonstrate most of the wizard-pattern surface area.

## Container shape

All wizards extend Obsidian's `Modal` class. No shared base class — each wizard is its own subclass. The patterns are conventional rather than enforced by inheritance. (A `WizardModal` abstract base could be extracted; it hasn't been because wizards vary enough in shape that a shared base would constrain more than it helps.)

**Shell structure** (consistent across wizards):

```
crc-{wizard-name}-modal   (root modal class)
└── contentEl
    ├── Header              ← title + icon
    ├── Step indicator      ← horizontal progress dots with connectors
    ├── Resume banner       ← (optional, only if persisted state exists)
    ├── Content container   ← current step's form
    └── Footer              ← Back | Skip | Next/Primary-Action
```

Header, step indicator, and footer are re-rendered each step; only the content container changes semantically between steps.

## Step model

**State shape:** each wizard tracks its current position via a `currentStep` field.

- **Linear wizards** use `number` (0-indexed). See `import-wizard-modal.ts:152`. Simple to iterate (`currentStep++`, `currentStep--`).
- **Branching / named-state wizards** use a string union type. See `family-creation-wizard.ts:33`: `type WizardStep = 'start' | 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'complete'`. Supports branching (e.g., "complete" can be reached from any step via a "Create now" action).

**Dispatcher pattern:** a `renderCurrentStep()` or `render()` method switches on `currentStep` and calls a step-specific render method. See `import-wizard-modal.ts:328-361` and `family-creation-wizard.ts:197-220`.

Each step's render function:

1. Renders header
2. Renders step indicator (with current position highlighted)
3. Renders step-specific content (form fields, preview table, progress bar, etc.)
4. Renders footer with appropriate buttons for that step

State transitions happen inside button handlers — no central state machine. The "Next" button handler increments `currentStep` (or sets it to a specific named state) and calls `renderCurrentStep()`.

## Step indicator (visual progress)

Horizontal row of numbered circles with connectors between them. Three visual states per circle:

- **Upcoming** — gray, shows the step number
- **Active** — accent color, shows the step number, slightly enlarged
- **Completed** — accent color, shows a checkmark icon instead of the number

Connectors mirror the step state: completed → accent color, upcoming → gray.

**Implementation patterns differ slightly between wizards:**

- **Family Creation Wizard** (`renderStepIndicator()` at line 238): defines the step array inline, iterates, sets classes based on comparison with `currentStepNum`.
- **Import Wizard** (`updateStepProgress()` at line 282): same pattern, with one extra detail — only 5 of 7 steps render as circles. Steps 6 (Numbering) and 7 (Complete) are conditional / post-import so they're hidden from the progress row to keep UI compact. The compact progress row focuses on "the part the user is walking through."

**CSS classes:** `.crc-wizard-step-indicator`, `.crc-wizard-step`, `.crc-wizard-step--active`, `.crc-wizard-step--completed`, `.crc-wizard-step-connector`, `.crc-wizard-step-connector--completed`. Styled in `styles/family-wizard.css` and `styles/import-export-wizard.css`.

**Why explicit circles rather than a percentage bar:** users navigate wizards by step, not by percentage. Showing "Step 3 of 5" plus visual completion state is more actionable than "40% complete." Clicking an indicator to jump (when valid) is possible — though Charted Roots currently doesn't wire that up.

## Navigation footer

Three-region layout: left (Back / Cancel), center/spacer, right (Skip / Next / primary action). Reusable `renderFooter()` method takes an options object describing which buttons to show and their handlers.

Family Creation Wizard's `renderFooter()` at `family-creation-wizard.ts:274-317` is the clearer of the two — it accepts:

```ts
{
    onBack?: () => void,
    onNext?: () => void,
    backLabel?: string,
    nextLabel?: string,
    nextDisabled?: boolean,
    showSkip?: boolean,
    onSkip?: () => void,
}
```

Each step calls this with step-specific options. Conventions:

- **First step:** no Back button, Next says "Next" or something context-specific ("Get started")
- **Middle steps:** Back + Next, optionally Skip
- **Final confirmation step:** Back + primary-action label ("Create," "Import," "Generate")
- **In-progress step** (e.g., importing): no buttons, or only a disabled primary button ("Importing...")
- **Complete step:** Done + often a "do it again" option ("Import Another," "Create another family")

**Button CSS:** `.crc-btn` (base), `.crc-btn--primary` (primary action, accent color, `.mod-cta` equivalent), `.crc-btn--secondary` (cancel/back). Primary is always right-most and accent-colored to draw the eye.

**Disabled state:** `.crc-btn--disabled` class + `disabled = true` on the element. Used to gate step progression when requirements aren't met (see validation below).

## Validation — gating step progression

**Pattern:** each wizard has a `canProceedToNextStep()` method that returns a boolean. The Next button's disabled state and click handler both check it.

Example from `import-wizard-modal.ts:1775-1793`:

```ts
if (!this.canProceedToNextStep()) {
    nextBtn.disabled = true;
    nextBtn.addClass('crc-btn--disabled');
}
nextBtn.addEventListener('click', () => {
    if (this.canProceedToNextStep()) {
        this.currentStep++;
        this.renderCurrentStep();
    }
});
```

The `canProceedToNextStep()` method inspects `this.formData` and `this.currentStep`:

- **Step 0** (Format): require `formData.format` to be set
- **Step 1** (File): require file uploaded + parsed
- **Step 2** (Options): always true (all fields have defaults)
- **Step 3** (Preview): always true (user already reviewed)
- **Step 4** (Import): handled asynchronously

**No inline validation messages** in this design. Validation is binary — either the Next button is clickable or it isn't. If the user needs to know why it's disabled, the step's content explains (e.g., "Please select a file to continue" renders above when no file has been picked). The alternative (inline error messages next to each field) would be valid but adds UI noise; binary gating is simpler.

## State management — form data across steps

**Single `formData` object** on the modal instance holds all state across steps. For the Import Wizard, it's `ImportWizardFormData` — a flat-ish object with fields for every step, initialized by `getDefaultFormData()` at `import-wizard-modal.ts:181-241`.

The `getDefaultFormData()` function is the contract — every field starts with a sensible default. Steps mutate it as the user progresses; render functions read from it to pre-populate controls.

**Why a single object rather than per-step state:** steps often reference earlier data (Preview step shows counts from parsed file; Import step uses options from earlier steps). A flat object makes that trivial. Downside: fields from different steps live side by side, which can be confusing for long wizards — but grouping via comments (e.g., `// Step 3` in the default data function) mitigates this.

Family Creation Wizard uses a slightly richer shape — nested objects for `centralPerson`, `spouses[]`, `children[]`, `father`, `mother`, plus a `mode` flag. Still a single state object; just more internal structure.

## State persistence and resume

**Persistent wizards** (Create Family, Create Map, Create Person, Create Note) survive modal close/reopen. Users who accidentally dismiss the modal can resume where they left off.

**Mechanism:** `src/ui/modal-state-persistence.ts` — generic `ModalStatePersistence<T>` class parameterized by modal type.

- Stores serialized form state in plugin settings under a modal-type-specific key (`familyWizardModalState`, `createPersonModalState`, etc.)
- 24-hour expiry (configurable via constructor)
- Save on modal close (if the flow didn't complete); clear on successful completion
- Resume prompt shown on modal open if valid state exists

**Key design choices:**

- **TFile references are stripped before serialization.** Settings are JSON; Obsidian's `TFile` objects aren't serializable. Wizards define a parallel "serializable" shape (e.g., `SerializableWizardState` in `family-creation-wizard.ts`) that replaces `TFile` with file-path strings. On restore, paths resolve back to `TFile` via `app.vault.getAbstractFileByPath()`.
- **Resume is opt-in** — not automatic. On open, the modal shows a resume banner: "You have unsaved progress from X ago. [Discard] [Resume]." Restoring applies only when the user clicks Resume. Discarding wipes the state. This avoids surprising users with old content.
- **Only persist when the state has meaningful content.** A `hasContent()` check at `family-creation-wizard.ts:145` prevents empty-state blobs from being written. If the user opens the modal and immediately closes it, nothing is persisted.
- **Clear on successful completion, not on close.** If the wizard finishes successfully (state reaches 'complete' and user clicks Done), the persisted state is cleared. If they close mid-flow, it persists. Flag-driven via `completedSuccessfully` at `family-creation-wizard.ts:117`.

**Resume banner** — rendered by the shared `renderResumePromptBanner()` helper exported from `modal-state-persistence.ts`. Consistent look across all persistable wizards: "You have unsaved work from {timeAgo}. Resume or discard?" plus two buttons.

**Expiry handling:** stored state includes a `savedAt` timestamp. `getValidState()` checks age and returns `null` if expired, cleaning up automatically.

## Completion state

Wizards typically have a "complete" step that:

- Summarizes what happened — counts of files created/imported/exported, error log link, etc.
- Offers a follow-on action — "Import Another," "Create another family," or a way to jump back to related tabs.
- Provides a Done button that closes the modal and (for persistable wizards) clears persisted state.

**Pattern across wizards:** completion is a regular step with regular render, just with no Back button and a tailored footer. The form data is either reset (for "Import Another") or the modal closes.

**Distinct from progress/in-flight steps.** If the operation takes time (e.g., the actual Import pass at step 4), the wizard renders a progress indicator — spinner, phase label, running counters — as that step's content. Usually handled by a dedicated sub-component or a linked progress modal rather than being inlined in the step renderer.

## Content sections within a step

Common patterns across wizard steps:

- **Section headers** — `<h3>` or a styled div with `.crc-wizard-section-title` class. One per logical subsection.
- **Info callouts** — colored blocks with `.crc-info-callout` for helper text ("Pick a calendar to import events from").
- **Card grids** — for option selection (import format, tree type, etc.). `.crc-import-format-grid` with `.crc-import-format-card` children. Selected card gets `--selected` modifier.
- **Settings rows** — Obsidian's `Setting` API is used within wizards for toggles and dropdowns, same as elsewhere in the plugin.
- **Preview tables** — for operations with bulk results (Import's Preview step, Cleanup's match list). Table + search/filter/sort controls above.
- **Progress sections** — spinner + text + running counts for in-flight operations.

The goal is each step feels focused — one primary action per step, with supporting context. Avoid cramming multiple form concerns into one step.

## CSS conventions

Each major wizard has its own stylesheet:

| File | Wizard |
|---|---|
| `styles/family-wizard.css` | Create Family |
| `styles/import-export-wizard.css` | Import Data, Export Data |
| `styles/report-wizard.css` | Report Wizard |
| `styles/map-wizard.css` | Create Map |
| `styles/cleanup-wizard.css` | Cleanup |
| `styles/universe-wizard.css` | Universe |

**Shared class prefixes:**

- `.crc-wizard-*` — generic wizard patterns (step indicator, step circle, connector)
- `.crc-{wizard-name}-*` — wizard-specific classes (e.g., `.crc-import-wizard`, `.crc-family-wizard-modal`)
- `.crc-btn`, `.crc-btn--primary`, `.crc-btn--secondary` — buttons (shared across modals, not wizard-specific)

**Theming** — uses Obsidian CSS variables throughout (no hardcoded colors). `@media` queries for mobile variants. Same color vocabulary as the rest of the plugin.

## Known patterns and tradeoffs

**1. No shared base class.** Each wizard is a standalone `Modal` subclass. Copies the step-dispatcher / step-indicator / footer pattern by convention rather than inheritance. Pro: each wizard is free to diverge where it needs to (Family Creation Wizard's branching states don't fit a purely linear model; Import Wizard's async import step doesn't fit a simple "user clicks Next" model). Con: more duplicated code; a new wizard starts with copying ~200 lines of skeleton from a sibling wizard.

If your plugin will have ≥3 wizards, consider extracting a `WizardModal<T>` abstract base with the step-indicator and footer rendering, and have subclasses provide an array of step-render functions. Charted Roots hasn't done this but probably should.

**2. Step progress is cosmetic, not interactive.** Users can't click step indicators to jump. Forward progression is via the Next button; back via Back. Clicking ahead would either skip validation gates (problematic) or be a no-op (confusing). The tradeoff: less discoverability (users sometimes want to see what step 5 asks for before filling step 3), simpler mental model.

**3. Async operations live in a step, not a separate modal.** The Import step is step 4 of the Import Wizard. Progress renders inside the content area. Advantage: the wizard owns the whole flow; no modal-over-modal stack. Disadvantage: the wizard must handle "in-progress" state within its existing rendering model, which means async work has to route through step renderers.

**4. Single form-data object with all step fields.** Simpler cross-step referencing but can grow large for complex wizards (Import Wizard's `formData` has ~30 fields). Grouping via comments helps. A more structured alternative (per-step state objects) would scale better for long wizards but complicates cross-step access.

**5. Validation is binary** (Next disabled / enabled). No inline field-level error messages. Works well when requirements are simple ("select a file"); less well when they're compound ("at least one of spouse or child must be specified"). For the latter, the step's content explains the requirement in prose instead of marking the Next button disabled without explanation.

**6. State persistence is opt-in, not default.** Only 4 of ~12 wizards persist state. Rationale: imports (session-only), exports (session-only), cleanup (destructive, shouldn't persist a stale plan), merge (depends on current data) — these don't benefit from resume. Create flows do, because users interrupt them more often.

## Extension model — adding a new step to an existing wizard

1. Extend the step type/array. For linear wizards, increase the step count; for named-state wizards, add a new string to the union type.
2. Add to the step indicator array if the step should show as a dot.
3. Add a `renderStepX()` method with the step's content.
4. Add a case to the dispatcher (`renderCurrentStep()` or `render()` switch).
5. Add form data fields to `getDefaultFormData()` (or equivalent) with defaults.
6. Update `canProceedToNextStep()` to gate progression based on the new step's requirements.
7. Update footer button labels if the step's primary action isn't "Next" (e.g., "Start Import").
8. Update persisted state shape if the wizard persists — add the new field to `SerializableWizardState` and the restore function.

Boilerplate is real but not huge. A small step (one-option selection) is ~30 lines of render + 5 lines of wiring. A complex step (file parsing, preview) is ~150-300 lines, with most complexity in the step-specific logic rather than the wizard shell.

## File map (all the pieces)

| File | Lines | Role |
|---|---|---|
| `src/ui/import-wizard-modal.ts` | ~1976 | Import Data wizard (linear, 7 steps, no persistence) |
| `src/ui/family-creation-wizard.ts` | ~1937 | Create Family wizard (branching, 7 named states, resumable) |
| `src/reports/ui/report-wizard-modal.ts` | ~3098 | Report Wizard (linear, many report-type variations) |
| `src/trees/ui/unified-tree-wizard-modal.ts` | ~2266 | Tree Generation wizard |
| `src/ui/export-wizard-modal.ts` | — | Export wizard |
| `src/ui/cleanup-wizard-modal.ts` | — | Cleanup wizard |
| `src/ui/create-map-wizard-modal.ts` | — | Create Map wizard (resumable) |
| `src/ui/split-wizard-modal.ts` | — | Split (note splitting) wizard |
| `src/ui/merge-wizard-modal.ts` | — | Merge wizard |
| `src/ui/modal-state-persistence.ts` | ~150 | Generic state-persistence helper (used by resumable wizards) |
| `src/universes/ui/universe-wizard.ts` | — | Universe creation wizard |
| `styles/family-wizard.css`, `styles/import-export-wizard.css`, etc. | — | Per-wizard styles |

## Pattern to adopt for Draft Bench (reference, not prescription)

If a future DB wizard tracks CR's model closely, the **minimum viable kernel** to adopt would be:

- Modal subclass with `currentStep` field (number or string union)
- `formData` object with all cross-step state
- Step-dispatcher switch in a `renderCurrentStep()` method
- Shared step-indicator render function (5-step horizontal dots)
- Shared footer render function with Back/Skip/Next/Primary-Action options
- `canProceedToNextStep()` validation method
- Header + step indicator + content area + footer as the repeatable shell

**Add as you grow:**

- Resume / state persistence (via a generic helper like `ModalStatePersistence<T>`) — needed when users interrupt flows often
- Branching / named-state model — needed when step order depends on user choices
- Async in-flight steps with progress indicators — needed when operations take time
- Preview-before-execute patterns — needed when the operation is expensive or destructive
- Shared abstract base class — worth extracting once you have 3+ wizards; the boilerplate is real

**Don't start with the abstract base class.** Build the first two wizards concretely, then extract the patterns when you see them repeat. Premature abstraction will over-constrain what each wizard can be.

**Again: whether DB follows this model, reshapes it, or takes a different approach is a future design call.** The kernel above is worth noting because it's what CR distilled to across ~12 wizards; it's not a commitment for DB.

## DB commitments for later design

The points below are specific DB decisions (not speculative adoption) that shape how wizards will evolve. Captured here so they survive session ends; none are implemented in Phase 1 or Phase 2.

### Build the first wizards concretely; don't abstract until 3+ exist

The CR summary cautions against premature abstraction: "Don't start with the abstract base class. Build the first two wizards concretely, then extract the patterns when you see them repeat." DB adopts the same discipline. The first wizard (likely onboarding in Phase 3, or the compile preset editor if D-06 resolves toward a wizard shape) is built standalone. A shared `WizardModal` base class is an option to consider when DB has its third wizard, not sooner. Until then, each wizard owns its own step-dispatcher, step-indicator, and footer rendering — duplicated by copy-paste rather than by inheritance.

**Why:** wizards in DB will differ in shape (an onboarding walkthrough has very different validation needs from a compile preset editor). Locking to an abstract base before we know what patterns actually repeat would over-constrain the second wizard to match the first.

### State persistence is per-wizard opt-in, not default

CR persists 4 of ~12 wizards. DB adopts the same opt-in model: each wizard explicitly decides whether to persist state based on the flow's characteristics.

**Heuristic:** persist when the user is likely to be interrupted mid-flow and the data is expensive to re-enter (onboarding walkthrough, compile preset editor). Don't persist when the data is ephemeral or depends on current vault state (bulk retrofit, repair-project-links-style previews).

**When a wizard does persist**, adopt CR's `ModalStatePersistence<T>` pattern as documented above: 24-hour default expiry, TFile-references stripped before serialization (replaced by path strings, resolved back on restore), opt-in resume via a banner, clear on successful completion. Deviation from these defaults requires an explicit reason.

### No interactive step-indicator jumping in V1

CR's step indicators are cosmetic (show progress, not clickable). DB matches this for V1 wizards. Allowing users to jump arbitrarily to a future step bypasses validation gates; allowing jumps to past steps is fine in principle but raises questions about whether visiting a past step "resets" later state. Both are resolvable but not a V1 concern. Decision: ship V1 wizards with non-interactive indicators; revisit if writer feedback asks for it.
