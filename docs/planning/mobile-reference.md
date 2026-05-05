# Mobile support reference: Charted Roots patterns

**Status:** Reference material. **Not** a design spec for Draft Bench's mobile support. Implementation tracking lives at [#29](https://github.com/banisterious/obsidian-draft-bench/issues/29).

**Purpose.** Captures Charted Roots' (CR) mobile-support approach (label taxonomy, triage path, implementation patterns, verification workflow) so that when DB elevates mobile readiness from "desktop-only" to "mobile-supported pre-1.0," the design starts from a concrete, well-understood prior art rather than a blank page. The summary below was drafted in a parallel CR session and ported here on 2026-05-05; the patterns are general-purpose Obsidian-mobile knowledge derived from CR's lived experience, not CR-specific code structure.

**How to use this document.**

- **DB is currently desktop-only** (`manifest.json` declares `isDesktopOnly: true`). No mobile-readiness work has been done; the patterns below are reference for the elevation pass when it happens.
- **This document is for the later pass**, when DB actually flips the desktop-only flag and audits its surfaces for mobile compatibility. The CR patterns are context for that design pass, not a commitment that DB must track CR one-for-one.
- **Fresh eyes intended.** Mobile support in DB might adopt CR's patterns as-is, reshape them for the writing-workflow context (different surfaces are mobile-relevant: Manuscript view vs Manuscript Builder vs editing scene bodies), or take a different approach for some surfaces (e.g., gating the Scrivener importer entirely off mobile). Those decisions belong to the implementation task, not to this document.
- **Verbatim portions.** The label taxonomy, triage 3-step, Platform-API patterns, and verification workflow below come almost verbatim from the CR session summary; they're general enough that they apply to any Obsidian plugin contemplating mobile support.

**Related docs.**

- [specification.md](specification.md): authoritative DB spec. Currently treats mobile support as a non-goal by default; an elevation decision would change that.
- [coding-standards.md](../developer/coding-standards.md): TypeScript and CSS standards. The `Platform.isMobile` / `Platform.isPhone` patterns below would slot under § "Platform-conditional rendering" if DB adopts them.
- [post-v1-forward-compat-audit.md](post-v1-forward-compat-audit.md): the mobile elevation decision is the kind of thing that benefits from a forward-compat audit pass first to surface latent desktop assumptions in the codebase.

---

## Role and design intent

Mobile support for an Obsidian plugin spans three concerns that don't reduce to one:

1. **Runtime compatibility.** Does the code run at all on mobile? Plugin manifest has `isDesktopOnly: true | false`; setting it to `false` means the plugin loads on iOS / iPadOS / Android. Anything depending on Node.js APIs, native binaries, or filesystem access outside the vault will break. Most plugins that read / write markdown via Obsidian's vault API are runtime-compatible without changes.
2. **Layout compatibility.** Does the UI render usefully on a small screen? Modals, sidebars, multi-column layouts, hover-only affordances all need attention. Touch targets need to be larger; horizontal scroll is uglier on phone.
3. **Feature compatibility.** Does each feature make sense on mobile? Some features (file imports requiring a desktop file picker, PDF compilation via heavy libraries, complex multi-pane workflows) are reasonable to gate to desktop even within a generally-mobile-compatible plugin.

A coherent mobile elevation addresses all three, not just one. CR's approach (per the patterns below) is to ship the runtime + layout work as the baseline and use feature-gating selectively where it preserves quality without contorting the UI.

---

## Label taxonomy

Three platform-aware labels in the issue tracker:

- `mobile`: generic mobile concerns (touch UX, gestures, viewport quirks); may also reproduce on desktop in narrow-window scenarios.
- `mobile-ios`: surfaces only on iOS / iPadOS. Obsidian Mobile uses the same WebKit on both, so one label covers both Apple platforms.
- `mobile-android`: surfaces only on Android (Chromium WebView).

Use distinct colors so platform reads at a glance in issue lists. CR's tested combination:

| Label | Color | Hex |
|---|---|---|
| `mobile-ios` | muted blue | `#1E5A8C` |
| `mobile-android` | muted green | `#3D7B3F` |

