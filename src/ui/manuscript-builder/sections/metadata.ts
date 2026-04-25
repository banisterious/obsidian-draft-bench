import { Setting, type App } from 'obsidian';
import type { CompilePresetNote } from '../../../core/discovery';
import type { CompileDateFormat } from '../../../model/compile-preset';
import { writeField } from './write-field';

const DATE_FORMAT_LABELS: Record<CompileDateFormat, string> = {
	iso: 'ISO 8601 (2026-04-23)',
	mdy: 'M/D/Y (4/23/2026)',
	dmy: 'D/M/Y (23/4/2026)',
	ymd: 'Y/M/D (2026/4/23)',
};

/**
 * Metadata section of the Compile tab form. Four book-output fields:
 * title, subtitle, author, date format. All persist via
 * `processFrontMatter` on change; the in-memory preset frontmatter
 * mirrors the write so subsequent reads in the same render pass see
 * the new value.
 *
 * Per [D-06 § Preset schema shape](../../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * empty defaults are intentional — the compile pipeline falls back
 * to project title / plugin defaults when a metadata field is empty.
 */
export function renderMetadataSection(
	parent: HTMLElement,
	app: App,
	preset: CompilePresetNote
): void {
	new Setting(parent)
		.setName('Title')
		.setDesc(
			'Book title shown on the cover page and in the document header. Leave empty to fall back to the project title.'
		)
		.addText((text) =>
			text
				.setPlaceholder('Project title')
				.setValue(preset.frontmatter['dbench-compile-title'])
				.onChange(async (value) => {
					await writeField(app, preset, 'dbench-compile-title', value);
				})
		);

	new Setting(parent)
		.setName('Subtitle')
		.setDesc('Optional subtitle shown beneath the title on the cover page.')
		.addText((text) =>
			text
				.setValue(preset.frontmatter['dbench-compile-subtitle'])
				.onChange(async (value) => {
					await writeField(app, preset, 'dbench-compile-subtitle', value);
				})
		);

	new Setting(parent)
		.setName('Author')
		.setDesc(
			'Author name shown on the cover page and in PDF document metadata.'
		)
		.addText((text) =>
			text
				.setValue(preset.frontmatter['dbench-compile-author'])
				.onChange(async (value) => {
					await writeField(app, preset, 'dbench-compile-author', value);
				})
		);

	new Setting(parent)
		.setName('Date format')
		.setDesc(
			'Format used for any compile-time date fields (e.g., the cover-page generation date).'
		)
		.addDropdown((dropdown) => {
			for (const value of Object.keys(DATE_FORMAT_LABELS) as CompileDateFormat[]) {
				dropdown.addOption(value, DATE_FORMAT_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-date-format'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-date-format',
						value as CompileDateFormat
					);
				});
		});
}

