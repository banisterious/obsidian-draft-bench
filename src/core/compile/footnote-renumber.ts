/**
 * Footnote renumbering for the compile pipeline (D-06 rule 6).
 *
 * When scene bodies concatenate, per-scene footnote labels (`[^1]`,
 * `[^2]`, ...) would collide across the compiled document. This
 * module renumbers the footnotes in one scene's content to continue
 * from a caller-supplied offset, so the compile service can thread
 * the offset across scenes and produce a globally-numbered output.
 *
 * Labels may be numeric (`[^1]`) or alphanumeric (`[^note-a]`);
 * either form is rewritten to a sequential numeric label. Unique
 * labels are discovered in order of first appearance so references
 * ordered differently from their definitions still get stable
 * numbering.
 *
 * Pure function — no side effects, no runtime dependencies.
 */

export interface FootnoteRenumberResult {
	/** The input with footnote references and definitions rewritten. */
	content: string;
	/**
	 * Number of unique labels assigned. Callers pass
	 * `startAt + consumedCount` as `startAt` for the next scene to
	 * maintain global sequence.
	 */
	consumedCount: number;
}

/**
 * Rewrite footnote labels in `content` so they run sequentially from
 * `startAt`. Each unique label is assigned the next number in order
 * of first appearance (reference or definition, whichever comes
 * first).
 *
 * A footnote reference matches `[^label]` where `label` is one or
 * more word / dash / dot characters. A definition matches
 * `[^label]: ...` at the start of a line. Orphan references (no
 * matching definition) and orphan definitions (no reference) are
 * both rewritten; the pipeline does not validate footnote pairing.
 */
export function renumberFootnotes(
	content: string,
	startAt: number
): FootnoteRenumberResult {
	const labelMap = new Map<string, number>();
	let nextNumber = startAt;

	// First pass: discover labels in order of first appearance.
	// `[^label]` matches both reference and (leading-of-line)
	// definition occurrences.
	const LABEL_PATTERN = /\[\^([\w.-]+)\]/g;
	let match: RegExpExecArray | null;
	while ((match = LABEL_PATTERN.exec(content)) !== null) {
		const label = match[1];
		if (!labelMap.has(label)) {
			labelMap.set(label, nextNumber);
			nextNumber++;
		}
	}

	if (labelMap.size === 0) {
		return { content, consumedCount: 0 };
	}

	// Second pass: rewrite references and definitions together. Using
	// a single regex replacement means we never rewrite a label twice
	// even when the newly-assigned number overlaps with an existing
	// label elsewhere in the text.
	const rewritten = content.replace(LABEL_PATTERN, (_m, label: string) => {
		const n = labelMap.get(label);
		return n === undefined ? _m : `[^${n}]`;
	});

	return { content: rewritten, consumedCount: labelMap.size };
}