Avoid a single `mobile-only` umbrella label. Bugs surface on different mobile platforms with different root causes (WebKit-vs-Chromium rendering differences, iOS-specific viewport behaviors, Android-specific touch handling), and one label hides that. Split the labels early; merge later only if a class of bugs turns out to be cross-platform.

---

## Triage path for mobile bug reports

Run this BEFORE assuming a code bug. Three diagnostics that catch most "mobile is broken" reports without any code investigation:

1. **Stale install check.** If the plugin was ever renamed (folder name, plugin id) or had a breaking version, the user's mobile install may have a leftover pre-rename folder alongside the current one. Both load, and the user sees the older UI. Symptoms: UI text matches an old plugin name, or behavior matches an older release. Fix: ask the user to remove the stale folder.
2. **Verify on-device install version.** Read `<vault>/.obsidian/plugins/<plugin-id>/manifest.json` on the device. Sync mechanisms (Obsidian Sync, Syncthing, iCloud) sometimes lag behind expectations; a "fixed in 0.4.2" report may actually be reproducing against 0.4.1.
3. **Collect device + Obsidian Mobile version.** iOS vs iPadOS vs Android, plus the Obsidian app version. Narrows scope quickly: a bug that reproduces on iOS 17 / Obsidian 1.5.0 but not on Android 14 / Obsidian 1.5.0 is almost certainly WebKit-specific.

Don't burn time investigating code paths until 1+2+3 are clear. The cost of asking three questions is low; the cost of debugging a non-bug is high.

---

## Implementation patterns

### Don't trust viewport media queries alone

`@media (max-width: 768px)` (or similar viewport breakpoints) does NOT fire reliably on Obsidian Mobile. Root cause isn't fully pinned (likely WebView viewport-meta interaction; possibly Obsidian's own viewport handling on top of that). Practical conclusion: never depend on viewport media queries as the sole signal for mobile-responsive layout.

This is the single most important pattern to internalize. CSS that "works on a narrow desktop window" can completely fail to apply on mobile, with no rendering error to surface the failure; the layout just looks wrong.

### Use JS-applied classes via `Platform.isMobile` / `Platform.isPhone`

The `Platform` API in the `obsidian` package is the reliable signal. Apply a class in your view's mount / build code:

```typescript
import { Platform } from 'obsidian';

if (Platform.isPhone) {
    container.addClass('plugin-view-phone');
}
```

CSS targets the class:

```css
.plugin-view-phone .toolbar-center {
    /* phone-specific layout */
}
```

For redundancy, combine with the viewport media query. Desktop narrow-window users benefit, and the rules don't conflict:

```css
@media (max-width: 768px) {
    .toolbar-center { /* rules */ }
}

.plugin-view-phone .toolbar-center { /* same rules */ }
```

The class-based path covers Obsidian Mobile (where the media query may not fire); the media query covers desktop narrow-window. Both writing the same rules is acceptable duplication.

### Scope: phone vs tablet matters

`Platform.isMobile` returns true for both phone and tablet. `Platform.isPhone` excludes tablets.

Decision rule for which API to use:

- *"This layout doesn't fit at all on a touch device of any size"* -> `Platform.isMobile`
- *"This layout doesn't fit on a phone but does on iPad"* -> `Platform.isPhone`

iPad in landscape has 1024px+ viewport, wide enough for inline horizontal layouts. Don't downgrade it to phone-style wrapping unless you actually need to. Most "mobile-responsive" patterns are really phone-responsive; tablet-landscape behaves more like a small desktop than like a phone.

### Other Platform API surface

`Platform` (from the `obsidian` package) carries several other booleans worth knowing:

- `Platform.isDesktop` / `Platform.isMobile`: top-level desktop vs mobile branching.
- `Platform.isIosApp` / `Platform.isAndroidApp`: platform-specific branching when behavior diverges (e.g., file picker affordances).
- `Platform.isMacOS` / `Platform.isWin` / `Platform.isLinux`: desktop-platform branching (rarely needed for mobile-readiness work, but useful for keyboard-shortcut conventions).
- `Platform.isPhone` / `Platform.isTablet`: form-factor branching within mobile.

Prefer the most-specific predicate that captures your intent: `isPhone` over `isMobile && !isTablet`, and `isIosApp` over `isMobile && isAppleish`.

---

## Verification process

