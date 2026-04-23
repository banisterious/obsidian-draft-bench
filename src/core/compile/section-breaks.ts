import type { CompilePresetFrontmatter } from '../../model/compile-preset';
import type { SceneNote } from '../discovery';

/**
 * Section-break injection for the compile pipeline.
 *
 * Per [D-06 § Preset schema shape](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * a scene that should have a named break rendered before it sets
 * `dbench-section-break-title` (and optionally
 * `dbench-section-break-style`) in its own frontmatter. Presence of
 * the title triggers the break. The preset's
 * `dbench-compile-include-section-breaks` toggle (default `true`)
 * gates the whole mechanism, letting writers compile a workshop
 * variant with breaks suppressed without touching scene metadata.
 *
 * Rendering: in the V1 markdown intermediate, both styles (`visual`
 * and `page-break`) emit the same visible form — a dinkus, the title
 * centered as bold, and a closing dinkus. The style field is
 * captured on the scene for P3.C renderers (PDF / ODT) to honor
 * page-break semantics when they land.
 */

/**
 * Build the markdown fragment for the section break that should
 * precede `scene` in the compiled document, or `null` when no break
 * applies.
 *
 * Returns `null` when:
 *
 * - the preset's `dbench-compile-include-section-breaks` is `false`,
 * - the scene lacks `dbench-section-break-title`, or
 * - the title field is present but empty / whitespace-only.
 *
 * The style field is read but not currently differentiated in output;
 * see module header.
 */
export function buildSectionBreak(
	scene: SceneNote,
	preset: CompilePresetFrontmatter
): string | null {
	if (!preset['dbench-compile-include-section-breaks']) return null;

	const fm = scene.frontmatter as unknown as Record<string, unknown>;
	const rawTitle = fm['dbench-section-break-title'];
	if (typeof rawTitle !== 'string') return null;
	const title = rawTitle.trim();
	if (title.length === 0) return null;

	return `* * *\n\n**${title}**\n\n* * *`;
}
