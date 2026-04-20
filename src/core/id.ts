/**
 * Draft Bench stable identifiers.
 *
 * Format: `abc-123-def-456` — three lowercase letters, three digits,
 * three lowercase letters, three digits (15 characters including
 * hyphens). Matches Charted Roots' ID format for cross-plugin
 * readability.
 *
 * Properties:
 * - Collision-resistant at realistic vault sizes (~3.1 x 10^14
 *   possible values from the four segments combined).
 * - Visually legible at a glance, unlike UUIDs.
 * - Not time-encoded, so rearranging notes never reshapes IDs.
 * - Stable: stamped once at note creation, never changed.
 */

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

/** Regex matching the exact ID format. */
const ID_PATTERN = /^[a-z]{3}-\d{3}-[a-z]{3}-\d{3}$/;

/**
 * Generate a new Draft Bench ID.
 *
 * Uses `Math.random()` (uniform over [0, 1)) which yields uniform
 * integer picks via `Math.floor(Math.random() * n)`. This is not
 * cryptographically strong, but ID generation here is not security-
 * critical: the four-segment format provides ~3.1 x 10^14 possible
 * values, which is more than adequate against accidental collisions
 * at realistic vault sizes. The simpler implementation avoids
 * cross-environment import differences between Obsidian's Electron
 * runtime and Node.js versions used for tests.
 */
export function generateDbenchId(): string {
	return [
		randomSegment(LETTERS, 3),
		randomSegment(DIGITS, 3),
		randomSegment(LETTERS, 3),
		randomSegment(DIGITS, 3),
	].join('-');
}

/**
 * Type guard: true iff `value` is a string matching the Draft Bench
 * ID format exactly. Rejects non-strings, surrounding whitespace,
 * wrong segment counts, wrong segment lengths, uppercase letters,
 * and wrong character classes per segment.
 */
export function isValidDbenchId(value: unknown): value is string {
	return typeof value === 'string' && ID_PATTERN.test(value);
}

/**
 * Pick `length` characters from `charset` with uniform probability.
 */
function randomSegment(charset: string, length: number): string {
	let out = '';
	for (let i = 0; i < length; i++) {
		out += charset[Math.floor(Math.random() * charset.length)];
	}
	return out;
}
