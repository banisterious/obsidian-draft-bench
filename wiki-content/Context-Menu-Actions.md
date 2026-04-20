# Context Menu Actions

Draft Bench adds several actions to Obsidian's right-click menu. They cover creating new projects, scenes, and drafts, plus retrofitting existing notes that predate your adoption of the plugin.

---

## Creation actions

- **Create Draft Bench project** (on a folder): opens the new-project modal.
- **New scene in project** (inside a project folder): opens the new-scene modal.
- **New draft of this scene** (on a scene note): snapshots current prose and carries it forward.
- **Set status** (on a project or scene): quick status change.
- **Reorder scenes** (anywhere inside a project): opens the reorder modal.

## Retrofit actions for existing notes

If you have notes you created before installing Draft Bench — existing short stories, drafts, project overviews — you can bring them under plugin management without recreating them.

### Set as project / scene / draft

For notes that don't yet have a `dbench-type` property, **Set as...** stamps the appropriate essentials in one step. The note becomes a typed project, scene, or draft — with a `dbench-id`, the right type, and empty placeholder wikilinks where needed.

### Complete essential properties

For notes that already have `dbench-type` but are missing other essentials (e.g., `dbench-id`, `dbench-status`), **Complete essential properties** fills in only the missing fields. It never overwrites existing values.

### Add dbench-id

Standalone action — adds only the stable identifier. Useful for notes that have type information but predate the ID system, or when you want just the ID without other essentials.

## Scopes

All retrofit actions work at three scopes:

- **Single files**: right-click on one note in the file explorer or editor.
- **Multi-selections**: select multiple notes in the file explorer, right-click.
- **Folders**: right-click on a folder; the action applies to all markdown files inside, recursively. Useful for onboarding an entire existing project at once.

## Behavior guarantees

- **Idempotent.** Running an action twice is identical to running it once.
- **Never overwrites.** Existing frontmatter values are preserved unconditionally.
- **Smart menu visibility.** Actions only appear in the menu when they would actually change something: a fully-stamped note shows no retrofit entries.
- **Empty placeholders for unresolvable wikilinks.** When **Set as scene** runs on a note that can't be automatically attached to a project, `dbench-project` is stamped as an empty string. Fill it in via the Properties panel; a Phase 2 picker modal will streamline this.

## Feedback

Actions emit a summary notice:

- Single file: "Set as scene" / "Already a scene" / "Failed to apply properties."
- Multi-file or folder: "Set as scene: 5 updated, 3 already typed, 1 error."

---

*More detail and examples coming once V1 ships.*
