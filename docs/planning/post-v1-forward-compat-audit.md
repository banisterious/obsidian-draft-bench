# Post-V1 forward-compat audit

Checklist for reviewing Draft Bench's deferred forward-compat items once the Phase 3 compile flow has accumulated ~2 weeks of real manuscript-writing use. The audit asks one question per item: **promote to active work, keep deferred, or need more data?**

---

## Target audit date

**2026-05-08**, or whenever ~2 weeks of real P3.E use have accumulated (whichever is later). Earlier is fine if a blocker surfaces; later is fine if real use was spotty. The date is a prompt, not a deadline.

## Scope

**Audit, not implementation sprint.** The deliverable is a set of promote / keep-deferred / needs-more-data recommendations with evidence, plus a bundle-size measurement. Any actual implementation work is a follow-up.

Not covered by this audit: new Phase 3 items that haven't been captured in a reference doc yet (if any surfaced during real use), Phase 5+ work (`chapter` type, auxiliary content, mobile support), or anything in `Post-V1 questions queued` in `.session-restore.md`. Those get their own audit if warranted.

---

## How to run the audit

1. Pull latest `main` and read the three reference docs ([pdf-bundling-reference.md](pdf-bundling-reference.md), [data-quality-reference.md](data-quality-reference.md), and the D-07 follow-ups in [.session-restore.md](../../.session-restore.md)).
2. Run `git log --since=2026-04-23 --oneline` and skim for `fix(` prefixes, repeated edits to the compile pipeline, or commit messages that hint at UX papercuts. Record anything user-facing in the usage-observations section below.
3. Work through each forward-compat item in order. Use the pre-filled evaluation criteria; append findings inline under `Findings`.
4. Measure current `main.js` with `npm install --no-bin-links && npm run build && ls -la main.js`. Record in the bundle-size table.
5. Write decisions in the Decisions section at the bottom. Each item gets one of: **Promote**, **Keep deferred**, or **Needs more data** (with a short explanation either way).

Optional: open a tracking PR / commit that captures the findings inline in this doc. Easier than a separate audit report since the promote-vs-defer decision is likely to drive subsequent work anyway.

---

## Forward-compat items

### Item 1: Lazy-loading pdfmake

**Context.** After the custom-Roboto-VFS optimization was closed on pdfmake 0.2.x (upstream already ships a trimmed VFS), lazy-loading pdfmake became the primary post-V1 bundle-size lever. The P3.E dispatcher imports render-pdf statically, so every user pays the ~3.7 MB pdfmake + VFS cost in `main.js` even if they only compile to MD. See [pdf-bundling-reference.md § Optimization 2](pdf-bundling-reference.md) for three candidate approaches:

1. esbuild code splitting (`splitting: true` + `format: 'esm'`) — unknown compatibility with Obsidian's plugin system.
2. Ship pdfmake as a separate asset file in the release — fragile across install paths.
3. Download pdfmake from GitHub releases on first PDF compile — offline-first concerns.

**Evaluation criteria.**

- Has anyone (the maintainer, a tester, a BRAT user, an issue filer, a reviewer on the pending Community Plugins submission) complained about `main.js` size?
- Did PDF actually get used in the last two weeks? How many compile runs? If PDF is a minority output format and writers mostly use MD, the cost-of-loading-for-everyone argument intensifies.
- Has esbuild's plugin-runtime code-splitting story evolved? Worth a 20-minute scan of recent Obsidian plugin-dev forum threads and the esbuild changelog.
- Are other plugins in the 4-6 MB range getting Community Plugins pushback in recent submissions? Skim the #plugin-dev Discord channel or the community-plugins repo PR queue if accessible.
- Critically: **is the status quo (4.72 MB ship) actually causing a real-user problem**, or is this theoretical concern?

**Findings.** _Fill in during audit._

---

### Item 2: Data Quality surface

