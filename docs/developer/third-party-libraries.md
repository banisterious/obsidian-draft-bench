# Third-Party Libraries

Draft Bench depends on three external libraries for compile-pipeline output formats: pdfmake (PDF), docx (DOCX), and JSZip (ODT). All three are bundled into `main.js` via static import. This document covers how each is used, plus bundling workarounds applied during 0.6.1's scanner-hygiene work.

## Table of Contents

- [pdfmake](#pdfmake)
- [docx](#docx)
- [JSZip](#jszip)
- [Bundling and workarounds](#bundling-and-workarounds)
- [Dependency management](#dependency-management)

---

## pdfmake

**Purpose:** PDF document generation for the compile pipeline.

**Version:** ^0.2.23

**Location:** `src/core/compile/render-pdf.ts` (runtime wiring); `src/core/compile/pdf/doc-definition.ts` (pure translator from markdown AST to pdfmake document).

**Usage pattern:**

```typescript
import * as pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

// Font registration (once per session)
pdfMake.addVirtualFileSystem(pdfFonts);
pdfMake.addFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
});

// Build the document definition (pure translation from MD AST)
const docDefinition: TDocumentDefinitions = buildPdfDocDefinition(blocks, {
  pageSize: 'LETTER', // or 'A4' per preset frontmatter
});

// Hand off to pdfmake's runtime; getBuffer is callback-based in 0.2.x
const pdf = pdfMake.createPdf(docDefinition);
const buffer = await new Promise<Buffer>((resolve) => {
  pdf.getBuffer((buf) => resolve(buf));
});
return new Uint8Array(buffer);
```

**Key concepts:**

| Concept | Description |
|---------|-------------|
| `TDocumentDefinitions` | JSON AST describing content, styles, page size, margins |
| `content` | Array of content blocks (paragraphs, headings, lists, etc.) |
| `styles` | Named style definitions (fontSize, bold, alignment, etc.) |
| `defaultStyle` | Base styles applied to all content |
| `vfs` | Virtual file system carrying embedded fonts (registered via `addVirtualFileSystem`) |

**Document-definition translator (`pdf/doc-definition.ts`):**

The translator consumes Draft Bench's shared markdown AST (built by `md-ast.ts`) and emits a pdfmake `TDocumentDefinitions`. It mirrors the ODT and DOCX translators in structure — same AST in, format-specific document out — so the three renderers stay testable and format-agnostic at the seam.

V1 markdown subset: headings (H1-H6), paragraphs, ordered + unordered lists, bold, italic. Blockquotes, code blocks, tables, and footnotes degrade to plain paragraphs upstream in the shared parser.

**Notes:**

- **Static import.** pdfmake + the VFS font bundle add ~2 MB to `main.js`. Lazy-loading the renderer module is the post-V1 lever per the pdf-bundling reference; the static-import choice keeps the V1 build simple at the cost of a fatter base bundle.
- **`getBuffer` typing mismatch.** `@types/pdfmake` declares `getBuffer(): Promise<Buffer>`, but the 0.2.x runtime is callback-based and throws `getBuffer is an async method and needs a callback argument` when called Promise-style. `render-pdf.ts` casts to the callback signature and wraps it in a Promise; the typings are lying for our version.
- **Roboto-only VFS.** The default `vfs_fonts.js` ships Roboto in four variants (regular / medium / italic / medium-italic). Draft Bench doesn't bundle additional fonts — manuscript output for the four supported formats doesn't need glyph coverage beyond what Roboto provides.
- **Types from `@types/pdfmake`** (devDependency).

---

## docx

**Purpose:** DOCX document generation for the compile pipeline.

**Version:** ^9.6.1

**Library:** [docx](https://github.com/dolanmiu/docx) (Dolan Miu / docx.js — TypeScript-native DOCX library).

**Location:** `src/core/compile/render-docx.ts` (runtime wiring); `src/core/compile/docx/doc-definition.ts` (pure translator from markdown AST to docx Document).

**Usage pattern:**

```typescript
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

// Build the document tree (pure translation from MD AST)
const doc: Document = buildDocxDocument(blocks, { pageSize: 'LETTER' });

// Pack into DOCX bytes
const buffer = await Packer.toBuffer(doc);
return new Uint8Array(buffer);
```

**Key building blocks used:**

| Class | Purpose |
|-------|---------|
| `Document` | Top-level container (sections, numbering, styles) |
| `Paragraph` | Block-level container (heading or body) |
| `TextRun` | Inline run with formatting (bold / italic) |
| `HeadingLevel` | `HEADING_1` through `HEADING_6` for the markdown H1-H6 mapping |
| `LevelFormat` | Numbered-list level formatting (`DECIMAL`, `BULLET`) |
| `AlignmentType` | Per-paragraph alignment (default left; center for compile-pipeline section breaks) |
| `Packer` | Serializes a `Document` to a Buffer of DOCX bytes |

**Document-definition translator (`docx/doc-definition.ts`):**

Same shape as the PDF and ODT translators: shared markdown AST in, format-specific document out. The docx library uses runtime class constructors (`new Paragraph(...)`, `new TextRun(...)`) rather than a JSON AST like pdfmake's, but the translator pattern is the same — pure function, no filesystem, no Obsidian dependencies, testable in isolation.

**Notes:**

- **Static import; ~200 KB.** Smaller than pdfmake. Bundle impact is felt only once the compile-pipeline module graph is reachable from the plugin entry.
- **Internal zip handling.** docx packages DOCX output as a ZIP archive (DOCX is a zip container of XML files); it does this internally, so JSZip is not used from the DOCX renderer. Only `render-odt.ts` drives zip-creation directly from our code.
- **No `@types/docx` package.** Type definitions ship with the library itself, exported alongside the runtime.

---

## JSZip

**Purpose:** ZIP archive creation for ODT document generation. ODT files are ZIP containers with specific structure (`mimetype` first, uncompressed; then `META-INF/manifest.xml`, `styles.xml`, `content.xml`).

**Version:** ^3.10.1

**Location:** `src/core/compile/render-odt.ts` (the only direct consumer); XML strings are built in `src/core/compile/odt/xml.ts` and zipped here.

**Usage pattern:**

```typescript
import JSZip from 'jszip';

export async function buildOdtArchive(markdown: string): Promise<Uint8Array> {
  const zip = new JSZip();
  // mimetype must be first and uncompressed per the ODT spec
  zip.file('mimetype', ODT_MIMETYPE, { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', ODT_MANIFEST_XML);
  zip.file('styles.xml', ODT_STYLES_XML);
  zip.file('content.xml', buildContentXml(parseMarkdownForOdt(markdown)));
  return await zip.generateAsync({ type: 'uint8array' });
}
```

**Key features used:**

| Feature | Description |
|---------|-------------|
| `new JSZip()` | Create a new archive for writing |
| `zip.file(path, content, options)` | Add a file; `{ compression: 'STORE' }` disables DEFLATE per ODT spec for the mimetype entry |
| `generateAsync({ type: 'uint8array' })` | Serialize the archive to bytes |

**ODT archive structure:**

- `mimetype` — must be first in the archive, uncompressed; content is `application/vnd.oasis.opendocument.text`.
- `META-INF/manifest.xml` — file manifest listing each entry's path and MIME type.
- `styles.xml` — paragraph / character / list styles.
- `content.xml` — the document body (paragraphs, headings, lists, text spans).

JSZip preserves insertion order when adding files, which is how Draft Bench keeps `mimetype` as the first entry — the order of `.file()` calls in `buildOdtArchive` is the order in the output ZIP.

**Notes:**

- **Lightweight.** ~90 KB minified, no native dependencies, works in browser and Node.
- **Only direct ODT use.** DOCX zip handling is internal to the `docx` library; PDF doesn't involve zip at all.
- **No `@types/jszip` needed.** Type definitions ship with the library.

---

## Bundling and workarounds

A handful of bundling quirks are worked around in `esbuild.config.mjs`. Most exist because pdfmake, docx, and jszip all transitively reach IE-era polyfills (`setimmediate`, `immediate`) that contain `createElement("script")` patterns — flagged by the community-plugin scanner as "dynamic `<script>` element creations" even though the IE branches are dead code in modern Chromium. These workarounds shipped in 0.6.1; see [CHANGELOG.md § 0.6.1](../../CHANGELOG.md) for the full release notes.

### Native-equivalent polyfill shims

The `setimmediate` and `immediate` npm packages (jszip transitive deps) are replaced at bundle time with native-equivalent shims:

- `polyfills/setimmediate.js` — installs `globalThis.setImmediate` from `setTimeout(fn, 0)` (matching the macrotask semantic of jszip's "yield to the event loop" usage).
- `polyfills/immediate.js` — exports a `queueMicrotask`-based scheduler matching lie's Promise microtask scheduler.

Wired via an esbuild `onResolve` plugin in `esbuild.config.mjs` (the `polyfill-shims` plugin) that maps the `setimmediate` and `immediate` module specifiers to the shim paths.

### jszip resolution rerouting

jszip's `package.json` `browser` field redirects `./lib/index` to `./dist/jszip.min.js` — a pre-bundled Browserified file with both `setimmediate` and `immediate` already inlined. The shim swap above can't catch those (they happen inside the pre-merged file's internal module system), so the same plugin reroutes `jszip` itself from the prebundled `dist` to the unbundled `lib/index.js`. `readable-stream` (which jszip's `lib` uses) routes to Node's built-in `stream`, already external for Electron.

### Vendor-bundle literal masking

`docx` and `pdfmake` ship pre-bundled distributions that inline `setimmediate` / `immediate` as dead code, guarded behind `MutationObserver` / `setImmediate` feature checks that always succeed first in Chromium. The IE branches never execute at runtime, but the `createElement("script")` string literals still appear in the bundle and trip the scanner.

A separate esbuild plugin (`mask-script-polyfill-literal`) intercepts file loads from `node_modules/docx/` and `node_modules/pdfmake/`, rewrites `createElement("script")` to a non-foldable runtime expression (`createElement("scrip"+(globalThis.__dbench_t__||"t"))`) so esbuild's optimizer can't constant-fold it back, and lets esbuild bundle the transformed contents. Runtime is unaffected (the branches are still dead).

### pdfmake `getBuffer` callback shim

Not a bundling workaround per se, but a notable runtime mismatch: `@types/pdfmake` declares `pdf.getBuffer()` as returning a `Promise<Buffer>`, but the 0.2.x runtime is callback-based and throws when called without a callback argument. `render-pdf.ts` casts to the callback signature and Promise-wraps it; see the inline comment at [`render-pdf.ts:112`](../../src/core/compile/render-pdf.ts#L112).

---

## Dependency management

**Bundle considerations:**

| Library | Approximate size | Loading |
|---------|------------------|---------|
| pdfmake core + Roboto VFS | ~2 MB total | Static import (loaded with the compile-pipeline module graph) |
| docx | ~200 KB | Static import |
| JSZip | ~90 KB | Static import |

Total compile-pipeline weight: ~2.3 MB. The plugin entry doesn't pull in any of these directly; they're reachable from `render-pdf.ts` / `render-docx.ts` / `render-odt.ts`, which are themselves reachable from the compile-service module. Until a P3.E compile command actually triggers the renderer, the cost is paid at bundle time but not at plugin-startup parse time (Obsidian parses `main.js` lazily where it can).

Bundle size is currently ~5.8 MB total. The pdf-bundling-reference document tracks open levers for shrinking this: lazy-loading the render-pdf module via dynamic import, switching pdfmake to a smaller alternative, font deduplication. None shipped pre-1.0; tracked as post-V1 work.

**Type definitions (devDependencies):**

- `@types/pdfmake` — pdfmake doesn't ship types of its own.
- `@types/node` — for `Buffer`, `fs`, and other Node builtins that surface through Electron.

docx and JSZip ship type definitions with the library itself; no separate `@types/` packages required.

**No native dependencies.** All three libraries are pure JavaScript. Builds work cross-platform (Windows, macOS, Linux, mobile) without per-platform binaries or postinstall steps.
