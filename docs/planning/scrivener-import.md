# Scrivener `.scriv` import (pre-1.0)

Planning doc for adding a Scrivener 3 project importer to Draft Bench. Originally captured as candidate #1 in [post-v1-candidates.md](post-v1-candidates.md), promoted to its own planning doc on 2026-05-05 with a pre-1.0 target.

**Status:** Drafted 2026-05-05. Sections below mirror [manuscript-builder-preview.md](manuscript-builder-preview.md)'s template (the most recent pre-1.0 promotion precedent). Implementation tracked via [#28](https://github.com/banisterious/obsidian-draft-bench/issues/28).

**Target release:** Pre-1.0; specific minor TBD when scheduled. Likely 0.5.0 or later given scope (3-4 weeks of focused work plus QA against real `.scriv` corpora).

**One-line scope.** Read a Scrivener 3 project (`.scriv` bundle containing a `.scrivx` index file plus per-document RTF/RTFD bodies) and produce a Draft Bench project: project / chapters / scenes / sub-scenes mapped from the binder hierarchy, RTF bodies converted to markdown, inspector metadata (synopsis, document notes, custom fields, comments, footnotes) preserved, and snapshots optionally imported as `dbench-type: draft` files.

---

## Why this is pre-1.0

Scrivener is the dominant prior tool for the fiction writers Draft Bench targets. Without an importer, a Scrivener user has to manually rebuild their project structure scene by scene; that's enough friction to send them to StoryLine (which has an importer) or to give up on migrating entirely. The presence of an importer is a marketing-tier feature: it's the answer to "but I have ten years of Scrivener projects."

Bumping it pre-1.0 means the 1.0 launch carries a comparable migration story to StoryLine's. As of 0.3.1 the dependencies are met (chapter type, drafts, compile pipeline, sub-scenes, integrity hardening, Bases integration); waiting until post-1.0 leaves the migration story for last and risks 1.0 readers concluding DB doesn't do what they need.

