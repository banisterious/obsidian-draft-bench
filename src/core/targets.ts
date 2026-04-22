/**
 * Target-word-count helpers for projects and scenes.
 *
 * The `dbench-target-words` frontmatter key is an opt-in writer-set
 * value: a positive integer capturing an authoring goal for a project
 * or scene. The plugin doesn't stamp it at creation; writers add it
 * via the Properties panel or include it in a template's frontmatter.
 *
 * These helpers are deliberately permissive: any non-positive-integer
 * value (missing, null, string, 0, negative, non-integer) is treated
 * as "no target set." The Properties panel can coerce YAML numbers in
 * various shapes, so validation happens here and the UI never sees a
 * bad target value.
 */

/**
 * Read `dbench-target-words` from a frontmatter record. Returns the
 * value when it's a positive integer; returns `null` otherwise.
 */
export function readTargetWords(
	frontmatter: Record<string, unknown> | undefined
): number | null {
	if (!frontmatter) return null;
	const raw = frontmatter['dbench-target-words'];
	return coerceTarget(raw);
}

/**
 * Narrow an unknown value to a positive integer, or `null`. Accepts
 * JavaScript numbers only (YAML-parsed integers reach the metadata
 * cache as numbers; string targets are rejected to avoid guessing
 * about units — writers can fix the frontmatter).
 */
function coerceTarget(raw: unknown): number | null {
	if (typeof raw !== 'number') return null;
	if (!Number.isFinite(raw)) return null;
	if (raw <= 0) return null;
	if (!Number.isInteger(raw)) return null;
	return raw;
}

/**
 * Shape of the formatted progress result. The caller renders `label`
 * as-is and uses `percent` (0-100, clamped to 100 for bar widths) to
 * size a progress bar. `overage` signals whether the count exceeded
 * the target, letting the caller apply an overage-tint class.
 */
export interface ProgressView {
	/** Display label, e.g., "2,500 / 3,000 words (83%)". */
	label: string;
	/**
	 * Percentage as a number 0-100, clamped for display. Use this for
	 * the bar width; use `rawPercent` for any calculation that needs
	 * the unclamped value.
	 */
	percent: number;
	/** Unclamped percentage (can exceed 100). Rounded to an integer. */
	rawPercent: number;
	/** True when count > target. Used to tint the bar. */
	overage: boolean;
}

/**
 * Pure formatter: render a count + target pair as a progress view.
 *
 * - `percent` is clamped to 100 for bar-width usage so an overage
 *   doesn't overflow the track visually.
 * - `label` always reports count and target with locale formatting
 *   and the raw percentage so the writer sees overage explicitly
 *   (e.g., "3,200 / 3,000 words (107%)").
 * - A target of 0 is nonsensical here — callers should not invoke
 *   `formatProgress` when `readTargetWords` returned `null` — but if
 *   it sneaks through, we return 0% to avoid division-by-zero.
 */
export function formatProgress(count: number, target: number): ProgressView {
	if (target <= 0) {
		return {
			label: `${formatNumber(count)} words`,
			percent: 0,
			rawPercent: 0,
			overage: false,
		};
	}
	const rawPercent = Math.round((count / target) * 100);
	const percent = Math.min(100, rawPercent);
	return {
		label: `${formatNumber(count)} / ${formatNumber(target)} words (${rawPercent}%)`,
		percent,
		rawPercent,
		overage: count > target,
	};
}

function formatNumber(n: number): string {
	return n.toLocaleString();
}
