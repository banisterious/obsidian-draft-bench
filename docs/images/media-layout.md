# Plugin repo media

Visual assets for the README and the GitHub wiki. Stills live here at the top level and are referenced directly (no website-CDN round-trip required) so the docs render cleanly even if `draftbench.io` is down. Motion captures are too large to commit and stay on the website CDN.

## Layout

```
docs/images/
  README.md                              # this file
  dbench-*.png                           # doc-source stills, committed
  raw/
    dbench-*.{webm,mp4,mov,mkv}          # motion source files, gitignored
    *.{kdenlive,pdn,psd}                 # editing source files, optional
```

## What lives where

- **`docs/images/*.png`** — source of truth for stills. ShareX captures at native resolution. Used directly by:
  - The repo `README.md` (relative path: `docs/images/<file>.png`).
  - The GitHub wiki (absolute URL: `https://raw.githubusercontent.com/banisterious/obsidian-draft-bench/main/docs/images/<file>.png`).
  - The website repo's `static/img/` — copies are made there for the public CDN, optionally with additional optimization. The plugin repo remains the archival source.
- **`docs/images/raw/`** — motion source files. Videos (`*.webm`, `*.mp4`, `*.mov`, `*.mkv`) are gitignored: they're large, and the optimized versions ship from the website CDN. Editing source files (`*.kdenlive`, `*.pdn`, `*.psd`) can be committed if useful for later re-tweaks; otherwise they stay local.

## Naming convention

Per [docs/planning/website-content/media-plan.md § Plugin prefix for media files](../planning/website-content/media-plan.md):

`dbench-<feature>-<variant>.<ext>` — lowercase, hyphens, no underscores.

Examples:

- `dbench-manuscript-view.png`
- `dbench-compile-flow.webm`
- `dbench-create-project-modal.png`

## Why stills are committed but videos aren't

Stills at ShareX native resolution typically run 200 KB - 2 MB. Committing a handful adds a few MB to the repo and keeps the docs self-contained. Videos at typical capture lengths run 5-50 MB each; committing them grows clones noticeably with little upside (motion captures are uncommon enough in README / wiki that the CDN round-trip is acceptable). The trade-off may revisit if GitHub's `<video>` rendering for repo-relative URLs becomes more reliable.

See [docs/planning/website-content/media-plan.md](../planning/website-content/media-plan.md) for the full plan, target file sizes, embed patterns, and bandwidth budget.
