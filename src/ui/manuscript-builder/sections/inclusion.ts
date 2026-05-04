import { Setting, type App } from 'obsidian';
import type { CompilePresetNote } from '../../../core/discovery';
import type { DraftBenchSettings } from '../../../model/settings';
import { writeField } from './write-field';

/**
 * Inclusion section of the Compile tab form.
 *
 * Per [D-06 § Inclusion model](../../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * V1 has three flat knobs:
 *
 * - `dbench-compile-scene-source` — `auto` only in V1; explicit
 *   chapter lists are reserved for post-V1, so the field renders
 *   read-only here as a forward-compat hint.
 * - `dbench-compile-scene-statuses` — multi-select over the writer's
 *   current status vocabulary. Empty = all statuses included.
 * - `dbench-compile-scene-excludes` — wikilink array of scenes to
 *   skip. V1 surfaces this as a textarea (one entry per line); a
 *   scene picker modal lands post-V1.
 */
export function renderInclusionSection(
	parent: HTMLElement,
	app: App,
	preset: CompilePresetNote,
	settings: DraftBenchSettings
): void {
	new Setting(parent)
		.setName('Scene source')
		.setDesc(
			'Every scene in the project, sorted by dbench-order. Explicit chapter lists are reserved for a future release.'
		)
		.addText((text) => {
			text
				.setValue('auto')
				.setDisabled(true);
			text.inputEl.setAttribute('aria-readonly', 'true');
		});

	const statusSetting = new Setting(parent)
		.setName('Status filter')
		.setDesc(
			'Only include scenes whose status matches one of these. Leave all unchecked to include every scene regardless of status.'
		);
	renderStatusFilter(statusSetting.controlEl, app, preset, settings);

	new Setting(parent)
		.setName('Exclude specific scenes')
		.setDesc(
			'One wikilink per line, e.g. `[[Outtake]]`. Excluded scenes are dropped from the compile set after the status filter runs.'
		)
		.addTextArea((textArea) => {
			textArea.inputEl.rows = 4;
			textArea.inputEl.addClass('dbench-manuscript-builder__monospace');
			textArea
				.setValue(preset.frontmatter['dbench-compile-scene-excludes'].join('\n'))
				.onChange(async (value) => {
					const lines = value
						.split('\n')
						.map((line) => line.trim())
						.filter((line) => line.length > 0);
					await writeField(
						app,
						preset,
						'dbench-compile-scene-excludes',
						lines
					);
				});
		});
}

/**
 * Multi-select chips injected into a Setting's `.controlEl`. Per
 * [ui-reference.md § 3 Divergence 3](../../../../docs/planning/ui-reference.md),
 * the Setting shell stays inherited (label, description, native
 * row layout); only the control surface is custom because Obsidian's
 * Setting API has no built-in multi-select primitive.
 *
 * Chip visual: a `<label>` styled as a toggleable pill, wrapping a
 * visually-hidden `<input type="checkbox">` plus the status text.
 * Click anywhere on the pill toggles via the standard label-wraps-
 * input affordance. The `data-status` attribute carries the lowercased
 * status value so CSS selectors can theme the active state per
 * status via `[data-status="brainstorm"]` etc., mirroring the
 * Manuscript view's status-chip pattern.
 *
 * Visual contract: outlined when unselected, color-mix-tinted with
 * the per-status `--dbench-status-<status>` variable when selected.
 * The hidden checkbox stays focusable for keyboard / screen-reader
 * accessibility; CSS `:has(input:focus-visible)` transfers the
 * focus indicator to the chip.
 */
function renderStatusFilter(
	parent: HTMLElement,
	app: App,
	preset: CompilePresetNote,
	settings: DraftBenchSettings
): void {
	const wrapper = parent.createDiv({
		cls: 'dbench-manuscript-builder__status-chips',
	});

	const current = new Set(
		preset.frontmatter['dbench-compile-scene-statuses']
	);

	for (const status of settings.statusVocabulary) {
		const label = wrapper.createEl('label', {
			cls: 'dbench-manuscript-builder__status-chip',
			attr: { 'data-status': status.toLowerCase() },
		});
		const checkbox = label.createEl('input', {
			type: 'checkbox',
			attr: { 'aria-label': status },
		});
		checkbox.checked = current.has(status);
		label.createSpan({
			cls: 'dbench-manuscript-builder__status-chip-label',
			text: status,
		});
		checkbox.addEventListener('change', () => {
			if (checkbox.checked) {
				current.add(status);
			} else {
				current.delete(status);
			}
			writeField(
				app,
				preset,
				'dbench-compile-scene-statuses',
				Array.from(current)
			).catch((err) => {
				// Swallow + log so a transient processFrontMatter failure
				// (e.g., file moved mid-edit) doesn't bubble into the DOM
				// event loop. The next render reads from the cache, which
				// will reflect actual on-disk state.
				console.error('Draft Bench: failed to update status filter', err);
			});
		});
	}
}

