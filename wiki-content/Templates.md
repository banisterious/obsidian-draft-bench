# Templates

Draft Bench applies a template when you create a new scene or chapter. V1 ships with a single built-in template per type, plus a multi-template system: writers can author additional named templates and pick from them at creation time.

---

## V1 built-in templates

Both the scene template and the chapter template ship with the same body shape — planning sections above a draft area:

```markdown
## Source passages

## Beat outline

## Open questions

## Draft

```

The idea is to give writers space for the thinking that happens before prose. Writers who don't plan before drafting can remove these headings; nothing enforces their presence.

For chapters specifically, the `## Draft` section is **chapter-introductory prose only** — it emits before the chapter's scenes in compile output, not interleaved between them. Most chapters leave it empty.

## Template application

The built-in scene template is applied automatically when you run **New scene in project**.
The built-in chapter template is applied automatically when you run **New chapter in project**.
No action required for the defaults.

## Customizing the templates (V1)

The first time you create a scene or chapter, the plugin seeds the built-in body to:

- `Draft Bench/Templates/scene-template.md`
- `Draft Bench/Templates/chapter-template.md`

Edit either file to customize subsequent creations. The folder path and per-file override paths are configurable in [Settings and Configuration](Settings-And-Configuration).

### Plugin tokens

Templates support `{{token}}` placeholders that get substituted at creation time:

**Scene template tokens:**

- `{{project}}` — wikilink to the project, e.g. `[[My Novel]]`.
- `{{project_title}}` — plain text title.
- `{{scene_title}}` — the new scene's title.
- `{{scene_order}}` — the scene's `dbench-order` value.
- `{{previous_scene_title}}` — basename of the scene one position earlier in the project (or empty if first).
- `{{date}}` — ISO date (`YYYY-MM-DD`) of creation.

**Chapter template tokens:**

- `{{project}}`, `{{project_title}}`, `{{date}}` — same as above.
- `{{chapter_title}}` — the new chapter's title.
- `{{chapter_order}}` — the chapter's `dbench-order` value.
- `{{previous_chapter_title}}` — basename of the chapter one position earlier (or empty if first).

Unknown tokens pass through unchanged so other tools (like Templater, below) can handle them.

## Named templates (custom)

Beyond the built-in defaults, you can author any number of additional templates and pick from them at scene or chapter creation.

### Authoring a named template

Create a markdown file in the templates folder (default: `Draft Bench/Templates/`) with frontmatter that declares its type:

```markdown
---
dbench-template-type: scene
dbench-template-name: POV — Anna
dbench-template-description: Single-POV scene with cue lines
---

## Source passages

## Beat outline

## POV cues

## Draft
```

Required frontmatter:

- `dbench-template-type` — `scene` or `chapter`. Determines which creation modal lists this template.

Optional frontmatter:

- `dbench-template-name` — display name shown in the picker. Falls back to the file basename when absent.
- `dbench-template-description` — short hint shown alongside the name in the picker.

Plugin tokens (above) work in named templates the same way they work in the defaults.

### Picking a template at creation

When at least one custom template is discovered, the **New scene in project** and **New chapter in project** modals show a Template dropdown above the title field. The default seed (`scene-template.md` / `chapter-template.md`) sorts first as the labeled "(default)" option; custom templates follow in alphabetical order by display name.

Vaults with only the default templates don't show the picker — there's no choice to make.

### Where to put template files

The templates folder is configured in **Settings → Community plugins → Draft Bench → Templates folder** (default: `Draft Bench/Templates/`). All `.md` files in this folder are scanned for templates. Files without `dbench-template-type` frontmatter are skipped — keeping Templater plugin templates and unrelated markdown out of the picker.

## Templater integration

If the [Templater plugin](https://github.com/SilentVoid13/Templater) is installed and enabled, Draft Bench's scene and chapter templates can use Templater syntax (`<% ... %>`) for dynamic content (dates, prompts, cursor placement). The plugin detects Templater's presence and runs templates through it before applying plugin-token substitution. The two syntaxes don't conflict: a Templater function can even emit a `{{plugin_token}}` that the plugin then substitutes.

If Templater isn't installed, templates use plugin-token substitution only.

---

*Template file paths and authoring instructions coming once V1 ships.*
