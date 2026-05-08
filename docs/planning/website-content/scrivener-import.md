# Importing from Scrivener

> Source-of-truth draft for a features-page section (or standalone feature page) on draftbench.io. The website session decides whether to slot this as a section of the existing features page or break it out as its own page (`/features/scrivener-import/`).

A multi-step wizard reads a Scrivener 3 project bundle from inside the vault and produces a fresh Draft Bench project. Chapters, scenes, sub-scenes, drafts, and inspector content all carry across; every mapping is reviewed in a Preview step before any file gets written.

## What it does

- **Reads `.scrivx` + RTF/RTFD bodies.** Scrivener 3 binder hierarchy, document text, snapshots, and inspector content are parsed into an in-memory model.
- **Maps the binder to Draft Bench's four levels.** Auto-detection runs on parse: deepest leaves with prose -> scenes; immediate folder parents -> chapters; anything above the chapter level (Parts, Books, Volumes) becomes `scrivener-part` frontmatter on the chapters they contain; sub-sub-scenes concatenate as nested headings inside the parent sub-scene. A per-row override dropdown surfaces in the Hierarchy Mapping step for any auto-detection that doesn't fit.
- **Routes statuses, labels, and custom metadata interactively.** Scrivener statuses match against Draft Bench's status vocabulary; unmatched rows can add to the vocabulary or drop. Labels go to a writer-named frontmatter key (default `scrivener-label`). Custom metadata routes per-field with type-aware coercion: Checkbox to boolean, List to resolved option title, Date to ISO `YYYY-MM-DD`, Text to raw string.
- **Converts RTF bodies to markdown.** Italics, bold, lists, smart quotes, em-dashes, footnotes (inline + inspector), comments (rendered as Obsidian `%% %%` syntax at the original anchor), inline images (extracted to `Research/Images/`), and cross-document Scrivener Links (rewritten to wikilinks via a UUID-to-path map) all carry across. Complex RTF tables fall back to inline HTML and are flagged in the import error log.
- **Optional snapshot import.** Per-document Scrivener snapshots become `dbench-type: draft` files alongside each scene. Per-scene cap (1 / 3 / 5 / All); filename template with variables `{scene}` `{title}` `{date}` `{date_compact}` `{time}` `{n}`. Original Scrivener title preserved as `scrivener-snapshot-title` frontmatter regardless of whether `{title}` appears in the template.
- **Optional Research import.** The Research folder and any other non-manuscript top-level folders carry across with hierarchy preserved verbatim. Templates and Trash are always skipped.
- **Cross-platform.** The importer reads via Obsidian's vault adapter on every supported OS. Mobile users (Android verified; iOS / iPadOS untested) get the same wizard and the same write pass.

## What V1 doesn't do

- **Scrivener 2 and iOS Scrivener formats.** Different schema and bundle structure. Re-add as separate parser paths post-V1 if a contributor surfaces with a project to test against.
- **Reading `.scriv` bundles from outside the vault.** Copy the bundle into the vault first. The wizard's Source step can do the copy on most platforms via drag-drop or the device picker.
- **Compile-format translation.** Scrivener compile presets don't map cleanly to Draft Bench compile presets. Build your DB presets from scratch after import.
- **DB -> Scrivener export.** No demand for the reverse direction.

## Where it sits

Scrivener is the dominant prior tool for the fiction writers Draft Bench targets. Without an importer, every Scrivener user has to manually rebuild project structure scene by scene. The importer closes that gap: a Scrivener project becomes a Draft Bench project with one wizard pass, no scripting required.

Full walkthrough, mapping reference, and troubleshooting at the [wiki page](https://github.com/banisterious/obsidian-draft-bench/wiki/Importing-from-Scrivener).

---

## Notes for the website session

- **Voice.** Factual, behavior-described. Don't pitch ("seamlessly migrate your work") and don't second-person-plural ("you and your team"). The plugin is "Draft Bench," not "we."
- **Slot.** Either a section of `/features/` (between the existing Compile and Bases sections, since the import is itself a Compile-adjacent migration story) or a dedicated `/features/scrivener-import/` subpage if the features page is getting long. Maintainer's call during the port.
- **Hero asset.** Motion capture is **live at `https://draftbench.io/img/dbench-scrivener-import.webm`** (uploaded alongside the 0.5.0 ship; raw source kept locally at `docs/images/raw/dbench-scrivener-import.webm`, gitignored). Per-step stills also exist at `docs/images/dbench-scrivener-import-{source,parse,hierarchy,metadata,snapshots,preview,complete}.png` (committed in the plugin repo); their counterparts need to land at `static/img/<same-name>.png` in the Hugo repo. See [media-plan.md § Tier 3](media-plan.md) for the full capture inventory and optimization notes.
- **Cross-link.** The homepage already carries a "Scrivener 3 import" bullet under "What it does" (added in the 0.5.0 content refresh) but doesn't yet link to a destination — point it at whichever page this content slots into. The FAQ's "Does it import from Scrivener?" answer and the comparison-page Scrivener section already point at the wiki page; either keep those wiki-pointing or repoint to the new features page once it lands.
