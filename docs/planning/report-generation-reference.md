# Reports — Reference Architecture

Reference for porting a structured-reports feature (Charted Roots) to Draft Bench or other sibling Obsidian plugins. Distills the patterns that matter for a generate-from-vault-data-to-configurable-output system and gives effort estimates for a smaller port.

---

## What the feature is

A suite of report generators that pull data from the vault's structured notes, produce markdown output, and optionally render that markdown to PDF or ODT via bundled converters. Each report type is self-contained, type-safe, and fed through a wizard UI that adapts its configuration surface to the selected type.

Key characteristics:

- **23 report types in 6 categories** (genealogical, research, timeline, geographic, summary, visual tree).
- **Markdown-first:** all non-visual reports produce a markdown string; PDF and ODT render from that string. Keeps output inspectable, vault-savable, and easy to debug.
- **Dispatcher + generators:** one service routes by type; each type is a standalone class with `(app, settings) → options → result`.
- **Metadata-driven UI:** a single `REPORT_METADATA` registry feeds the wizard's display and form generation.
- **Per-report options typed as discriminated unions:** each report's config is a distinct interface, making invalid combinations a compile-time error.

---

## Total size snapshot (CR)

- `src/reports/` — **~11,387 LOC** across 29 files.
- Bundled fonts (pdfmake VFS) — Roboto + DejaVuSansMono.
- No templates, no user-customizable output skins.
- No unit tests committed (the test gate exists for relationship / migration code; reports are tested via manual + integration).

---

## File layout

```
src/reports/
  types/
    report-types.ts               ~1,261 LOC   Type defs, enums, REPORT_METADATA registry
  services/
    report-generation-service.ts  ~320 LOC     Main dispatcher + save/download
    pdf-report-renderer.ts        ~2,868 LOC   Markdown → PDF via pdfmake
    odt-generator.ts              ~693 LOC     Markdown → ODT via JSZip
  generators/
    [18 generator files]          ~200–970 LOC each    One class per report type
  utils/
    report-utils.ts               ~37 LOC      PersonNode → ReportPerson mapper
    footnote-parser.ts            ~109 LOC     Extracts [^1] markers for PDF footnote section
  fonts/
    vfs_fonts_all.ts              ~18 LOC      Base64-bundled font dictionary
    vfs_fonts_mono.ts             ~12 LOC      Monospace fallback
  ui/
    report-wizard-modal.ts        ~3,098 LOC   4-step wizard: select → format → customize → generate
    report-generator-modal.ts     ~1,954 LOC   Legacy single-report modal; still used in some paths
  index.ts                        ~42 LOC      Barrel exports
```

---

## Core patterns

### Generator class shape

Every generator follows the same shape. No base class, no abstract inheritance — just a consistent constructor + single async method:

```ts
export class FamilyGroupSheetGenerator {
  constructor(
    private app: App,
    private settings: PluginSettings
  ) {}

  async generate(options: FamilyGroupSheetOptions): Promise<FamilyGroupSheetResult> {
    // Pull data from services (FamilyGraphService, SourceService, etc.)
    // Build markdown string via direct string concatenation
    // Compute stats for result
    return { success: true, content: markdown, stats, ... };
  }
}
```

This is deliberately simple — composition over inheritance. A new report type is a new class, new options interface, new result interface, and a new case in the dispatcher. No base-class contract to satisfy.

### Dispatcher pattern

`ReportGenerationService` instantiates all generators up front and routes via a switch on the `ReportType` string:

```ts
async generateReport(type: ReportType, options: ReportOptions): Promise<ReportResult> {
  switch (type) {
    case 'family-group-sheet':
      return this.familyGroupSheetGenerator.generate(options as FamilyGroupSheetOptions);
    case 'ahnentafel':
      return this.ahnentafelGenerator.generate(options as AhnentafelOptions);
    // ... 20+ cases
  }
}
```

Up-front instantiation costs ~0 since generators are stateless. The switch is verbose but type-safe — each cast to the specific options type is checked.

### Metadata registry for UI

The single most portable piece. One `Record<ReportType, ReportMetadata>` drives the wizard's category grid, subject picker, filename defaults, and help text:

```ts
export const REPORT_METADATA: Record<ReportType, ReportMetadata> = {
  'family-group-sheet': {
    type: 'family-group-sheet',
    name: 'Family group sheet',
    description: 'Couple with spouse(s), children, vitals, and sources',
    icon: 'users',
    category: 'genealogical',
    requiresPerson: true,
    entityType: 'person'
  },
  'timeline-report': {
    type: 'timeline-report',
    name: 'Timeline',
    description: 'Chronological events with grouping and filters',
    icon: 'calendar',
    category: 'timeline',
    requiresPerson: false,
    entityType: 'optional'  // can be vault-wide or person-scoped
  },
  // ... one entry per type
};
```

