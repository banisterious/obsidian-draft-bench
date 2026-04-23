# Media Management — Reference Architecture

Reference for porting a media-management feature (Charted Roots) to Draft Bench or other sibling Obsidian plugins. Covers file-to-entity linking, gallery rendering, thumbnail generation, crop regions, and orphaned-file auditing.

---

## What the feature is

An entity-agnostic system for attaching media files (images, PDFs, audio, video) to structured notes, rendering them in inline galleries, and auditing orphaned-vs-linked state across the vault. Same machinery works for every entity type — the service doesn't know what a "person" or "place" is, just that a note has a `media:` frontmatter array.

Key characteristics:

- **Flat frontmatter schema:** `media: ["[[file.jpg]]"]` as a wikilink array on the entity note. Companion `media_crop:` array for per-image crop regions.
- **Service layer is entity-agnostic.** The same `MediaService` works across all five CR entity types and would work for any new entity type without changes.
- **Lazy everything:** image thumbnails use CSS + `loading="lazy"`, PDF thumbnails render on-demand and cache in memory, crop-region data URLs cache in memory.
- **Modal family for interactions:** add, remove, reorder, bulk-link, pick from vault, upload from disk — each a focused modal, share the underlying service.
- **Orphan auditing built in:** a dedicated report walks the vault for media files not referenced by any entity, flagged as orphans.

---

## Total size snapshot (CR)

- Core services — **~1,339 LOC** across 4 files (service + PDF thumbnails + crop renderer + canvas association).
- UI modals — **~4,193 LOC** across 9 files (gallery, manager, picker, uploader, bulk-link, unlinked-media).
- Dynamic content block renderer — **~947 LOC** across 2 files.
- Profile-view media section — **~87 LOC**.
- Media inventory report — **~395 LOC**.
- GEDCOM OBJE import integration — embedded in the GEDCOM importer, not a separate file.
- Styles, settings — modest.

**Total: ~7,000 LOC.** A port that skips bulk operations, GEDCOM import, and crop regions lands closer to **~2,500 LOC**.

---

## File layout

```
src/core/
  media-service.ts                       ~433 LOC    Entity-agnostic service; parse, resolve, mutate
  pdf-thumbnail-service.ts               ~144 LOC    PDF.js-backed PDF thumbnailing with cache + dedup
  crop-renderer.ts                       ~110 LOC    Canvas-based image cropping with data-URL cache
  media-association.ts                   ~652 LOC    Canvas-layout media detection (CR-specific; skip for port)
  ui/
    media-gallery-modal.ts               ~621 LOC    Full-screen lightbox gallery
    media-manager-modal.ts               ~420 LOC    Link/unlink media to entities
    media-picker-modal.ts                ~740 LOC    Vault file browser with preview
    media-upload-modal.ts                ~512 LOC    Upload files to vault + optionally link
    media-manage-modal.ts                ~358 LOC    Reorder, remove, edit metadata
    bulk-media-link-modal.ts             ~572 LOC    Batch-link many images to one entity
    bulk-media-link-progress-modal.ts    ~196 LOC    Progress UI for batch operations
    unlinked-media-modal.ts              ~692 LOC    Find orphaned files
src/ui/
  media-lightbox-modal.ts                ~211 LOC    Minimal fullscreen image/PDF viewer
src/dynamic-content/
  renderers/media-renderer.ts            ~869 LOC    `charted-roots-media` code-block renderer
  processors/media-processor.ts          ~78 LOC     Parses code-block config attrs
src/profile-view/sections/
  media-section.ts                       ~87 LOC     Profile-view media grid
src/reports/services/
  media-inventory-generator.ts           ~395 LOC    Orphaned / coverage-gap report
src/gedcom/gedcom-importer-v2.ts         ~60 LOC embedded    OBJE record resolution
```

---

## Canonical schema

Everything pivots on two frontmatter arrays:

```yaml
# Wikilink array. Order matters for gallery display. Always present.
media:
  - "[[photo-of-alice.jpg]]"
  - "[[marriage-certificate.pdf]]"
  - "[[alice-death-record.jpg]]"

# Companion array. Omit for images without crops. Keyed by basename.
media_crop:
  - image: "photo-of-alice.jpg"
    x: 100       # pixel offsets by default
    y: 50
    w: 200
    h: 250
  - image: "group-photo-1920.jpg"
    x: 10        # percent-based when `percent: true`
    y: 20
    w: 50
    h: 60
    percent: true
```

**Why two arrays instead of nested objects:** nested frontmatter doesn't round-trip through Obsidian's Properties panel and has no UX affordance in Obsidian. Flat arrays do. CR made this an explicit design rule (see `flatten-nested-properties` planning doc).

**Crop region as percent vs pixels:** pixel crops are trivial; percent crops are necessary for media imported from tools like Gramps that don't know final image dimensions. The `percent: true` flag lets both coexist.

**Per-entity crop, not per-file:** the same image on two different notes can have two different crops. The crop lives with the entity's relationship to the image, not with the image itself.

---

## MediaService — the entity-agnostic core

One service, ~433 LOC, covers the full lifecycle. Constructor takes `app` and `settings`; no entity-type awareness.

```ts
export class MediaService {
  constructor(private app: App, private settings: PluginSettings) {}

  // Parse / resolve
  parseMediaProperty(fm: Record<string, unknown>): string[];
  resolveMediaItem(mediaRef: string): MediaItem;
  resolveMediaItems(mediaRefs: string[]): MediaItem[];
  resolveMediaItemsWithCrops(fm: Record<string, unknown>): MediaItem[];
  parseMediaCrops(fm: Record<string, unknown>): Map<string, MediaCrop>;

  // Convenience accessors
  getFirstThumbnailMedia(mediaRefs: string[]): MediaItem | null;
  getFirstThumbnailFile(mediaRefs: string[]): TFile | null;
  getMediaType(extension: string): MediaType;
  getResourcePath(file: TFile): string;

  // Filters
  isInMediaFolders(filePath: string): boolean;

  // Mutations (all go through processFrontMatter)
  addMediaToEntity(file: TFile, mediaRef: string): Promise<void>;
  removeMediaFromEntity(file: TFile, mediaRef: string): Promise<void>;
  reorderMedia(file: TFile, newOrder: string[]): Promise<void>;
  updateMediaProperty(file: TFile, mediaRefs: string[]): Promise<void>;
}
```

`MediaItem` is the resolved shape every renderer consumes:

```ts
interface MediaItem {
  mediaRef: string;         // original wikilink or path
  file: TFile | null;       // null when unresolvable (broken link)
  type: MediaType;          // 'image' | 'audio' | 'video' | 'pdf' | 'document' | 'other'
  displayName: string;      // basename without path
  extension: string;        // '.jpg', lowercased
  crop?: MediaCrop;         // from media_crop if matched
}
```

No caching at the service layer itself. Obsidian's `metadataCache` handles frontmatter caching; the two service-specific caches (PDF thumbnails, crop canvases) live in their dedicated services. This keeps the service stateless and fork-safe.

---

## Thumbnail generation

### Images

CSS-only. No pre-generation, no canvas resize. Three size presets as CSS classes on the grid:

```css
.cr-media__grid--small  { grid-template-columns: repeat(auto-fit, minmax(96px,  1fr)); }
.cr-media__grid--medium { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.cr-media__grid--large  { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
```

Every `<img>` gets `loading="lazy"`. The browser handles everything. No performance tuning needed until someone reports a vault with 1000+ images in one gallery.

### PDFs

A dedicated service (`PdfThumbnailService`, ~144 LOC) renders the first page to a 200×280 canvas and returns a data URL. Uses Obsidian's `loadPdfJs()` (which reuses the pdfjs already bundled for built-in PDF preview).

```ts
class PdfThumbnailService {
  private cache = new Map<string, string>();      // path → dataUrl
  private pending = new Map<string, Promise<string>>();  // dedup in-flight

  async getThumbnail(file: TFile): Promise<string> {
    const path = file.path;
    if (this.cache.has(path)) return this.cache.get(path)!;
    if (this.pending.has(path)) return this.pending.get(path)!;

    const promise = this.renderThumbnail(file).then(dataUrl => {
      this.cache.set(path, dataUrl);
      this.pending.delete(path);
      return dataUrl;
    });
    this.pending.set(path, promise);
    return promise;
  }

  getCached(path: string): string | null {
    return this.cache.get(path) ?? null;
  }
}
```