The cost is real: 3-4 weeks of focused work, a long QA tail (RTF fidelity is fiddly), and a meaningful new design surface (DB's first wizard). All accepted in exchange for a 1.0 release that doesn't have an obvious migration gap.

---

## What's locked at the meta level

Decisions ratified during the design conversation on 2026-05-05 (preserved here so the implementation phase doesn't re-litigate):

- **Scrivener 3 only for V1.** Scrivener 2 (`.scriv` schema differs in some areas) and iOS Scrivener (different bundle structure) are deferred. The maintainer is on Windows; Windows Scrivener went 1.x straight to 3.x, so 2.x support requires a Mac user with a 2.x project for testing. Add as a separate parser path post-V1 if a Mac contributor surfaces.
- **Multi-step linear wizard** (no branching states). Per the [DB commitments in wizards-reference.md](wizards-reference.md), this is DB's first wizard; built standalone, no shared abstract base. Sets the pattern for later wizards (onboarding, compile preset editor) but doesn't constrain them.
- **In-session form-data persistence only.** The wizard's `formData` object survives Back / Next navigation within a session (writer can revise mappings after seeing Preview). No cross-session resume; the source `.scriv` may have changed between sessions and parsing is fresh anyway. Matches CR's Import Wizard pattern, which also doesn't persist.
- **Discoverability: command palette + Manuscript view button.** Palette command for muscle memory, small button in the Manuscript view next to the existing "Create project" button for empty-state discovery. No settings tab row; the Manuscript view button covers persistent re-import discoverability adequately.
- **Onboarding hook deferred** to Phase 3+ (when onboarding ships). At that point the importer becomes a first-class option in the welcome flow alongside "Start fresh." Don't block the importer milestone on this.
- **Compile settings: skipped entirely.** Scrivener compile formats don't translate cleanly to DB compile-presets. Importer creates the project structure; writer builds DB compile-presets from scratch. Optional stub: a default-named "Imported defaults" preset using DB's standard defaults so the writer has somewhere to start.
- **Synopsis on scene model: extended.** The `dbench-synopsis` slot exists today on chapter and sub-scene but not scene; the importer milestone extends it to scene and ships minimal display surface (scene-row rendering similar to `dbench-subtitle`). Without this, scene-level Scrivener synopses would import to invisible frontmatter and the writer's index-card content would feel lost.
- **Conflict handling: editable destination project name with real-time validation.** No silent auto-rename, no overwrite. Writer is asked to confirm the destination name in the Parse step, with conflict detection and a suggested alternate if the target folder already exists.
- **Folder location: `settings.defaultProjectFolder`.** No override picker for V1. Add later if writers ask.
- **Marketing surfaces bundled with milestone.** README hero (with a still or short walkthrough video), wiki page ("Importing from Scrivener"), website features-page section. The migration message is the feature's whole point; doc surfaces are not optional.

---

## Sections requiring ratification

Each section below presents a remaining design decision, ratified during the 2026-05-05 design conversation. Ratifications carry forward into implementation.

### 1. Wizard step layout

**Ratified 2026-05-05: 8 steps; indicator dots show 1-6 (per the CR Import Wizard pattern of hiding post-action steps).**

| # | Step | Indicator? | Validation gate |
|---|---|---|---|
| 1 | **Source** | yes | `.scriv` folder selected and contains a parseable `.scrivx` |
| 2 | **Parse** | yes | Async parse succeeded; destination project name is non-empty and non-conflicting |
| 3 | **Hierarchy mapping** | yes | Every binder leaf has a target type assigned |
| 4 | **Metadata mapping** | yes | Always-true (defaults provided for status / labels / custom fields) |
| 5 | **Options** | yes | Always-true (toggles default to safe values) |
| 6 | **Preview** | yes | Always-true (review-only) |
| 7 | **Import** | hidden | Auto-advance on completion; renders progress + per-file count |
| 8 | **Complete** | hidden | Done button + "Import another" |

Footer per the CR pattern: Back / Skip / Next or primary action; first step has no Back; in-progress step has no buttons; final step has Done + "Import another."

**Considered and not chosen:**

- **Combining Source and Parse into one step.** The user picks a folder, the parse runs immediately, then summary + destination name appears. Compact but mixes "input" with "async progress" with "configuration" — three concerns in one step. The two-step split (pick + confirm-after-parse) feels cleaner.
- **Combining Metadata mapping and Options.** Different UX patterns (tabular dialogs vs toggle list); mixing them would clutter step 4. Keep separate.
- **Adding a dedicated Destination step** between Parse and Hierarchy. Cleaner separation of "what we read" from "where it goes," but adds a step for what's effectively one input field. Folding the destination name into Parse keeps the step count manageable.

### 2. Hierarchy mapping (binder -> DB types)

**Ratified 2026-05-05: auto-detect with per-row override; parts-above as `scrivener-part` frontmatter; sub-sub-scenes concatenated as nested headings in the parent sub-scene body.**

Scrivener allows arbitrary binder nesting; DB has 4 levels (project / chapter / scene / sub-scene). The mapping rules:

- **Auto-detect on parse.** Heuristic: deepest leaves with prose -> scenes; their immediate folder parents -> chapters; everything above the chapter level -> "extras above" (Parts, Books, Volumes).
- **Step 3 (Hierarchy mapping) shows the binder tree** with the auto-detected mapping per row (chapter / scene / sub-scene / extras-above / extras-below) and a dropdown per row for manual override. The writer can demote a chapter to scene, promote a scene to chapter, etc.
- **Extras-above** (Parts and similar): preserved as `scrivener-part: "Part 1"` frontmatter on the chapters they contain. Not folded into chapter titles (writer can do that later if they want it visible).
- **Extras-below** (sub-sub-scenes and beyond): concatenated into the parent sub-scene's body as nested markdown headings (`### Sub-sub-scene title` followed by its prose). Loses structural distinction but preserves all prose with order intact. Count badge in Step 3 surfaces how many documents will be merged ("3 documents will be merged into their parents").

**Considered and not chosen:**

- **Flat-name concatenation.** A 5-level deep document becomes a sub-scene named "Part 1 / Chapter 1 / Sub-sub-scene." Preserves intent in the title but loses structural relationship and produces ugly filenames. Concatenation as nested headings is a better tradeoff.
- **Auto-promote / demote intermediate folders.** Hard to get right automatically; the per-row override in Step 3 is the right surface for writer judgment.
- **Reject deep binders entirely.** Writer-hostile; some Scrivener projects genuinely have deep nesting and rejecting forces them to manually flatten before importing.

### 3. Status / Label / POV / Custom metadata mapping

**Ratified 2026-05-05: interactive mapping dialog (Step 4) with auto-add for missing statuses; custom metadata routed to `scrivener-*` frontmatter by default.**

Scrivener attaches several writer-defined metadata axes to each document:

- **Status** (e.g., "First draft," "Revised," "Final") — typically maps to `dbench-status`.
- **Label** (often used as POV character or scene category) — DB has no built-in equivalent; route to writer-named frontmatter.
- **Custom Metadata fields** (writer-defined per-project; can be checkboxes, dates, lists) — route to writer-named frontmatter.

**Step 4 surfaces three sub-tables:**

1. **Status mapping table.** Each Scrivener status with document count, and a target dropdown: existing `dbench-status` values + "<add as new status>" + "<drop>." Adding a new status updates the writer's settings.statuses list as part of the import write phase. Default behavior: best-effort match by exact-string and case-insensitive match against the existing DB vocab; unmatched defaults to "<add as new status>."
2. **Label mapping.** One-time decision: target frontmatter key (default suggestion: `scrivener-label`, but writer can name it `dbench-pov` or anything else). The label values themselves get written verbatim per document.
3. **Custom Metadata mapping.** Each Scrivener custom field with target dropdown: `scrivener-<field-name>` (default), `dbench-<field-name>` (rare; writer-driven), or `<drop>`.

**On the `scrivener-*` prefix decision:** these keys carry import-time provenance, not plugin-managed state. The plugin doesn't actively read or write them after the import phase. They're collision-safe (no other plugin writes `scrivener-*`), they're honest about their origin, and writers can edit / delete them freely. Strict CLAUDE.md reading would prefix with `dbench-` since the plugin writes them at import time, but the spirit of the namespace (active plugin management) doesn't apply here. Ratified as `scrivener-*`. If a future DB feature wants to surface these (e.g., a "show original Scrivener label" UI), revisit at that time.

**Considered and not chosen:**

- **Drop labels and custom metadata silently.** Lossy; some writers genuinely use these (POV character is the common Label use). Worth the extra UI.
- **Force everything into `dbench-` namespace.** Strict CLAUDE.md reading but pollutes the namespace with non-managed keys. The `scrivener-*` provenance prefix is cleaner.
- **Single dialog covering all three axes.** Rich but cluttered. Three sub-tables in step 4 read as three coherent panels.

### 4. Snapshot import

**Ratified 2026-05-05: opt-in toggle in Step 5 (Options), default off; per-scene cap dropdown (1 / 3 / 5 / all) when on.**

Scrivener snapshots are per-document RTF copies with a title (often empty / auto-named with timestamp) and a creation timestamp. A heavy-snapshot user can have hundreds across a project.

- **Default: opt-in off.** Most first-time importers want a clean slate; their Scrivener snapshot history is a backup safety net rather than active material.
- **When on:** per-scene cap defaults to "Most recent 3" with options 1 / 3 / 5 / all. Imported snapshots become `dbench-type: draft` files in the standard DB drafts location for the parent scene, with the original Scrivener snapshot title and timestamp preserved (`dbench-created-at` set to the snapshot timestamp; original title to the file name).
- **Snapshot bodies use the same RTF -> markdown conversion path** as primary scene bodies (per § 6).

**Considered and not chosen:**

- **Always import all snapshots.** File-explosion risk (a project with 80 scenes and 5 snapshots each is 400 extra draft files). Bad default.
- **Skip snapshots in V1 entirely.** Would lose provenance for writers who really value their revision history. Opt-in covers the case without forcing the file count on writers who don't want it.
- **Time-bucket the cap** (last 30 days vs last N). More complex with marginal benefit; per-scene cap is the lever writers actually understand.

### 5. Inspector content mapping

**Ratified 2026-05-05: synopsis -> `dbench-synopsis`; document notes -> appended `## Notes` section; custom metadata -> via § 3 mapping; inline comments -> Obsidian `%% %%` syntax; footnotes -> standard markdown footnotes; project notes -> project body `## Notes`; keywords -> Obsidian `tags:` frontmatter.**

Inspector content in Scrivener splits across several panels:

| Scrivener field | DB destination |
|---|---|
| Synopsis (index-card text) | `dbench-synopsis` frontmatter (per § Synopsis-on-scene-model below) |
| Document Notes (freeform writing-pad) | Appended `## Notes` section in scene body |
| Custom Metadata (per-doc fields) | Frontmatter via the Step 4 mapping (per § 3) |
| Inline Comments (anchored to selected text) | Obsidian `%% comment %%` syntax at the original anchor |
| Footnotes (inline + inspector) | Standard markdown footnotes (`[^1]` reference + `[^1]: body` definition at end of scene) |
| Project Notes (project-level) | Appended `## Notes` section in the project note body |
| Keywords (project-wide tag-like vocabulary, document-attached) | Obsidian `tags:` frontmatter array |

**Notes on each:**

- **Synopsis:** every Scrivener document carries a synopsis (it's the index-card text in the corkboard view), not just folders. Mapping to `dbench-synopsis` requires extending the scene model (currently only chapter and sub-scene have the slot) and shipping minimal display surface. See § Synopsis-on-scene-model below.
- **Comments:** Scrivener comments are anchored to specific text ranges, like Word comments. Markdown has no native syntax for this. Obsidian's `%% %%` comment syntax preserves the comment-at-location semantic, is invisible in preview, searchable in source, and Obsidian-native. The comment author and timestamp Scrivener attaches are dropped (markdown comments don't carry metadata); add as a comment-prefix string if writer feedback indicates they want it preserved.
- **Footnotes:** Scrivener has both inline footnotes (in the body text) and inspector footnotes (in the sidebar with anchor refs in the body). Both map to standard markdown footnotes. The inline / inspector distinction is lost; markdown has only one footnote type.
- **Keywords -> tags:** writers using Scrivener Keywords typically use them like Obsidian tags (cross-cutting categorization). Routing to `tags:` aligns with Obsidian conventions. Worth flagging in import options if writer feedback suggests they'd rather have `scrivener-keywords` instead.

**Considered and not chosen:**

- **Drop comments entirely.** Lossy; reviewer comments and self-notes are real content writers want to keep.
- **Convert comments to footnotes.** Heavyweight (each comment becomes a numbered footnote in the document); pollutes the footnote space which writers may use for actual footnotes.
- **Document Notes as a separate `Notes/` companion file per scene.** File-explosion; the appended section keeps everything per-scene in one place.

### 6. Body content conversion (RTF -> markdown)

**Ratified 2026-05-05 in shape; specific RTF library choice gated on a Step 4 spike. Inline images extracted to `Research/Images/`; cross-document Scrivener Links rewritten to wikilinks via a UUID -> path map.**

Scrivener stores document bodies as RTF (`.rtf`) or RTFD (`.rtfd`, an RTF-with-attachments bundle). The conversion pass needs to handle:

- **Inline formatting:** italics, bold, underline, strikethrough -> standard markdown.
- **Smart quotes, em-dashes, ellipses:** preserved verbatim (no straight-quote conversion; writers chose those characters).
- **Lists:** ordered + unordered -> markdown lists. Nested lists supported.
- **Tables:** RTF tables -> markdown tables where the structure permits; complex tables (merged cells, formatting) flagged in the import error log and preserved as raw HTML tables in the body. Acceptable lossy fallback.
- **Inline images:** extracted to `Research/Images/<original-filename>` (or `<scene-id>-<index>.<ext>` if no original filename) and referenced via Obsidian wikilink (`![[Research/Images/foo.png]]`).
- **Footnotes:** per § 5 above.
- **Comments:** per § 5 above.
- **Cross-document Scrivener Links:** Scrivener documents can link to each other internally via UUID-tagged markers. Pass 1 of the import builds a `scrivener-uuid -> dbench-file-path` map; pass 2 walks scene bodies and rewrites the link markers as Obsidian wikilinks pointing at the imported equivalents. Unresolvable links (target document was excluded from import or not found) become `[broken: <original-title>]` text with an entry in the import error log.

**RTF library spike (Step 4 of implementation):** evaluate `rtf-parser`, `rtf-stream-parser`, and a roll-your-own minimal subset against representative real-scene RTF bodies. Decision criteria: italics / bold / footnotes / inline images all working, bundle-size impact acceptable for a desktop-only plugin, cleanly licensed for distribution. Output of the spike: a chosen library (or rolled subset) and a small wrapper at `src/import/scrivener/rtf-to-markdown.ts`.

**Considered and not chosen:**

- **Preserve RTF as-is in scene bodies.** Defeats the point — Obsidian doesn't render RTF.
- **Use a heavyweight HTML intermediate** (`pandoc`-style RTF -> HTML -> markdown). Adds a binary dependency or a server round-trip; both unacceptable for a local Obsidian plugin.
- **Skip cross-document links.** Lossy in a way writers will notice immediately ("my links broke"). The two-pass approach is solvable.

### 7. Non-Draft folders (Research / Templates / Trash)

**Ratified 2026-05-05: Research opt-in toggle in Step 5 (Options); Templates and Trash always skipped.**

Scrivener allows non-Draft top-level folders (Research, Templates, Trash, plus arbitrary writer-created folders alongside Draft).

- **Research folder:** opt-in toggle in Step 5, default off. When on, imports the Research folder contents as `Research/` companion notes in the new DB project folder. Bodies converted via § 6 RTF -> markdown. Hierarchy preserved verbatim (no project / chapter / scene mapping applied to Research content). Images and binary attachments extracted under `Research/Images/` and `Research/Files/` as appropriate.
- **Templates folder:** always skipped. DB has its own template system; importing Scrivener templates as DB templates is more confusing than helpful.
- **Trash folder:** always skipped. Trash is trash.
- **Other top-level folders:** treated as Research (opt-in) or skipped per writer choice. Default skipped; if the Research toggle is on and the writer has additional non-Draft top-level folders, they're surfaced as separate toggles in Step 5 ("Also import: Plot, Characters, ...").

**Considered and not chosen:**

- **Always import Research.** Some writers have hundreds of MB of Research (PDFs, web clippings). Default-on would create surprise file explosion.
- **Map Research content into project body.** Research is project-adjacent material, not project content. Keeping it in a separate folder respects the distinction.

### 8. "Include in Compile" flag

**Ratified 2026-05-05: preserved as `scrivener-include-in-compile: false` frontmatter on excluded documents.**

Scrivener has a per-document "Include in Compile" boolean. DB's compile model uses status-based filtering rather than per-doc flags; there's no native equivalent.

The importer writes `scrivener-include-in-compile: false` on each document where the Scrivener flag is set to false. The flag is preserved as provenance, not actively read. If a writer wants to translate it into a DB compile-preset rule (e.g., "exclude scenes with `scrivener-include-in-compile: false`"), they can do so manually after import. Most writers won't need this; the flag's most common Scrivener use (excluding chapter intro / outline pages from compile) is better expressed in DB via status-based exclusion in the compile preset.

**Considered and not chosen:**

- **Drop the flag silently.** Lossy in a subtle way; writers who relied on it for compile would discover the loss only at compile time.
- **Translate to a DB compile-preset rule on import.** Coupling-heavy; the compile preset is its own surface and the import shouldn't write to it.

### 9. Empty documents and order preservation

**Ratified 2026-05-05: empty documents imported as scenes with synopsis populated and empty body; order preservation is a first-class implementation concern integrated with the existing linker.**

- **Empty documents** (no body content; common as outline placeholders) import as scenes with synopsis populated (per § 5) and empty body. They're often the writer's actual outline. Don't skip.
- **Order preservation:** Scrivener binder order is significant — it's the manuscript order. The importer must walk the binder in order, assigning `dbench-order` and writing to parent reverse arrays (`dbench-chapters`, `dbench-scenes`, `dbench-sub-scenes`, plus their `-ids` siblings) in sequence. The linker's existing order-preservation machinery (the same code path that powers retrofit and the rotation-and-truncation patch from 0.2.3) is the right surface to integrate with — not a parallel implementation.

The 0.2.3 retrofit work surfaced how fragile order preservation can be when reverse arrays drift out of sync with `dbench-order`. The Scrivener importer is a high-volume write pass (potentially hundreds of files) and a tested integration with the linker is non-negotiable.

**Considered and not chosen:**

- **Skip empty documents.** Loses outline content writers explicitly created.
- **Hand-roll order preservation in the importer.** Duplicates linker logic and risks the same drift the 0.2.3 patch solved. Reuse the linker.

### 10. Project metadata

**Ratified 2026-05-05: Scrivener project title -> project note title; project description -> project note body; keywords -> Obsidian `tags:` frontmatter (per § 5).**

Scrivener's `.scrivx` carries project-level metadata: title, description (sometimes), and the project keyword vocabulary.

- **Title:** the writer-confirmed destination project name (per § Conflict-handling) becomes the project folder name and the project note's `title` if Obsidian's title-from-filename behavior would otherwise produce something different.
- **Description / project notes:** appended to the project note body as `## Notes` per § 5.
- **Keywords vocabulary:** the project-wide keyword list isn't directly imported (DB has no notion of a per-project tag vocabulary); per-document keyword *uses* are imported as `tags:` frontmatter on the relevant scenes per § 5.

**Considered and not chosen:**

- **Project title verbatim from Scrivener.** Conflict-handling needs writer confirmation anyway; folding the confirmation into Step 2 also covers the title decision.
- **Keyword vocabulary as a Settings list.** DB has no tag-vocabulary concept; the per-document `tags:` array is the right surface.

### 11. Synopsis on scene model

**Ratified 2026-05-05: extend scene model with `dbench-synopsis`; ship minimal display surface (scene-row rendering similar to `dbench-subtitle`) as part of the importer milestone.**

Scrivener attaches a synopsis to every document (it's the corkboard index-card text), not just folders. DB's current model has `dbench-synopsis` declared on chapter ([src/model/chapter.ts:50](../../src/model/chapter.ts#L50)) and sub-scene ([src/model/sub-scene.ts:66](../../src/model/sub-scene.ts#L66)) but not on scene; no UI surface reads or writes the property.

**Two pieces of work in this milestone:**

1. **Model extension.** Add `'dbench-synopsis'?: string` to the scene type. Update [src/core/essentials.ts](../../src/core/essentials.ts) doc comments to reflect the broader applicability.
2. **Display surface.** Render `dbench-synopsis` in the Manuscript view scene rows (similar to how `dbench-subtitle` is rendered today). Per-scene opt-in: rows without the field keep the original layout; rows with the field gain a muted second / third line. Same pattern as the recently-shipped subtitle field (commit `8780951`).

This is precondition work for the importer (otherwise scene-level synopses import to invisible frontmatter), but it stands alone as a small feature: writers who fill `dbench-synopsis` manually via the Properties panel get the display surface too.

**Considered and not chosen:**

- **Drop scene-level synopses on import.** Lossy in a way writers will notice — the corkboard index card is one of the most visible Scrivener surfaces.
- **Import to `dbench-synopsis` without adding a display surface.** Acceptable but undermines the user-visible value of the import — synopses end up only in the Properties panel.
- **Defer the display surface to a follow-on milestone.** Same problem; the import would be incomplete.

---

## Implementation sequence

Numbered steps to ship the milestone. Each step is committable independently.

1. **Scene model + display surface for `dbench-synopsis`.** Per § 11. Extend the scene type; add scene-row rendering in the Manuscript view; smoke-test against existing projects.
2. **Wizard shell skeleton.** Modal subclass with `currentStep: number`, `formData` object, `renderCurrentStep()` dispatcher, step-indicator render function, footer render function. Shell renders only — steps are placeholder divs. CSS: `dbench-import-wizard__*` classes per the BEM convention. No state persistence (per meta-level lock).
3. **Source step (step 1).** Folder picker for the `.scriv` bundle; basic validation (folder exists, contains a `.scrivx` file). Next gates on valid source.
4. **RTF library spike + integration.** Per § 6. Pick library, prototype against real scene RTF bodies, build wrapper at `src/import/scrivener/rtf-to-markdown.ts`. Spike output: a passing test against a small representative corpus (italics, bold, footnotes, inline image, comment).
5. **`.scrivx` parser.** Walk the binder XML into an in-memory tree representation. Each node: UUID, title, type (folder / document), Scrivener metadata (synopsis, status, label, keywords, custom fields, include-in-compile), child references. Handle Scrivener 3 schema only.
6. **Parse step (step 2).** Async parse — invoke the `.scrivx` parser, walk RTF bodies, count documents / snapshots / images. Render summary + editable destination project name with real-time conflict validation against `settings.defaultProjectFolder`. Next gates on parse success + non-empty + non-conflicting destination.
7. **Hierarchy mapping step (step 3).** Render the binder tree with auto-detected mapping per row (chapter / scene / sub-scene / extras-above / extras-below). Per-row override dropdown. Count badges for collapsed-into-parent documents per § 2. Next gates on every leaf having a target type.
8. **Metadata mapping step (step 4).** Three sub-tables per § 3: status mapping (with auto-add), label mapping (target frontmatter key picker), custom metadata mapping (per-field target). Always-passes Next.
9. **Options step (step 5).** Toggles per the meta-level locks: import Research folder; import snapshots + per-scene cap; comment style (always Obsidian `%%` for V1, but exposed for future flexibility); image extraction folder (default `Research/Images/`); create stub default compile preset. Always-passes Next.
10. **Preview step (step 6).** Tree of files about to be created with paths. Image asset list. Counts. Warnings ("3 documents will be merged into parents"). Always-passes Next.
11. **Import write pass (step 7).** Async write with progress indicator. Two-pass approach: pass 1 creates project folder, walks binder in order, writes notes via `FileManager.processFrontMatter` (per CLAUDE.md hard rule), extracts images, integrates with the linker for reverse arrays per § 9, and builds the UUID -> dbench-path map; pass 2 walks scene bodies and rewrites cross-document Scrivener Links to wikilinks per § 6. Errors collected; continue on per-file failures (don't abort whole import).
12. **Complete step (step 8).** Summary: counts of files created, list of warnings / errors with link to the import error log file (written as `Import errors.md` in the new project folder if any). Done button + "Import another." On Done, focus the new project in the Manuscript view.
13. **Discoverability surfaces.** Palette command `Draft Bench: Import from Scrivener`; small button in the Manuscript view sibling to the existing "Create project" button (per [src/ui/manuscript-view/manuscript-view.ts:312](../../src/ui/manuscript-view/manuscript-view.ts#L312)). Both launch the wizard at step 1. Empty-state CTA in the Manuscript view shows the import button alongside "Create project." **Both surfaces are gated to desktop via `Platform.isDesktopApp`** per the mobile-elevation commitment ratified 2026-05-05 ([#29](https://github.com/banisterious/obsidian-draft-bench/issues/29)); on mobile, the command does not register and the button does not render. See [mobile-reference.md § DB commitments](mobile-reference.md).
14. **Test corpus + QA pass.** Acquire 3-5 real `.scriv` projects (maintainer's own + community contributions via a tracking-issue request). Run the importer against each. Catalog issues; fix critical bugs before release.
15. **Documentation.** New wiki page at `wiki-content/Importing-from-Scrivener.md` with screenshots of each wizard step, mapping examples, known limitations (Scrivener 2 not supported, complex RTF tables fall back to HTML, etc.). Sync via `./upload-wiki.sh`. README hero updated to mention import; website features-page section drafted in `docs/planning/website-content/` for the parallel session to port.
16. **CHANGELOG entry.** Under `[Unreleased]`, then cut to the target minor at release time. Headline: "Scrivener 3 project import."

Estimated total effort: **3-4 weeks of focused work**, plus 1-2 weeks of QA / dogfooding / corpus-driven bug fixes. The single largest risk is RTF fidelity; the spike in step 4 de-risks the milestone by surfacing library choice early.

---

## Out of scope for V1

Explicitly deferred:

- **Scrivener 2 support.** Schema differs in some areas; needs a 2.x project for testing. Re-add as a separate parser path post-V1 if a Mac contributor surfaces with a 2.x project.
- **iOS Scrivener format.** Different bundle structure. Defer.
- **Custom destination folder picker.** Defaults to `settings.defaultProjectFolder`. Add only if writers ask for per-import location override.
- **Compile settings translation** (Scrivener compile format -> DB compile preset). Skipped entirely; only optional default-preset stub.
- **Onboarding hook.** Deferred to Phase 3+ when onboarding ships.
- **Word doc import** (`.docx`) **and generic markdown folder import.** Separate feature requests if writers ask. The Scrivener import doesn't generalize.
- **Reverse direction: DB -> Scrivener export.** No demand; would couple DB to a format it has no other reason to write.
- **Import progress as a separate modal.** Per the wizards-reference doc, async operations live as a step within the wizard, not as a parallel modal.
- **Dry-run / preview-only mode** (parse, show what would be created, exit without writing). The Preview step in the wizard already lets the writer back out before commit; a separate dry-run mode is redundant.
- **Resumable wizard state** (cross-session). Per meta-level lock; in-session form-data persistence only.

---

## Open questions

Items the design conversation didn't fully resolve; carry forward into implementation:

- **RTF library choice.** Decided in Step 4 spike. Recommendation TBD.
- **Test corpus sourcing.** Maintainer's own `.scriv` projects (the user has a 30-day Scrivener 3 trial as of 2026-05-05) plus community contributions. Mechanism: file a tracking issue ahead of milestone start asking for `.scriv` projects from willing contributors. Alternative: use Scrivener's bundled tutorial project as a baseline.
- **Manuscript view button placement specifics.** Adjacent to "Create project" as a sibling button, or behind a `+` menu with "New project" / "Import from Scrivener"? Cleaner UX if button count goes above two; for V1 with two buttons, sibling-buttons may be fine. Ratify during step 13 implementation.
- **"Import another" focus behavior.** When the writer clicks "Import another" from the Complete step, does the wizard reset to step 1 with empty `formData`, or to the Source step with the previous `.scriv` path remembered? Ratify during step 12 implementation.
- **Import error log file naming.** `Import errors.md` is functional but ugly; consider `import-errors.md` or `Scrivener import errors.md`. Ratify during step 11.
- **Specific minor version target.** 0.4.0 vs 0.5.0 vs later. Decide when scheduling (depends on what 0.4.0's theme ends up being).

---

## Decision log

Track ratifications and reversals here as work proceeds.

- **2026-05-05** — Doc created from candidate #1 in [post-v1-candidates.md](post-v1-candidates.md) after a design conversation covering: Scrivener version targeting, hierarchy depth handling, status / label / custom metadata mapping, snapshot import, inspector content, compile settings, body conversion, non-Draft folders, conflict handling, synopsis-on-scene-model, discoverability, and wizard shape. All meta-level decisions ratified. § 1-11 ratifications captured below.
- **2026-05-05** — § 1 (Wizard step layout) ratified: 8 steps, indicator dots show 1-6.
- **2026-05-05** — § 2 (Hierarchy mapping) ratified: auto-detect with per-row override; parts-above as `scrivener-part` frontmatter; sub-sub-scenes as nested headings.
- **2026-05-05** — § 3 (Status / Label / Custom metadata) ratified: interactive mapping dialog with auto-add for missing statuses; `scrivener-*` prefix for non-managed provenance keys.
- **2026-05-05** — § 4 (Snapshots) ratified: opt-in toggle, default off; per-scene cap (1 / 3 / 5 / all).
- **2026-05-05** — § 5 (Inspector content) ratified: synopsis to `dbench-synopsis`; document notes to `## Notes`; comments to Obsidian `%% %%`; footnotes to standard markdown footnotes; project notes to project body `## Notes`; keywords to `tags:` frontmatter.
- **2026-05-05** — § 6 (Body conversion) ratified in shape; specific RTF library deferred to Step 4 spike. Cross-document Scrivener Links rewritten via two-pass UUID -> path map.
- **2026-05-05** — § 7 (Non-Draft folders) ratified: Research opt-in; Templates / Trash always skipped.
- **2026-05-05** — § 8 (Include-in-Compile flag) ratified: preserved as `scrivener-include-in-compile` provenance frontmatter.
- **2026-05-05** — § 9 (Empty docs + order preservation) ratified: empty docs imported as outline placeholders; order preservation integrated with existing linker.
- **2026-05-05** — § 10 (Project metadata) ratified: title via destination-name confirmation; description to project body; keywords to `tags:`.
- **2026-05-05** — § 11 (Synopsis on scene model) ratified: extend scene type; ship minimal display surface as part of the milestone.
- **2026-05-05** — Discoverability ratified: command palette + Manuscript view sibling button. No settings tab row. Onboarding hook deferred to Phase 3+.
- **2026-05-05** — Conflict handling ratified: editable destination project name in Parse step with real-time validation; never silent auto-rename, never overwrite.
- **2026-05-05** — Compile settings ratified: skipped entirely; optional default-preset stub via Step 5 toggle.
