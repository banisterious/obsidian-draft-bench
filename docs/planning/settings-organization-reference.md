# Settings organization reference: Charted Roots pattern

**Status:** Reference material. **Not** a design spec for Draft Bench's settings organization.

**Purpose.** Captures the Charted Roots (CR) settings-tab UI pattern so that when DB's settings tab grows beyond the current flat-with-setHeading layout, the redesign starts from a concrete, well-understood prior art. The pattern below was lifted from a parallel CR session; file paths reflect CR's state around April 2026, so treat them as search starting points rather than stable anchors. The CSS class prefix in the examples is CR's `cr-` (which maps to DB's `dbench-` / `draft-bench-` per [coding-standards.md § 3](../developer/coding-standards.md)).

**How to use this document.**

- **DB does not currently use this pattern.** As of 0.2.0 work, [src/settings/settings-tab.ts](../../src/settings/settings-tab.ts) is a single flat list of sections grouped by `setHeading()`: Folders, Drafts, Templates, Bases, Statuses, Sync, About. The list fits on a tall screen and re-renders fast; collapsibles would be premature today.
- **This document is for the later pass**, once DB's settings list grows past comfortable scrolling (likely when the compile-preset editor and per-status rule editors land), or when the writer-feedback signal is "I can't find the X setting" rather than "I open settings rarely."
- **Adoption is incremental.** Lift CSS first, then collapsibles, then search, then state preservation, then helpers — in that order. The "Adapting for DB" section at the end gives a recommended start order that defers each addition until it's actually justified.

**Relationship to other docs.**

- [ui-reference.md](ui-reference.md) — broader CR UI patterns (modals, batch operations, accessibility, CSS conventions). The styling philosophy in § 0 ("inherit first, customize last") applies to settings UI as well; this doc layers on top of those general rules.
- [control-center-reference.md](control-center-reference.md) — CR splits frequently-changed user preferences out of the settings tab into a Control Center → Preferences tab. DB has no Control Center in V1, so the two-surface split (covered in the architecture overview below) is not directly applicable; everything lives in the settings tab.

---

## 1. Architecture overview

CR uses **two parallel settings surfaces** with a clear division of responsibility:

1. **Plugin Settings tab** (`PluginSettingTab` subclass, `src/settings.ts`) — installation-time and rarely-changed configuration: folder paths, data-detection mode, privacy, canvas styling, dates, sex normalization, places, research, property aliases, advanced. Mostly write-once.
2. **Control Center → Preferences tab** (`src/ui/preferences-tab.ts`) — frequently-changed user preferences accessed from inside the workflow UI. Same visual idiom but lives next to the work, not behind a settings menu.

Cross-references between the two surfaces use a styled callout (`.cr-preferences-callout`) so users discover the related surface when they're on the wrong one.

**DB adaptation.** DB has no Control Center in V1 (per [control-center-reference.md](control-center-reference.md)), so the two-surface split is not directly applicable; everything lives in the settings tab. If DB later grows a Control Center, this split becomes worth revisiting.

---

## 2. Top-level structure

The settings tab `display()` method is just a list of section renderers:

```ts
display(): void {
    // ... search box ...
    this.renderFoldersSection(containerEl);
    this.renderDataSection(containerEl);
    this.renderPrivacySection(containerEl);
    this.renderCanvasSection(containerEl);
    this.renderDatesSection(containerEl);
    this.renderSexSection(containerEl);
    this.renderPlacesSection(containerEl);
    this.renderResearchSection(containerEl);
    this.renderAliasesSection(containerEl);
    this.renderAdvancedSection(containerEl);
}
```

Each `render*Section` method is self-contained and produces one collapsible section. Adding a new section is one new method + one line in `display()`.

**DB analog.** [src/settings/settings-tab.ts](../../src/settings/settings-tab.ts)'s current `display()` is already shaped this way (`renderFolders`, `renderDrafts`, `renderTemplates`, `renderBases`, `renderStatuses`, `renderSync`, `renderAbout`). The shape is right; the only change to adopt CR's pattern is wrapping each section in `<details>/<summary>` rather than `setHeading()`.

---

## 3. Collapsible sections — native `<details>/<summary>`

Each section is a real HTML `<details>` element. **No custom JS toggle logic** — the browser handles open/close natively. The chevron, hover, and section-description are pure CSS.

```ts
const foldersDetails = containerEl.createEl('details', { cls: 'cr-settings-section' });
foldersDetails.dataset.sectionName = 'folders';
const foldersSummary = foldersDetails.createEl('summary');
foldersSummary.createSpan({ text: 'Folders' });
foldersSummary.createSpan({
    cls: 'cr-section-desc',
    text: 'Where Charted Roots stores and finds notes'
});
const foldersContent = foldersDetails.createDiv({ cls: 'cr-section-content' });
```

Three CSS pieces make this look like a styled section rather than browser-default `<details>`:

