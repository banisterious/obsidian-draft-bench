import { Setting, type App } from 'obsidian';
import type { CompilePresetNote } from '../../../../core/discovery';
import type { DraftBenchSettings } from '../../../../model/settings';
import { writeField } from './write-field';

/**
 * Inclusion section of the Compile tab form.
 *
 * Per [D-06 § Inclusion model](../../../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
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
			textArea.inputEl.addClass('dbench-compile-tab__monospace');
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

function renderStatusFilter(
	parent: HTMLElement,
	app: App,
	preset: CompilePresetNote,
	settings: DraftBenchSettings
): void {
	const wrapper = parent.createDiv({
		cls: 'dbench-compile-tab__multi-select',
	});

	const current = new Set(
		preset.frontmatter['dbench-compile-scene-statuses']
	);

	for (const status of settings.statusVocabulary) {
		const label = wrapper.createEl('label', {
			cls: 'dbench-compile-tab__multi-select-item',
		});
		const checkbox = label.createEl('input', {
			type: 'checkbox',
			attr: { 'aria-label': status },
		});
		checkbox.checked = current.has(status);
		label.createSpan({ text: status });
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

