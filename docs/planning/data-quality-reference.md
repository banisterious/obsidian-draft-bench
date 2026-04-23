# Data Quality — Reference Architecture

Reference for porting data-quality tooling (Charted Roots) to Draft Bench or other sibling Obsidian plugins. Covers the tools users have to identify, audit, and correct inconsistencies in their vault notes — plus the infrastructure for evolving the data schema over time.

---

## What the feature is

A multi-layered system that treats the vault as a database and provides increasing-intensity tools for keeping it clean:

1. **Analysis** — a service that walks the vault, detects issues by category, and produces a scored report.
2. **Interactive tab** — a Control Center surface that shows issues grouped and actionable, with preview-before-apply batch operations.
3. **Cleanup Wizard** — a guided 14-step workflow for post-import or periodic cleanup, covering normalization (dates, genders, formats) and schema migrations (legacy structures → current structures).
4. **Migration services** — self-contained, idempotent transformations for specific legacy-to-current schema evolutions.
5. **Migration notice view** — proactive banner shown on plugin upgrade to surface pending migrations.
6. **Schema validation** — a separate but related subsystem for enforcing user-defined schemas on notes.

The through-line: every operation has a **detect phase** (read-only analysis), a **preview phase** (show what would change), and an **apply phase** (commit changes). Users always see the diff before it lands on disk.

---

## Total size snapshot (CR)

- Analysis service — **~3,000 LOC** (one file).
- UI: tab + wizard + batch ops + preview modals — **~9,400 LOC** across 6 files.
- Schema validation subsystem — **~1,350 LOC** across 2 files.
- Migration services — **~1,500 LOC** across 4 files (plus migration logic inline in the analysis service).
- Migration notice view — modest.
- Planning docs under `docs/planning/archive/` — six separate planning docs, signal for how much design went into this.

**Total: ~20,000+ LOC.** A Draft Bench port with fewer issue categories and simpler migrations could land closer to **~5,000 LOC**.

---

## File layout

```
src/core/
  data-quality.ts                         ~3,012 LOC    Main analysis engine + fix methods
src/ui/
  cleanup-wizard-modal.ts                 ~3,849 LOC    14-step wizard orchestrator
  cleanup-wizard-types.ts                 ~389 LOC      Step definitions + wizard state types
  data-quality-tab.ts                     ~1,827 LOC    Control Center tab with issue lists + action buttons
  data-quality-batch-ops.ts               ~1,522 LOC    Individual batch operations exposed outside wizard
  data-quality-modals.ts                  ~2,178 LOC    9 preview-modal classes (one per batch op)
  data-quality-view.ts                    ~153 LOC      Read-only quality report view
  views/
    migration-notice-view.ts              (modest)       Proactive migration banner on upgrade
src/schemas/
  types/schema-types.ts                                   Schema definitions
  services/schema-service.ts              ~440 LOC       Schema CRUD + targeting
  services/validation-service.ts          ~905 LOC       Validate notes against schemas
src/core/migrations/ (conceptually — files scattered):
  src/sources/services/source-migration-service.ts              ~289 LOC
  src/sources/services/sourced-facts-migration-service.ts       ~317 LOC
  src/events/services/life-events-migration-service.ts          ~544 LOC
  src/events/services/event-person-migration-service.ts         ~354 LOC
```

---

## Analysis service

The single entry point for "tell me what's wrong with this vault." ~3,000 LOC but with a small, consistent surface:

```ts
export class DataQualityService {
  constructor(private plugin: Plugin) {}

  // Read-only analysis
  analyze(options?: DataQualityOptions): DataQualityReport;

  // Detection-only (for preview modals)
  detectBidirectionalInconsistencies(): BidirectionalInconsistency[];
  detectOrphanReferences(): OrphanReference[];
  detectNestedProperties(): NestedPropertyIssue[];
  detectDateIssues(): DateIssue[];
  // ... one detect method per batch op

  // Apply (mutate vault)
  async normalizeDateFormats(options): Promise<BatchResult>;
  async normalizeGenderValues(options): Promise<BatchResult>;
  async clearOrphanReferences(options): Promise<BatchResult>;
  async flattenNestedProperties(options): Promise<BatchResult>;
  async repairMissingIds(options): Promise<BatchResult>;
  async fixBidirectionalInconsistencies(options): Promise<BatchResult>;
}
```

