# Release Procedure

How a Draft Bench release is cut, what the Obsidian community-plugin scanner reads when, and the procedural surface that protects against the failure modes we've encountered. This document is the authoritative checklist; `CLAUDE.md` § 4 points here for detail.

The release flow has been stable since 0.5.5 (when the CI workflow + build-provenance attestations shipped). Most releases follow the same pattern; this document records the variations and edge cases.

---

## Scanner behavior (read this before debugging a scan)

Obsidian's community-plugin automated review scanner has five behaviors that aren't documented anywhere central and are easy to miss when iterating:

1. **`manifest.json` is read from the repo at the tagged commit**, not from the release asset and not from `main` HEAD at scan time. Whatever version sits in the tagged commit's `manifest.json` must match a published GitHub release tag, or the scan errors with "Unable to find a release with the tag X."

2. **`styles.css` is read from the repo at the tagged commit**, same shape as `manifest.json`. The CI-built `styles.css` attached to the release is *not* what gets scanned. If `styles.css` is tracked in the repo and the committed copy is stale (out of sync with `styles/*.css` sources), the scanner surfaces findings against the stale rules. **Draft Bench commits `styles.css`** (see § 4 of `docs/developer/coding-standards.md`), so this trap is live for us — see § "Six-file version bump" below.

3. **`main.js` is read from the release asset**, *not* from the repo at the tagged commit. The release asset is what gets analyzed for runtime patterns (`createElement("script")`, `setInterval` + `fetch` correlation, `new Function(`, dynamic code execution, etc.). `main.js` is gitignored in our repo (CI builds + uploads it), which is fine — the scanner doesn't read the gitignored copy.

4. **Pre-releases are rejected.** "Pre-releases cannot be installed by Obsidian users. The 'Set as a pre-release' option must be unchecked in the GitHub Releases UI." This kills the trial-run pattern: you cannot preview a scan against a candidate fix without committing to a real release.

5. **Non-pure-SemVer in `manifest.json` is rejected.** "Plugin version must only contain numbers and dots (e.g. 1.0.0)." So `0.6.4-rc1` in `manifest.json` fails the scan even if the GitHub release tag matches. Pre-release tags (e.g., `0.5.5-rc1`) are still useful for CI-workflow trial runs, but they must use the rc-suffix on the *tag* while keeping `manifest.json` at the pure-SemVer base — and per behavior #1, the scanner will reject the resulting tag mismatch anyway. Use pre-release tags only for CI smoke-testing the workflow itself; never expect them to pass scan.

**Net consequence**: a scan-cleanup fix cannot be pre-validated against the scanner. Ship the real release, read the resulting scan, iterate via the next real version. This is a single largest source of release-cadence friction; plan for one-shot fixes.

---

## Six-file version bump

For every release, the following six files change in lockstep. A seventh file (`styles.css`) is added if any CSS source under `styles/` changed in the release.

| File | What changes |
|---|---|
| `manifest.json` | `"version": "X.Y.Z"` |
| `versions.json` | Append `"X.Y.Z": "<minAppVersion>"` entry |
| `package.json` | `"version": "X.Y.Z"` |
| `package-lock.json` | Both top-level `version` and `packages.""` `version` |
| `CHANGELOG.md` | `[Unreleased]` -> `[X.Y.Z] - YYYY-MM-DD`, fresh empty `[Unreleased]` above |
| `README.md` | Status callout updated to reflect the new version (description / version list). Some releases don't touch this if the README is generic enough. |

**If any file under `styles/` changed in the release:** ALSO run `npm run build` and stage the rebuilt `styles.css`. The committed `styles.css` must track its source for the scanner to see CSS fixes; the CI-built release-asset `styles.css` is correct but the scanner doesn't read it (per behavior #2 above).

**If only TypeScript / patch scripts / docs changed** (no `styles/` changes), `styles.css` doesn't need to be touched. The standard six is sufficient.

---

## Release sequence (12 steps)

Stable since 0.5.5; the steps below codify what's worked across 0.6.x. Branch-based variant in § "Optional: branch-based release flow"; for direct-on-main releases (most of our cadence), steps 1-3 collapse.