Add a new report → add one entry here → the wizard picks it up automatically. This is where most of the port value lives.

### Report wizard architecture

4-step modal with form state persisted across steps:

- **Step 1 (Select):** category grid → report type → subject picker (driven by `entityType` in metadata).
- **Step 2 (Format):** radio buttons for output method (vault / download / pdf / odt).
- **Step 3 (Customize):** per-report options form, dynamically rendered based on the selected type's options interface.
- **Step 4 (Generate):** filename review + generate button with progress indicator.

The dynamic form in step 3 is the most complex part. CR hardcodes per-type form sections (not metadata-driven) because options schemas vary so widely (e.g., timeline has 8 format variants and 5 grouping modes; gaps has 4 field-check booleans plus research-level filtering). For a port with fewer report types, a metadata-driven dynamic form is viable and would be cleaner.

### Markdown → PDF pipeline

CR uses **pdfmake** with Virtual File System (VFS) font bundling. The flow:

```
Report.generate() → markdown string
  → PdfReportRenderer.renderToPdf(markdown, options)
    → parse footnotes via footnote-parser.ts
    → build pdfmake document definition (JSON tree)
    → pdfMake.createPdf(doc).getBlob(cb)
      → PDF Blob
```

Key decisions:

- **pdfmake over jsPDF** for text-heavy reports (pdfmake has real table / flow layout; jsPDF is fine for image-based exports).
- **Lazy-loaded pdfmake and fonts.** `ensurePdfMake()` dynamic-imports on first PDF export so the initial bundle stays small.
- **Bundled Roboto + DejaVuSansMono** as base64 VFS. No CDN fetch, no font loading UX. Works offline. Trade-off: ~1MB bundled cost.
- **Manual markdown → pdfmake.** Not using a library; footnote parser handles `[^n]` markers, and table blocks are re-parsed by the renderer. This keeps the rendering pipeline fully controlled but is the biggest LOC contributor (2,868 LOC in the renderer alone).

### ODT pipeline (lighter-weight)

- Uses **JSZip** (already a CR dependency).
- Builds mimetype + manifest + styles.xml + content.xml in a zip archive.
- Markdown → ODT XML is a targeted subset: headings, bold/italic, lists, tables, images.
- No font bundling — ODT uses system fonts.

---

## Integration points

Reports depend on most other plugin services:

| Service | Used by | Purpose |
|---|---|---|
| Family graph / relationship graph | Person-scoped reports | Walk ancestors, descendants, collect family |
| Event service | Timeline, Place Summary | Fetch + filter events by date / type |
| Source service | Source Summary, Sources by Role, Bibliography | Get sources, quality, classification |
| Place graph | Place Summary, geo filters | Hierarchy, coordinates |
| Universe / collection service | Scope filters | Universe-bounded reports |
| Media service | Media Inventory | Vault file scan, orphan detection |

No dedicated "data loader layer" between reports and these services. Each generator calls services directly. Works at CR's scale because services are cheap; a larger system might want a coordinator to cache results across reports in a single run.

---

## What's worth porting intact

1. **Generator class shape.** `constructor(app, settings) + async generate(options): Promise<result>`. Clean, type-safe, no framework overhead.
2. **`REPORT_METADATA` registry.** The single most reusable piece. Feeds UI, dispatcher validation, and dynamic forms.
3. **Dispatcher switch pattern.** Verbose but type-safe. Avoid premature abstraction into a base class.
4. **Markdown-first output.** Every non-visual report produces markdown. PDF / ODT are optional secondary renderers over the same string. Makes debugging trivial — save the markdown to the vault and inspect.
5. **Lazy-loaded pdfmake + VFS fonts.** Dynamic-import on first use keeps the initial bundle small. Bundle the fonts rather than CDN-fetching them; the ~1MB cost is worth the offline guarantee.
6. **Footnote parser.** Standalone utility (~109 LOC). Pure function. Copy-paste if you emit `[^1]` in markdown.
7. **4-step wizard shape.** Select → Format → Customize → Generate is a natural flow for report config. Simpler than trying to squeeze everything into one screen.

---

## What to skip or simplify for Draft Bench

- **The 23 genealogy-specific report types.** Draft Bench's report set will differ entirely. Pick 3–5 report types relevant to your domain and build from there.
- **ODT generator.** Nice-to-have, but PDF covers 95% of use cases. Skip unless users explicitly ask. Saves ~700 LOC.
- **Visual tree PDF pipeline.** CR uses a `VisualTreeSvgRenderer` to produce SVG, then embeds it in the PDF. If Draft Bench doesn't have tree-like visualizations, skip entirely.
- **Canvas / Excalidraw exports.** CR exports timelines to `.canvas` and `.excalidraw`. Very CR-specific; probably not applicable.
- **REPORT_METADATA categories.** CR has 6 categories (genealogical, research, timeline, etc.). For 3–5 report types, a flat list is fine — no category grouping.
- **Two-level wizard and legacy modal.** CR maintains both a modern wizard and the older single-report modal. Start with one; don't introduce tech debt on day one.
- **Dynamic per-report form sections in step 3.** For a small report set, hand-write each report's form. When you hit 8+ types, refactor to metadata-driven fields.

