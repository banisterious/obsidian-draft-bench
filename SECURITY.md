# Security Policy

## Supported Versions

Currently, security updates are provided for the latest release version only.

| Version | Supported |
|---------|-----------|
| 0.0.x (pre-release) | Design-phase; no public releases yet. |
| < 0.0.1 | Not applicable. |

This table will be updated once V1 ships.

## Data handled by the plugin

Draft Bench manages **writing content**: unpublished drafts of scenes, project notes, and manuscripts. This content can be personal, creative, or commercially sensitive. It is stored as **plain markdown with YAML frontmatter** inside your Obsidian vault.

Specifically, Draft Bench reads and writes:

- **Project notes** (`dbench-type: project`): title, shape, status, scene list, freeform planning prose.
- **Scene notes** (`dbench-type: scene`): prose drafts, planning sections, status, order.
- **Draft notes** (`dbench-type: draft`): archived snapshots of prior scene drafts.
- **Plugin settings** (`.obsidian/plugins/draft-bench/data.json`): folder paths, template preferences, UI settings. No writing content.

## Local-only guarantees

Draft Bench runs **entirely locally inside Obsidian**. The plugin does not:

- Transmit any data over the network.
- Connect to external services or APIs.
- Upload writing content to cloud servers.
- Share data with third parties.
- Call language models, AI assistants, or any remote inference service.
- Send telemetry, usage analytics, crash reports, or any other information off-device.

All file I/O happens through Obsidian's `Vault` API against the user's local vault. The plugin has no network code paths. See also the [specification's Non-goals section](docs/planning/specification.md).

## User security recommendations

### Vault protection

- **Encrypt the storage device** containing your vault (full-disk encryption at the OS level).
- **Use strong passwords** for any OS account or cloud-sync service that holds the vault.
- **Limit physical access** to devices holding unpublished writing.

### Cloud sync and backup

- Cloud-sync services (Obsidian Sync, iCloud, Dropbox, OneDrive, Syncthing, etc.) replicate your vault — including drafts — to the sync provider's infrastructure. Understand each service's security model.
- Enable **two-factor authentication** on any cloud service that hosts the vault.
- Consider **encrypted cloud storage** (Cryptomator, etc.) for highly sensitive writing.
- For unpublished work under contract or NDA, consider a **local-only vault** without cloud sync.

### Version control (Git)

- Writing in progress can be kept in Git, but **private repositories only** for unpublished work.
- Git history preserves every committed state, including earlier drafts. This is a feature (versioning) but also a risk if the repo is ever made public.
- Consider whether your drafts folder should be in `.gitignore` if you use Git for other parts of the vault.

### Plugin hygiene

- Keep **Obsidian and Draft Bench updated** to receive security fixes.
- Review plugin permissions in Obsidian's community-plugin settings before enabling new plugins; Draft Bench doesn't request special permissions, but other plugins might.
- Be cautious about enabling plugins that modify frontmatter broadly; they may interact unpredictably with `dbench-*` properties.

## Known security limitations

1. **No built-in encryption.** Draft Bench does not encrypt writing content. It relies on Obsidian and the underlying OS/filesystem for confidentiality.
2. **No access controls within the vault.** Anyone with read access to your vault can read all Draft Bench data.
3. **No audit logging.** The plugin does not log who reads or modifies notes. (Obsidian's own file-history features and Git provide some visibility.)

These are deliberate: Draft Bench operates on the user's local, plaintext writing files per Obsidian's philosophy. Additional security layers are the user's responsibility.

## Reporting a vulnerability

If you discover a security vulnerability in Draft Bench, please report it privately rather than publicly.

1. **Do not** open a public GitHub issue for security-sensitive reports.
2. Use [GitHub's Private Vulnerability Reporting](https://github.com/banisterious/obsidian-draft-bench/security/advisories/new) to submit a confidential advisory.
3. Include:
   - Description of the vulnerability.
   - Steps to reproduce.
   - Potential impact (especially regarding draft exposure or data loss).
   - Suggested fix, if available.

You can expect:

- Initial response within 72 hours.
- Updates as the issue is investigated and fixed.
- Credit in the security advisory (unless you prefer anonymity).
- Coordination on a responsible disclosure timeline.

## Legal and ethical considerations

Users are responsible for complying with any applicable laws governing the content they store, including but not limited to contractual nondisclosure obligations, publisher agreements, and regional data-protection regulations where relevant (e.g., GDPR if vault content includes third-party personal data in nonfiction research).

Draft Bench is a tool for organizing a writer's own work and does not provide features for multi-party consent, contractual compliance, or regulated-data handling.

---

Last updated: 2026-04-20. This policy will evolve as the plugin ships public releases.