### Issue taxonomy

Every issue fits into one of ~8 categories, with severity:

```ts
type IssueCategory =
  | 'date_inconsistency'           // Birth/death ordering, unreasonable age
  | 'relationship_inconsistency'   // Circular refs, missing IDs, wikilink mismatches
  | 'missing_data'                 // No parents, no dates, no gender
  | 'data_format'                  // Non-ISO dates, invalid enum values
  | 'orphan_reference'             // Links to non-existent notes
  | 'nested_property'              // YAML objects instead of flat properties
  | 'legacy_type_property'         // Legacy schema
  | 'legacy_membership';           // Deprecated property

type IssueSeverity = 'error' | 'warning' | 'info';

interface DataQualityIssue {
  code: string;                    // e.g., 'DEATH_BEFORE_BIRTH'
  message: string;                 // Human-readable
  severity: IssueSeverity;
  category: IssueCategory;
  person: PersonNode;              // Affected entity (generic shape for port)
  relatedPerson?: PersonNode;      // If the issue is relational
  details?: Record<string, string | number | boolean>;
}
```

Key choices worth porting:

- **Severity is discrete, not graded.** Three levels is enough; more creates triage paralysis.
- **Category is a string enum, not a nested taxonomy.** Flat keeps filtering simple.
- **Every issue carries a `code`.** Uppercase SNAKE_CASE. Lets UI refer to specific issues without parsing the message string, and lets planning docs point at exact issue types.
- **Every issue carries the full affected entity, not just an ID.** Simplifies rendering in the UI — no second lookup needed.

### Quality score

A single 0–100 number computed from issue counts, normalized by entity count:

```ts
function calculateScore(totalEntities: number, issues: DataQualityIssue[]): number {
  if (totalEntities === 0) return 100;
  const penalty =
    issues.filter(i => i.severity === 'error').length * 10 +
    issues.filter(i => i.severity === 'warning').length * 3 +
    issues.filter(i => i.severity === 'info').length * 1;
  const scaledPenalty = (penalty / totalEntities) * 10;
  return Math.max(0, Math.min(100, Math.round(100 - scaledPenalty)));
}
```

Scaling by entity count matters — a vault of 10 people with 5 errors shouldn't score the same as a vault of 10,000 people with 5 errors. The UI adds color thresholds (green ≥80, yellow 50–79, red <50), which users parse faster than the raw number.

### Completeness metrics

Beyond issues, the report includes a completeness summary:

```ts
interface DataQualitySummary {
  totalEntities: number;
  totalIssues: number;
  bySeverity: { error: number; warning: number; info: number };
  byCategory: Record<IssueCategory, number>;
  completeness: {
    withName: number;
    withBirthDate: number;
    withDeathDate: number;
    withBothParents: number;
    // ... domain-specific fields
  };
}
```

Completeness is distinct from issues: a person without a birth date is "incomplete" but not "broken." Surfacing both gives users a richer picture than just "how many errors."

---

## Control Center Data Quality tab

Interactive surface for reviewing and fixing issues one category at a time.

Structure (top to bottom):

- **Vault-wide summary card** — quality score, total issues, completeness percentages.
- **Issue filter tabs** — All / Errors / Warnings / Info.
- **Issue list** — grouped by person or by category (user-toggleable).
- **Action buttons** — one per batch operation. Clicking opens a preview modal.
- **Research gaps section** — domain-specific in CR (missing birth dates, missing sources, etc.); a port would include equivalent sections for its domain.

Action buttons all follow the same pattern:

```ts
button.onClick(() => {
  // 1. Detect: scan vault, compute diff
  const changes = service.detectXxxIssues();
  if (changes.length === 0) {
    new Notice('No issues found');
    return;
  }
  // 2. Preview: show modal with old → new diff
  new XxxPreviewModal(app, changes, async (confirmedChanges) => {
    // 3. Apply: commit changes on confirmation
    const result = await service.fixXxxIssues(confirmedChanges);
    new Notice(`Fixed ${result.fixedCount} issues`);
  }).open();
});
```

