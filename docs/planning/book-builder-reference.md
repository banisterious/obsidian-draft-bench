# Book Builder — Reference Architecture

Reference for porting a multi-stage compilation feature (Charted Roots' Book Builder) to Draft Bench or other sibling Obsidian plugins. Distills the patterns that matter for a gather-compile-render pipeline that bundles many sources into a single published document.

---

## What the feature is

A pipeline that takes an ordered list of chapters — each of which can be a report, a vault note, a visual tree, or a section divider — and assembles them into a single PDF or ODT with cover page, TOC, chapter numbering, bibliography, and name index. Think "print this genealogy work as a book."

Distinct from the Reports system: reports produce *one* markdown output per invocation. Book Builder *orchestrates* many report invocations, interleaves vault notes and images, and assembles the result into a single multi-chapter document with back matter.

Key characteristics:

- **Chapter-type dispatch:** each chapter type (report / vault note / visual tree / section divider) has its own generation path.
- **Intermediate markdown:** chapters produce markdown; the renderer converts to PDF or ODT at assembly time. Same strategy as the Reports system.
- **BookDefinition persistence:** the full book configuration serializes to a JSON file so "regenerate" works without re-opening the wizard.
- **Change detection via content hashing:** per-chapter djb2 hashes let the user see which chapters changed since the last generation.
- **Progress callbacks + partial success:** long compilations report chapter-by-chapter progress and continue even if individual chapters fail.

---

## Total size snapshot (CR)

- `src/book/` — **~3,191 LOC** across 6 files.
- No separate font bundling (reuses the Reports system's pdfmake VFS).
- No tests (feature #294, mature by commit history).

---

## File layout

```
src/book/
  types/
    book-types.ts                   ~172 LOC    BookDefinition, BookChapter, BookMetadata, output options
  services/
    book-generation-service.ts      ~554 LOC    Pipeline orchestrator
    pdf-book-renderer.ts            ~456 LOC    PDF assembly (delegates markdown-to-PDF to reports' PdfReportRenderer)
    odt-book-renderer.ts            ~381 LOC    ODT assembly (delegates markdown-to-ODT to reports' OdtGenerator)
  ui/
    book-builder-modal.ts           ~1,628 LOC  4-step wizard: metadata → chapters → output → generate
  index.ts                          ~29 LOC     Barrel exports
```

Much smaller than Reports because it reuses the Reports system's markdown-to-PDF / markdown-to-ODT conversion machinery. Book Builder is the orchestration and assembly layer; it does not reimplement rendering.

---

## BookDefinition schema

The persistence contract. Saved as `.book.json` in the vault; loaded for regeneration:

```ts
interface BookDefinition {
  version: 1;                        // schema version for future migrations
  metadata: {
    title: string;
    subtitle?: string;
    author?: string;
    date?: string;
    logoDataUrl?: string;            // cover page logo
    coverNotes?: string;
  };
  chapters: BookChapter[];           // ordered list
  outputOptions: {
    format: 'pdf' | 'odt';
    pageSize: 'A4' | 'LETTER';
    fontStyle: 'serif' | 'sans-serif';
    dateFormat: 'mdy' | 'dmy' | 'ymd';
    includeCoverPage: boolean;
    includeToc: boolean;
    includeBibliography: boolean;
    includeNameIndex: boolean;
    chapterNumbering: 'none' | 'numeric' | 'roman';
  };
  lastGeneratedAt?: string;          // ISO timestamp
  lastChapterHashes?: Record<string, string>;  // chapter-id → djb2 hash
}

type BookChapter = {
  id: string;                        // UUID
  type: 'report' | 'visual-tree' | 'vault-note' | 'section-divider';
  title: string;
  config: ReportChapterConfig | VisualTreeChapterConfig | VaultNoteChapterConfig | DividerChapterConfig;
};
```

Port this verbatim (with your domain's chapter types). The `version: 1` field lets you evolve the schema later. The hash field is optional but high-leverage.

---

## Pipeline stages

One sequential pipeline with 6 stages:

```
1. Orchestration    generateBook() iterates chapters
2. Per-chapter      Dispatch by chapter.type → generate markdown
                     (+ embedded image for visual trees)
3. Bibliography     Collect [^n]: footnote definitions across chapters, dedupe
4. Name index       Extract bold names and table-cell patterns, group by letter
5. Assembly         PdfBookRenderer or OdtBookRenderer builds final doc
6. Output           Save to vault or browser download
```

Representative orchestration code:

```ts
async generateBook(definition: BookDefinition, onProgress?: (p: Progress) => void) {
  const chapterResults: ChapterResult[] = [];

  for (let i = 0; i < definition.chapters.length; i++) {
    const chapter = definition.chapters[i];
    onProgress?.({ currentChapter: i + 1, totalChapters: definition.chapters.length, chapterTitle: chapter.title, phase: 'generating' });

    try {
      const result = await this.generateChapter(chapter);
      chapterResults.push(result);
    } catch (err) {
      chapterResults.push({ id: chapter.id, success: false, error: String(err) });
      // continue — partial success is better than nothing
    }
  }

  const bibliography = this.collectBibliography(chapterResults);
  const nameIndex = this.collectNameIndex(chapterResults);

  onProgress?.({ phase: 'rendering' });
  const renderer = definition.outputOptions.format === 'pdf'
    ? new PdfBookRenderer(this.app, this.settings)
    : new OdtBookRenderer(this.app, this.settings);
  const blob = await renderer.renderBook(definition, chapterResults, bibliography, nameIndex);

  return { success: true, blob, failedChapters: chapterResults.filter(r => !r.success) };
}
```

Chapters generate sequentially. They *could* parallelize (no inter-chapter dependencies) but CR keeps it sequential for predictable progress reporting and to avoid hammering the vault's metadata cache with concurrent reads.

---

## Chapter-type dispatch

Each chapter type has a dedicated generator method:

```ts
private async generateChapter(chapter: BookChapter): Promise<ChapterResult> {
  switch (chapter.type) {
    case 'report':
      return this.generateReportChapter(chapter);
    case 'visual-tree':
      return this.generateVisualTreeChapter(chapter);
    case 'vault-note':
      return this.generateVaultNoteChapter(chapter);
    case 'section-divider':
      return this.generateSectionDividerChapter(chapter);
  }
}
```

### Report chapters (delegate to Reports system)

```ts
private async generateReportChapter(chapter: BookChapter & { type: 'report' }) {
  const reportService = new ReportGenerationService(this.app, this.settings);
  const options = {
    ...chapter.config.reportOptions,
    outputMethod: 'download'  // return content, don't save
  };
  const result = await reportService.generateReport(chapter.config.reportType, options);
  return { id: chapter.id, success: result.success, markdown: result.content };
}
```

This is the cleanest dependency pattern in the whole system. Book Builder doesn't know how any individual report works — it just hands a type and options to `ReportGenerationService` and receives markdown back.

### Vault note chapters

Read the file, sanitize: strip frontmatter, strip plugin-specific code blocks, convert wikilinks to plain display text:

```ts
private sanitizeVaultNote(content: string): string {
  // Strip YAML frontmatter
  content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  // Strip charted-roots-* code blocks (plugin-specific)
  content = content.replace(/```charted-roots-[\s\S]*?```\n?/g, '');
  // Convert [[target|alias]] → alias (or target if no alias)
  content = content.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, t, _p, a) => a || t);
  return content;
}
```

### Visual tree chapters

Render SVG via `VisualTreeSvgRenderer`, convert to PNG data URL for embedding:

```ts
private async generateVisualTreeChapter(chapter) {
  const svg = await this.visualTreeService.renderSvg(chapter.config);
  const pngDataUrl = await svgToPng(svg, { maxWidth: 1200 });
  return { id: chapter.id, success: true, imageDataUrl: pngDataUrl };
}
```

### Section dividers

Metadata-only; no content generation. The renderer handles styling.

---

## Bibliography + Name Index extraction

Both run over the aggregated chapter markdown after generation completes.

**Bibliography** extracts footnote *definitions* (`[^1]: Smith, John. 1850 Census.`), deduplicates by normalized text, and records which chapters each citation appears in:

```ts
private collectBibliography(results: ChapterResult[]) {
  const entries = new Map<string, BibliographyEntry>();
  const footnoteRe = /^\[\^([^\]]+)\]:\s*(.+)$/gm;

  for (const result of results) {
    if (!result.markdown) continue;
    for (const match of result.markdown.matchAll(footnoteRe)) {
      const text = match[2].trim();
      const key = normalize(text);
      if (!entries.has(key)) entries.set(key, { text, chapters: [] });
      entries.get(key)!.chapters.push(result.chapterTitle);
    }
  }
  return Array.from(entries.values()).sort((a, b) => a.text.localeCompare(b.text));
}
```

**Name index** extracts bold names (`**John Smith**`) and table-cell names. Groups by last name's first letter. Sorted alphabetically.

Both are lightweight regex scans. Neither is sophisticated, and both have false-positive / false-negative edges (e.g., bold text that isn't a name). That's fine for v1 — users can manually edit the output if needed.

---

## Rendering: PDF and ODT

Both renderers **delegate chapter markdown conversion to the Reports system's renderers.** The Book renderers handle:

- Cover page (same builder reused from reports).
- TOC generation (pdfmake's `tocItem` marker on chapter headings).
- Chapter numbering (roman / numeric / none) via title prefix.
- Page breaks between chapters.
- Section divider styling.
- Bibliography + name index as back matter sections.

Pattern:

```ts
async renderBook(definition, chapterResults, bibliography, nameIndex): Promise<Blob> {
  const docDef = this.buildBaseDefinition(definition);
  if (definition.outputOptions.includeCoverPage) this.addCoverPage(docDef, definition.metadata);
  if (definition.outputOptions.includeToc) this.addTocMarker(docDef);

  for (let i = 0; i < chapterResults.length; i++) {
    const chapter = chapterResults[i];
    this.addChapterHeading(docDef, chapter, i, definition.outputOptions.chapterNumbering);
    if (chapter.markdown) this.pdfReportRenderer.appendMarkdown(docDef, chapter.markdown);
    if (chapter.imageDataUrl) this.addImage(docDef, chapter.imageDataUrl);
    this.addPageBreak(docDef);
  }

  if (definition.outputOptions.includeBibliography) this.addBibliography(docDef, bibliography);
  if (definition.outputOptions.includeNameIndex) this.addNameIndex(docDef, nameIndex);

  return await this.pdfMake.createPdf(docDef).getBlob();
}
```

---

## Book Builder Modal

4-step wizard mirroring the Report Wizard's shape:

1. **Metadata** — title, author, date, logo + template selection (family history / research compilation / blank).
2. **Chapters** — ordered list with drag-drop reordering, per-chapter config modal (`ChapterConfigModal`), add/edit/remove.
3. **Output** — format, page size, font, toggles (cover / TOC / bibliography / name index), chapter numbering.
4. **Generate** — progress bar, log of per-chapter success/fail, download or save-to-vault button.

**Template-driven chapter auto-population** (Step 1 → Step 2) is the most interesting UI logic. A "family history" template walks the family graph from the root person and generates a chapter list automatically:

- Pedigree chart chapter (root person).
- Descendant chart chapter (root person).
- Section divider: "Ancestors."
- Individual summary chapters for root + direct-line ancestors up to N generations.
- Section divider: "Family groups."
- Family group sheet chapters for each nuclear family head.
- Section divider: "Reference."
- Ahnentafel + Register report chapters.

This is generated as a starting point — users then reorder, add, remove in Step 2. Value: a user who doesn't know what to include can get a reasonable default in one click.

---

## Progress and change detection

Progress callback pattern:

```ts
interface BookProgress {
  currentChapter: number;
  totalChapters: number;
  chapterTitle?: string;
  phase: 'generating' | 'rendering';
}
```

Fires after each chapter's generation completes, once before rendering starts. Enables a live progress bar in the modal without blocking the UI thread.

Change detection uses a tiny djb2 hash per chapter:

```ts
function djb2(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  return (hash >>> 0).toString(16);
}
```

On regeneration, compare each chapter's new hash to the stored one in `lastChapterHashes`. Report which changed. Doesn't skip regeneration (all chapters still run), but gives the user visibility: "Chapter 3 (Family group sheet) changed; 14 other chapters unchanged."

Worth it even for small books. ~10 LOC for the hash function, ~20 LOC for the compare-and-report.

---

## Integration boundary with Reports

The cleanest part of the design. Book Builder delegates report generation entirely:

```
BookGenerationService
  → ReportGenerationService  (doesn't know book exists)
    → individual generator   (doesn't know report service exists)
```

No shared state, no callbacks, no "book context" threaded through. Just: "generate this report type with these options; give me markdown back."

The same pattern works for visual trees (`VisualTreeService`) and vault notes (`app.vault.read`). Each source type has a clean function signature that Book Builder calls without caring about implementation.

---

## What's worth porting intact

1. **BookDefinition schema with `version: 1`.** JSON persistence, per-chapter hashing, lastGeneratedAt. ~170 LOC that never has to be rewritten.
2. **Pipeline with try/catch per chapter.** Partial success is better than all-or-nothing. Let failed chapters produce an error marker in the output; don't block the whole book.
3. **Chapter-type dispatch via discriminated union.** Type-safe, readable, easy to extend.
4. **Bibliography + name index via regex over aggregated markdown.** Not perfect, but v1-sufficient. Don't over-engineer.
5. **Reuse the Reports system's markdown-to-PDF/ODT renderers.** The Book Builder is a thin layer over them. Don't duplicate rendering code.
6. **Template auto-population for chapter lists.** The single biggest UX win in the wizard. Even for non-genealogy domains, pre-built "you probably want these chapters" templates save users 5–10 minutes of click-through.
7. **Progress callbacks.** Required for multi-minute generations to feel responsive.
8. **djb2 hashing for change detection.** Tiny code, big UX value.

---

## What to skip or simplify for Draft Bench

- **Visual tree chapter type** unless Draft Bench has tree-like visualizations. Saves the SVG-to-PNG conversion path.
- **ODT renderer** on day one. PDF-only is fine until someone explicitly asks.
- **Chapter numbering variants.** Start with numeric; roman and none are easy to add later.
- **Bibliography and name index** unless the domain has citations. Worth skipping v1 if your chapters don't use footnotes.
- **Logo on cover page.** Nice-to-have; easy to add later if users ask.
- **Templates more complex than "blank + one prefab."** CR has three templates because genealogy has specific conventions. Start with one template that says "include this chapter and this chapter."

---

## LOC estimate for Draft Bench (PDF only, 3 chapter types, 1 template)

| Component | Estimate |
|---|---|
| `book-types.ts` (schema + discriminated union) | ~120 LOC |
| `book-generation-service.ts` (pipeline) | ~350 LOC |
| `pdf-book-renderer.ts` (simplified — no visual trees) | ~300 LOC |
| `book-builder-modal.ts` (4 steps, simpler per-chapter config) | ~900 LOC |
| **Total** | **~1,670 LOC** |

That's **~55% the size of CR's Book Builder**. Porting effort: one engineer, ~2–3 weeks, assuming the Reports system is already in place and the underlying vault services exist.

---

## Key patterns for any compilation-pipeline port

1. **Markdown as the intermediate format.** Don't try to produce PDF directly. Go through markdown; it's inspectable, vault-savable, and composes cleanly.
2. **Delegate per-chapter generation to existing services.** Book Builder doesn't own report logic, note reading, or tree rendering. It's pure orchestration.
3. **Partial success, not atomic generation.** One failed chapter shouldn't break an hour-long run. Mark the chapter as failed, continue, report at the end.
4. **Persist the definition.** Users iterating on a long book want to regenerate without rebuilding the chapter list every time.
5. **Version the schema.** `version: 1` on the persisted definition. Even if you don't need migration now, you'll want the hook when you inevitably add a field.
6. **Auto-populate templates.** First-time users don't know what to include. Give them a defensible default; let them edit.
7. **Progress + change detection pay their weight.** Both are small additions with outsized UX value for anything that takes >30 seconds.

---

## Draft Bench adaptation

The orchestration patterns in this doc port well to Draft Bench's compile pipeline. The persistence format, chapter type scope, and V1 back-matter scope diverge from CR.

**Preset persistence: first-class notes, not `.book.json`.**

Draft Bench compile presets are first-class vault notes with `dbench-type: compile-preset`, not JSON sidecars. Rationale captured in [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md): travelability when project folders move between vaults, shareability between writers, Bases queryability, alignment with the plugin's notes-as-data philosophy. Presets participate in bidirectional linking: a new `RelationshipConfig` entry in the linker maintains `preset.dbench-project` <-> `project.dbench-compile-presets` / `project.dbench-compile-preset-ids` reverse arrays, same pattern already shipped for scene <-> project and scene <-> draft.

The `BookDefinition` schema shape still ports (`version: 1`, metadata, chapters, outputOptions, `lastGeneratedAt`, `lastChapterHashes`) — stored as frontmatter + body on the preset note rather than JSON. Schema versioning stays valuable for future migrations (e.g., adding a content-handling-rules block once D-06 locks the override surface).

**V1 chapter types:**

- `scene` — the primary content source. Pulls the scene note's body (subject to D-06's heading-scope rule, e.g., `## Draft` only) and D-06's content-handling rules.
- `section-divider` — metadata-only; styled break between scenes. Useful for "Part I / Part II" breaks or unnamed separators.

Deferred to post-V1:

- `vault-note` chapter — insert an arbitrary vault note (useful for front matter, dedications, appendices). Easy to add when asked for; sanitizer pattern from CR ports near-verbatim.
- `chapter` chapter type — pairs with the post-V1 `chapter` note type (see [UC-02](use-cases/UC-02-novelist-with-chapters.md)). Would be an ordered grouping of scenes with its own title and numbering.

Skipped entirely:

- `visual-tree` chapter — CR-specific.

**What Draft Bench ports intact:**

- **BookDefinition schema shape** (adapted to frontmatter + body storage as above).
- **Chapter-type dispatch via discriminated union.**
- **Pipeline with per-chapter try/catch.** Partial success beats atomic failure; a broken scene produces an error marker in output, not a dead compile.
- **Progress callbacks.** Required for multi-minute compiles to feel responsive.
- **djb2 change detection.** Tiny function, big UX value for regeneration ("Scene 3 (Tempting Waters) changed; 14 other scenes unchanged").
- **4-step wizard shape** is the leading candidate (Metadata -> Chapters -> Output -> Generate). [wizards-reference.md](wizards-reference.md) is the consulting reference once the preset-edit UI is designed.

**What Draft Bench skips or simplifies:**

- **No bibliography back-matter section.** Footnote renumbering across concatenated scenes is a content-handling rule ([D-06](decisions/D-06-compile-preset-storage-and-content-rules.md)), not a rendered back-matter feature.
- **No name index.** The genealogy-specific "bold names + table cells" extraction doesn't apply to prose manuscripts.
- **One starter template, not three.** V1 default: "all scenes in `dbench-order`, no dividers." Post-V1 can add "chapter-grouped" and "custom selection" templates.
- **Logo on cover page** is a nice-to-have; default to text-only cover in V1. Literary manuscripts rarely carry a logo.
- **Chapter numbering:** default to "none" (literary manuscripts typically don't number scenes in compile output); numeric and roman remain easy to add.
- **ODT and DOCX ship in V1** (unlike CR's Book Builder reference which suggests deferring both). Rationale in [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md): writers submitting to workshops / agents / editors overwhelmingly want Word-format output (DOCX) and the [docx](https://docx.js.org/) library is a self-contained no-Pandoc path; ODT covers the OpenOffice/LibreOffice user via JSZip, which already handles the archive mechanics.

**Architectural divergence to note:** CR's Book Builder delegates per-chapter markdown-to-PDF/ODT conversion to the Reports system's renderers. Draft Bench has no Reports substrate, so the rendering code co-locates inside the compile service. A future post-V1 Reports feature (character summaries, per-scene stats, compile-diff reports, etc.) would motivate extracting the rendering layer at that time.

**Related docs:**

- [report-generation-reference.md](report-generation-reference.md) — the rendering-layer patterns this orchestration sits on top of.
- [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md) — Draft Bench's synthesis doc for preset storage format, content-handling rules, and ODT scope.
- [wizards-reference.md](wizards-reference.md) — consulting reference for the preset-edit wizard UI.
- [specification.md § Compile / Book Builder](specification.md) — user-facing feature spec.
