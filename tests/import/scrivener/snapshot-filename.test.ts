import { describe, expect, it } from 'vitest';
import {
	applySnapshotFilenameTemplate,
	disambiguateFilename,
	DEFAULT_SNAPSHOT_FILENAME_TEMPLATE,
} from '../../../src/import/scrivener/snapshot-filename';

const SCENE = { basename: '01 - Opening' };
const SNAPSHOT = {
	title: 'Workshop draft',
	date: '2026-05-08 16:04:16 -0700',
};

// ---- Default template -------------------------------------------------

describe('DEFAULT_SNAPSHOT_FILENAME_TEMPLATE', () => {
	it('matches the spec § 4 default that mirrors native draft files', () => {
		expect(DEFAULT_SNAPSHOT_FILENAME_TEMPLATE).toBe(
			'{scene} - Draft {n} ({date_compact})'
		);
	});

	it('resolves the default template against a typical snapshot', () => {
		const filename = applySnapshotFilenameTemplate(
			DEFAULT_SNAPSHOT_FILENAME_TEMPLATE,
			SCENE,
			SNAPSHOT,
			2
		);
		expect(filename).toBe('01 - Opening - Draft 2 (20260508)');
	});
});

// ---- Variable substitution --------------------------------------------

describe('applySnapshotFilenameTemplate — variable substitution', () => {
	it('substitutes {scene} with the scene basename', () => {
		expect(
			applySnapshotFilenameTemplate('{scene}', SCENE, SNAPSHOT, 1)
		).toBe('01 - Opening');
	});

	it('substitutes {title} verbatim when non-empty and not the Scrivener default', () => {
		expect(
			applySnapshotFilenameTemplate('{title}', SCENE, SNAPSHOT, 1)
		).toBe('Workshop draft');
	});

	it('substitutes {title} with "Untitled" when title is the empty string', () => {
		expect(
			applySnapshotFilenameTemplate(
				'{title}',
				SCENE,
				{ ...SNAPSHOT, title: '' },
				1
			)
		).toBe('Untitled');
	});

	it('substitutes {title} with "Untitled" when title is the literal "Untitled Snapshot"', () => {
		expect(
			applySnapshotFilenameTemplate(
				'{title}',
				SCENE,
				{ ...SNAPSHOT, title: 'Untitled Snapshot' },
				1
			)
		).toBe('Untitled');
	});

	it('substitutes {date} with YYYY-MM-DD', () => {
		expect(
			applySnapshotFilenameTemplate('{date}', SCENE, SNAPSHOT, 1)
		).toBe('2026-05-08');
	});

	it('substitutes {date_compact} with YYYYMMDD (no separators)', () => {
		expect(
			applySnapshotFilenameTemplate('{date_compact}', SCENE, SNAPSHOT, 1)
		).toBe('20260508');
	});

	it('substitutes {time} with HHMM (24-hour)', () => {
		expect(
			applySnapshotFilenameTemplate('{time}', SCENE, SNAPSHOT, 1)
		).toBe('1604');
	});

	it('substitutes {n} with the per-scene counter', () => {
		expect(
			applySnapshotFilenameTemplate('{n}', SCENE, SNAPSHOT, 7)
		).toBe('7');
	});

	it('substitutes multiple variables in one template', () => {
		expect(
			applySnapshotFilenameTemplate(
				'{scene} - {title} - {date}',
				SCENE,
				SNAPSHOT,
				1
			)
		).toBe('01 - Opening - Workshop draft - 2026-05-08');
	});

	it('leaves unrecognized {token} placeholders literal', () => {
		expect(
			applySnapshotFilenameTemplate(
				'{scene} - {custom_thing}',
				SCENE,
				SNAPSHOT,
				1
			)
		).toBe('01 - Opening - {custom_thing}');
	});
});

// ---- Sanitization -----------------------------------------------------

describe('applySnapshotFilenameTemplate — sanitization', () => {
	it('replaces filesystem-unsafe characters in resolved values with -', () => {
		expect(
			applySnapshotFilenameTemplate(
				'{title}',
				SCENE,
				{ ...SNAPSHOT, title: 'Workshop / Agent: Final?' },
				1
			)
		).toBe('Workshop - Agent- Final-');
	});

	it('sanitizes literal template content too', () => {
		expect(
			applySnapshotFilenameTemplate('foo:bar', SCENE, SNAPSHOT, 1)
		).toBe('foo-bar');
	});

	it('does not sanitize hyphens, underscores, parentheses, or spaces', () => {
		expect(
			applySnapshotFilenameTemplate(
				'a - b_c (d) e',
				SCENE,
				SNAPSHOT,
				1
			)
		).toBe('a - b_c (d) e');
	});
});

// ---- Defensive date handling -----------------------------------------

describe('applySnapshotFilenameTemplate — defensive on malformed dates', () => {
	it('falls back to raw value for {date} / {date_compact} on unparseable input', () => {
		const result = applySnapshotFilenameTemplate(
			'{date_compact}',
			SCENE,
			{ ...SNAPSHOT, date: 'not a date' },
			1
		);
		// Sanitization replaces the space with -.
		expect(result).toBe('not a date');
	});

	it('falls back to 0000 for {time} on unparseable input', () => {
		expect(
			applySnapshotFilenameTemplate(
				'{time}',
				SCENE,
				{ ...SNAPSHOT, date: '' },
				1
			)
		).toBe('0000');
	});
});

// ---- disambiguateFilename ---------------------------------------------

describe('disambiguateFilename', () => {
	it('returns the base name unchanged when not in alreadyUsed', () => {
		expect(disambiguateFilename('Foo', new Set())).toBe('Foo');
	});

	it('appends " 2" on the second collision', () => {
		expect(disambiguateFilename('Foo', new Set(['Foo']))).toBe('Foo 2');
	});

	it('appends " 3" when " 2" is also already used', () => {
		expect(
			disambiguateFilename('Foo', new Set(['Foo', 'Foo 2']))
		).toBe('Foo 3');
	});

	it('skips taken numbers and finds the next free suffix', () => {
		expect(
			disambiguateFilename(
				'Foo',
				new Set(['Foo', 'Foo 2', 'Foo 3', 'Foo 5'])
			)
		).toBe('Foo 4');
	});

	it('does not mutate alreadyUsed', () => {
		const seen = new Set(['Foo']);
		disambiguateFilename('Foo', seen);
		expect(seen).toEqual(new Set(['Foo']));
	});
});
