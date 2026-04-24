import { Setting, type App } from 'obsidian';
import { computeLastCompileStatus } from '../../../../core/compile/last-compile-status';
import type { CompilePresetNote } from '../../../../core/discovery';

/**
 * Last-compile section of the Compile tab form. Read-only display of
 * the three `dbench-last-*` fields plus an asynchronously-computed
 * "N scenes changed since last compile" readout per D-06's UI
 * commitment.
 *
 * The async computation reads every scene's content to djb2-hash it,
 * so the section first renders synchronously with placeholders and
 * updates when the promise resolves. If the writer switches presets
 * before the computation finishes, the stale update writes into a
 * detached DOM (harmless) — the next render starts fresh.
 */
export function renderLastCompileSection(
	parent: HTMLElement,
	app: App,
	preset: CompilePresetNote
): void {
	const compiledAtSetting = new Setting(parent)
		.setName('Last compiled')
		.setDesc('Timestamp of the most recent successful compile.');
	const compiledAtValue = compiledAtSetting.controlEl.createEl('span', {
		cls: 'dbench-compile-tab__readonly-value',
		text: '...',
	});

	const outputPathSetting = new Setting(parent)
		.setName('Last output path')
		.setDesc(
			'Vault or absolute path the most recent compile wrote to. Re-compile overwrites this path silently.'
		);
	const outputPathValue = outputPathSetting.controlEl.createEl('span', {
		cls: 'dbench-compile-tab__readonly-value',
		text: '...',
	});

	const changesSetting = new Setting(parent)
		.setName('Scenes changed since')
		.setDesc(
			'Count of scenes whose content differs from the snapshot taken at the last compile, plus added or removed scenes.'
		);
	const changesValue = changesSetting.controlEl.createEl('span', {
		cls: 'dbench-compile-tab__readonly-value',
		text: 'Computing...',
	});

	computeLastCompileStatus(app, preset)
		.then((status) => {
			compiledAtValue.textContent = status.compiledAt
				? formatTimestamp(status.compiledAt)
				: 'Never compiled.';
			outputPathValue.textContent = status.outputPath ?? 'No output yet.';
			changesValue.textContent = formatScenesChanged(status);
		})
		.catch((err) => {
			console.error('Draft Bench: failed to compute last-compile status', err);
			compiledAtValue.textContent = preset.frontmatter['dbench-last-compiled-at']
				? formatTimestamp(preset.frontmatter['dbench-last-compiled-at'])
				: 'Never compiled.';
			outputPathValue.textContent =
				preset.frontmatter['dbench-last-output-path'] || 'No output yet.';
			changesValue.textContent = '(unable to compute)';
		});
}

/**
 * Format an ISO 8601 timestamp as a human-readable local string.
 * Falls back to the input value if parsing fails.
 *
 * Exported for tests.
 */
export function formatTimestamp(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString();
}

/**
 * Format the scenes-changed count as a single user-facing line.
 * Distinguishes "never compiled" from "no changes" so writers can
 * tell which baseline they're seeing.
 *
 * Exported for tests.
 */
export function formatScenesChanged(status: {
	storedHashCount: number;
	scenesChanged: number;
	totalCurrentScenes: number;
}): string {
	if (status.storedHashCount === 0) return 'No baseline; never compiled.';
	if (status.scenesChanged === 0) return 'No changes since last compile.';
	const noun = status.scenesChanged === 1 ? 'scene' : 'scenes';
	return `${status.scenesChanged} ${noun} changed since last compile.`;
}
