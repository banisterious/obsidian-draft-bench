# Media plan

Asset inventory + capture-session priorities for [draftbench.io](https://draftbench.io). Stub for Phase 0; the real plan lands closer to V1 once features stabilize and a tier-1 capture session is worth scheduling.

This file follows the conventions in [website-strategy-reference.md § 5](../website-strategy-reference.md). Read that section before any capture work.

---

## Phase 0: what's needed now

All assets live in [`docs/assets/branding/`](../../assets/branding/). The website session copies the relevant ones into the Hugo repo's `static/img/` directory (NOT `assets/img/`, per § 5.2). Use the canonical inventory and intended-use guidance from [brand-guidelines.md](../../assets/branding/brand-guidelines.md).

| Asset | File | Where it goes |
|---|---|---|
| Site header / nav lockup | `draft-bench-horizontal.svg` | Hugo `params.logo` (target render height 40-60 px) |
| Hero / primary mark | `draft-bench-graphite-on-ivory.svg` | Homepage hero block |
| Favicon (modern) | `favicon-32.png` | Hugo favicon config |
| Favicon (legacy) | `favicon.ico` | Hugo favicon config |
| Apple touch icon | `favicon-180.png` | Hugo favicon config |
| Android / PWA | `icon-192.png`, `icon-512.png` | Hugo favicon config |
| OG / social card | `draft-bench-social-card.png` (1200×630) | `static/img/social-card.png` -> `params.defaultSocialImage` |

The homepage and FAQ are otherwise text-only. The comparison page has one table but no images. The pre-V1 site doesn't need screenshots, motion captures, or hero shots beyond the mark.

**Color and typography from the brand:** Graphite `#2B2B2D` ink, Ivory `#F7F3E9` ground; Fraunces (Google Fonts) for display + body. The Hugo theme palette should be tuned to match — see brand-guidelines.md § Color and § Typography for the canonical values. Mirror the chartedroots.com pattern of defining a custom Blowfish color scheme rather than overriding theme variables ad hoc.

## Plugin prefix for media files

**Locked:** `dbench-`. Matches the CSS class prefix and frontmatter property prefix; consistent across the project.

Convention: `dbench-<feature>-<variant>.<ext>` per § 5.1. Lowercase, hyphens, no underscores.

Examples (when capture work begins):

- `dbench-manuscript-view.png`
- `dbench-compile-flow.webm`
- `dbench-create-project-modal.png`
- `dbench-drafts-folder-standard.png`

## Tier 1 candidates (deferred to V1 launch)

When V1 ships and the surface is stable, the first capture session targets these — likely 3-5 motion loops + a handful of static screenshots. Don't capture earlier; pre-V1 UI is still moving.

- **Project creation flow** — modal, generated folder structure, first scene seeded.
- **Manuscript Builder in action** — chapter cards collapsing, scene reorder, word-count rollups updating live.
- **Scene-to-draft snapshot** — context menu -> "New draft from scene" -> draft created and linked.
- **Compile flow end-to-end** — preset selection, run, output file opens.
- **Integrity service repair** — broken link surfaced, batch repair UI.

Static screenshots (lower priority for V1, populate as a second pass):

- Compile preset note in Properties panel (showing the content-handling rules).
- Bases starter view for projects.
- Style Settings panel showing Draft Bench's exposed variables.

## Format and size targets

Per § 5.3 (locking the conventions here so the V1 session doesn't re-derive):

- **Static screenshots:** PNG. ≤500 KB per file post-optimization.
- **Motion loops:** WebM (`libvpx-vp9 -crf 32 -an`). MP4 fallback only if older-browser support comes up. ≤5 MB per file.
- **No GIFs** unless a sub-3-second micro-loop where the size difference is negligible.

## Embed pattern

Per § 5.4, motion loops use raw HTML rather than Blowfish's `{{< video >}}` shortcode:

```html
<video autoplay muted loop playsinline preload="metadata"
       src="/img/<filename>.webm"
       aria-label="<short factual description>"></video>
```

Requires `markup.goldmark.renderer.unsafe = true` in `hugo.toml`. The website session sets this up as part of the initial scaffolding.

## Source-of-truth raw vs. site-ready

Per § 5.6:

- **Raw captures** live in this plugin repo at `docs/images/raw/`. Full resolution, untouched. Gitignore `*.webm` and `*.mp4` here (large files; only the optimized versions ship).
- **Site-ready optimized** versions live in the website repo at `static/img/`. Smaller, scaled, format-finalized.

This split is established convention from chartedroots.com; mirroring it for Draft Bench keeps regenerate-at-different-size workflows simple.

## Anti-patterns (per § 8 + § 5.5)

- **No per-release banners.** "v0.x.y has shipped! Read the changelog →" is a maintenance treadmill that adds visual noise. GitHub releases is the canonical announcement channel.
- **No standalone screenshots gallery.** Once the features page is well-illustrated, a `/screenshots/` page is redundant.
- **No "Coming soon" sections that don't get audited.** If the section claims a feature is coming and it's already shipped (or quietly dropped), credibility leaks.
- **Bandwidth ceiling: ~15-20 MB cumulative motion per page** before switching to `IntersectionObserver`-based play-when-visible. Track per page as the library grows.