**Context.** Post-V1 direction captured in [data-quality-reference.md](data-quality-reference.md). CR's full surface is ~14K LOC across multiple files — substantially larger than anything DB has shipped. The existing `Repair project links` modal covers the one relationship-integrity use case V1 needs; the reference doc sketches a dedicated tab for broader cleanup operations (stale references, conflicting wikilinks, missing essentials at scale, schema migrations).

**Evaluation criteria.**

- Has the integrity service surfaced enough issues during real use that a dedicated tab is warranted? Check:
  - How often has `Draft Bench: Repair project links` been invoked? (Check command usage if telemetry exists — DB doesn't have telemetry, so this is really "did the maintainer find themselves running it a lot?")
  - Are there types of inconsistencies the integrity service doesn't catch but the maintainer noticed manually?
- Has any writer (maintainer or tester) hit a situation where the current `Repair project links` preview was inadequate — needed more categories, better grouping, or bulk operations?
- Is there a schema migration need looming? E.g., has anyone proposed a `dbench-*` rename, a type consolidation, or a new type that would require retrofitting existing vaults?
- Has retrofit-in-anger (Set as project / scene / draft on a pre-existing vault) been a recurring action? If yes, the cleanup-wizard angle of the Data Quality reference becomes more valuable.

**Findings.** _Fill in during audit._

---

### Item 3: Active-note-sync heuristic for the Manuscript leaf

**Context.** D-07 shipped with explicit project selection: writers use the picker in the Manuscript leaf header to choose which project they're viewing. The deferred heuristic would auto-switch when a writer opens a scene belonging to a different project than the current selection. Not blocking, but noted in D-07 as "revisit after writers live with explicit-only selection."

**Evaluation criteria.**

- Does the maintainer manually change projects frequently? Check `.session-restore.md` and commit messages for notes like "had to change projects to see X" or "selection got out of sync."
- Does the current behavior produce any visible confusion when opening a scene from Quick Switcher / search / file explorer? Test: open a scene note from a different project while the leaf is docked. Does the leaf still show the wrong project's scene list? Is that momentarily confusing?
- Are writers using multiple projects concurrently? If the maintainer and early testers are still on one project each, the heuristic is a solution to a non-problem.
- Related: has the "selection got lost on reload" class of bug resurfaced? Those were addressed in the D-07 post-ship bug-fix stack (commits `89efbea`, `fa1701e` in particular); a recurrence would be a higher priority than auto-switch.

**Findings.** _Fill in during audit._

---

## Bundle-size tracking

| Date | main.js size | Notes |
|---|---|---|
| 2026-04-23 | 4.72 MB | Baseline set after P3.E shipped; pdfmake unminified + stock VFS + JSZip + DB code. |
| _2026-05-08_ | _tbd_ | _Audit measurement._ |

If the audit measurement exceeds ~5.2 MB, investigate what grew. Expected contributors over the next two weeks: marginal DB code growth from P3.F (strip-with-notice batching) + possibly a few KB of CSS. Anything larger is unexpected and worth running `esbuild --analyze` to understand.

---

## Decisions

_Fill in after finishing each item's Findings._

### Lazy-loading pdfmake

- **Decision:** _Promote / Keep deferred / Needs more data_
- **Reason:**

### Data Quality surface

- **Decision:** _Promote / Keep deferred / Needs more data_
- **Reason:**

### Active-note-sync heuristic

- **Decision:** _Promote / Keep deferred / Needs more data_
- **Reason:**

---

## Follow-up after the audit

- If any item is marked **Promote**, add an entry to `.session-restore.md`'s "Next-session starting points" and (where applicable) a pointer from the relevant reference doc.
- If any item is marked **Keep deferred**, note the audit date + reason in the reference doc so the next audit has context.
- If any item is marked **Needs more data**, record what additional signal would resolve it and set a new target audit date.
- Consider whether a second audit is warranted for items deferred again, or whether the audit itself becomes recurring (e.g., "every 6-8 weeks during active pre-1.0 development").
