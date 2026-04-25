import { Setting, type App } from 'obsidian';
import type { CompilePresetNote } from '../../../core/discovery';
import type {
	CompileDinkusRule,
	CompileEmbedRule,
	CompileFrontmatterRule,
	CompileHeadingScope,
	CompileWikilinkRule,
} from '../../../model/compile-preset';
import { writeField } from './write-field';

const HEADING_SCOPE_LABELS: Record<CompileHeadingScope, string> = {
	draft: 'Draft section only (below the `## Draft` heading)',
	full: 'Full body (including planning sections)',
};

const FRONTMATTER_LABELS: Record<CompileFrontmatterRule, string> = {
	strip: 'Strip the YAML fence',
	preserve: 'Preserve the YAML fence as plain text',
};

const WIKILINK_LABELS: Record<CompileWikilinkRule, string> = {
	'display-text': 'Keep display text, drop brackets',
	strip: 'Drop entirely',
	'preserve-syntax': 'Keep [[brackets]] in output',
};

const EMBED_LABELS: Record<CompileEmbedRule, string> = {
	strip: 'Strip every embed',
	resolve: 'Resolve embeds (post-V1; falls back to strip in V1)',
};

const DINKUS_LABELS: Record<CompileDinkusRule, string> = {
	preserve: 'Preserve as written',
	normalize: 'Normalize to `* * *`',
};

/**
 * Content-handling section of the Compile tab form.
 *
 * Per [D-06 § Content-handling rules](../../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * five rules are per-preset (heading scope, frontmatter,
 * wikilinks, embeds, dinkuses); the other eleven are hardcoded and
 * not surfaced here. Embed rule's `resolve` mode is reserved for
 * post-V1; V1 strips regardless, so the dropdown lets writers stage
 * the setting early without behavioral change.
 */
export function renderContentHandlingSection(
	parent: HTMLElement,
	app: App,
	preset: CompilePresetNote
): void {
	new Setting(parent)
		.setName('Heading scope')
		.setDesc(
			'Which part of each scene is included in the compile. Default keeps only the draft section so planning notes stay private.'
		)
		.addDropdown((dropdown) => {
			for (const value of Object.keys(
				HEADING_SCOPE_LABELS
			) as CompileHeadingScope[]) {
				dropdown.addOption(value, HEADING_SCOPE_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-heading-scope'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-heading-scope',
						value as CompileHeadingScope
					);
				});
		});

	new Setting(parent)
		.setName('Frontmatter')
		.setDesc(
			'How each scene\'s YAML fence is handled in the compiled output.'
		)
		.addDropdown((dropdown) => {
			for (const value of Object.keys(
				FRONTMATTER_LABELS
			) as CompileFrontmatterRule[]) {
				dropdown.addOption(value, FRONTMATTER_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-frontmatter'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-frontmatter',
						value as CompileFrontmatterRule
					);
				});
		});

	new Setting(parent)
		.setName('Wikilinks')
		.setDesc(
			'How [[wikilinks]] in scene bodies are rendered. Display-text is the most common choice for submission manuscripts.'
		)
		.addDropdown((dropdown) => {
			for (const value of Object.keys(
				WIKILINK_LABELS
			) as CompileWikilinkRule[]) {
				dropdown.addOption(value, WIKILINK_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-wikilinks'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-wikilinks',
						value as CompileWikilinkRule
					);
				});
		});

	new Setting(parent)
		.setName('Embeds')
		.setDesc(
			'How ![[embeds]] are handled. V1 strips every embed; resolve mode is reserved for a future media-inclusion release.'
		)
		.addDropdown((dropdown) => {
			for (const value of Object.keys(EMBED_LABELS) as CompileEmbedRule[]) {
				dropdown.addOption(value, EMBED_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-embeds'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-embeds',
						value as CompileEmbedRule
					);
				});
		});

	new Setting(parent)
		.setName('Dinkuses')
		.setDesc(
			'Whether scene-break glyphs (`* * *`, asterism, fullwidth stars) are normalized to `* * *` or preserved as written.'
		)
		.addDropdown((dropdown) => {
			for (const value of Object.keys(DINKUS_LABELS) as CompileDinkusRule[]) {
				dropdown.addOption(value, DINKUS_LABELS[value]);
			}
			dropdown
				.setValue(preset.frontmatter['dbench-compile-dinkuses'])
				.onChange(async (value) => {
					await writeField(
						app,
						preset,
						'dbench-compile-dinkuses',
						value as CompileDinkusRule
					);
				});
		});
}
