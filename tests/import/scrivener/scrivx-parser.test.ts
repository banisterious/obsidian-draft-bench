import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
	parseScrivx,
	ScrivxParseError,
	type BinderItem,
} from '../../../src/import/scrivener/scrivx-parser';

/**
 * Tests for the `.scrivx` parser. Two layers of coverage:
 *
 * 1. **Synthetic-XML tests** validate parser shape and edge cases —
 *    missing optional elements, malformed input, defaults. These are
 *    fast to write and pin specific behaviors regardless of which
 *    Scrivener variants we have fixtures for.
 *
 * 2. **Real-fixture tests** load `.scrivx` files committed to
 *    `tests/fixtures/scrivener/` (real Scrivener exports, sanitized to
 *    fictional content per the no-personal-writing rule). Real
 *    fixtures catch schema quirks synthetic XML never has — element
 *    ordering, version-attribute idiosyncrasies, sibling-vs-child
 *    placement, slug-vs-UUID id formats. Add more fixtures as new
 *    Scrivener variants surface (macOS 3.x, future 3.x point releases,
 *    edge-case writer setups) per the test-corpus tracking issue.
 */

// ---- Synthetic-XML tests -----------------------------------------------

function projectXml(inner: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>\n<ScrivenerProject Version="2.0">${inner}</ScrivenerProject>`;
}

describe('parseScrivx — error handling', () => {
	it('throws on completely empty input', () => {
		expect(() => parseScrivx('')).toThrow(ScrivxParseError);
	});

	it('throws on malformed XML', () => {
		expect(() => parseScrivx('<not closed')).toThrow(ScrivxParseError);
	});

	it('throws when the root element is not <ScrivenerProject>', () => {
		expect(() =>
			parseScrivx('<?xml version="1.0"?><Other/>')
		).toThrow(ScrivxParseError);
	});
});

describe('parseScrivx — empty / minimal projects', () => {
	it('returns an empty binder + warning when <Binder> is missing', () => {
		const result = parseScrivx(projectXml(''));
		expect(result.binder).toEqual([]);
		expect(result.warnings).toContain(
			'No <Binder> element found; importing nothing.'
		);
	});

	it('returns an empty binder for an empty <Binder>', () => {
		const result = parseScrivx(projectXml('<Binder></Binder>'));
		expect(result.binder).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it('returns empty vocab maps when settings blocks are missing', () => {
		const result = parseScrivx(projectXml('<Binder/>'));
		expect(result.labels.size).toBe(0);
		expect(result.statuses.size).toBe(0);
		expect(result.keywords.size).toBe(0);
		expect(result.customMetaDataFields.size).toBe(0);
	});
});

describe('parseScrivx — BinderItem core fields', () => {
	it('reads UUID, Type, Created, Modified, and Title', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="ABC-123" Type="Text"
							Created="2024-01-02 03:04:05 -0700"
							Modified="2024-02-03 04:05:06 -0700">
						<Title>Opening</Title>
						<MetaData/>
					</BinderItem>
				</Binder>`)
		);
		const [item] = result.binder;
		expect(item.id).toBe('ABC-123');
		expect(item.type).toBe('Text');
		expect(item.title).toBe('Opening');
		expect(item.created).toBe('2024-01-02 03:04:05 -0700');
		expect(item.modified).toBe('2024-02-03 04:05:06 -0700');
	});

	it('falls back to ID attribute when UUID is missing', () => {
		const result = parseScrivx(
			projectXml(`<Binder><BinderItem ID="legacy-id" Type="Text"><Title>x</Title></BinderItem></Binder>`)
		);
		expect(result.binder[0].id).toBe('legacy-id');
		expect(result.warnings).toEqual([]);
	});

	it('warns when a BinderItem has neither UUID nor ID', () => {
		const result = parseScrivx(
			projectXml(`<Binder><BinderItem Type="Text"><Title>x</Title></BinderItem></Binder>`)
		);
		expect(result.binder[0].id).toBe('');
		expect(result.warnings.some((w) => w.includes('no UUID/ID'))).toBe(
			true
		);
	});

	it('preserves binder document order', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="A" Type="Text"><Title>First</Title></BinderItem>
					<BinderItem UUID="B" Type="Text"><Title>Second</Title></BinderItem>
					<BinderItem UUID="C" Type="Text"><Title>Third</Title></BinderItem>
				</Binder>`)
		);
		expect(result.binder.map((b) => b.title)).toEqual([
			'First',
			'Second',
			'Third',
		]);
	});
});

describe('parseScrivx — IncludeInCompile parsing', () => {
	const item = (metadata: string): BinderItem =>
		parseScrivx(
			projectXml(`<Binder><BinderItem UUID="x" Type="Text"><Title>t</Title>${metadata}</BinderItem></Binder>`)
		).binder[0];

	it('defaults to true when MetaData is empty', () => {
		expect(item('<MetaData/>').includeInCompile).toBe(true);
	});

	it('defaults to true when MetaData is absent entirely', () => {
		expect(item('').includeInCompile).toBe(true);
	});

	it('is true when IncludeInCompile is "Yes"', () => {
		expect(
			item('<MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData>')
				.includeInCompile
		).toBe(true);
	});

	it('is false when IncludeInCompile is "No"', () => {
		expect(
			item('<MetaData><IncludeInCompile>No</IncludeInCompile></MetaData>')
				.includeInCompile
		).toBe(false);
	});

	it('is false when IncludeInCompile is missing AND MetaData has other children (Scrivener Windows toggle-off serialization)', () => {
		// Scrivener Windows handles "unchecked Include-in-Compile" by
		// REMOVING the element from MetaData rather than writing
		// <IncludeInCompile>No</...>. So a non-empty MetaData block
		// without IncludeInCompile is the writer's exclusion signal.
		expect(
			item('<MetaData><LabelID>7</LabelID><StatusID>2</StatusID></MetaData>')
				.includeInCompile
		).toBe(false);
	});

	it('is true when IncludeInCompile is "Yes" alongside other MetaData (typical Scrivener Windows checked-state serialization)', () => {
		// Scrivener Windows writes the explicit Yes when MetaData has
		// other content; verify the rule doesn't accidentally treat
		// these as exclusions.
		expect(
			item(
				'<MetaData><LabelID>7</LabelID><IncludeInCompile>Yes</IncludeInCompile><StatusID>2</StatusID></MetaData>'
			).includeInCompile
		).toBe(true);
	});
});

describe('parseScrivx — status / label IDs', () => {
	it('reads StatusID and LabelID elements', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="x" Type="Text"><Title>t</Title>
						<MetaData>
							<StatusID>2</StatusID>
							<LabelID>7</LabelID>
						</MetaData>
					</BinderItem>
				</Binder>`)
		);
		expect(result.binder[0].statusId).toBe('2');
		expect(result.binder[0].labelId).toBe('7');
	});

	it('preserves negative IDs (Scrivener "No Status" / "No Label" sentinel)', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="x" Type="Text"><Title>t</Title>
						<MetaData>
							<StatusID>-1</StatusID>
							<LabelID>-1</LabelID>
						</MetaData>
					</BinderItem>
				</Binder>`)
		);
		expect(result.binder[0].statusId).toBe('-1');
		expect(result.binder[0].labelId).toBe('-1');
	});

	it('treats empty StatusID / LabelID as null', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="x" Type="Text"><Title>t</Title>
						<MetaData>
							<StatusID></StatusID>
							<LabelID></LabelID>
						</MetaData>
					</BinderItem>
				</Binder>`)
		);
		expect(result.binder[0].statusId).toBeNull();
		expect(result.binder[0].labelId).toBeNull();
	});
});

