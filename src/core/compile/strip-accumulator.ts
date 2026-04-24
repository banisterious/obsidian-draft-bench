/**
 * Strip-with-notice accumulator for the compile pipeline (P3.F).
 *
 * As `applyContentRules` processes each scene, every embed that gets
 * stripped (image, audio, video, PDF, base, note) is recorded here.
 * The compile dispatcher reads the final snapshot after all scenes
 * have been processed and surfaces one batched Notice at compile
 * completion summarizing counts by category — no per-embed notice
 * spam.
 *
 * Per [D-06 § Content-handling rules](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * V1 strips every non-text embed because it has no way to resolve
 * images, audio, video, PDFs, or Bases into the compile output.
 * Writers need to know something got dropped from their output;
 * silently omitting embeds produced compiled manuscripts that looked
 * incomplete without explanation.
 */

/**
 * Strip event categories. Matches the list in D-06 plus `note` for
 * the V1 "all note embeds strip" rule (8a).
 */
export type StripCategory =
	| 'image'
	| 'audio'
	| 'video'
	| 'pdf'
	| 'base'
	| 'note';

export interface StripSummary {
	counts: Record<StripCategory, number>;
	total: number;
}

export interface StripAccumulator {
	/** Record one strip event in the given category. Idempotent-safe. */
	record(category: StripCategory): void;
	/** Freeze the current counts into a plain snapshot. */
	snapshot(): StripSummary;
}

/**
 * Create a fresh accumulator. Each compile run gets its own; tests
 * can instantiate one per assertion.
 */
export function createStripAccumulator(): StripAccumulator {
	const counts: Record<StripCategory, number> = {
		image: 0,
		audio: 0,
		video: 0,
		pdf: 0,
		base: 0,
		note: 0,
	};

	return {
		record(category) {
			counts[category] += 1;
		},
		snapshot() {
			let total = 0;
			for (const key of Object.keys(counts) as StripCategory[]) {
				total += counts[key];
			}
			return {
				counts: { ...counts },
				total,
			};
		},
	};
}

/**
 * Classify an embed path into a strip category by extension, or
 * `null` when the extension doesn't match any known media/base type
 * (caller treats as a note embed).
 *
 * Kept as a pure helper so `content-rules.ts` and the accumulator
 * tests can both reach for it without re-deriving the regex set.
 * Extensions chosen to match Obsidian's native file-type handling:
 * images from the core sync list, audio / video from Obsidian's
 * embed-capable types, PDF from the built-in PDF viewer, `.base`
 * from Bases.
 */
export function classifyEmbedPath(path: string): StripCategory | null {
	const lower = path.toLowerCase();
	if (/\.(png|jpe?g|gif|webp|svg|bmp|heic|heif|avif)$/.test(lower)) {
		return 'image';
	}
	if (/\.(mp3|wav|ogg|m4a|flac|aac|3gp)$/.test(lower)) {
		return 'audio';
	}
	if (/\.(mp4|webm|mov|mkv|ogv|avi)$/.test(lower)) {
		return 'video';
	}
	if (/\.pdf$/.test(lower)) return 'pdf';
	if (/\.base$/.test(lower)) return 'base';
	return null;
}

/**
 * Build a user-facing one-line summary of the strip categories, or
 * `null` when nothing was stripped. Used by `notifyOutcome` to append
 * a second line to the compile-success Notice.
 *
 * Examples:
 *
 * - `{ image: 3 }` -> `"Skipped 3 image embeds."`
 * - `{ image: 3, base: 1 }` -> `"Skipped 3 image embeds, 1 base embed."`
 * - `{ note: 2 }` -> `"Skipped 2 note embeds."`
 * - all zero -> `null`
 */
export function formatStripSummary(summary: StripSummary): string | null {
	if (summary.total === 0) return null;

	const parts: string[] = [];
	for (const [category, label] of CATEGORY_LABELS) {
		const n = summary.counts[category];
		if (n === 0) continue;
		parts.push(`${n} ${n === 1 ? label.singular : label.plural}`);
	}
	return `Skipped ${parts.join(', ')}.`;
}

const CATEGORY_LABELS: Array<
	[StripCategory, { singular: string; plural: string }]
> = [
	['image', { singular: 'image embed', plural: 'image embeds' }],
	['audio', { singular: 'audio embed', plural: 'audio embeds' }],
	['video', { singular: 'video embed', plural: 'video embeds' }],
	['pdf', { singular: 'PDF embed', plural: 'PDF embeds' }],
	['base', { singular: 'base embed', plural: 'base embeds' }],
	['note', { singular: 'note embed', plural: 'note embeds' }],
];