**Why this shape matters:** the detect / preview / apply split is what makes batch operations safe. Users always see what will change before it changes. The preview modal can show hundreds of diffs; apply is one click. Users trust the system because the system never surprises them.

---

## Cleanup Wizard

A guided workflow that strings together the batch operations in a dependency-aware sequence. ~3,849 LOC because it orchestrates 14 heterogeneous steps and persists state across sessions.

### Step list

Each step has a type, a service it delegates to, and optional dependencies on earlier steps:

```ts
interface WizardStep {
  id: string;
  number: number;                 // 1..14 display order
  title: string;
  description: string;
  type: 'review' | 'batch' | 'interactive';
  service: string;                // Which service handles this step
  detectMethod: string;           // Method name on the service
  dependencies: string[];         // Step IDs that must complete first
}
```

Types:

- **`review`** — read-only. Shows info, doesn't mutate (e.g., Step 1 Quality Report).
- **`batch`** — detect all, preview all, apply all at once.
- **`interactive`** — detect all, user approves each one individually (used for fuzzy operations like place-variant unification where auto-decisions aren't safe).

### State persistence

Wizard state survives Obsidian restarts and session breaks:

```ts
interface CleanupWizardState {
  currentStep: number;
  steps: Record<number, {
    status: 'pending' | 'in_progress' | 'complete' | 'skipped';
    issueCount?: number;
    fixCount?: number;
    skippedReason?: string;
  }>;
  startTime: number;
  isPreScanning: boolean;
  preScanComplete: boolean;
}
```

Persisted to plugin settings. Expiry: 24 hours (if the user abandoned the wizard a day ago, start fresh). Methods: `saveState()`, `loadState()`, `restoreFromPersistedState()`.

**Why 24-hour expiry:** long-running wizards are a debugging hazard. If a user saw step 5's preview three days ago, the vault has probably changed since — replaying the "next step" assumes still-valid state. A fresh start is safer.

### Preview-before-apply inside the wizard

Every batch step renders a preview panel before "Apply." Standard pattern:

- Detect runs automatically on step entry.
- Preview shows the diff (old → new) in a scrollable table with search / filter / sort.
- "Apply" button commits; status moves to "complete."
- "Skip" button marks the step skipped with an optional reason.

Apply does not offer undo. Changes are committed to disk immediately via `processFrontMatter` or file rewrites. If a user regrets an action, it's a git-or-vault-backup recovery.

---

## Migration services

Schema evolution pattern. Each service handles one migration from a legacy format to a current format.

All four current migrations follow the same shape:

```ts
export class XxxMigrationService {
  constructor(private app: App, private settings: PluginSettings) {}

  // Detect: scan vault for entities using legacy format
  detect(): LegacyNote[];

  // Preview: show what migrating would produce
  preview(notes: LegacyNote[]): MigrationPreview[];

  // Apply: commit migrations
  async migrate(
    notes: LegacyNote[],
    onProgress?: (current: number, total: number, currentFile?: string) => void
  ): Promise<MigrationResult>;

  // Quick check: does the vault have any legacy format?
  hasLegacyFormat(): boolean;
}
```

### Idempotency as a first-class concern

Every migration must be safe to re-run. Common patterns:

- **Check for target format before migrating.** If a note is already in the current format, skip it.
- **Scan existing target artifacts before creating new ones.** Life Events Migration scans for existing event notes matching `(persons, event_type, date)` and reuses them; only creates a new note if no match.
- **Report reuse counts.** Post-migration notice says "Created 3, reused 5" so users understand a re-run didn't duplicate work.
- **Strict matching.** `"1850"` and `"1850-01-01"` are different identities. Don't silently merge refinements; surface them as new notes.

Re-runnability enables two important workflows:

1. **Partial-run recovery.** If a migration errors midway, re-running skips the already-migrated entries.
2. **Incremental adoption.** Users can run a migration, review, and re-run after adding more legacy-format notes.

### Current migration set

| Service | Transforms | Trigger |
|---|---|---|
| Source Array | `source_2`, `source_3` → `sources: [...]` | Old multi-source notes |
| Sourced Facts | Nested `sourced_facts: {...}` → flat `sourced_fact`, `sourced_date` | Nested-property cleanup |
| Life Events | Inline `events: [{...}]` → separate event note files | Event-note architecture transition |
| Event Persons | `person: [[X]]` (singular) → `persons: [[[X]]]` (array) | Multi-person event support |

Plus inline migrations in the quality service: legacy type property, normalize children property.

---

## Migration notice view

Proactive banner surfaced on plugin upgrade when the new version expects a migrated schema. Shown in a distinct view so users don't miss it.

Flow:

1. Plugin loads.
2. Each migration service's `hasLegacyFormat()` runs (fast check — scans metadataCache, doesn't rewrite anything).
3. If any returns `true`, plugin shows a persistent banner with "Open Cleanup Wizard" button.
4. User completes wizard steps for the relevant migrations.
5. On next load, `hasLegacyFormat()` returns `false` for all, banner doesn't show.