describe('parseScrivx — custom metadata', () => {
	it('reads MetaDataItem entries with FieldID + Value child elements', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="x" Type="Text"><Title>t</Title>
						<MetaData>
							<CustomMetaData>
								<MetaDataItem><FieldID>povcharacter</FieldID><Value>Alice</Value></MetaDataItem>
								<MetaDataItem><FieldID>scenetag</FieldID><Value>flashback</Value></MetaDataItem>
							</CustomMetaData>
						</MetaData>
					</BinderItem>
				</Binder>`)
		);
		const cmd = result.binder[0].customMetaData;
		expect(cmd.get('povcharacter')).toBe('Alice');
		expect(cmd.get('scenetag')).toBe('flashback');
	});

	it('skips MetaDataItem entries with missing FieldID', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="x" Type="Text"><Title>t</Title>
						<MetaData>
							<CustomMetaData>
								<MetaDataItem><Value>orphan</Value></MetaDataItem>
								<MetaDataItem><FieldID>good</FieldID><Value>kept</Value></MetaDataItem>
							</CustomMetaData>
						</MetaData>
					</BinderItem>
				</Binder>`)
		);
		const cmd = result.binder[0].customMetaData;
		expect(cmd.size).toBe(1);
		expect(cmd.get('good')).toBe('kept');
	});

	it('reads field definitions from top-level <CustomMetaDataSettings>', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder/>
				<CustomMetaDataSettings>
					<MetaDataField Type="Text" ID="povcharacter" Wraps="No" Align="Left">
						<Title>POV Character</Title>
					</MetaDataField>
					<MetaDataField Type="Checkbox" ID="reviewed">
						<Title>Reviewed</Title>
					</MetaDataField>
				</CustomMetaDataSettings>`)
		);
		expect(result.customMetaDataFields.get('povcharacter')).toEqual({
			id: 'povcharacter',
			title: 'POV Character',
			fieldType: 'Text',
			listOptions: new Map(),
		});
		expect(result.customMetaDataFields.get('reviewed')).toEqual({
			id: 'reviewed',
			title: 'Reviewed',
			fieldType: 'Checkbox',
			listOptions: new Map(),
		});
	});

	it('reads <ListOptions> children for List-typed fields', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder/>
				<CustomMetaDataSettings>
					<MetaDataField Type="List" ID="povmode">
						<Title>POV mode</Title>
						<ListOptions None="None">
							<Option ID="1">First</Option>
							<Option ID="2">Third limited</Option>
							<Option ID="3">Omniscient</Option>
						</ListOptions>
					</MetaDataField>
				</CustomMetaDataSettings>`)
		);
		const field = result.customMetaDataFields.get('povmode');
		expect(field?.fieldType).toBe('List');
		expect(field?.listOptions.get('1')).toBe('First');
		expect(field?.listOptions.get('2')).toBe('Third limited');
		expect(field?.listOptions.get('3')).toBe('Omniscient');
	});
});