---

## LOC estimate for Draft Bench (3–5 report types, PDF only, no ODT / visual trees)

| Component | Estimate |
|---|---|
| `report-types.ts` (types + metadata registry) | ~200 LOC |
| `report-generation-service.ts` (dispatcher) | ~150 LOC |
| `pdf-report-renderer.ts` (simplified — no footnote parser or tree renderer) | ~800 LOC |
| 5 generators × ~250 LOC each | ~1,250 LOC |
| Wizard modal (4 steps, simpler forms) | ~1,000 LOC |
| Bundled fonts (pdfmake VFS) | ~15 LOC |
| **Total** | **~3,400 LOC** |

That's **~30% the size of CR's report system.** Porting effort: one engineer, ~3–5 weeks for MVP (3 report types + wizard + PDF output), assuming the data-gathering services already exist.

---

## Things that are CR-specific and not worth copying

- Ahnentafel / Sosa-Stradonitz numbering, NGSQ descendant numbering — genealogy-specific conventions.
- Gaps report's research-level (0–6) histogram — CR's specific research-methodology model.
- Sources-by-role report — depends on CR's role-on-source schema (#274).
- Kinship report — requires the degree-of-relationship calculator.
- Mills-aligned source classification — Evidence Explained framework specific to genealogy.
- Brick-wall report logic — depends on CR's ancestor-termination semantics.

---

## Planning + developer docs to produce alongside

- **Per-report spec docs** before coding each type. Define: input (scope + filters), output (markdown shape), options, edge cases. Write as short planning doc checked into `docs/planning/`.
- **REPORT_METADATA as the source of truth.** If you find yourself maintaining two parallel lists of report types, the metadata registry is wrong — fix it before adding more types.
- **Wizard UI walk-through** for maintainers. 4-step modals are intricate; a sequence diagram or state chart pays off when debugging form state persistence.

---

## Draft Bench adaptation

Draft Bench has no Reports feature. The rendering-layer patterns in this doc (markdown-first output, pdfmake+VFS fonts, ODT via JSZip, footnote parser, generator class shape) apply to Draft Bench's single compile pipeline; the dispatcher / metadata-registry patterns for N report types do not.

**What Draft Bench ports intact:**

- **Generator class shape.** `constructor(app, settings) + async generate(options): Promise<result>`, stateless, composition over inheritance. Maps to a single `CompileService.generate(preset): Promise<CompileResult>` entry point.
- **Markdown-first output.** The compile pipeline produces a markdown string; PDF, ODT, and vault-MD are renderers over that string. D-06's content-handling rules run once in the MD-synthesis step rather than per-format.
- **pdfmake with lazy-loaded VFS fonts.** Bundled Roboto + DejaVuSansMono base64 VFS, dynamic-imported on first PDF export. Already committed in [specification.md § Compile / Book Builder](specification.md).
- **ODT via JSZip.** The ~693 LOC pattern (mimetype + manifest + styles.xml + content.xml subset, system fonts, no bundling) is the answer to "how does Draft Bench render ODT." Draft Bench commits ODT in V1 (see [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md)).
- **Footnote parser.** The ~109 LOC standalone utility supports D-06's "auto-renumber footnotes across concatenated scenes" content-handling rule. Near-verbatim copy.

**What Draft Bench skips or simplifies:**

- **No `REPORT_METADATA` registry.** Draft Bench has one compile shape, not N report types. Preset configuration is parameterized per-preset, not per-type.
- **No dispatcher switch.** Single entry point; no N-way routing on a type discriminator.
- **No visual tree PDF pipeline, no SVG-to-PNG.**
- **No canvas / Excalidraw exports.**

**Architectural divergence to note:** In CR, Book Builder's renderer delegates per-chapter markdown conversion to the Reports system's `PdfReportRenderer` / `OdtGenerator`. Draft Bench has no Reports substrate, so the rendering code co-locates inside the compile service. If a post-V1 Reports feature ever lands (per-scene stats, character summaries, compile-diff reports, etc.), the rendering layer should be extracted to a shared module at that time, not pre-factored now.

**Related docs:**

- [book-builder-reference.md](book-builder-reference.md) — the orchestration layer that sits over this rendering layer.
- [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md) — Draft Bench's synthesis doc for preset storage format, content-handling rules, and ODT scope.
- [specification.md § Compile / Book Builder](specification.md) — user-facing feature spec.
