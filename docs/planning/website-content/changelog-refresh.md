# Changelog Page - draft

> **Goal:** draftbench.io `/changelog/` is a curated presentation layer over the wiki's [`Release-History.md`](../../../wiki-content/Release-History.md). One H2 per user-facing release (or multi-release wave when a feature landed in stages), 1-3 sentences each, with a "Read the full release notes ->" link to the matching anchor on the wiki. Internal-quality releases (scanner hygiene, refactors, build infrastructure, same-day hot-patches) get a single bottom paragraph pointing at the wiki rather than per-release entries here. Departs from the Charted Roots cluster pattern: DB's release density is low enough that flat per-release H2s work better than version-cluster grouping.

**Target page:** `/changelog/_index.md` on draftbench.io
**Source material:** [wiki Release-History.md](../../../wiki-content/Release-History.md) (canonical longer-form), [CHANGELOG.md](../../../CHANGELOG.md) (per-release detail).
**Last ported:** (none yet; this is the initial seed.)
**Pending port (next session):** full first-port covering all 11 curated entries (0.1.0 - 0.1.4 through 0.6.4).

---

## Authoring notes

- **Per-release H2.** Each curated entry is one `## <version>: <title> (<date>)` H2. Multi-release entries (Scrivener arc 0.5.0 - 0.5.2, V1-launch arc 0.1.0 - 0.1.4) collapse a wave under a single H2 with a date range.
- **User-facing filter.** Features, bug fixes a user can feel, UI changes, doc surfaces. Skip scanner hygiene, refactors, hot-patches, internal-quality releases. Those get a single bottom paragraph linking to the wiki + GitHub Releases.
- **1-3 sentences per release.** The wiki has the long-form; the website page is for scannability. Open each entry with the user-visible change in plain language.
- **Wiki backlink** closes each entry: `**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#<anchor>)**`. The wiki is the canonical source for full detail.
- **Internal-quality / hot-patch releases** fold into a single bottom paragraph linking to the wiki for the writer who wants every version. Specifically: 0.0.1, 0.1.1, 0.1.2, 0.1.3, 0.2.1, 0.2.2, 0.2.3, 0.5.3, 0.5.5, 0.6.0, 0.6.1, 0.6.2, 0.6.3.
- **Editorial style:**
  - No em-dashes. Use colons (apposition), commas (parallel), semicolons (consequence), periods, parentheses (asides).
  - ASCII arrows (`->`) in code-shape contexts; Unicode `->` is fine in link markers ("Read the full release notes ->") and UI breadcrumbs (`Settings -> Hotkeys`).
  - Sentence case in headings (matches Obsidian's UI convention).
  - Backticks for code identifiers only. Don't backtick ordinary technical terms.
- **Wiki anchor format.** GitHub's heading slugger lowercases, strips most punctuation (periods, colons, plus signs, em-dashes, parentheses, backticks), and converts spaces to hyphens. Em-dash + surrounding spaces collapse to a double hyphen. Example: `## 0.6.4: 2026-05-16 — Scanner hygiene + Scrivener import fix` -> `#064-2026-05-16--scanner-hygiene--scrivener-import-fix`. Verify each anchor against the live wiki before posting; GitHub's slugger sometimes diverges from intuition on edge cases.

---

## Draft content

Everything below this line is intended as the website page body. Hugo frontmatter (`title`, `description`, `date`, etc.) is added during the port.

---

# Changelog

For per-release detail, see the [wiki Release History](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History) (canonical) or [GitHub Releases](https://github.com/banisterious/obsidian-draft-bench/releases). This page surfaces user-facing changes.

## 0.6.4: Scanner hygiene + Scrivener import fix (2026-05-16)

Scrivener-imported scenes no longer leak `HYPERLINK "scrivcmt://..."` field-instruction text alongside visible content ([#37](https://github.com/banisterious/obsidian-draft-bench/issues/37)). Production minification dropped the bundle by 47% (5.83 MB to 3.09 MB), so startup is meaningfully faster on slower machines and Obsidian Sync stays under its 5 MB Standard-tier transfer limit.

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#064-2026-05-16--scanner-hygiene--scrivener-import-fix)**

---

## 0.5.4: Scene archive (2026-05-12)

Park scenes, chapters, or sub-scenes you aren't working on without deleting them. A "hidden statuses" mechanism filters them out of the Manuscript view's List and Continuous modes; a "Show archived" toolbar toggle reveals the hidden items at a muted opacity when you need them. The default status vocabulary grows by one entry (`archived`), and any status can be flagged hidden via the eye toggle in the statuses settings ([#36](https://github.com/banisterious/obsidian-draft-bench/issues/36)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#054-2026-05-12--scene-archive)**

---

## 0.5.0 - 0.5.2: Scrivener 3 project importer (2026-05-06 to 2026-05-09)

Import an entire Scrivener 3 project (`.scriv` bundle) as a Draft Bench project: chapters, scenes, sub-scenes, drafts, and inspector content (synopsis, document notes, inline comments, footnotes, custom metadata, labels, keywords) all carry across. An 8-step wizard reviews every mapping in a Preview step before any file gets written. The 0.5.1 follow-up added per-document snapshot import and a default compile-preset stub; 0.5.2 reframed the Source step on Android to route around builds whose system file picker ignores the `webkitdirectory` hint ([#28](https://github.com/banisterious/obsidian-draft-bench/issues/28), [#33](https://github.com/banisterious/obsidian-draft-bench/issues/33), [#34](https://github.com/banisterious/obsidian-draft-bench/issues/34), [#35](https://github.com/banisterious/obsidian-draft-bench/issues/35)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#050-2026-05-08--scrivener-3-project-import)**

---

## 0.4.0: Manuscript view Continuous mode (2026-05-06)

The Manuscript leaf gains a List / Continuous tab strip. Continuous renders the entire project as one scrollable read-only document covering chapters, scenes, sub-scenes, and full bodies, top to bottom in `dbench-order`. It's the surface for revision read-throughs that the per-scene List view isn't shaped for. Click any heading to jump to its source file; the four-control typography toolbar above the prose tunes text alignment, reading width, font size, and family ([#31](https://github.com/banisterious/obsidian-draft-bench/issues/31)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#040-2026-05-06--manuscript-view-continuous-mode)**

---

## 0.3.3: Manuscript leaf restyle (2026-05-05)

The Manuscript leaf moves from the original aesthetic (semantic status colors, gradient progress fills, per-scene mini bars) to a minimal style that harmonizes with the Manuscript Builder modal + leaf shipped in 0.3.0 and 0.3.1. Inline small-caps muted text replaces the colored status chips; the project progress bar shrinks to a 2px hairline; the per-scene drafts column drops since drafts live on the scene file itself ([#30](https://github.com/banisterious/obsidian-draft-bench/issues/30)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#033-2026-05-05--manuscript-leaf-restyle)**

---

## 0.3.2: Mobile support (2026-05-05)

Draft Bench loads on Obsidian Mobile (Android verified; iOS / iPadOS untested at ship time). Manuscript view, Manuscript Builder modal + leaf, all creation / retrofit / integrity / compile / Bases / Style Settings surfaces are mobile-supported. PDF, ODT, and DOCX compile to the vault works on mobile via Obsidian's vault API (the disk-output paths remain desktop-only by construction) ([#29](https://github.com/banisterious/obsidian-draft-bench/issues/29)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#032-2026-05-05--mobile-support)**

---

## 0.3.1: Dockable Manuscript Builder leaf (2026-05-05)

A "dock to leaf" button in the Manuscript Builder modal converts it into a workspace tab so writers can pin Preview next to a scene they're editing in another pane. The leaf supports debounced file-save reactivity that the modal couldn't, so Preview updates as the source scene saves (400ms debounce, project members only). Last-selected preset persists per project; Preview scroll position survives re-renders ([#27](https://github.com/banisterious/obsidian-draft-bench/issues/27)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#031-2026-05-05--dockable-manuscript-builder-leaf)**

---

## 0.3.0: Manuscript Builder Preview tab (2026-05-04)

A Preview tab in the Manuscript Builder modal renders the current preset's compile output as continuous read-only prose: tune settings on Build, flip to Preview, see the impact, iterate, without writing a real export file. Tested clean against a 110k-word fixture project. A four-control typography toolbar (text alignment, reading width, font size, font family) sits above the prose; preferences persist globally ([#26](https://github.com/banisterious/obsidian-draft-bench/issues/26)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#030-2026-05-04--manuscript-builder-preview-tab)**

---

## 0.2.4: Manuscript view + Builder UI polish (2026-05-04)

Three polish items across the Manuscript view and Manuscript Builder. The status chip drops its redundant colored dot since the pill background already encoded the status color. The Builder's status filter restyled as toggleable pills instead of native checkboxes (which read as single-select despite being multi-select). The Manuscript view's primary CTA now opens the Builder rather than short-circuiting to instant compile, renamed "Compile..." per the ellipsis convention for "opens further UI" ([#23](https://github.com/banisterious/obsidian-draft-bench/issues/23), [#24](https://github.com/banisterious/obsidian-draft-bench/issues/24), [#25](https://github.com/banisterious/obsidian-draft-bench/issues/25)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#024-2026-05-04--manuscript-view--builder-ui-polish)**

---

## 0.2.0: Sub-scene note type (2026-05-04)

A new `sub-scene` note type joins the V1 vocabulary, letting writers break a scene into per-unit narrative blocks (e.g., the setpieces of an auction night, the movements of a trial sequence) with their own status, drafts, word count, and reorder position. Sub-scenes render as collapsible cards in the Manuscript view; the compile pipeline descends into them in `dbench-order`; the integrity service tracks them with the same scan + repair affordances as scenes. The settings tab reorganized into collapsible sections; the `scenesFolder` setting now accepts a `{chapter}` token so chapter-aware projects auto-nest scenes under their chapter folder ([#10](https://github.com/banisterious/obsidian-draft-bench/issues/10), [#11](https://github.com/banisterious/obsidian-draft-bench/issues/11), [#18](https://github.com/banisterious/obsidian-draft-bench/issues/18)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#020-2026-05-04--sub-scene-note-type)**

---

## 0.1.0 - 0.1.4: V1 launch and post-launch polish (2026-04-29 to 2026-04-30)

First BRAT-public release shipped the full V1 feature set per the [specification](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md). Five plugin-managed note types (`project`, `chapter`, `scene`, `draft`, `compile-preset`) with frontmatter-based identity, a dockable Manuscript view, the Manuscript Builder compile modal, the integrity service, retrofit actions, templates with token substitution and Templater pass-through, Bases integration, Style Settings hooks, and the onboarding welcome modal with an example-project generator. The same week brought four follow-up patches surfaced from real-vault migration testing: context-menu submenu consolidation under a single `Draft Bench` entry, editor-menu registration, wikilink-display polish for Obsidian's Properties panel round-trip, and the `New draft of this scene` affordance to match the `New draft of this chapter` one already in place ([#3](https://github.com/banisterious/obsidian-draft-bench/issues/3) through [#9](https://github.com/banisterious/obsidian-draft-bench/issues/9)).

**[Read the full release notes ->](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History#010-2026-04-29--first-brat-public-release)**

---

## Internal releases

Internal-quality releases (scanner hygiene, refactors, build-infrastructure work, same-day hot-patches that don't reach the user surface) are listed in the canonical [wiki Release History](https://github.com/banisterious/obsidian-draft-bench/wiki/Release-History). Full chronology including version metadata is on [GitHub Releases](https://github.com/banisterious/obsidian-draft-bench/releases).

---

## Port history

| Date | Port commit | Notes |
|---|---|---|
| (none yet) | | Initial seed pending |