describe('parseScrivx — keywords', () => {
	it('reads project-level keywords from top-level <Keywords>', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder/>
				<Keywords>
					<Keyword ID="1"><Title>POV: Alice</Title></Keyword>
					<Keyword ID="2"><Title>Flashback</Title></Keyword>
				</Keywords>`)
		);
		expect(result.keywords.get('1')).toBe('POV: Alice');
		expect(result.keywords.get('2')).toBe('Flashback');
	});

	it('walks nested keyword children into the flat map', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder/>
				<Keywords>
					<Keyword ID="1">
						<Title>POV</Title>
						<Children>
							<Keyword ID="2"><Title>Alice</Title></Keyword>
							<Keyword ID="3"><Title>Bob</Title></Keyword>
						</Children>
					</Keyword>
				</Keywords>`)
		);
		expect(result.keywords.size).toBe(3);
		expect(result.keywords.get('1')).toBe('POV');
		expect(result.keywords.get('2')).toBe('Alice');
		expect(result.keywords.get('3')).toBe('Bob');
	});

	it('reads per-document keywords as a sibling of MetaData and resolves to titles', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="x" Type="Text"><Title>t</Title>
						<MetaData/>
						<Keywords>
							<KeywordID>1</KeywordID>
							<KeywordID>2</KeywordID>
						</Keywords>
					</BinderItem>
				</Binder>
				<Keywords>
					<Keyword ID="1"><Title>POV: Alice</Title></Keyword>
					<Keyword ID="2"><Title>Flashback</Title></Keyword>
				</Keywords>`)
		);
		expect(result.binder[0].keywords).toEqual([
			'POV: Alice',
			'Flashback',
		]);
	});

	it('drops per-document keyword references that do not resolve', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="x" Type="Text"><Title>t</Title>
						<MetaData/>
						<Keywords>
							<KeywordID>1</KeywordID>
							<KeywordID>999</KeywordID>
						</Keywords>
					</BinderItem>
				</Binder>
				<Keywords>
					<Keyword ID="1"><Title>POV: Alice</Title></Keyword>
				</Keywords>`)
		);
		expect(result.binder[0].keywords).toEqual(['POV: Alice']);
	});
});

