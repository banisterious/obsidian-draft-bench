# Context menu reference: Charted Roots submenu pattern

**Status:** Reference material. **Not** a design spec for Draft Bench's context menu. DB currently ships flat top-level items via [src/context-menu/file-menu.ts](../../src/context-menu/file-menu.ts) and [src/context-menu/files-menu.ts](../../src/context-menu/files-menu.ts); the CR pattern below collapses each plugin's contributions into a single submenu entry, with a mobile-flat fallback. DB will adopt this shape via a tracked feature request.

**Purpose.** Captures Charted Roots' (CR) plugin-namespaced submenu pattern for Obsidian's `file-menu` and `editor-menu` events, so DB starts the submenu refactor from a concrete prior art rather than a blank page. The summary reflects CR's working pattern around April 2026; treat code excerpts as search starting points rather than stable anchors.

**How to use this document.**

- **DB ships flat top-level items today.** Retrofit actions ("Set as project / chapter / scene / draft," "Complete essential properties," "Add identifier"), `Repair project links`, `New scene / chapter / draft`, `Reorder scenes / chapters`, `Move to chapter`, `New draft of this chapter`, and the compile entry points all live at the top of the right-click menu, mixing with Obsidian's native items and other plugins.
- **The CR pattern is the target shape** for the submenu refactor: desktop branches into a `Draft Bench` submenu containing the plugin's actions; mobile falls back to a flat list with `Draft Bench:` prefixes because Obsidian doesn't support submenus on mobile yet.
- **Smart visibility ports cleanly.** DB's existing rule (only show actions that would change something; hide entries on fully-stamped files) decides which sub-items appear, not whether the parent submenu shows. The submenu itself surfaces whenever any action would.
- **Editor-menu events** (right-click inside an open editor) follow the same pattern via `app.workspace.on('editor-menu', ...)`. Separate registration; same submenu shape.

**Related docs.**

- [src/context-menu/file-menu.ts](../../src/context-menu/file-menu.ts), [src/context-menu/files-menu.ts](../../src/context-menu/files-menu.ts): current flat implementation. `buildSingleFileItems`, `buildFilesMenuItems`, `buildFolderItems` are the existing entry points.
- [wiki-content/Context-Menu-Actions.md](../../wiki-content/Context-Menu-Actions.md): user-facing documentation; will need a refresh post-refactor.
- [D-05 § Smart menu visibility](decisions/D-05-property-retrofit-actions.md): the rule that retrofit actions only appear when they would actually change something. Carries through into the submenu unchanged.
- [ui-reference.md](ui-reference.md): breadth-first CR UI/UX patterns including brief mentions of context-menu shape.

---

## Goal

Group all plugin-specific actions under a single `Charted Roots` submenu in Obsidian's right-click file context menu, instead of polluting the top level with multiple plugin items. Falls back to a flat namespaced list on mobile (Obsidian doesn't support submenus there).

## Registration

Set up once in `plugin.onload()` via `app.workspace.on('file-menu', ...)`:

```ts
plugin.registerEvent(
    plugin.app.workspace.on('file-menu', (menu, file) => {
        const useSubmenu = Platform.isDesktop && !Platform.isMobile;

        // Branch on file type — only surface actions relevant to this file.
        if (file instanceof TFile && file.extension === 'canvas') {
            buildCanvasContextMenu(menu, plugin, file, useSubmenu);
        }
        // ...other file-type branches
    })
);
```

The same pattern works for `editor-menu` (right-click inside an open editor) — separate `app.workspace.on('editor-menu', ...)` registration.

## Desktop variant — submenu

```ts
menu.addSeparator();
menu.addItem((item) => {
    const submenu = item
        .setTitle('Charted Roots')
        .setIcon('git-fork')           // plugin's brand icon
        .setSubmenu();                  // returns a Menu instance

    submenu.addItem((subItem) => {
        subItem
            .setTitle('Regenerate canvas')
            .setIcon('refresh-cw')
            .onClick(async () => { /* action */ });
    });

    submenu.addItem((subItem) => { /* ... */ });
    submenu.addSeparator();             // logical groupings inside the submenu
    submenu.addItem((subItem) => { /* ... */ });
});
```

Nested submenus work too — call `.setSubmenu()` on a sub-item to get a third level (e.g. an `Export` submenu containing `Export as PNG / SVG / PDF`).

## Mobile variant — flat namespaced list

```ts
menu.addItem((item) => {
    item
        .setTitle('Charted Roots: Regenerate canvas')   // prefix every title
        .setIcon('refresh-cw')
        .onClick(async () => { /* same action */ });
});
menu.addItem((item) => {
    item.setTitle('Charted Roots: Show tree statistics').setIcon('bar-chart').onClick(/* ... */);
});
// ...one item per action, all prefixed
```

The prefix matters because mobile shows everything at the top level — without it, plugin actions are indistinguishable from Obsidian's native ones.

## Structural conventions

- **Top-level wrapper function** per file type: `buildCanvasContextMenu(menu, plugin, file, useSubmenu)`. Centralizes the desktop-vs-mobile split and the action list.
- **`menu.addSeparator()` before adding items** so the plugin's section is visually distinct from Obsidian's native items above.
- **Every item has both `.setTitle()` and `.setIcon()`**. Lucide icon names; consistent icons across desktop and mobile variants.
- **Lazy-import heavy modal classes inside `.onClick()`** (`const { Modal } = await import('...')`) to keep onload fast and avoid pulling unused UI code into the bundle eagerly.
- **File-type detection** before deciding which submenu to build: check `file.extension` for canvas / book files, or read frontmatter (`cr_type`) for entity-typed markdown notes. Submenu items are scoped to actions valid for that file type.

## Why this matters

Right-clicking a file in Obsidian without this pattern, every plugin's actions live at the top level of the menu — three plugins each adding five actions becomes a 15-item flat list. The submenu pattern collapses each plugin's contribution to one entry, so users can scan natively-named items (Open, Rename, Delete...) and dive into `Charted Roots` only when they want plugin actions.

## Mobile note

`Menu.addItem(...).setSubmenu()` is a no-op on mobile in current Obsidian. The flat-with-prefix fallback isn't elegant but it's the working pattern. Re-test on mobile when Obsidian adds submenu support there — at that point a single code path replacing both branches becomes possible.