Two patterns worth calling out:

- **Pending-request deduplication.** If the gallery renders 10 PDFs and two cells ask for the same PDF's thumbnail simultaneously, the second call returns the first call's in-flight promise instead of starting a second render.
- **Synchronous `getCached()` escape hatch.** Gallery cells render an `<img>` placeholder first, check the cache synchronously, and attach `onload` async. Avoids the flash-of-placeholder in the common warm-cache case.

In-memory cache lives for the lifetime of the plugin instance. Obsidian reload clears it; worth it to avoid disk I/O for cached thumbnails.

---

## Image crop regions (optional)

Canvas-based rendering via `crop-renderer.ts` (~110 LOC):

```ts
async function applyCropToImage(
  img: HTMLImageElement,
  file: TFile,
  crop: MediaCrop,
  app: App
): Promise<string> {
  const cacheKey = `${file.path}:${crop.x},${crop.y},${crop.w},${crop.h},${crop.percent ?? false}`;
  if (cropCache.has(cacheKey)) return cropCache.get(cacheKey)!;

  const source = new Image();
  source.src = app.vault.getResourcePath(file);
  await new Promise(resolve => { source.onload = resolve; });

  const { x, y, w, h } = crop.percent
    ? { x: crop.x * source.width / 100, y: crop.y * source.height / 100,
        w: crop.w * source.width / 100, h: crop.h * source.height / 100 }
    : crop;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(source, x, y, w, h, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  cropCache.set(cacheKey, dataUrl);
  return dataUrl;
}
```

Applied by the gallery renderer, Profile View media section, and Family Chart card avatars (where genealogy users crop a face out of a group photo for the chart card).