**Shape of the banner:**

```
⚠ Migrations available
Your vault has notes using an older format. The Cleanup Wizard
can migrate them safely. [Open Cleanup Wizard] [Dismiss for now]
```

Dismiss stores a per-migration flag; banner only re-appears if new legacy-format notes are added.

---

## Schema validation (separate but related)

Optional subsystem for enforcing user-defined schemas on notes. Parallel to data-quality but with different semantics:

- **Data quality** detects objective issues (broken references, impossible dates, duplicate entries).
- **Schema validation** detects subjective issues — user's own schema says "person notes must have `birth_date`," validator reports notes missing it.

Users define schemas; a schema can target all people, a collection, a folder, a universe. Validation runs on-demand (command palette) or in the Cleanup Wizard's Step 1.

Skip schema validation for a Draft Bench v1 port unless users have strong demand. It adds ~1,350 LOC and requires a schema-editing UI to justify. Revisit in v2.

---

## Reports that consume quality data

Three CR reports surface quality metrics directly:

- **Gaps Report** — missing data fields by person, grouped and filtered.
- **Brick Wall Report** — genealogy-specific (ancestors with no parents = research bottlenecks).
- **Media Inventory** — orphaned media files + entities without media.

A port can decide domain-appropriate quality reports. The value pattern is the same: take data-quality output, format it as a navigable report, save to vault. Useful as both an audit tool and a "research this next" prioritization aid.

---

## What's worth porting intact

1. **The three-layer surface hierarchy.** Service (analysis) → Tab (interactive) → Wizard (guided workflow). Each layer has a clear purpose; don't collapse them into one surface. Users hit different layers depending on whether they're browsing, fixing, or onboarding.
2. **Detect / preview / apply triad.** Every batch operation follows this. Users trust the system because the system never surprises them.
3. **Issue taxonomy with category + severity + code.** Discrete enum for category, three-level severity, SNAKE_CASE codes. Ported verbatim to a new domain.
4. **Quality score formula** (severity-weighted penalty, normalized by entity count). Simple, effective, scales.
5. **Completeness separate from issues.** An incomplete entity isn't broken; a broken entity isn't (necessarily) incomplete. Both metrics matter.
6. **Migration service pattern** (`detect / preview / migrate / hasLegacyFormat`). Plus the idempotency discipline. Copy both the shape and the rules.
7. **Migration notice view.** Proactive discovery > hoping users check the Cleanup Wizard. 50 LOC for enormous UX value.
8. **Wizard state persistence with 24-hour expiry.** Right tradeoff for long workflows.
9. **Preview modals as a dedicated family.** One modal class per batch operation, sharing a base class for table + filter + apply. Makes new operations cheap to add.

---

## What to skip or simplify for Draft Bench

