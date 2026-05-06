import type { CompilePresetFrontmatter } from '../../model/compile-preset';
import {
	appendHeadingMarker,
	toRoman,
	type HeadingBuilderOptions,
} from './content-rules';

/**
 * Build the chapter heading emitted in chapter heading-scope mode.
 *
 * Mirrors `buildSceneHeading` but for chapters: applies the preset's
 * `dbench-compile-chapter-numbering` prefix (none / numeric / roman)
 * to the chapter title. Always emits a non-empty H1 so the chapter
 * walker can rely on it as the segment's leading line.
 *
 * Per chapter-type § 7: chapter mode emits one H1 per chapter; scene
 * titles are suppressed and scene draft bodies concatenate beneath
 * the chapter heading (and any chapter-introductory prose).
 */
export function buildChapterHeading(
	title: string,
	index: number,
	preset: CompilePresetFrontmatter,
	opts: HeadingBuilderOptions = {}
): string {
	const numbering = preset['dbench-compile-chapter-numbering'];
	let heading: string;
	if (numbering === 'numeric') heading = `# ${index}. ${title}`;
	else if (numbering === 'roman') heading = `# ${toRoman(index)}. ${title}`;
	else heading = `# ${title}`;
	return appendHeadingMarker(heading, opts);
}
