import { Setting, type App } from 'obsidian';
import type { CompilePresetNote } from '../../../core/discovery';
import type {
	CompileChapterNumbering,
	CompileFormat,
	CompileOutput,
	CompilePageSize,
} from '../../../model/compile-preset';
import { writeField } from './write-field';

const FORMAT_LABELS: Record<CompileFormat, string> = {
	md: 'Markdown',
	pdf: 'PDF',
	odt: 'OpenDocument Text (ODT)',
	docx: 'Word (DOCX)',
};

const OUTPUT_LABELS: Record<CompileOutput, string> = {
	vault: 'Save into the vault',
	disk: 'Save to disk (prompts each time)',
};

const PAGE_SIZE_LABELS: Record<CompilePageSize, string> = {
	letter: 'US Letter (8.5 × 11 in)',
	a4: 'A4 (210 × 297 mm)',
};

const CHAPTER_NUMBERING_LABELS: Record<CompileChapterNumbering, string> = {
	none: 'None',
	numeric: 'Numeric (1, 2, 3...)',
	roman: 'Roman (I, II, III...)',
};

/**
 * Output section of the Compile tab form.
 *
 * Per [D-06 § Output format](../../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md):
 * format + output destination are orthogonal flat fields. Vault
 * destination is meaningful only when format=md (PDF / ODT always
 * write to disk regardless), but the picker stays enabled in both
 * cases so the writer's intent persists when they flip formats.
 */
export function renderOutputSection(
	parent: HTMLElement,
	app: App,
	preset: CompilePresetNote
): void {
	new Setting(parent)
		.setName('Format')
		.setDesc('File format produced by this preset.')
		.addDropdown((dropdown) => {
			for (const value of Object.keys(FORMAT_LABELS) as CompileFormat[]) {
				dropdown.addOption(value, FORMAT_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-format'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-format',
						value as CompileFormat
					);
				});
		});

	new Setting(parent)
		.setName('Destination')
		.setDesc(
			'Where the compiled file is saved. PDF and ODT always prompt for a disk location regardless of this setting.'
		)
		.addDropdown((dropdown) => {
			for (const value of Object.keys(OUTPUT_LABELS) as CompileOutput[]) {
				dropdown.addOption(value, OUTPUT_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-output'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-output',
						value as CompileOutput
					);
				});
		});

	new Setting(parent)
		.setName('Page size')
		.setDesc('Used by PDF and ODT renderers. Markdown ignores this field.')
		.addDropdown((dropdown) => {
			for (const value of Object.keys(PAGE_SIZE_LABELS) as CompilePageSize[]) {
				dropdown.addOption(value, PAGE_SIZE_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-page-size'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-page-size',
						value as CompilePageSize
					);
				});
		});

	new Setting(parent)
		.setName('Cover page')
		.setDesc(
			'Render a cover page with title, subtitle, and author at the start of the document.'
		)
		.addToggle((toggle) =>
			toggle
				.setValue(preset.frontmatter['dbench-compile-include-cover'])
				.onChange(async (value) => {
					await writeField(app, preset, 'dbench-compile-include-cover', value);
				})
		);

	new Setting(parent)
		.setName('Table of contents')
		.setDesc('Generate a table of contents listing scene titles in order.')
		.addToggle((toggle) =>
			toggle
				.setValue(preset.frontmatter['dbench-compile-include-toc'])
				.onChange(async (value) => {
					await writeField(app, preset, 'dbench-compile-include-toc', value);
				})
		);

	new Setting(parent)
		.setName('Chapter numbering')
		.setDesc(
			'Prefix each scene heading with a sequential number, a roman numeral, or no prefix at all.'
		)
		.addDropdown((dropdown) => {
			for (const value of Object.keys(
				CHAPTER_NUMBERING_LABELS
			) as CompileChapterNumbering[]) {
				dropdown.addOption(value, CHAPTER_NUMBERING_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-chapter-numbering'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-chapter-numbering',
						value as CompileChapterNumbering
					);
				});
		});

	new Setting(parent)
		.setName('Section breaks')
		.setDesc(
			'Honor scene-level dbench-section-break-title declarations. Turn off to suppress every break in this compile (useful for workshop variants).'
		)
		.addToggle((toggle) =>
			toggle
				.setValue(preset.frontmatter['dbench-compile-include-section-breaks'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-include-section-breaks',
						value
					);
				})
		);
}
