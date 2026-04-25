import { Setting, type App, type TextComponent } from 'obsidian';
import { computeLastCompileStatus } from '../../../core/compile/last-compile-status';
import type { CompilePresetNote } from '../../../core/discovery';

/**
 * Last-compile section of the Compile tab form. Read-only display of
 * the three `dbench-last-*` fields plus an asynchronously-computed
 * "N scenes changed since last compile" readout per D-06's UI
 * commitment.
 *
 * Per [ui-reference.md § 0](../../../../docs/planning/ui-reference.md),
 * each row is a `Setting` row with `addText().setDisabled(true)` so
 * the read-only value picks up Obsidian's native disabled-text-input
 * styling instead of a custom pill class. The async update mutates
 * the held `TextComponent` references rather than reaching for raw
 * DOM nodes.
 *
 * Stale updates after a preset switch write into a detached
 * TextComponent (harmless) — the next render starts fresh.
 */
export function renderLastCompileSection(
	parent: HTMLElement,
	app: App,
	preset: CompilePresetNote
): void {
	let compiledAtComponent: TextComponent | null = null;
	let outputPathComponent: TextComponent | null = null;
	let scenesChangedComponent: TextComponent | null = null;

	new Setting(parent)
		.setName('Last compiled')
		.setDesc('Timestamp of the most recent successful compile.')
		.addText((text) => {
			compiledAtComponent = text;
			text.setValue('...').setDisabled(true);
		});

	new Setting(parent)
		.setName('Last output path')
		.setDesc(
			'Vault or absolute path the most recent compile wrote to. Re-compile overwrites this path silently.'
		)
		.addText((text) => {
			outputPathComponent = text;
			text.setValue('...').setDisabled(true);
		});

	new Setting(parent)
		.setName('Scenes changed since')
		.setDesc(
			'Count of scenes whose content differs from the snapshot taken at the last compile, plus added or removed scenes.'
		)
		.addText((text) => {
			scenesChangedComponent = text;
			text.setValue('Computing...').setDisabled(true);
		});

	computeLastCompileStatus(app, preset)
		.then((status) => {
			compiledAtComponent?.setValue(
				status.compiledAt
					? formatTimestamp(status.compiledAt)
					: 'Never compiled.'
			);
			outputPathComponent?.setValue(status.outputPath ?? 'No output yet.');
			scenesChangedComponent?.setValue(formatScenesChanged(status));
		})
		.catch((err) => {
			console.error('Draft Bench: failed to compute last-compile status', err);
			compiledAtComponent?.setValue(
				preset.frontmatter['dbench-last-compiled-at']
					? formatTimestamp(preset.frontmatter['dbench-last-compiled-at'])
					: 'Never compiled.'
			);
			outputPathComponent?.setValue(
				preset.frontmatter['dbench-last-output-path'] || 'No output yet.'
			);
			scenesChangedComponent?.setValue('(unable to compute)');
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
