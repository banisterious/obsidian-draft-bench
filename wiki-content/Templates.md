# Templates

Draft Bench applies a scene template when you create a new scene. V1 ships with a single built-in template. User-defined multi-template support arrives in Phase 2.

---

## V1 built-in template

The default scene template includes planning sections above the draft area. The exact shape is:

```markdown
## Source passages

## Beat outline

## Open questions

## Draft

```

The idea is to give writers space for the thinking that happens before prose. Writers who don't plan before drafting can remove these headings; nothing enforces their presence.

## Template application

The built-in template is applied automatically when you run **New scene in project**. No action required.

## Customizing the template (V1)

You can edit the built-in template file in the vault. The path is configurable in [Settings and Configuration](Settings-And-Configuration). Changes take effect on the next scene creation.

## User-defined templates (Phase 2+)

Phase 2 adds:

- A **templates folder** where you can author multiple named templates.
- A **template selection** step at scene creation.
- **Per-project default template** settings.

Templates will support frontmatter scaffolding, body text with structural prompts, and display-name/description metadata.

## Templater integration (stretch goal)

If the [Templater plugin](https://github.com/SilentVoid13/Templater) is installed, Draft Bench's templates may use Templater syntax for dynamic content (dates, prompts, cursor placement). The plugin detects Templater's presence and processes templates through it when available. This is a stretch goal for V1 — scope and behavior TBD.

---

*Template file paths and authoring instructions coming once V1 ships.*