1. **Implement the change** on `main` (or on a branch, per § "Optional: branch-based release flow"). Tests + lint + lint:css + dev-vault smoke test all green.
2. **Six-file version bump** per the table above. Rebuild `styles.css` if `styles/` changed.
3. **Commit the release.** Conventional message: `chore(release): X.Y.Z`. Body summarizes what's in the release (mirrors but condenses the CHANGELOG entry).
4. **Tag.** Plain SemVer, no `v` prefix (per `feedback_obsidian_release_tag_format.md`). `git tag X.Y.Z`.
5. **Push the release commit + tag.** `git push origin main && git push origin X.Y.Z`.
6. **Wait for CI.** The `.github/workflows/release.yml` workflow runs on tag-push: lint + lint:css + test + build + attestation + `gh release create --draft`. ~3-5 minutes end-to-end.
7. **Draft the release description in chat** for J.B. to paste. Editorial gate per § 3 of CLAUDE.md (no em-dashes; ASCII arrows; no AI attribution). Match recent release-description shape.
8. **J.B. opens the draft** at `https://github.com/banisterious/obsidian-draft-bench/releases/tag/X.Y.Z`.
9. **Paste the release description** into the draft body.
10. **Verify assets** are attached: `main.js`, `manifest.json`, `styles.css` + their attestations.
11. **Uncheck "Set as a pre-release"** + **check "Set as the latest release"**. (The draft defaults are usually correct but worth confirming — pre-releases fail the scanner per behavior #4.)
12. **Click "Publish release."** Triggers the community-plugin scan.

**Attestation verification** (smoke check after publish; same command end users would run):

```sh
gh release download X.Y.Z --pattern main.js
gh attestation verify main.js --repo banisterious/obsidian-draft-bench
```

Expected output: `Loaded digest sha256:<hash> ... Verification succeeded!`.

**Failure mode**: if CI aborts (failing test, lint error), the tag already exists in the repo. Delete locally + remotely (`git tag -d X.Y.Z && git push --delete origin X.Y.Z`), fix the issue, re-tag. Don't try to recover the workflow run.

**0.6.1 recovery example**: initial release commit failed CI on a typed-rule eslint mismatch. Tag was deleted, fix landed in a follow-up commit, tag re-pushed at the fix commit. The release-as-shipped points at the recovery commit (`01d9502`), not the original (`82c796c`). Pattern is documented in `.session-restore.md`'s late-evening 0.6.1 block for reference.

---

## Optional: branch-based release flow

For larger or higher-risk changes (the scan-cleanup arc from 0.6.2 onward used this pattern), work on a branch first:

1. Branch: `scan-cleanup-vX.Y.Z` or similar.
2. Implement fixes + tests + dev-vault verification on the branch.
3. Push the branch for review or for the user to deploy + smoke-test in dev-vault.
4. Six-file version bump on the branch (or after merge — either works).
5. Merge branch to `main` with `git merge --ff-only` (Draft Bench's history stays linear; we don't use `--no-ff` merge commits).
6. Resume the 12-step sequence from step 4 onward.

Branches can be kept after merge as historical reference (user choice; see the 2026-05-15 `scan-cleanup-v0.6.2` branch).

---

## Postinstall patches (for unreachable vendored code)

When a vendored library bundles code that the scanner flags (`createElement("script")` in feature-detection guards, `new Function("return this")` in `globalThis` polyfills, `setInterval` + `fetch` correlation in beacon-poll loops, etc.) and that code is unreachable in Obsidian's Electron runtime, the most honest fix is a postinstall patch that removes the dead code at the source.

**Pattern (after Charted Roots'** [`patch-core-js-polyfill.js`](https://github.com/banisterious/obsidian-charted-roots/blob/main/patch-core-js-polyfill.js) **and related)**:

1. Locate the dead-code block by exact string match (or regex if whitespace varies).
2. Replace with a no-op or stubbed-out version that preserves the function signature and returns the modern-environment value (`globalThis`, no-op for callbacks, etc.).
3. Idempotency check via a unique marker string so repeated `npm install` runs are safe.
4. Chained via `package.json`'s `"postinstall"` script: `node patch-A.js && node patch-B.js && ...`.

**Why this beats bundle-time literal masking**: literal masking (the `mask-script-polyfill-literal` esbuild plugin we shipped in 0.6.1) hides the offending pattern from the scanner but leaves the dead code in the bundle. Postinstall patches remove the dead code entirely — smaller bundle, no compounding workaround layers.

**Trade-offs**:

- **Pro**: cleaner bundle, contributes to bundle-size warnings, easier to audit (the patch scripts are committed source-of-truth).
- **Pro**: catches vendor breakage. If a vendor update changes the targeted string, the patch fails loudly at install time — actually useful as a canary.
- **Con**: every `npm install` runs the patches. Idempotency markers handle the repeat case but the patches are now part of the build's dependency-install path.
- **Con**: requires committing patch scripts. Draft Bench has none yet; the runtime-hygiene-pass plan (Sub-task A) is the first.

Patches are kept at the repo root (matching CR's convention) with names like `patch-pdfmake.js`, `patch-docx.js`. The `package.json` `"postinstall"` script wires them.

**Cross-reference**: when authoring patches, mirror CR's existing patches as templates. The exact-string-match locate + no-op replace + idempotency marker shape is the load-bearing pattern.

---

## Cross-references

- **Editorial gate** (no em-dashes, ASCII arrows, no AI attribution): see CLAUDE.md § 3 "Writing Style."
- **Tag format** (plain SemVer, no `v` prefix): see `~/.claude/projects/.../memory/feedback_obsidian_release_tag_format.md`.
- **Generated files policy** (`main.js` gitignored, `styles.css` committed, build artifacts deterministic): see `docs/developer/coding-standards.md` § 6.3.
- **Third-party libraries shipping in the bundle**: see `docs/developer/third-party-libraries.md`.
- **Runtime hygiene queue**: see `docs/planning/runtime-hygiene-pass.md` (gitignored).
- **Charted Roots' authoritative release-procedure doc** (the model for this one): [`docs/developer/release-procedure.md`](https://github.com/banisterious/obsidian-charted-roots/blob/main/docs/developer/release-procedure.md) in `banisterious/obsidian-charted-roots`.
