import { describe, expect, it } from 'vitest';
import { renumberFootnotes } from '../../../src/core/compile/footnote-renumber';

describe('renumberFootnotes', () => {
	it('returns content unchanged when no footnotes are present', () => {
		const input = 'Plain prose with no footnotes.';
		const result = renumberFootnotes(input, 1);
		expect(result.content).toBe(input);
		expect(result.consumedCount).toBe(0);
	});

	it('renumbers references and definitions starting from startAt', () => {
		const input = 'A claim[^1] and another[^2].\n\n[^1]: First note.\n[^2]: Second note.';
		const result = renumberFootnotes(input, 5);
		expect(result.content).toBe(
			'A claim[^5] and another[^6].\n\n[^5]: First note.\n[^6]: Second note.'
		);
		expect(result.consumedCount).toBe(2);
	});

	it('assigns the same number to every occurrence of one label', () => {
		const input = 'Ref[^a] then again[^a].\n\n[^a]: Shared note.';
		const result = renumberFootnotes(input, 1);
		expect(result.content).toBe(
			'Ref[^1] then again[^1].\n\n[^1]: Shared note.'
		);
		expect(result.consumedCount).toBe(1);
	});

	it('numbers alphanumeric labels in order of first appearance', () => {
		const input =
			'See[^note-z] then[^note-a].\n\n[^note-a]: Alpha.\n[^note-z]: Zed.';
		const result = renumberFootnotes(input, 1);
		expect(result.content).toBe(
			'See[^1] then[^2].\n\n[^2]: Alpha.\n[^1]: Zed.'
		);
		expect(result.consumedCount).toBe(2);
	});

	it('handles orphan references (no matching definition) without error', () => {
		const input = 'Dangling[^x] reference.';
		const result = renumberFootnotes(input, 10);
		expect(result.content).toBe('Dangling[^10] reference.');
		expect(result.consumedCount).toBe(1);
	});

	it('handles orphan definitions (no matching reference) without error', () => {
		const input = 'No refs.\n\n[^orphan]: Unreferenced.';
		const result = renumberFootnotes(input, 3);
		expect(result.content).toBe('No refs.\n\n[^3]: Unreferenced.');
		expect(result.consumedCount).toBe(1);
	});

	it('does not collide when the new number coincides with another original label', () => {
		// Label "1" gets remapped to 5; label "5" gets remapped to 6.
		// Single-pass replacement must not rewrite the already-rewritten
		// [^5] by subsequently finding a label "5".
		const input = 'Ref[^1] and[^5].';
		const result = renumberFootnotes(input, 5);
		expect(result.content).toBe('Ref[^5] and[^6].');
		expect(result.consumedCount).toBe(2);
	});

	it('supports dotted labels', () => {
		const input = 'Ref[^1.2] and[^3.4].';
		const result = renumberFootnotes(input, 1);
		expect(result.content).toBe('Ref[^1] and[^2].');
		expect(result.consumedCount).toBe(2);
	});
});