Mobile fixes should not ship without on-device verification. Plausible-looking diffs that pass desktop smoke-test can still misbehave on mobile (different rendering, different event handling, different network behavior).

### Per-fix workflow

1. Implement based on best-effort diagnosis.
2. Build + smoke-test on desktop in dev-vault.
3. **Install on the actual mobile platform.** Options: BRAT for pre-release tags, manual copy of the plugin folder, or community-plugin install if the version is published.
4. Verify the fix on the device.

If you can't access the device class (e.g., no iPad available), narrow the scope claim. Say "verified on Android; iPad behavior unchanged from current" rather than "fixes mobile." Honesty about what was tested is better than vague mobile-fixes-everything claims.

### Pre-release pattern for mobile-labeled fixes

For releases containing any `mobile-*` labeled fix, use a pre-release tag rather than tagging main directly:

1. Cut a `vX.Y.Z-rc1` pre-release on GitHub. Do not tag main yet.
2. Install on the target mobile platform via BRAT (BRAT handles pre-release tags transparently).
3. Verify on-device.
4. If good: tag final and ship. If bad: iterate (`-rc2`, `-rc3`, etc.).

Adds overhead but prevents shipping authoritative-looking CHANGELOG entries for fixes that turn out to not actually fix anything on the target device.

### Device debugging via `chrome://inspect` (Android)

Obsidian Mobile on Android uses Chromium WebView, which is inspectable from desktop Chrome:

1. Enable USB debugging on the Android device (Settings -> Developer Options -> USB Debugging).
2. Connect via USB to desktop.
3. Open `chrome://inspect/#devices` in desktop Chrome.
4. Find Obsidian's WebView entry and click "inspect."
5. Full Chrome DevTools opens: DOM, computed styles, media-query matcher, console, network panel.

Invaluable for diagnosing CSS / layout / JS issues that reproduce only on Android. The media-query matcher in DevTools is especially useful for the viewport-query-not-firing case described above; you can confirm visually whether `@media (max-width: 768px)` is matching.

### Device debugging on iOS / iPadOS

iOS / iPadOS WebView debugging requires a Mac plus Safari Web Inspector:

1. On the iOS device: Settings -> Safari -> Advanced -> Web Inspector (enable).
2. On the Mac: Safari -> Settings -> Advanced -> Show Develop menu in menu bar (enable).
3. Connect device to Mac via USB.
4. Mac Safari -> Develop menu -> [device name] -> [Obsidian WebView entry].
5. Safari Web Inspector opens with similar surface to Chrome DevTools.

Higher friction than Android (Mac required, USB cable, two Settings toggles). Document the path when first needed; don't assume it's available unless the maintainer or a contributor has Mac + iOS access.

For DB specifically, the maintainer is on Windows and doesn't have Mac access. iOS-specific bugs would need help from a Mac-equipped contributor for inspector-driven debugging, falling back to print-debugging via the Obsidian Mobile log surface otherwise.

---

## Honest scoping in user-facing notes

When you can't verify a claim, scope it explicitly in CHANGELOG entries, release notes, and PR descriptions:

- ✓ "Verified on Android. iPad behavior unchanged from prior release."
- ✓ "Phone-only fix. iPad-landscape keeps the existing inline layout."
- ✓ "Untested on iOS; reports welcome."
- ✗ "Fixes the toolbar layout on all mobile platforms."
- ✗ "Mobile-friendly Manuscript view." (without specifying which platforms / form-factors)

Your future self benefits from knowing what was actually verified versus what was claimed. Users benefit from accurate expectations. If a fix turns out to work on a class you couldn't test, update the docs later; don't promise what you didn't verify.

This applies to the plugin description in `manifest.json` and the README too. "Mobile-supported" with no qualifier reads as "fully tested on iOS, iPadOS, Android"; if the actual coverage is "tested on Android, untested on iOS / iPadOS," say so.

---

## Pattern to adopt for Draft Bench (reference, not prescription)

If DB elevates mobile support pre-1.0, the **minimum viable kernel** to adopt would be:

- Three platform labels (`mobile`, `mobile-ios`, `mobile-android`) with the color split above.
- Triage 3-step (stale install / version verify / device + version) wired into any mobile bug-report template.
- `Platform.isMobile` / `Platform.isPhone` as the primary platform-conditional signal in TypeScript.
- Belt-and-suspenders CSS (Platform-class + viewport media query, both writing the same rules).
- Pre-release `-rc` pattern for any mobile-labeled fix before main tag.
- Honest-scope CHANGELOG / release-notes language.