- **Schema validation subsystem** for v1. Non-trivial design surface; wait for user demand.
- **Interactive wizard steps** (Place Variants, Bulk Geocode, Place Hierarchy) — CR-specific to genealogy. A port would have 0–1 interactive steps, if any.
- **Research-gaps section in the tab** — CR-specific. Replace with your domain's equivalent "what's missing" surface.
- **The 14-step count.** Port 4–6 steps that make sense for your domain; don't chase the number.
- **Reports consuming quality data** — ship them later. The quality tab itself provides enough visibility on day one.
- **Nested-property flattening.** If the plugin never ships with nested frontmatter, no migration needed. The rule "all frontmatter is flat" is easier to hold than the rule "migrate away from nested."
- **Legacy type / legacy membership migrations** — CR-specific schema history. A fresh port has no legacy to migrate from.

---

## LOC estimate for Draft Bench (core, ~4 issue categories, simpler wizard, no schema validation)

| Component | Estimate |
|---|---|
| `data-quality.ts` (analysis + fix methods) | ~1,200 LOC |
| `data-quality-tab.ts` (Control Center integration) | ~800 LOC |
| `data-quality-batch-ops.ts` | ~600 LOC |
| `data-quality-modals.ts` (3–4 preview modals) | ~900 LOC |
| `cleanup-wizard-modal.ts` (6 steps) | ~1,500 LOC |
| `cleanup-wizard-types.ts` | ~200 LOC |
| Migration services (2 services) | ~600 LOC |
| `migration-notice-view.ts` | ~100 LOC |
| Styles | ~400 LOC |
| **Total** | **~6,300 LOC** |

**~30% the size of CR's data-quality subsystem.** Porting effort: one engineer, ~6–8 weeks for an MVP covering analysis, tab, 4 batch ops, and a 6-step wizard. Reduces further if you skip the wizard entirely and ship just the tab first.

---

## Patterns worth internalizing for any quality-tooling feature

1. **Three surface types for three user states.** Browsers want quick at-a-glance metrics (report / tab summary). Fixers want focused tools per issue type (batch ops). Onboarders want a guided sequence (wizard). Serve each directly; don't force one surface to do all three jobs.
2. **Detect / preview / apply is non-negotiable.** Users need to see what will happen before it happens. No operation should bypass the preview step.
3. **Codes, not messages.** Every issue has a stable identifier. Users bug-report against codes ("DEATH_BEFORE_BIRTH fires incorrectly"); developers map codes to detection logic. Never reference an issue by its rendered message string.
4. **Idempotency or nothing.** Every fix and every migration must be safe to re-run. Build the check into the detect phase — if nothing's wrong, don't show the user a fix button.
5. **Persist wizard state; expire it.** Long workflows need breakpoints. State older than ~24 hours is stale — stale state causes more bugs than missing state.
6. **Migration discoverability beats migration correctness.** A perfect migration no one runs is worse than an imperfect one that's surfaced in a banner. Ship the migration notice.
7. **Quality score is a conversation starter.** The number itself is a rough heuristic; don't chase it. Use it as a "you should probably look at this" prompt, not an SLA.
8. **Batch ops share a preview-modal base class.** Each op has domain-specific diff rendering, but the table / filter / search / apply shell is generic. Extract the base modal early.

---

## Draft Bench adaptation

Data Quality as a unified tab is **out of scope for V1.** Draft Bench already ships the building blocks that would roll up into it (bidirectional integrity scanning, retrofit actions, and a repair UI); a consolidated Control Center surface with a cleanup wizard lands post-V1.

### Related V1 surfaces (already shipped)

- **`DraftBenchIntegrityService`** (`src/core/integrity.ts`). Implements `scanProject` + `applyRepairs` across all three relationship types (scene <-> project, scene <-> draft, project <-> single-scene draft). Issues classified as missing-in-reverse, stale-in-reverse, or wikilink / id-companion conflicts. Auto-repairable vs. manual-review split. Already follows CR's detect / preview / apply triad.
- **Retrofit actions** (`src/core/retrofit.ts`). Five per-file helpers (`setAsProject`, `setAsScene`, `setAsDraft`, `completeEssentials`, `addDbenchId`) plus `applyToFiles` batch helper. Smart folder-based inference on retrofit. Context-menu + palette entry points.
- **Repair project links modal** (`src/ui/modals/repair-project-modal.ts`). Preview -> confirm -> execute -> summary pattern with project picker and grouped issue lists.
- **Statuses management** (`src/core/statuses.ts` + Settings tab). `filesWithStatus` / `countStatusUsage` / `renameStatus` primitives plus bulk-rename-or-remove modal (P2.D).

