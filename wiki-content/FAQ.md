# FAQ

Common questions about Draft Bench. Add your own via [GitHub Discussions](https://github.com/banisterious/obsidian-draft-bench/discussions).

---

## How is Draft Bench different from Longform?

Draft Bench and Longform share core ideas — scene-based writing, project structure in Obsidian. Draft Bench differs in:

- **Per-scene versioned drafts as first-class files.** Every "new draft" creates a real markdown file you can open, link, tag, and query.
- **Frontmatter-native data model.** Membership and relationships live in `dbench-*` properties. No index file, no parallel JSON store. Native Obsidian Bases compatibility.
- **Flexible folder structure.** Scenes can live anywhere in your vault; the plugin identifies them by frontmatter, not folder location.
- **Compile without JavaScript.** A form-based Book Builder (Phase 3+) will support compile presets, scene selection, and multi-format export.

## Does it work on mobile?

V1 is desktop-only. Mobile support is under post-V1 evaluation — the primary UX (Manuscript view, Manuscript Builder, reorder modal, Style Settings integration) was designed for a desktop form factor.

## Can I use existing notes?

Yes. Right-click any note (or folder, or multi-selection) and use one of the [retrofit actions](Context-Menu-Actions): **Set as project / scene / draft**, **Complete essential properties**, or **Add identifier**. All are idempotent and never overwrite existing data.

## Where does my draft history live?

In a `Drafts/` folder. Default placement is inside each project folder; three options are configurable (project-local, per-scene, vault-wide). Draft files are plain markdown with frontmatter — you own them, and they're readable without the plugin.

## What happens if I rename a project note?

Obsidian automatically updates wikilinks in all scenes' `dbench-project` properties. Draft Bench additionally carries a `dbench-project-id` stable identifier as a backup reference, so the relationship survives renames even in edge cases (non-Obsidian renames, sync races). If any inconsistency occurs, the **Repair project links** command reconciles forward and reverse references.

## What happens if I move scenes to a different folder?

Nothing breaks. Draft Bench identifies scenes by their `dbench-project` frontmatter, not by folder location. You can reorganize your vault however you want — by date, by status, by part — and the plugin continues to work.

## Can I remove the plugin and keep my files?

Yes. Every note is plain markdown with YAML frontmatter. Disabling or uninstalling the plugin doesn't alter your notes — they remain human-readable and editable in any markdown editor. Other frontmatter readers (Bases, Dataview) continue to see the `dbench-*` properties as normal frontmatter.

## Is there an AI writing assistant?

No. Draft Bench is deliberately not an AI writing assistant and does not call language models, generate prose, or rewrite your text. The plugin provides structural and workflow scaffolding; the words are yours. See the [specification § Non-goals](https://github.com/banisterious/obsidian-draft-bench/blob/main/docs/planning/specification.md).

## Why doesn't file-explorer order match story order?

Story order is determined by the `dbench-order` frontmatter property, not by filename. This lets you reorder scenes cheaply (no file or folder renames, no wikilink cascade) and organize files by any other criterion (status, POV, date) without breaking manuscript order. The **Manuscript view** (the dockable pane in the right sidebar) is the canonical ordered view.

## Can I use Draft Bench alongside other Obsidian plugins?

Yes. Draft Bench stays out of the way of other plugins: it uses namespaced properties (`dbench-*`), namespaced CSS classes (`.dbench-` / `.draft-bench-`), and does not modify Obsidian's editor behavior beyond applying CSS classes. Known-compatible plugins include Templater, Style Settings, Bases, Dataview, and any community sort-plugin that reads frontmatter.

---

*More questions and answers will be added based on real user questions in GitHub Discussions.*