**Add as the surface area grows:**

- Android `chrome://inspect` workflow for layout debugging (low cost, high value when needed).
- iOS Safari Web Inspector workflow (only when Mac access is available).
- Form-factor differentiation (`isPhone` vs `isTablet`) once a feature surfaces phone-vs-tablet layout differences.
- Feature-gating (e.g., `if (Platform.isDesktopApp) registerCommand(...)`) for desktop-only features inside an otherwise mobile-supported plugin.

**Don't over-invest before knowing where the breakage is.** CR's experience suggests a substantial fraction of mobile-readiness work is "audit the surfaces, fix the few that break, label the gates" rather than a parallel mobile codebase. Start with `isDesktopOnly: false` + a smoke pass and let the breakage tell you where to focus.

---

## DB commitments for later design

DB-specific decisions captured here so they survive session ends. Ratifications dated below.

### Ratified 2026-05-05: feature-gating scope

Only the **Scrivener `.scriv` importer** is desktop-gated for V1 mobile support. Every other DB feature (Manuscript view, Manuscript Builder modal + leaf, scene / chapter / sub-scene / draft creation, retrofit, integrity, compile pipeline, Bases integration, Style Settings) ships mobile-supported and is verified case-by-case during the audit pass.

Implication: the importer command (`Draft Bench: Import from Scrivener`) and the Manuscript view import button (per [scrivener-import.md § 13](scrivener-import.md)) are wrapped in `Platform.isDesktopApp` checks; on mobile, neither registers / renders. The wizard surface itself never loads on mobile.

For features that turn out to need work to function reasonably on mobile (e.g., Manuscript Builder layout in phone form-factor), the audit pass surfaces the issue as a `mobile` or `mobile-<platform>` labeled bug for follow-up; default ship-state is "mobile-attempted." Don't pre-emptively gate features that haven't been smoke-tested as broken.

### Ratified 2026-05-05: iOS / iPadOS shipping without testing

V1 mobile support ships without iOS / iPadOS verification. The maintainer is on Windows + Android; iOS access is a future acquisition. Until iOS coverage is available:

- CHANGELOG and release notes scope claims to "Verified on Android. iOS / iPadOS untested; reports welcome."
- The README and plugin description avoid blanket "Mobile-supported" language; use "Mobile (Android verified; iOS untested)" or similar.
- iOS-specific bug reports are triaged via the standard 3-step but require Mac-equipped contributor help for `chrome://inspect`-equivalent debugging (Safari Web Inspector).

The alternative (defer mobile claims entirely until iOS coverage is acquired) was considered and rejected: the Discord #creative-channel signal that mobile-first writers are common makes the daily-use win meaningful even without full coverage. Honest scoping is the safety mechanism.

### Ratified 2026-05-05: mobile elevation precedes Scrivener importer

Mobile readiness ships before the Scrivener importer ([#28](https://github.com/banisterious/obsidian-draft-bench/issues/28)). Tracking issue: [#29](https://github.com/banisterious/obsidian-draft-bench/issues/29). The audit pass + `Platform.isDesktopApp` gating infrastructure needs to land first so the importer's commands and Manuscript view button can register their gates against a stable mobile-aware codebase. Reversing the order (importer first, mobile after) would mean retrofitting gates into already-shipped code.

This shapes the pre-1.0 sequencing: mobile readiness as the next minor (likely 0.4.0), Scrivener importer as a later minor (0.5.0 or beyond) once the corpus + RTF spike are in hand.

### Ratified 2026-05-05: label taxonomy

CR's two platform-specific labels adopted on 2026-05-05 (created by maintainer):

| Label | Color | Hex |
|---|---|---|
| `mobile-ios` | muted blue | `#1E5A8C` |
| `mobile-android` | muted green | `#3D7B3F` |

The generic `mobile` umbrella label was considered but skipped at creation time. If cross-platform mobile concerns surface (touch UX patterns, viewport bugs reproducing on both), revisit and add the generic label then; until then, use the platform-specific label that matches the report.
