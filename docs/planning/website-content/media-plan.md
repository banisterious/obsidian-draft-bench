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

## Tier 1 captures (action plans)

Five motion loops, captured ahead of V1 launch. Each block below is a self-contained action plan: setup checklist, click choreography, capture frame, post-process steps, output destinations. Work through one block per capture session; check items off as you go.

**Recommended capture order** (by setup difficulty):

1. Manuscript view in action — easiest, dev-vault as-is
2. Scene-to-draft snapshot — same vault state, small choreography
3. Compile flow — needs The Salt Road's compile preset, which the seed already includes
4. New project flow — needs an empty vault state, captured before any project exists
5. Integrity repair — needs a deliberately-broken state, captured last so the rest of the vault stays clean

**Tooling assumed**: ShareX for screen capture, Paint.NET / ScreenToGif / kdenlive for post. ffmpeg encode to webm per [§ Format and size targets](#format-and-size-targets).

---

### Capture: `dbench-manuscript-view.webm`

**Type**: motion loop · **Target duration**: 25-32s · **Embed**: features page, "Write" section

**Setup checklist**

- [x] Theme: Obsidian default (light)
- [x] Accent color: `#5b8cd6` (matches brand idea-status blue) or theme default; lock before recording
- [x] Vault: `dev-vault`, fresh reload (Ctrl+R)
- [x] Layout: Manuscript view docked right sidebar; file explorer hidden; main pane shows a chapter file or empty
- [x] Selected project: **The Salt Road**
- [x] All chapter cards collapsed except Ch01 (so the open-state is visible at start)

**Action sequence**

- [x] (0-3s) Static rest: leaf at rest, Ch01 expanded showing Departure / First night / Sighting the river
- [x] (3-7s) Click Ch02 header → smooth expand animation reveals scene rows
- [x] (7-11s) Cmd-click "Climb begins" title → opens in a new tab to the right
- [x] (11-22s) Open the Reorder scenes modal (palette `Draft Bench: Reorder scenes`, or the toolbar's Reorder button, scoped to Ch01) → grab the drag handle on "Sighting the river" and drag it above "First night" → drop → click "Apply order" → modal closes → Ch01's card body shows the new order with updated capsule numbers
- [x] (22-32s) In the side pane (the Cmd-clicked "Climb begins" scene), type a sentence into the `## Draft` section → Ch02's word-count rollup ticks live in the leaf

**Notes for the capture**

- Reordering happens in a dedicated modal, not inline drag on the leaf. The modal is the canonical reorder UX (matches spec § Reordering).
- Cleanup after capture: open the Reorder scenes modal again and drag "Sighting the river" back below "First night" to restore the seed order, OR revert via git status on the affected scene `dbench-order` values.

**Capture frame**: full Obsidian window minus title bar; 1920×1080 source

**Post-process**

- [x] Trim raw to clean start (after any ShareX countdown) and clean end (after the word-count rollup updates settle)
- [x] Strip audio
- [x] Encode: `ffmpeg -i raw.mp4 -c:v libvpx-vp9 -crf 32 -an -b:v 0 dbench-manuscript-view.webm`
- [x] Verify size ≤ 5MB; if larger, bump CRF to 34 and re-encode

**Outputs**

- [x] Raw saved at `docs/images/raw/dbench-manuscript-view.mp4` (gitignored)
- [x] Optimized webm copied to website repo `static/img/dbench-manuscript-view.webm`
- [x] Embedded on draftbench.io features page per § Embed pattern

---

### Capture: `dbench-new-draft.webm`

**Type**: motion loop · **Target duration**: 12-18s · **Embed**: features page, "Versioned drafts" section

**Setup checklist**

- [x] Same theme + accent settings as the Manuscript view capture (lock once, reuse)
- [x] Vault: `dev-vault`
- [x] Layout: scene file open in main pane; Manuscript view in sidebar; file explorer hidden
- [x] Active scene: **Departure** (under Ch01, has prose body + frontmatter visible)
- [x] Pre-condition: scene currently has no prior drafts (or only one, so the Notice reads `Created Draft 2 of Departure`)

**Action sequence**

- [x] (0-2s) Static: Departure open, scrolled to show some prose
- [x] (2-5s) Right-click in editor (or click scene title in Manuscript view) → context menu opens
- [x] (5-7s) Hover "Draft Bench" submenu → "New draft of this scene" highlighted
- [x] (7-9s) Click "New draft of this scene" → preview modal opens showing draft number and target path
- [x] (9-11s) Click "Create draft" → modal closes, Notice appears top-right `✓ Created Draft 1 of Departure`
- [x] (11-15s) New draft note auto-opens in the active leaf; pause to show frontmatter (`dbench-type: draft`, `dbench-scene: [[Departure]]`, `dbench-draft-number: 1`)
- [x] (15-18s) Pan back to Manuscript view → Departure row's draft count badge updated to `1 draft`

**Capture frame**: full Obsidian window; consider zooming in on the Properties panel during the frontmatter pause

**Post-process**

- [x] Trim
- [x] Strip audio
- [x] Encode: same ffmpeg command, output `dbench-new-draft.webm`
- [x] Verify size ≤ 4MB (shorter loop)

**Outputs**

- [x] Raw at `docs/images/raw/dbench-new-draft.webm`
- [x] Optimized in website repo `static/img/dbench-new-draft.webm`

**Cleanup after capture**: delete the just-created draft file from the dev-vault to restore the seed state for re-takes.

---

### Capture: `dbench-compile-flow.webm`

**Type**: motion loop · **Target duration**: 25-35s · **Embed**: features page, "Compile" section

**Setup checklist**

- [x] Theme + accent locked
- [x] Vault: `dev-vault`
- [x] Selected project: **The Salt Road**
- [x] At least one compile preset exists for The Salt Road (the seed includes "Workshop"); format is `md` and destination is `vault` for the cleanest visual flow (no OS save dialog)
- [x] Layout: Manuscript view in sidebar, main pane on a chapter file

**Action sequence**

- [x] (0-3s) Static: Manuscript view with The Salt Road selected, Compile button visible
- [x] (3-7s) Click "Compile" CTA → Manuscript Builder modal opens
- [x] (7-13s) Show preset header dropdown with "Workshop" selected; scroll past Inclusion + Output + Content handling sections so each is briefly visible
- [x] (13-15s) Click "Run compile" button at top of modal
- [x] (15-18s) Modal closes; Notice appears `✓ Compiled to <path>`
- [x] (18-25s) Compiled markdown file auto-opens in the active leaf showing chapter headings and concatenated scene bodies
- [x] (25-35s) Pan/scroll through the compiled output to demonstrate continuity

**Capture frame**: full Obsidian window

**Post-process**

- [x] Trim
- [x] Strip audio
- [x] Encode: same ffmpeg command, output `dbench-compile-flow.webm`
- [x] Verify size ≤ 5MB

**Outputs**

- [x] Raw at `docs/images/raw/dbench-compile-flow.mp4`
- [x] Optimized in website repo `static/img/dbench-compile-flow.webm`

**Cleanup**: delete the generated `<project>/Compiled/Workshop.md` so subsequent re-takes start clean.

---

### Capture: `dbench-create-project.webm`

**Type**: motion loop · **Target duration**: 18-25s · **Embed**: homepage hero (or Getting Started section)

**Setup checklist**

- [ ] Theme + accent locked
- [ ] Vault: a **fresh empty capture vault** (do NOT use dev-vault — needs no existing projects). Easiest: copy a clean Obsidian vault to `~/capture-vault`, enable Draft Bench from Community plugins, no projects created yet
- [ ] Layout: file explorer visible (so the writer can see the folder structure get created)
- [ ] Welcome modal already dismissed (capture this flow separately if you want to show onboarding)

**Action sequence**

- [ ] (0-3s) Static: empty Obsidian, file explorer empty or near-empty
- [ ] (3-6s) Open command palette (Ctrl+P) → type "Draft Bench: Create" → "Draft Bench: Create project" highlighted
- [ ] (6-8s) Press Enter → new-project modal opens
- [ ] (8-13s) Type project title `The Lighthouse`, choose Folder shape, leave default location, click Create
- [ ] (13-16s) Modal closes; Notice `✓ Created project The Lighthouse`
- [ ] (16-20s) Manuscript view auto-reveals on the right; file explorer shows the new `Draft Bench/The Lighthouse/` folder with project note + scene placeholder
- [ ] (20-25s) Project note opens in main pane showing stamped frontmatter (`dbench-type: project`, `dbench-id`, `dbench-status: idea`)

**Capture frame**: full Obsidian window with file explorer visible on the left

**Post-process**

- [ ] Trim
- [ ] Strip audio
- [ ] Encode: same ffmpeg command, output `dbench-create-project.webm`
- [ ] Verify size ≤ 5MB

**Outputs**

- [ ] Raw at `docs/images/raw/dbench-create-project.mp4`
- [ ] Optimized in website repo `static/img/dbench-create-project.webm`

**Cleanup**: capture vault stays around for re-takes; reset by deleting `Draft Bench/The Lighthouse/` between takes.

---

### Capture: `dbench-repair-integrity.webm`

**Type**: motion loop · **Target duration**: 18-25s · **Embed**: features page, "Integrity" section

**Setup checklist**

- [ ] Theme + accent locked
- [ ] Vault: `dev-vault`, with a **deliberate manual break** introduced just before recording (see "Break the link" below)
- [ ] Layout: file explorer visible; main pane on the broken scene file
- [ ] Selected project in Manuscript view: **The Salt Road**

**Break the link** (do this once, immediately before capture):

- [ ] Open `Draft Bench/The Salt Road/Ch01 - The crossing/Departure.md`
- [ ] In Properties panel, change `dbench-chapter-id` to a garbage value like `chp-xxx-xxx-xxx` (preserving the wikilink); save
- [ ] Confirm Manuscript view shows Departure missing from Ch01's card body (or in the wrong place)

**Action sequence**

- [ ] (0-3s) Static: Manuscript view shows broken state (Departure missing or visually orphaned); file explorer shows the file is still there
- [ ] (3-6s) Open command palette → type "Repair" → "Draft Bench: Repair project links" highlighted
- [ ] (6-8s) Press Enter → repair modal opens with project picker
- [ ] (8-12s) Pick "The Salt Road" → modal scans, lists detected issues (e.g., `STALE_CHAPTER_ID_ON_SCENE`)
- [ ] (12-16s) Click "Apply repairs" → Notice `✓ Repaired N issues`
- [ ] (16-22s) Modal closes; Manuscript view updates → Departure reappears under Ch01's card
- [ ] (22-25s) Static end: clean state restored

**Capture frame**: full Obsidian window with file explorer + main pane + Manuscript view all visible

**Post-process**

- [ ] Trim
- [ ] Strip audio
- [ ] Encode: same ffmpeg command, output `dbench-repair-integrity.webm`
- [ ] Verify size ≤ 4MB

**Outputs**

- [ ] Raw at `docs/images/raw/dbench-repair-integrity.mp4`
- [ ] Optimized in website repo `static/img/dbench-repair-integrity.webm`

**Cleanup after capture**: revert the Departure scene's `dbench-chapter-id` to `chp-slt-tst-001` (the original value) so the dev-vault returns to seed state.

---

## Tier 2 captures (static screenshots)

Three stills, lower priority than the motion loops. Capture as a second pass; useful for documentation pages and reference content.

---

### Capture: `dbench-compile-preset-properties.png`

**Type**: still · **Embed**: wiki Manuscript-Builder.md or Compile section of features page

**Setup checklist**

- [ ] Theme + accent locked
- [ ] Vault: `dev-vault`
- [ ] Open: a compile-preset note (`Draft Bench/The Salt Road/Compile Presets/Workshop.md`)
- [ ] Properties panel visible in the right pane (toggle if needed)
- [ ] Show the full set of `dbench-compile-*` properties (heading scope, frontmatter handling, wikilinks, embeds, dinkuses, last-compile fields)

**Capture**

- [ ] Frame: main pane + Properties panel, file explorer hidden
- [ ] Resolution: 1920×1080 source; can crop to relevant area in Paint.NET

**Post-process**

- [ ] Crop to relevant content (drop unrelated chrome)
- [ ] Optimize: PNG, ≤ 500KB. If over, run through pngcrush / oxipng

**Outputs**

- [ ] Raw at `docs/images/raw/dbench-compile-preset-properties.png` (full-res, tracked)
- [ ] Optimized in website repo `static/img/dbench-compile-preset-properties.png`

---

### Capture: `dbench-bases-projects.png`

**Type**: still · **Embed**: features page, "Bases-native discovery" section; possibly homepage

**Setup checklist**

- [ ] Theme + accent locked
- [ ] Vault: `dev-vault`
- [ ] Pre-condition: Bases starter views installed (run palette command **`Draft Bench: Install starter Bases views`** once; generates files at `Draft Bench/Bases/`)
- [ ] Open: `Draft Bench/Bases/projects.base` (the projects starter view)
- [ ] View shows multiple projects with key columns (title, status, scene count, target words)

**Capture**

- [ ] Frame: main pane only (Bases view full-width); sidebars hidden
- [ ] Resolution: 1920×1080 source

**Post-process**

- [ ] Crop to remove tab strip if it's not informative
- [ ] Optimize: PNG, ≤ 500KB

**Outputs**

- [ ] Raw at `docs/images/raw/dbench-bases-projects.png`
- [ ] Optimized in website repo `static/img/dbench-bases-projects.png`

---

### Capture: `dbench-style-settings.png`

**Type**: still · **Embed**: wiki Settings-And-Configuration.md or features page footer

**Setup checklist**

- [ ] Theme + accent locked
- [ ] Vault: `dev-vault`
- [ ] Pre-condition: Style Settings community plugin installed and enabled
- [ ] Open: Settings → Style Settings → Draft Bench section expanded showing all exposed variables (scene typography, draft archival cue, etc.)

**Capture**

- [ ] Frame: Settings modal only, cropped to the Draft Bench section
- [ ] Resolution: 1920×1080 source

**Post-process**

- [ ] Crop to the Draft Bench section + a sliver of context above (showing it's nested under Style Settings)
- [ ] Optimize: PNG, ≤ 400KB (mostly UI chrome, compresses well)

**Outputs**

- [ ] Raw at `docs/images/raw/dbench-style-settings.png`
- [ ] Optimized in website repo `static/img/dbench-style-settings.png`

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
