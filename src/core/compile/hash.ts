/**
 * djb2 string hash for compile-preset change detection.
 *
 * The compile pipeline records `dbench-last-chapter-hashes` on the
 * preset note as `"<scene-id>:<hash>"` pairs so the Compile tab
 * (P3.D) can surface "N scenes changed since last compile." The hash
 * is non-cryptographic; a 32-bit digest is more than enough for the
 * realistic scale (a few hundred scenes per project) and avoids the
 * weight of a crypto library.
 *
 * djb2 by Dan Bernstein; near-verbatim port of the canonical
 * formulation: `hash = hash * 33 + char`. Starting value `5381` and
 * the `* 33` multiplier are the standard choices and should not be
 * changed — preset state written by one plugin build must remain
 * comparable to state written by another.
 */

/**
 * Hash an arbitrary string to an 8-hex-character djb2 digest.
 *
 * Deterministic and stable across platforms / plugin versions. Length
 * is fixed (left-pads with zeros when the numeric hash has fewer hex
 * digits) so the formatted `"<id>:<hash>"` strings sort
 * lexicographically in a predictable way.
 */
export function djb2(input: string): string {
	let hash = 5381;
	for (let i = 0; i < input.length; i++) {
		// `(hash << 5) + hash` = hash * 33, but keeps us in 32-bit
		// integer math which V8 handles faster than the multiplication.
		hash = (hash << 5) + hash + input.charCodeAt(i);
		hash = hash | 0;
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Format a compile-state entry for `dbench-last-chapter-hashes`. The
 * flat `"id:hash"` string form is a hard constraint from D-06 — YAML
 * mappings don't round-trip through Obsidian's Properties panel.
 */
export function formatChapterHash(sceneId: string, hash: string): string {
	return `${sceneId}:${hash}`;
}
