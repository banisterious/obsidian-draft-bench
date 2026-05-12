# Audit Phase 3: Bundle-Size Reduction

**Status:** ✅ Complete (closed with negative finding)
**Created:** May 11, 2026
**Merged:** 2026-05-11
**Branch:** `audit/phase-3-bundle-size`
**Release target:** None — no behavior or build changes shipped

Phase 3's intent was to lazy-load pdfmake, docx, jszip, and (optionally) the Scrivener importer to cut the initial bundle from 5.7 MB to roughly 500 KB. Implementation revealed the planned lever doesn't work under the project's current bundler configuration. This deliverable documents the finding, the underlying constraint, the options considered, and why the phase closes without a code change.

---

## What was attempted

Slice 1 of the planned four-slice phase: convert [src/core/compile/render-pdf.ts](../../src/core/compile/render-pdf.ts) to dynamic-import `pdfmake/build/pdfmake` and `pdfmake/build/vfs_fonts` on first call to `buildPdfBytes`, with a 300 ms-delayed `Notice` for first-compile UX feedback. The implementation followed the master plan's pattern almost verbatim:

```typescript
let pdfMakeModule: Promise<...> | undefined;

async function loadPdfMake() {
    if (pdfMakeModule) return pdfMakeModule;
    pdfMakeModule = Promise.all([
        import('pdfmake/build/pdfmake'),
        import('pdfmake/build/vfs_fonts'),
    ]).then(([pdfMake, pdfFontsMod]) => ({ ... }));
    return pdfMakeModule;
}
```

Build passed. Tests passed. But `node scripts/audit/measure-bundle.mjs` reported the same 5.7 MB main.js as before the change, with `pdfmake/build/pdfmake.js` still listed at 62.3% of the bundle. `grep -c "pdfmake" main.js` returned 33, confirming the library was still inlined. No chunk files were emitted alongside main.js.

The lever ran perfectly at the source level and produced zero bundle-size impact.

---

## Why the lever doesn't work

esbuild's code-splitting (`splitting: true`) is documented as ESM-only. Under `format: 'cjs'` with no splitting flag (the project's current configuration, mirrored across the Obsidian-plugin ecosystem), dynamic `import()` expressions get either rewritten to synchronous `require()` calls or inlined into the same bundle. The bytes never leave main.js.

[esbuild.config.mjs](../../esbuild.config.mjs) currently has:

```javascript
format: 'cjs',
outfile: 'main.js',
// no `splitting: true`, no chunk-naming hooks
```

This matches what every committed-in-the-wild Obsidian plugin does. [external/longform/rollup.config.js](../../external/longform/rollup.config.js) uses the same `format: "cjs"` + `external: ["obsidian"]` pattern with no dynamic imports in its `src/`. There's no precedent in the surveyed prior-art for shipping multiple chunks from an Obsidian plugin.

The audit-implementation-plan and the Phase 1 deliverable both assumed dynamic-import-as-code-splitting would just work. It doesn't — not for this bundler configuration, and likely not for any standard Obsidian plugin's bundler configuration.

---

## Options considered

Three paths to actually shrink the initial bundle, in increasing scope:

1. **Switch to ESM + splitting.** Refactor esbuild to `format: 'esm'` with `splitting: true`, output multiple chunk files, adapt the plugin's `main.js` loading semantics. Risk: Obsidian's plugin loader has historically been CJS-only; ESM plugins may not load (or may load with caveats). Would need empirical verification in a real Obsidian install.

2. **External + ship-as-asset.** Mark `pdfmake`, `docx`, `jszip` as `external` in esbuild. Bundle and ship those deps as separate files in the plugin's release. At runtime, load them via `app.vault.adapter.read` plus a custom module-loader shim. Bypasses esbuild's bundling entirely for those dependencies; introduces a bespoke asset-loading layer.

3. **Accept the bundle.** No build changes. The 5.7 MB stays at startup.

---

## Decision

Option 3 — stop Phase 3, archive with this negative finding, move to Phase 4.

Rationale:

- **No user-impact evidence.** No reports of slow plugin load. Desktop and Android both verified working through 0.5.2. The 5.7 MB cost is paid once per plugin-enable; there are no continuous-cost symptoms.
- **Options 1 and 2 are real build-system changes** with non-trivial risk to plugin compatibility. They don't belong inside a "low-risk hygiene"-adjacent audit phase. Trying ESM-or-external would need its own scoping, empirical testing in a fresh Obsidian install, and a rollback plan if Obsidian rejects the format.
- **Phase 4 doesn't depend on Phase 3.** The master plan ordered Phase 3 between Phase 2 and Phase 4 to "land a smaller bundle first" and "catch compile-flow regressions before the linker is rearranged." Neither rationale is load-bearing: the bundle stays the same size either way, and Phase 4 is a behavior-preserving internal refactor that doesn't touch the compile path.
- **The lazy-load wrapping isn't kept.** With the bundle unchanged, the dynamic-import code at module entry adds complexity that delivers no measurable benefit. Reverted in this branch; the file is back to its main-branch state.

---

## Implications

**Phase 4 unblocked.** Proceeds directly from Phase 2's merge point. The master plan's stated ordering (Phase 2 -> Phase 3 -> Phase 4) was an organizing convention, not a dependency.

**Phase 5 unchanged.** Phase 5's cleanup items are independent of the bundle question.

**Post-V1 follow-up worth tracking separately.** If/when bundle-size becomes a real symptom (mobile plugin-startup latency complaint, App Store-style size budgets, etc.), an exploratory branch outside the audit cadence is the right venue. The branch should:

- Empirically test Option 1 (ESM + splitting) in a fresh Obsidian install before any wider commitment. The smallest viable proof is a hello-world plugin compiled to ESM with one dynamic chunk; if Obsidian loads it cleanly, Option 1 becomes viable.
- Only if Option 1 is rejected, try Option 2 (external + ship-as-asset) — the build-system invasiveness is much higher and the runtime asset-loading layer needs careful design.
- Failing both, accept the bundle.

---

## What landed in this branch

- Bundle measurement re-run on the Phase 2 merge tip (5.7 MB; same headline contributors as Phase 1's report).
- An exploratory render-pdf.ts dynamic-import implementation that exposed the constraint, then reverted.
- This deliverable.

Net change to `src/`: zero lines. The branch's value is the captured finding.

---

## Verification

All four gates pass on the reverted branch tip:

| Gate | Result |
|---|---|
| `npm run build` | EXIT=0 |
| `npm test` | 1360 / 1360 tests, 76 / 76 suites |
| `npm run lint` | 0 errors, 40 warnings (preexisting from 0.2.9 recommended config) |
| `npm run lint:css` | 0 errors |

No `[Unreleased]` CHANGELOG entry — Phase 3 ships no behavior or developer-visible change.

---

## Status

Phase 3 closes with a negative finding. The master plan's bundle-size lever is not viable under the current Obsidian-plugin bundler constraints, and pursuing it would require a build-system rewrite outside the audit's scope. Ready for Phase 4 (linker refactor).
