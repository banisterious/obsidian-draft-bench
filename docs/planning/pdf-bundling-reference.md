# PDF bundling strategy: notes from Charted Roots' dual-library analysis

**Source:** distilled from a Charted Roots design session on why that plugin bundles both pdfmake and jsPDF. Preserved here verbatim (with light editorial touches) so the reasoning is available when Draft Bench or future plugins face the same bundle-size question. Draft Bench's adaptation footer follows at the end.

> **Note on bundle-size figures below.** The ~2.4 MB stock-VFS number and ~80% custom-VFS saving quoted in the CR analysis reflect the pdfmake version CR is pinned to. When DB measured against `pdfmake@0.2.23`, `vfs_fonts.js` was 835 KB and shipped exactly the 4 variants DB uses — upstream had already trimmed the VFS. The extraction optimization is no longer available on current pdfmake. See the Adaptation footer (Optimization 1) for the measurement and the revised plan.

---

## Why Bundle Both pdfmake and jsPDF: The Full Argument

### Context

If you're evaluating whether to bundle two PDF libraries in an Obsidian plugin (or any browser-context app), the default instinct is "consolidate — one library is smaller than two." For Charted Roots, that instinct was evaluated explicitly, and the conclusion was: no, dual-library is correct. The reasoning below captures why, so the argument can be made cleanly when the question comes up again.

### The fundamental capability split

pdfmake and jsPDF solve different PDF-generation problems. They're not substitutable — each does what the other does poorly or not at all.

#### pdfmake is a document-layout engine

pdfmake takes a declarative JSON-like document description and produces a typeset PDF. Content flows, pages break automatically, tables that don't fit on one page continue on the next with repeated headers, named styles cascade like CSS, and the library handles all the pagination math.

What this gives you:

- **Declarative authoring.** You describe the document structure (title, paragraphs, tables, footnotes) and let the library decide where page breaks land. Reads like HTML-to-PDF, not like a drawing API.
- **Auto-pagination.** Content longer than one page flows naturally. No manual `addPage()` calls, no cursor-tracking code.
- **Flowing tables.** A 50-row table breaks across pages, headers repeat, cell styling is preserved. Implementing this by hand in a lower-level library is weeks of work.
- **Table of contents and bookmarks.** First-class support. You declare what should appear in the TOC, pdfmake handles the page-number resolution.
- **Named styles.** Define `header`, `subheader`, `body` once; apply them throughout the document.
- **Footnotes and cross-references.** Built-in support for the kind of annotation density that genealogical reports, academic documents, and technical manuals require.

**Where it's used in Charted Roots:** Ahnentafel reports, Register reports, Family Group Sheets, Book Builder multi-chapter PDF assembly, source summaries, brick-wall reports. Everything text-structured.

#### jsPDF is a low-level PDF drawing API

jsPDF is closer to a canvas. You call `addImage()`, `text()`, `rect()`, `line()` at explicit coordinates on an explicit page. Nothing flows. Nothing paginates. You decide where everything goes.

This sounds like a disadvantage until you realize: when you're embedding a pre-rendered image (like a family tree chart), you don't want automatic flow. You want pixel-perfect placement at exact dimensions.

What this gives you:

- **Dynamic page sizing.** Page dimensions can match the content. A family tree that's 2400×1800 logical pixels can be exported to a page that's exactly 2400×1800 — no cropping, no scaling, no resampling.
- **Canvas-to-PDF embedding.** Render an SVG to a `<canvas>` at 2× scale, extract as PNG data URL, embed in PDF at 1:1 logical size. The result is crisp: lines stay sharp, text stays readable, no compression artifacts.
- **Pixel-perfect placement.** Cover pages, title blocks, overlays — anything positioned at exact coordinates works cleanly.
- **Smaller surface area.** jsPDF is ~229 KB static. The API is small enough to learn in an afternoon. pdfmake is richer but heavier.

**Where it's used in Charted Roots:** Family Chart view PDF export. The interactive SVG chart gets rendered to canvas, embedded at native resolution, and optionally prefaced with a jsPDF-drawn cover page.

### The question you keep getting asked

> "pdfmake is ~400-500 KB. Can't we just use jsPDF for everything?"

Short answer: yes, technically. But every consolidation attempt runs into the same wall.

#### If you consolidate on jsPDF

You lose pdfmake's document-layout engine. To replace it, you have to re-implement:

- Auto-pagination logic (track cursor Y-position, detect overflow, add page, repeat header row)
- Table layout engine that breaks across pages and repeats headers
- TOC generation with page-number resolution (two-pass: lay out, collect TOC entries with final page numbers, prepend)
- Named-style cascade and resolution
- Footnote placement
- Multi-column flow

This is months of work. Each of these features has edge cases (widow/orphan control, header-on-first-page-only, spanning cells, nested tables) that pdfmake has already solved. You'd be rebuilding a mature library from scratch to save ~400-500 KB — and you'd have bugs.

**Not worth it.** Bundle-size savings don't justify rebuilding a document-layout engine.

#### If you consolidate on pdfmake

You lose jsPDF's image-based export quality. pdfmake requires declared page sizes (LETTER, A4, or a fixed `[width, height]` in points). When you embed an image into a fixed-size page, one of two things happens:

1. The image fits the page and gets resampled to match the print resolution — quality degrades.
2. The image exceeds the page bounds and gets cropped.

Neither outcome is acceptable for a family chart that someone will print on a large-format printer or archive as a heritage document. The jsPDF path sets the page dimensions to match the chart, embeds the PNG at 1:1 logical size, and you get pixel-perfect output.

pdfmake does support SVG natively. You could feed it the raw SVG instead of a canvas-rendered PNG. Two problems:

- pdfmake's SVG support is incomplete for complex charts (missing filter effects, gradient edge cases, font-loading quirks with embedded text).
- Even if the SVG renders correctly, you're still constrained to pdfmake's page-size model, which reintroduces the scaling problem.

**Not worth it.** Chart quality is the headline feature of the Family Chart export — degrading it to save ~229 KB is the wrong trade.

### The bundle-size math, honestly

This is the part people usually get wrong when they push for consolidation. "Two libraries" doesn't mean "2x the size."

**Charted Roots' actual numbers:**

| Component | Size | Loading strategy |
|---|---|---|
| jsPDF | ~229 KB | Static — always loaded |
| pdfmake core | ~400-500 KB | **Dynamic** — loads only on first PDF report export |
| Bundled fonts (Roboto + DejaVu Sans Mono) | ~465 KB | Static — needed for Unicode coverage in reports |
| **Initial bundle cost** | **~694 KB** | jsPDF + fonts |
| **Runtime cost (first PDF export)** | **+~400-500 KB** | Cached for session |

The critical move is **lazy-loading pdfmake**. A user who only exports family charts never downloads pdfmake. A user who only exports reports downloads it once, on first export, and it's cached. The initial plugin load isn't paying for pdfmake at all.

#### The "just use jsPDF" comparison, done right

If you consolidated on jsPDF today and kept the same feature set:

- You'd save the ~400-500 KB of pdfmake, but only for users who export reports — and those users already pay that cost lazily.
- You'd keep the ~465 KB of fonts, because jsPDF also needs font registration for any non-default typography (cover pages in the chart export already use Roboto via jsPDF's VFS).
- You'd have to implement pdfmake's features in jsPDF. That code adds bytes too — realistically 100-300 KB of your own pagination/table/TOC implementation.

Net result: you'd save maybe 200-300 KB on the lazy-loaded path, and spend months implementing features that already work. The size savings don't touch the initial bundle at all.

### Font bundling is a separate-but-related decision

Charted Roots bundles Roboto + DejaVu Sans Mono (~465 KB) via a custom `build-fonts.js` that extracts only the needed TTF variants. This is a departure from the original plan to use standard PDF fonts (Helvetica, Times, Courier) with zero embedding.

**Why the change:** Pedigree reports render ASCII tree connectors — `├──`, `└──`, `│` — which are Unicode box-drawing characters. Helvetica doesn't have them. They rendered as blank spaces, breaking the visual structure of the tree. Switching pdfmake's default font to DejaVu Sans Mono for these sections fixed it.

**Why not just use pdfmake's default bundled font?** pdfmake ships with a default `vfs_fonts.js` that's ~2.4 MB of embedded Roboto variants. We use the same Roboto base but extract only the four variants we need (normal, medium, italic, medium-italic). That's ~180 KB of Roboto plus ~285 KB of DejaVu Sans Mono = ~465 KB, vs 2.4 MB if we'd just imported the default VFS. ~80% savings.

**This is a font-bundling optimization**, not a dual-library question. It applies equally whether you use one PDF library or two.

