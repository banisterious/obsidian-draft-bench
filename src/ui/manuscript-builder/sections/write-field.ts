import type { App } from 'obsidian';
import type { CompilePresetNote } from '../../../core/discovery';

/**
 * Persist a single preset-frontmatter field. Writes via
 * `processFrontMatter` and mirrors the value into the in-memory
 * `preset.frontmatter` so subsequent reads in the same render pass
 * see the update without a metadata-cache round-trip.
 *
 * Shared by every Compile-tab form section.
 */
export async function writeField<
	K extends keyof CompilePresetNote['frontmatter'],
>(
	app: App,
	preset: CompilePresetNote,
	key: K,
	value: CompilePresetNote['frontmatter'][K]
): Promise<void> {
	await app.fileManager.processFrontMatter(preset.file, (fm) => {
		(fm as Record<string, unknown>)[key as string] = value as unknown;
	});
	(preset.frontmatter as unknown as Record<string, unknown>)[key as string] =
		value;
}