These surfaces collectively cover the bidirectional-relationship and missing-properties corners of data quality today. They are not unified under a single "Data Quality" heading yet.

### V1 compile touchpoint

[D-06](decisions/D-06-compile-preset-storage-and-content-rules.md) sub-decision 4c locked strict missing-status handling during compile: a scene with empty `dbench-status` is excluded when the preset's status filter is non-empty. This anticipates a future Data Quality tab that would surface "N scenes with missing status" as a fixable pre-compile issue. V1 writers encountering the edge case fix via the Properties panel or retrofit actions today.

### Patterns worth porting when the consolidated surface lands

- **Three-layer surface hierarchy** (service / tab / wizard). DB has the service layer; the Control Center gains a Data Quality tab alongside Templates and Compile; a cleanup wizard lands if/when schema evolutions land.
- **Issue taxonomy with `code` + `severity` + `category`.** DB's existing `IntegrityReport` issues should be codified with stable SNAKE_CASE codes (e.g., `MISSING_IN_REVERSE`, `STALE_IN_REVERSE`, `WIKILINK_ID_MISMATCH`). The current shape is already close; the explicit code field is missing.
- **Detect / preview / apply triad.** Already the shape DB uses for integrity + retrofit + repair-project. Generalize to a documented principle in coding-standards for future batch operations.
- **Migration service pattern** (`detect / preview / migrate / hasLegacyFormat`). DB has no schema migrations yet (pre-1.0 plugin; no legacy formats). Pattern matters when the first schema evolution lands; likely candidates are the post-V1 `chapter` note type introduction paired with UC-02 novelist support, and the post-V1 `dbench-type: media` introduction.
- **Migration notice view** as a proactive banner on plugin upgrade. Critical for discoverability of schema evolutions. ~100 LOC when needed.
- **Wizard state persistence with 24-hour expiry.** Relevant when a cleanup wizard ships; the Phase 3 onboarding wizard may reuse the persistence pattern.

### Patterns to skip or defer

- **Schema validation subsystem.** Non-trivial design surface; DB's writer audience is unlikely to demand user-defined schemas over plugin-defined frontmatter.
- **Quality score.** A single 0-100 number is a conversation starter but doesn't pay its weight for a pre-release plugin. Revisit if a vault-wide quality surface ever ships.
- **Interactive wizard steps.** CR's place-variant / geocode / hierarchy steps are genealogy-specific. DB has no equivalent domain needs.
- **Legacy-format migrations.** No legacy to migrate from (pre-1.0).
- **Gaps / Brick Wall reports.** Domain-specific; DB's equivalent "what's missing" surface is TBD and not a V1 concern.

### V1 forward-compat considerations

- **Codify existing issue types.** Before the Data Quality tab lands, add stable codes to `IntegrityReport` issues. Cheap pre-1.0 edit; saves a refactor when the tab is built.
- **Keep integrity + retrofit services as the source of truth.** A future Data Quality tab should compose over them, not reimplement. Services stay stateless; the tab handles presentation.
- **Preserve the detect / preview / apply shape** in any new batch operation added between now and the Data Quality tab. Consistency across operations is what lets them roll up into the unified surface later.

### Related docs

- [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md) — compile content-handling rules; sub-decision 4c anticipates a future Data Quality surface for missing-status scenes.
- [control-center-reference.md](control-center-reference.md) — CR Control Center architecture; a future Data Quality tab would follow the same tab-dispatch pattern.
- [wizards-reference.md](wizards-reference.md) — wizard patterns for the eventual cleanup wizard (or the Phase 3 onboarding wizard).
