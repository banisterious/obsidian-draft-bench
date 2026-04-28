# Raw captures

Full-resolution, untouched captures from ShareX (and any post-tweaks from Paint.NET / ScreenToGif / kdenlive). Source-of-truth for regenerating site-ready versions at different sizes or formats.

**What lives here:**

- Motion source files (gitignored — see below): `*.mp4`, `*.webm`, `*.mov`, `*.mkv`.
- Raw stills: `*.png` from ShareX at native resolution. Committed.
- Source files for editing: `*.kdenlive`, `*.pdn`, `*.psd`. Optional, commit if useful for later re-tweaks.

**Gitignored** (large files, only the optimized versions ship):

- `*.webm`, `*.mp4`, `*.mov`, `*.mkv`

**Naming convention** (per [docs/planning/website-content/media-plan.md § Plugin prefix for media files](../../planning/website-content/media-plan.md)):

`dbench-<feature>-<variant>.<ext>` — lowercase, hyphens, no underscores.

Examples:

- `dbench-manuscript-view.png`
- `dbench-compile-flow.webm`
- `dbench-create-project-modal.png`

**Where the optimized versions go:** the website repo's `static/img/` directory. This plugin repo holds the raws so the website can be regenerated at different sizes without re-capturing.

See [docs/planning/website-content/media-plan.md](../../planning/website-content/media-plan.md) for the full plan, target file sizes, embed patterns, and bandwidth budget.