describe('parseScrivx — vocab tables', () => {
	it('reads top-level <LabelSettings><Labels><Label> entries', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder/>
				<LabelSettings>
					<Title>Label</Title>
					<Labels>
						<Label ID="-1">No Label</Label>
						<Label ID="7">Red</Label>
						<Label ID="9">Yellow</Label>
					</Labels>
				</LabelSettings>`)
		);
		expect(result.labels.get('-1')).toBe('No Label');
		expect(result.labels.get('7')).toBe('Red');
		expect(result.labels.get('9')).toBe('Yellow');
	});

	it('reads top-level <StatusSettings><StatusItems><Status> entries', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder/>
				<StatusSettings>
					<Title>Status</Title>
					<StatusItems>
						<Status ID="-1">No Status</Status>
						<Status ID="2">First Draft</Status>
						<Status ID="3">Revised Draft</Status>
					</StatusItems>
				</StatusSettings>`)
		);
		expect(result.statuses.get('-1')).toBe('No Status');
		expect(result.statuses.get('2')).toBe('First Draft');
		expect(result.statuses.get('3')).toBe('Revised Draft');
	});
});

describe('parseScrivx — nested binder structure', () => {
	it('walks deep BinderItem nesting via <Children>', () => {
		const result = parseScrivx(
			projectXml(`
				<Binder>
					<BinderItem UUID="ROOT" Type="DraftFolder"><Title>Manuscript</Title>
						<Children>
							<BinderItem UUID="P1" Type="Folder"><Title>Part</Title>
								<Children>
									<BinderItem UUID="C1" Type="Folder"><Title>Chapter</Title>
										<Children>
											<BinderItem UUID="S1" Type="Text"><Title>Scene</Title></BinderItem>
										</Children>
									</BinderItem>
								</Children>
							</BinderItem>
						</Children>
					</BinderItem>
				</Binder>`)
		);
		const root = result.binder[0];
		expect(root.title).toBe('Manuscript');
		const part = root.children[0];
		expect(part.title).toBe('Part');
		const chapter = part.children[0];
		expect(chapter.title).toBe('Chapter');
		const scene = chapter.children[0];
		expect(scene.title).toBe('Scene');
		expect(scene.children).toEqual([]);
	});
});

// ---- Real-fixture tests ------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/scrivener');

/**
 * Discover any committed `.scrivx` fixture files. Walks one level deep
 * (fixtures are typically `<bundle>.scriv/<name>.scrivx`) and returns
 * absolute paths. Empty when no fixtures are committed yet.
 */
function findFixtureScrivxFiles(): string[] {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(FIXTURES_DIR);
	} catch {
		return out;
	}
	for (const name of entries) {
		const p = path.join(FIXTURES_DIR, name);
		const s = statSync(p);
		if (s.isDirectory()) {
			for (const inner of readdirSync(p)) {
				if (inner.endsWith('.scrivx')) {
					out.push(path.join(p, inner));
				}
			}
		} else if (name.endsWith('.scrivx')) {
			out.push(p);
		}
	}
	return out;
}

const fixtures = findFixtureScrivxFiles();
const novelFixture = fixtures.find((f) =>
	f.includes('ScrivenerTesting.scriv')
);