### Alternatives considered (and why they're not better)

**pdf-lib.** More modern API, smaller bundle. But it's a low-level primitive library (similar to jsPDF's design) without document-layout features. You'd be re-implementing pdfmake's pagination engine on top of it. Same problem as "consolidate on jsPDF."

**html2pdf / html2canvas + jsPDF.** Render HTML to canvas, then embed in PDF. Works for simple documents but has classic issues: page breaks in the middle of content, variable quality based on the HTML source, slow rendering for long documents, and no TOC/bookmark support. Not viable for structured reports.

**Puppeteer / headless Chrome.** Produces beautiful PDFs but requires a Node.js server. Charted Roots runs entirely in Obsidian's browser context — Puppeteer isn't available. Also not viable for a client-side Obsidian plugin.

**@react-pdf.** React component model for PDF generation. Would require React adoption in a non-React project, and the component library is smaller than pdfmake's feature set. Not a fit.

### The TL;DR you actually need

**Dual-library is correct because pdfmake and jsPDF solve different problems.**

- pdfmake: declarative document layout, auto-pagination, flowing tables, TOCs, footnotes. Essential for genealogical reports and books.
- jsPDF: low-level drawing with dynamic page sizing, canvas-based image embedding at 1:1 scale. Essential for high-quality family chart export.

**Consolidation is a false economy.** Either direction sacrifices output quality or requires rebuilding mature library features from scratch.

**Bundle-size concerns are addressed by lazy-loading pdfmake**, so the initial bundle pays for jsPDF (229 KB) + fonts (465 KB), not for pdfmake. Users who only export charts never download pdfmake.

**The fonts are a separate, orthogonal decision** driven by Unicode coverage requirements in reports. They're not a cost of "having two libraries."

### When this argument might not apply

If the plugin in question:

- Only produces one kind of PDF output (either text documents OR image exports, not both), then one library is sufficient.
- Produces text documents but has no needs for auto-pagination, flowing tables, or TOCs (e.g., a single-page receipt generator), then jsPDF alone suffices.
- Produces image exports but is fine with fixed page sizes and image resampling (e.g., a thumbnail gallery export), then pdfmake alone suffices.
- Has strict bundle-size constraints below ~500 KB total, then one library is a forced choice — but the feature set will necessarily be narrower.

**For Charted Roots specifically**, the genealogical-reports feature set demands pdfmake's document-layout capabilities, and the family-chart-export feature set demands jsPDF's pixel-perfect image embedding. Neither feature is optional. So two libraries is the correct answer for this plugin.

---

## Adaptation footer: what this means for Draft Bench

Draft Bench is the "when this argument might not apply" case from the TL;DR above **for V1 scope**: exactly one PDF output kind (compile-to-PDF of structured prose), no image-export scenario, and D-06 rule 8b strips all image embeds with a notice. Draft Bench's V1 PDF needs are purely document-layout: headings, paragraphs, flowing tables, optional TOC, per-chapter page breaks, footnote renumbering. That's pdfmake's wheelhouse.

**So the V1 dual-library question is settled: pdfmake only.** The interesting questions are the two optimizations CR layered on top of that choice.

### Post-V1 caveat: media inclusion may change the calculus

[media-management-reference.md](media-management-reference.md) sketches a post-V1 `dbench-type: media` note type with a MediaService resolver. If media inclusion lands, rule 8b could flip from "strip with notice" to "resolve and embed," and the question of whether jsPDF is needed becomes live again.

The likely shape of that future question:

- **Inline chapter illustrations, scene reference photos, author portraits, decorative ornaments.** pdfmake's image embedding handles these cleanly. Images flow inline with text at content-box-fitted dimensions. Same fidelity as exporting from a word processor. No case for adding jsPDF.
- **Full-bleed cover art, photography books, graphic novel scripts with exact-dimension panels.** Pixel-perfect placement at exact page dimensions is jsPDF's strength. If Draft Bench grows to target these use cases — and writers demand rendering fidelity that pdfmake can't provide — the dual-library argument might become right for DB too.

For a writing plugin, the first category is vastly more common than the second: most writers submit manuscripts as plain text, embedded images are a minority use case, and "full-page pixel-perfect image" is a minority of that minority. But the scope isn't locked. This section exists so future-us doesn't forget to reopen the question when media inclusion lands.