**Skip this layer for a Draft Bench port** unless the domain benefits from it. Image regions (#354) were a genealogy-specific UX — users zoom into a face inside a wedding photo or census page. For generic media attachment, users will just upload the pre-cropped image instead.

---

## Gallery block renderer

The `charted-roots-media` code-block renderer (`media-renderer.ts`, ~869 LOC) is the most-seen media surface. A block in a note looks like this (shown indented to avoid nested fence ambiguity):

    ```charted-roots-media
    title: "Photos"
    columns: 3          # number or "auto"
    size: "medium"      # small | medium | large
    filter: "all"       # all | images | documents
    editable: true      # drag-reorder handles + context menu
    ```

Behaviors:

- Reads `media` and `media_crop` from the host note's frontmatter.
- Resolves via `MediaService.resolveMediaItemsWithCrops()`.
- Renders a responsive grid with `loading="lazy"` images.
- PDFs render a placeholder first, then the thumbnail async.
- Editable mode adds drag handles (uses native HTML5 drag-and-drop with a persistence hook that calls `reorderMedia()` on drop).
- Right-click context menu: Open in Obsidian, Open in new tab, Remove, Set crop region.

**Freeze / embed variant:** the block header has a "Freeze" button that converts the live gallery into a static callout of markdown image embeds. Useful for exports / snapshots. Probably skip for a port v1 — it's polish.

---

## Modal family

Each modal does one thing well. Share the service, not the UI.

| Modal | Purpose | Approx LOC |
|---|---|---|
| **Media Gallery** | Full-screen lightbox for viewing linked media (zoom, navigate, search, filter) | ~620 |
| **Media Manager** | Link or unlink media to a specific entity; bulk selection | ~420 |
| **Media Picker** | Browse vault for a file to attach; inline preview | ~740 |
| **Media Upload** | Pick from disk, copy to vault, optionally link to entity | ~510 |
| **Media Manage** | Reorder, remove, edit metadata on an entity's existing media | ~360 |
| **Bulk Media Link** | Link many images to one entity at once (e.g., album upload) | ~570 |
| **Unlinked Media** | Vault-wide audit showing orphan files; click to link | ~690 |
| **Media Lightbox** | Minimal fullscreen image/PDF viewer | ~210 |

For a port that doesn't need bulk operations, start with Media Picker + Media Manager + a simple lightbox. That's enough for "click to add one, click to remove one, click to view." Everything else is opt-in as users ask.

---

## Profile view integration

Thin wrapper over the gallery renderer (`profile-view/sections/media-section.ts`, ~87 LOC):

```ts
export function renderMediaSection(
  parent: HTMLElement,
  data: ProfileEntityData,
  options: SectionOptions,
  deps: { app: App; mediaService: MediaService; pdfThumbnailService: PdfThumbnailService }
): void {
  const mediaItems = deps.mediaService.resolveMediaItemsWithCrops(data.frontmatter);

  const content = renderProfileSection(parent, {
    sectionId: 'media',
    title: 'Media',
    summary: `${mediaItems.length} item${mediaItems.length === 1 ? '' : 's'}`,
    expanded: options.sectionStates['media'] ?? false,
    onToggle: options.onToggle,
    hidden: mediaItems.length === 0,
    icon: 'image'
  });
  if (!content) return;

  renderMediaGrid(content, mediaItems, deps);
}
```

Note the shape: the section is a thin orchestrator. Data loading is the service's job. Thumbnail rendering is the PDF service's job. Layout is the gallery renderer's job (reused). The section wires them together and hands control to the reusable pieces.

---

## Orphan / coverage audit

Vault-wide audit as a report (`media-inventory-generator.ts`, ~395 LOC):

- Scan the vault for files matching supported extensions.
- For each entity with a `media` array, collect which files are referenced.
- Compute two sets:
  - **Orphaned files:** on disk but not referenced by any entity.
  - **Coverage gaps:** entities without any media (filterable by type).

The report's output is pure markdown, written through the Reports pipeline:

```
Media Inventory Report
======================

Summary:
- Total files scanned: 1,247
- Linked files: 892
- Orphaned files: 355 ← click any to link
- Entities without media: 42 persons, 8 places

Orphaned Files by Category:
- /media/old_scans/: 128 files
  - 1900-census-page-47.jpg
  - 1900-census-page-48.jpg
  - ...
```

The Unlinked Media modal offers an interactive version of the same audit: browse orphans inline and link them to an entity without leaving the modal. Roughly ~690 LOC; worth porting if users maintain large media folders.

---

## Settings

Five user-facing settings, all optional with sensible defaults:

- `thumbnailSize: 'small' | 'medium' | 'large'` — gallery grid cell size, default `'medium'`.
- `mediaFolders: string[]` — restrict scanning to specific folders (e.g., `['Attachments/', 'Photos/']`). Empty = whole vault.
- `enableMediaFolderFilter: boolean` — toggle the above on/off without losing the configured folder list.
- `frozenGalleryCalloutType: string` — callout type for "frozen" galleries (converts live block to static snapshot). Only if you port the freeze feature.
- `showSourceThumbnails: boolean` — CR-specific; whether the Sources tab gallery shows thumbnails. Skip unless your domain has a sources equivalent.

Minimal port: just `thumbnailSize`. Defaults work for everything else.

---

## GEDCOM import (skip for non-genealogy ports)

CR's GEDCOM importer resolves `OBJE` records — GEDCOM's media-reference format — and converts them to `[[file.jpg]]` wikilinks in the generated person notes. Two steps:

1. Parser extracts `0 @Oxxxx@ OBJE` records into `GedcomData.media: Map<id, {filePath, format, title}>`. Individual / family / source / event records carry `mediaRefs` to these IDs.
2. Importer's `resolveMediaRefs()` maps each ID to a `[[filename]]` wikilink, validates against vault existence, collects unresolved names as warnings.

Out of scope for non-genealogy ports. If your domain has a similar external-import format, mirror the "parse → resolve → warn-on-missing" pattern. It's the only defensible shape.

---

## What's worth porting intact

1. **The two-array schema (`media` + `media_crop`).** Flat arrays, basename-keyed crops, percent-or-pixel flag. Don't get cute with nested objects.
2. **`MediaService` as entity-agnostic core.** Keep it stateless; entity-specific knowledge stays out. Makes it trivial to add a sixth entity type later.
3. **`MediaItem` discriminated return type.** Every renderer consumes the same shape; service has the only switch on extension → MediaType.
4. **PDF thumbnail cache + pending-request dedup.** The dedup alone is worth the porting effort — it's the difference between "gallery of 10 PDFs renders once" and "gallery of 10 PDFs kicks off 10 concurrent pdfjs renders."
5. **CSS-only image thumbnails with `loading="lazy"`.** Don't build a custom thumbnail cache for images. Let the browser do it.
6. **Gallery block renderer pattern.** The code-block-config-driven grid with freeze/embed, drag-reorder, and context menu is polished. Port the shape; trim features as needed.
7. **Media Manager modal.** Link/unlink UX for the common case. ~420 LOC. Clean pattern.
8. **Orphan audit as a report.** Users accumulate orphan files surprisingly fast. Reports should ship with the feature, not as a follow-up.

---

## What to skip or simplify for Draft Bench

- **`media-association.ts`** — canvas-based (Obsidian Canvas) media detection. Very CR-specific; skip entirely. Saves ~650 LOC.
- **Crop regions.** Image region UX is genealogy-specific (zooming into faces in group photos). A generic media port gets the same result from users cropping their images before upload.
- **Bulk link modals** (Bulk Media Link, Bulk Link Progress). Start with single-image flows; add bulk later if users ask.
- **Media Upload modal.** Obsidian already has a file import / drag-drop flow. A separate upload modal is only necessary if you want the "upload → immediately link to entity" single-step UX. Otherwise, users drag into the vault, then use the Picker.
- **Freeze / embed UI.** Snapshotting a live gallery into markdown is polish; skip v1.
- **GEDCOM import** unless your domain has an equivalent import format.
- **Source-specific gallery** (`src/sources/ui/media-gallery.ts`, ~417 LOC). CR has it because source notes have unique metadata needs (citations). Don't build per-entity-type galleries — reuse the generic one.

---

## LOC estimate for Draft Bench (core, no crop / no bulk / no GEDCOM)

| Component | Estimate |
|---|---|
| `media-service.ts` | ~350 LOC |
| `pdf-thumbnail-service.ts` | ~140 LOC (port intact) |
| Gallery block renderer (`media-renderer.ts`, simplified) | ~500 LOC |
| Media block processor (config parsing) | ~80 LOC |
| Media Manager modal | ~400 LOC |
| Media Picker modal | ~500 LOC |
| Media Lightbox modal | ~200 LOC |
| Profile-view media section | ~90 LOC |
| Media inventory report | ~350 LOC |
| Styles | ~300 LOC |
| **Total** | **~2,900 LOC** |

**~40% the size of CR's media system.** Porting effort: one engineer, ~4–5 weeks for MVP (gallery + picker + manager + profile section + audit report), assuming the plugin already has entity detection and a code-block registration path.

---

## Things that are CR-specific and not worth copying

- Media association heuristics for Obsidian Canvas (`media-association.ts`). Canvas-only, edge-connected / proximity / naming-convention detection. Highly specific to CR's canvas-generation feature.
- Source-role metadata on linked media (e.g., "this image is the source, linked as citation"). Domain-specific.
- Family Chart avatar cropping integration. Chart-specific integration point.
- `showSourceThumbnails` setting — only applies if your domain has a sources-tab equivalent.

---

## Patterns worth internalizing for any media feature

1. **Entity-agnostic service.** The service knows about notes with `media:` arrays, not about what "person" or "project" means. Makes adding new entity types a frontmatter change, not a code change.
2. **Schema-first design.** The `media` + `media_crop` flat arrays are the contract. Every UI, every importer, every exporter round-trips through that contract.
3. **Cache what's expensive to compute, not what's free.** PDF thumbnails: cache. Crop-rendered data URLs: cache. Image sizes / file extensions: don't bother.
4. **Dedup in-flight work.** Gallery renders with 10 PDFs should result in 10 renders, not 100. Promise-based dedup in the service layer solves this cleanly.
5. **Audit is a first-class surface, not an afterthought.** Orphan files accumulate. Ship the audit report with v1; it's the one surface users can't build themselves.
6. **Reuse modals, don't inherit them.** Gallery, Manager, Picker, Uploader each do one thing and share the service. Trying to unify them behind an abstract `MediaModal` base class makes each worse.

---

## Draft Bench adaptation

Media management is **out of scope for V1**. Scene-body image embeds (`![[photo.jpg]]`) are stripped-with-notice in V1 compile output (see [D-06 § content-handling rules](decisions/D-06-compile-preset-storage-and-content-rules.md)). This reference captures the target post-V1 shape so V1 decisions can avoid painting the future into a corner.

### Likely post-V1 direction

A first-class `dbench-type: media` note, one per media asset, wrapping the binary and carrying metadata. Rationale aligns with DB's notes-as-data philosophy:

- Bidirectional linking makes "which scenes use this image" queryable for free.
- Metadata properties (`dbench-media-credit`, `dbench-media-license`, `dbench-media-alt`, `dbench-media-source-url`) travel with the asset, not duplicated per-scene.
- Compile can auto-generate an image-credits back-matter section from media notes actually referenced in the compile set. Nonfiction and memoir writers get an auditable home for attribution data; fiction writers can ignore the metadata entirely.
- A `dbench-type: media` note participates in integrity service + orphan auditing for free (the orphan-audit report described above maps directly to a "media not referenced by any scene" surface).

### Patterns worth porting

- **Entity-agnostic `MediaService`.** Stateless; parses a `dbench-media` frontmatter array from any note's frontmatter (scenes, projects, presets, future types). No type-awareness in the service.
- **Flat frontmatter arrays.** `dbench-media: ["[[photo.jpg]]"]`; round-trips through Obsidian's Properties panel. Nested objects do not.
- **PDF thumbnail service with pending-request dedup.** ~140 LOC ports near-verbatim; prevents N-cell galleries from kicking off N concurrent pdfjs renders.
- **CSS-only image thumbnails + `loading="lazy"`.** No custom thumbnail cache for images.
- **Gallery as code-block renderer.** `dbench-media` fenced block reads the host note's frontmatter and renders a grid. Same pattern CR uses; adapt the prefix.
- **Orphan audit as a first-class surface.** Ships with the feature, not as a follow-up. Writers accumulate unused media (draft cover art, rejected illustrations, scratch references) and need visibility.

### Patterns to skip or defer

- **Crop regions.** Genealogy-specific (zooming into faces inside group photos). Writers pre-crop their images; no UX win for DB's domain. Saves ~110 LOC core + associated UI affordances.
- **Bulk link modals.** Single-image flows cover the common case. Add bulk if writers ask.
- **Media Upload modal.** Obsidian's native drag-drop flow is sufficient; a separate upload modal is only needed for the "upload and immediately link" single-step UX.
- **Canvas-based media association.** CR-specific (Obsidian Canvas integration). Skip entirely.
- **GEDCOM OBJE import.** No prose-writing equivalent.
- **Freeze / embed gallery variant.** Polish; skip V1 of the media feature.

### Integration with Book Builder (post-V1)

When image support lands in compile, the renderer's image-resolver callback (see [book-builder-reference.md](book-builder-reference.md)) queries `MediaService.resolveMediaItem()` for each `![[embed]]` encountered in scene bodies. The resolver returns binary data + mime type + credits + alt text; PDF and ODT renderers inline the binary with alt text; MD output preserves the wikilink with optional credit-footnote injection. Compile presets gain a content-handling rule for image embeds (include / strip); strip remains the V1 default.

An image-credits back-matter section becomes a preset toggle: compile walks the set of `dbench-type: media` notes referenced by included scenes and emits a sorted credits list.

### Related docs

- [D-06](decisions/D-06-compile-preset-storage-and-content-rules.md) — compile preset storage + content-handling rules; locks V1's "strip images with notice" behavior and reserves a post-V1 hook for image-embed handling.
- [book-builder-reference.md](book-builder-reference.md) — compile orchestration; describes where the image-resolver callback hooks in.
- [report-generation-reference.md](report-generation-reference.md) — rendering-layer patterns; PDF and ODT renderers would consume resolved media items.