describe.skipIf(novelFixture === undefined)(
	'parseScrivx — real fixture: ScrivenerTesting.scriv (Scrivener 3.1.6 Windows, Novel-with-Parts template)',
	() => {
		const xml = readFileSync(novelFixture as string, 'utf-8');
		const result = parseScrivx(xml);

		it('parses without errors or warnings', () => {
			expect(result.warnings).toEqual([]);
		});

		it('reads the top-level binder roots in document order', () => {
			expect(result.binder.map((b) => b.title)).toEqual([
				'Manuscript',
				'Characters',
				'Places',
				'Front Matter',
				'Notes',
				'Research',
				'Template Sheets',
				'Trash',
			]);
		});

		it('preserves binder root types (DraftFolder / ResearchFolder / TrashFolder + custom Folders)', () => {
			const byTitle = new Map(result.binder.map((b) => [b.title, b]));
			expect(byTitle.get('Manuscript')?.type).toBe('DraftFolder');
			expect(byTitle.get('Research')?.type).toBe('ResearchFolder');
			expect(byTitle.get('Trash')?.type).toBe('TrashFolder');
			expect(byTitle.get('Characters')?.type).toBe('Folder');
		});

		it('walks the Manuscript -> Volume -> Part -> Chapter -> Scene nesting', () => {
			const manuscript = result.binder.find(
				(b) => b.title === 'Manuscript'
			);
			expect(manuscript).toBeDefined();
			expect(manuscript?.children.map((c) => c.title)).toEqual([
				'Volume 1',
			]);

			const volume = manuscript?.children[0];
			expect(volume?.children.map((c) => c.title)).toEqual([
				'Part One: The Salt Road',
				'Part Two: The Meridian Drift',
			]);

			const partOne = volume?.children[0];
			expect(partOne?.children.map((c) => c.title)).toEqual([
				'Chapter 1: Departure',
				'Chapter 2: The Crossing',
			]);

			const chapter1 = partOne?.children[0];
			expect(chapter1?.children.map((c) => c.title)).toEqual([
				'01 - Opening',
				'02 - Argument',
				'Extra subfolder',
			]);
		});

		it('reads metadata on the seeded scene "01 - Opening" (label, status, custom metadata, keyword)', () => {
			const opening = findByTitle(result.binder, '01 - Opening');
			expect(opening).toBeDefined();
			expect(opening?.id).toBe('A9C97B44-46C8-4CA8-8F28-B8C0606A58EF');
			expect(opening?.type).toBe('Text');
			expect(opening?.labelId).toBe('7');
			expect(opening?.statusId).toBe('2');
			expect(opening?.includeInCompile).toBe(true);
			expect(opening?.customMetaData.get('povcharacter')).toBe('Alice');
			expect(opening?.keywords).toEqual(['POV: Alice']);
		});

		it('reads metadata on the seeded scene "02 - Argument"', () => {
			const argument = findByTitle(result.binder, '02 - Argument');
			expect(argument?.labelId).toBe('9');
			expect(argument?.statusId).toBe('3');
			expect(argument?.customMetaData.get('povcharacter')).toBe('Bob');
			expect(argument?.keywords).toEqual([]);
		});

		it('exposes the project label vocabulary', () => {
			expect(result.labels.get('-1')).toBe('No Label');
			expect(result.labels.get('7')).toBe('Red');
			expect(result.labels.get('9')).toBe('Yellow');
			expect(result.labels.get('12')).toBe('Purple');
		});

		it('exposes the project status vocabulary', () => {
			expect(result.statuses.get('-1')).toBe('No Status');
			expect(result.statuses.get('1')).toBe('To Do');
			expect(result.statuses.get('2')).toBe('First Draft');
			expect(result.statuses.get('3')).toBe('Revised Draft');
			expect(result.statuses.get('5')).toBe('Done');
		});

		it('exposes the project keyword vocabulary', () => {
			expect(result.keywords.get('1')).toBe('POV: Alice');
		});

		it('exposes the custom metadata field definition', () => {
			const field = result.customMetaDataFields.get('povcharacter');
			expect(field).toEqual({
				id: 'povcharacter',
				title: 'POV Character',
				fieldType: 'Text',
				listOptions: new Map(),
			});
		});

		it('preserves Created and Modified attributes', () => {
			// Created is a stable seed-time value; Modified drifts every
			// time the fixture is re-saved in Scrivener, so assert
			// format-shape only (YYYY-MM-DD HH:MM:SS ±HHMM) rather than a
			// literal string.
			const opening = findByTitle(result.binder, '01 - Opening');
			expect(opening?.created).toBe('2018-11-06 10:57:53 -0700');
			expect(opening?.modified).toMatch(
				/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [-+]\d{4}$/
			);
		});

		it('handles non-Text BinderItem types (Image, PDF) without error', () => {
			const cover = findByTitle(result.binder, 'Cover');
			expect(cover?.type).toBe('Image');
			const standardManuscript = findByTitle(
				result.binder,
				'Standard Manuscript'
			);
			expect(standardManuscript?.type).toBe('PDF');
		});
	}
);

/** Depth-first search across the binder tree by title. */
function findByTitle(
	items: BinderItem[],
	title: string
): BinderItem | undefined {
	for (const item of items) {
		if (item.title === title) return item;
		const inChildren = findByTitle(item.children, title);
		if (inChildren) return inChildren;
	}
	return undefined;
}