**Decision rule for post-V1 reconsideration:** if media inclusion lands AND rule 8b flips to resolve AND writers credibly complain about pdfmake's image fidelity on typical manuscript illustrations, re-read the CR analysis above and consider adding jsPDF for the image-centric code path. Otherwise, stay on pdfmake only.

### Optimization 1: custom font VFS (closed — pdfmake 0.2.x already ships a trimmed VFS)

**Finding (2026-04-23 measurement against `pdfmake@0.2.23`):** the extraction optimization no longer applies. Stock `pdfmake/build/vfs_fonts.js` on disk is **835 KB**, and enumerating its contents at runtime returns exactly the 4 variants DB uses:

| Entry | Base64 bytes | Approx raw TTF |
|---|---|---|
| Roboto-Regular.ttf | 204.7 KB | ~154 KB |
| Roboto-Medium.ttf | 204.9 KB | ~154 KB |
| Roboto-Italic.ttf | 212.1 KB | ~159 KB |
| Roboto-MediumItalic.ttf | 212.5 KB | ~159 KB |
| **Total (base64)** | **834.2 KB** | **~626 KB raw** |

Upstream has already narrowed the default VFS to the same 4 variants pdfmake's default style definitions reference. Extracting those 4 variants into a custom `vfs.ts` and base64-encoding them produces the same ~834 KB payload — no saving. CR's ~80% win was real when `vfs_fonts.js` shipped the full Roboto family (~10-11 fonts, ~2.4 MB); 0.2.x pre-trimmed that down and closed the gap.

**Decision:** import `pdfmake/build/vfs_fonts` directly from [render-pdf.ts](../../src/core/compile/render-pdf.ts). No extraction script, no generated `src/core/compile/pdf/fonts/vfs.ts`, no maintenance burden for the VFS-regex extraction approach that CR documented. Same output; fewer moving parts.

**CR gotchas preserved as "if we ever revisit" notes.** The five gotchas CR shared are still true if a future optimization path reopens this:

1. **Base64 overhead is ~33%.** Any size math against pdfmake's VFS payload should target b64 bytes, not decoded TTF bytes. The table above shows both.
2. **Regex extraction is version-brittle.** CR's `/var\s+vfs\s*=\s*(\{[\s\S]*?\});/` parser depends on pdfmake's `vfs_fonts.js` output shape. Pin pdfmake and re-check the regex on any bump. The `require('pdfmake/build/vfs_fonts').pdfMake.vfs` accessor is safer but still version-dependent on how pdfmake exports its VFS.
3. **Unicode coverage.** Roboto covers Latin / Greek / Cyrillic / extended Latin well enough for manuscript prose. If DB ever adds box-drawing characters (scene-flow diagrams, ASCII-art trees), Roboto won't render them — CR bundles DejaVu Sans Mono (+285 KB) for that. Not a V1 concern.
4. **Generated-file ownership.** If a custom VFS does get generated at some future point, decide up front whether the `.ts` output is committed (simpler fresh-clone story, inflates repo) or gitignored behind a build-step prerequisite (cleaner repo, adds a build-ordering dependency). CR commits theirs.
5. **Lint/diff tooling.** A ~240 KB base64 string in a `.ts` file is functionally fine but makes the file uneditable and may confuse Prettier / ESLint / diff viewers. If we ever regenerate, add the path to `.prettierignore` and any ESLint ignore config up front.

**Paths that could reopen this question post-V1:**

- **Drop Medium + MediumItalic** (keep Regular + Italic only) and let pdfmake emit synthetic bold via `bold: true` on Regular. Saves ~420 KB. Tradeoff: heading weight is browser-style faux-bold rather than Roboto-Medium, a typographic downgrade but arguably fine for a manuscript PDF.
- **Bundle a smaller serif family** (Merriweather, Tinos, Crimson Pro) if the consensus shifts from sans to serif for prose manuscripts. Usually no saving; different aesthetic.
- **pdfmake upstream ships an even-smaller VFS.** Worth a recheck on every pdfmake bump — if upstream drops another variant, we want to know.

Draft Bench doesn't need DejaVu Sans Mono — there are no ASCII tree connectors or box-drawing characters in manuscript prose. Roboto-only is sufficient.

### Optimization 2: lazy-loading pdfmake (complex, investigate before committing)

Current state: [render-pdf.ts](../../src/core/compile/render-pdf.ts) statically imports pdfmake. Once a P3.E command reaches render-pdf, esbuild bundles the ~1.4 MB pdfmake core into main.js for every user.