```css
/* Hide the native marker, draw our own chevron */
.cr-settings-section > summary::-webkit-details-marker { display: none; }
.cr-settings-section > summary::marker { content: ""; }
.cr-settings-section > summary::before {
    content: "›";
    font-family: monospace;
    transition: transform 150ms ease;
    display: inline-block;
}
.cr-settings-section[open] > summary::before {
    transform: rotate(90deg);
}

/* Section description sits right-aligned on the summary line */
.cr-section-desc {
    color: var(--text-muted);
    margin-left: auto;
    font-weight: normal;
}
```

The `dataset.sectionName` is the key for state preservation (see § 6).

---

## 4. Subsections — Obsidian's `setHeading()`, no nested `<details>`

Within a section, group related settings under subheadings using Obsidian's built-in heading-style setting item. **Don't nest `<details>` elements** — readability degrades quickly.

```ts
new Setting(foldersContent).setName('Entity folders').setHeading();
// ... related settings here ...
new Setting(foldersContent).setName('Output folders').setHeading();
// ... related settings here ...
new Setting(foldersContent).setName('System folders').setHeading();
// ... related settings here ...
```

This produces a flat-but-grouped layout inside each collapsible section.

---

## 5. Search box that filters AND auto-expands

A search box at the top filters settings by name + description. When a query matches a setting inside a closed section, the section auto-expands so the match is visible:

```ts
private filterSettings(containerEl: HTMLElement, query: string): void {
    const normalizedQuery = query.toLowerCase().trim();
    const sections = containerEl.querySelectorAll('.cr-settings-section');

    sections.forEach(section => {
        const settingItems = section.querySelectorAll('.cr-section-content .setting-item');
        let visibleCount = 0;

        settingItems.forEach(item => {
            const name = item.querySelector('.setting-item-name')?.textContent?.toLowerCase() || '';
            const desc = item.querySelector('.setting-item-description')?.textContent?.toLowerCase() || '';
            const matches = !normalizedQuery || name.includes(normalizedQuery) || desc.includes(normalizedQuery);

            (item as HTMLElement).toggleClass('crc-hidden', !matches);
            if (matches) visibleCount++;
        });

        // Hide whole section if it has no matches; auto-expand if it does
        const sectionEl = section as HTMLElement;
        if (normalizedQuery && visibleCount === 0) {
            sectionEl.addClass('crc-hidden');
        } else {
            sectionEl.removeClass('crc-hidden');
            if (normalizedQuery && visibleCount > 0) {
                (section as HTMLDetailsElement).open = true;
            }
        }
    });
}
```

---

## 6. State preservation across re-renders

Obsidian re-renders settings tabs on focus changes and after some setting changes. Without state preservation, every interaction re-collapses sections and resets scroll. Two pieces fix this:

```ts
private openSections: Set<string> = new Set();
private hasRendered = false;

display(): void {
    const scrollTop = containerEl.scrollTop;
    if (this.hasRendered) {
        this.saveOpenSections(containerEl);
    }
    containerEl.empty();
    // ... render all sections ...
    if (this.hasRendered) {
        this.restoreOpenSections(containerEl);
        requestAnimationFrame(() => {
            containerEl.scrollTop = scrollTop;
        });
    }
    this.hasRendered = true;
}

private saveOpenSections(containerEl: HTMLElement): void {
    this.openSections.clear();
    const sections = containerEl.querySelectorAll<HTMLDetailsElement>('.cr-settings-section[data-section-name]');
    sections.forEach(section => {
        if (section.open && section.dataset.sectionName) {
            this.openSections.add(section.dataset.sectionName);
        }
    });
}

private restoreOpenSections(containerEl: HTMLElement): void {
    const sections = containerEl.querySelectorAll<HTMLDetailsElement>('.cr-settings-section[data-section-name]');
    sections.forEach(section => {
        if (section.dataset.sectionName && this.openSections.has(section.dataset.sectionName)) {
            section.open = true;
        }
    });
}
```

The `requestAnimationFrame` for scroll restoration matters — DOM has to be in place before scrollTop sticks.

---

## 7. Helper methods for repeated patterns

Where a settings section repeats the same shape (e.g., folder pickers with autocomplete), extract a helper. CR uses this for folder settings:

```ts
private createFolderSetting(
    container: HTMLElement,
    name: string,
    desc: string,
    placeholder: string,
    getValue: () => string,
    setValue: (v: string) => void
): void {
    new Setting(container)
        .setName(name)
        .setDesc(desc)
        .addText(text => {
            text.setPlaceholder(placeholder)
                .setValue(getValue())
                .onChange(async (value) => {
                    setValue(value);
                    await this.plugin.saveSettings();
                });
            new FolderSuggest(this.app, text, (value) => {
                void (async () => {
                    setValue(value);
                    await this.plugin.saveSettings();
                })();
            });
        });
}
```

Section render methods then look like a flat list of one-liners:

```ts
this.createFolderSetting(foldersContent, 'People folder', 'Default folder for person notes',
    'Charted Roots/People',
    () => this.plugin.settings.peopleFolder,
    (v) => { this.plugin.settings.peopleFolder = v; });
```

Other helpers in CR that follow the same shape: `renderPropertyAliasSection` (for collapsible nested groupings within a section), `createNumberSetting`, `createColorSetting`. Pattern: any setting type that appears 3+ times gets a helper.

---

## 8. Info boxes and cross-references inside sections

Two patterns for in-section context:

```ts
// Plain explanatory box at top of a section
const folderExplanation = foldersContent.createDiv({
    cls: 'setting-item-description cr-info-box'
});
folderExplanation.appendText('These folders determine where new notes are created...');

// Muted info box pointing to a related section
const advancedNote = foldersContent.createDiv({ cls: 'cr-info-box cr-info-box--muted' });
const advancedIcon = advancedNote.createSpan({ cls: 'cr-info-box-icon' });
setIcon(advancedIcon, 'settings');
advancedNote.createSpan({
    text: 'For folder filtering options, see Advanced below.'
});
```

The cross-reference pattern is what surfaces relationships between sections without forcing the user to scroll-and-discover.

---

## 9. File / class layout (CR)

| File | Purpose |
|---|---|
| `src/settings.ts` | `CanvasRootsSettingTab` class + the canonical `CanvasRootsSettings` interface + defaults |
| `src/ui/preferences-tab.ts` | Control Center Preferences tab — frequently-changed surface, same visual idiom |
| `styles/settings.css` | All section / chevron / search / info-box styling |
| `main.ts` | One line: `this.addSettingTab(new CanvasRootsSettingTab(this.app, this));` |

**DB analog.** [src/settings/settings-tab.ts](../../src/settings/settings-tab.ts) holds the `DraftBenchSettingTab` class; [src/model/settings.ts](../../src/model/settings.ts) holds the `DraftBenchSettings` interface and `DEFAULT_SETTINGS`. Adopting the CR pattern would keep that split intact and add a `styles/settings-tab.css` for the section / chevron / search styling, integrated into the [styles bundle](../../styles/) per the plugin's CSS build pipeline.

---

## 10. Adapting for Draft Bench — start order

1. **Lift the CSS** for collapsible sections + info boxes (the `<details>/<summary>` chevron block and `cr-info-box` styles) into `styles/settings-tab.css`. Rename the prefix to `dbench-` / `draft-bench-` per [coding-standards.md § 3](../developer/coding-standards.md). No TS changes yet.
2. **Build the `<details>/<summary>` skeleton** in `display()` with one section per logical grouping. Keep the existing `render*` methods intact; just wrap their content in a `<details>` shell. State preservation can wait until you notice the re-collapse problem.
3. **Add the search box + `filterSettings()`** once you have 3+ sections that span more than one screen height.
4. **Add `saveOpenSections` / `restoreOpenSections`** once the re-collapse-on-re-render behavior surfaces in dev-vault use.
5. **Extract helpers** (`createFolderSetting`-style) only after you're repeating yourself 3+ times — premature extraction muddies the section renderers, and DB's current settings tab doesn't repeat enough yet to justify it.

---

## 11. Things to copy verbatim vs. adapt

**Copy verbatim:**

- The `<details>/<summary>` + chevron CSS (with the prefix renamed).
- `filterSettings`, `saveOpenSections`, `restoreOpenSections` — they're plugin-agnostic.
- The `cr-info-box` pattern for in-section explanatory text.

**Adapt to DB:**

- Section list in `display()` — DB's domains are different (Folders, Drafts, Templates, Bases, Statuses, Sync, About vs. CR's ten sections). Don't copy CR's section list one-for-one.
- Helper methods — only extract for shapes DB actually repeats.
- The two-surface split (Settings vs Control Center) — DB has no Control Center in V1, so keep everything in the settings tab.

---

## 12. Open design decisions for the DB pass

To resolve when DB actually adopts this pattern:

- **Default-open vs default-closed sections.** CR opens all sections by default; DB might prefer the inverse for a denser settings tab, with state preservation kicking in once the writer customizes which sections they care about.
- **Per-section search-result count.** CR's `filterSettings` hides a whole section if no settings match the query; should the section header instead show "(0 matches)" so the writer knows the section exists?
- **Subsection naming for DB's domains.** CR's "Entity folders / Output folders / System folders" trio doesn't map. DB's folder section currently has Projects / Scenes / Sub-scenes / Templates folders all flat; whether to subgroup them, and along what axis, is a design call.
- **Where to put the migration-version flag** like `scenesFolderMigrated` (introduced in #11). Not a user-facing setting, but the settings interface holds it. Adoption of collapsibles is a chance to also organize internal-state fields (collapse states, migration flags, last-selected-project-id) consistently — likely under a hidden / non-rendered partition.