**Expected saving:** all 1.4 MB shifts from initial-bundle cost to first-compile cost. Writers who only compile to MD or ODT never download pdfmake. Writers who compile to PDF download it once per plugin install (or per cache invalidation).

**Work required:** depends on esbuild configuration options the team hasn't explored yet. CR's doc says they lazy-load pdfmake but doesn't spell out the mechanism. Candidate approaches:

1. **esbuild code splitting (`splitting: true` + `format: 'esm'`).** Produces separate chunks. Obsidian plugins ship as a single `main.js` by convention; a split build would need manifest changes or a loader shim. Unknown compatibility with Obsidian's plugin system.
2. **Ship pdfmake as a separate asset file in the release, loaded at runtime.** The plugin's release bundle contains `main.js` + `pdfmake.js`; the plugin runtime-loads `pdfmake.js` from the plugin folder when first needed. Obsidian exposes the plugin folder path via the adapter API. Fragile across user install paths but feasible.
3. **Download pdfmake from GitHub releases on first PDF compile, cache in plugin folder.** Network-dependent; needs offline-first fallback semantics. Probably too complex for V1.

For V1, the lazy-loading investigation is deferrable. Ship with static import of `pdfmake/build/vfs_fonts` (~835 KB), measure real-world bundle impact, and revisit lazy-loading as a post-V1 optimization if writers or the Community Plugin review flag bundle size as blocking. The custom-VFS partial mitigation the original plan relied on is no longer available (Optimization 1), so the case for lazy-loading is correspondingly stronger.

### Proposed sequence

1. **V1:** ship `pdfmake/build/vfs_fonts` imported statically. No extraction script. The one meaningful font-bundle optimization (custom VFS extraction) is closed by upstream's own trim on 0.2.x — pursuing it would be pure maintenance cost for zero runtime benefit.
2. **Post-V1:** investigate lazy-loading pdfmake via one of the candidate approaches above. This is now the **primary** bundle-size lever since the font-VFS lever is gone. Revisit if bundle size becomes a real pain point for writers or community-submission reviewers.
3. **Never (per dual-library analysis):** do not add jsPDF or pdf-lib. Draft Bench has one PDF use case; one library is correct.

### Revised bundle math for Draft Bench

Measured 2026-04-23 after P3.E shipped and the dispatcher made render-pdf + render-odt reachable from the plugin entry. Production build (`npm run build`), esbuild without minification (Obsidian community-plugin convention; reviewers read source):

| Component | Size in bundle | Loading strategy (V1) | Loading strategy (post-V1 lazy) |
|---|---|---|---|
| pdfmake core (unminified) | ~2.85 MB | Static, once render-pdf is imported | Lazy, on first PDF compile |
| Stock Roboto VFS (4 variants, base64) | ~835 KB | Static, once render-pdf is imported | Lazy, pairs with pdfmake |
| JSZip (ODT renderer, unminified) | ~300-400 KB | Static, once render-odt is imported | Static, unchanged |
| Draft Bench code + other deps | ~200 KB | Static | Static |
| **main.js total (measured)** | **~4.72 MB** (from 181 KB baseline) | — | **~400-600 KB**; pdfmake + VFS deferred |

Important correction for anyone working from earlier numbers: pdfmake.js **unminified** is ~2.85 MB, not the ~1.4 MB minified figure previously quoted. esbuild's Obsidian-plugin config doesn't minify, so the unminified size is what ships. This roughly doubled the bundle-increase prediction — actual +4.54 MB vs. forecast +2.3 MB. Total V1 ship size is substantial (~5 MB including CSS + all deps); post-V1 lazy-loading is now the dominant lever, not a nice-to-have.

### Outstanding questions for Draft Bench

- **Does esbuild + Obsidian plugin runtime support code splitting cleanly?** No evidence in the current codebase either way. Investigation needed before committing to option 1 above. Answering this is now more urgent than it was when the custom-VFS plan existed as a partial mitigation.
- **Is CR's lazy-load mechanism documented somewhere?** If so, crib it. If not, the next CR session might be a good place to extract the approach into a shared pattern.
- **Bundle budget expectation.** Is there a community-plugins-submission reviewer threshold for main.js size? None documented, but plugins over 2 MB sometimes get push-back in submission reviews. Worth knowing before ship — DB is heading toward ~2.5 MB total with PDF + ODT wired.
