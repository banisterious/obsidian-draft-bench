/**
 * Scrivener `.scrivx` parser.
 *
 * Reads a Scrivener 3 project's binder XML file (`.scrivx`) and walks
 * it into an in-memory tree. Pure function: no I/O, no Obsidian
 * dependencies. The Parse step (step 6 of [scrivener-import.md
 * § Implementation](../../../docs/planning/scrivener-import.md))
 * invokes this on the .scrivx string read via `app.vault.adapter.read`.
 *
 * **Browser DOM via `DOMParser`.** Cross-platform: native in Obsidian's
 * renderer process on every supported platform. Tests use the
 * `@xmldom/xmldom` polyfill installed in [tests/setup.ts](../../../tests/setup.ts).
 *
 * **Schema target: Scrivener 3.x only.** The schema modelled here was
 * verified against a Scrivener 3.1.6 (Windows) export of the bundled
 * Novel-with-Parts template; macOS Scrivener 3 may differ in minor
 * ways that real-corpus exposure (per the test-corpus tracking issue)
 * will surface. Scrivener 2 (`.scrivx` schema differs in Labels /
 * Status sections) and iOS Scrivener (different bundle structure)
 * are out of scope per § "What's locked at the meta level."
 *
 * **What's not in this parser:** project title (Scrivener 3 doesn't
 * write it into the .scrivx — caller derives it from the bundle
 * folder name), and synopsis / body / notes content (those live in
 * `Files/Data/<UUID>/synopsis.txt`, `content.rtf`, `notes.rtf` and
 * load lazily during the Parse step's enrichment pass). The .scrivx
 * itself only carries the structural binder + project-level
 * vocabulary tables, all of which this parser exposes.
 */

export interface ScrivProject {
	/** Top-level binder roots. Always includes the DraftFolder; usually
	 *  also ResearchFolder / TrashFolder; may include writer-created
	 *  custom top-level folders (Characters, Places, Front Matter,
	 *  Notes, Template Sheets in the Novel template). */
	binder: BinderItem[];
	/** Label ID -> title, from top-level `<LabelSettings><Labels>`.
	 *  IDs are signed integers as strings ("-1" for "No Label" is
	 *  Scrivener's default). Empty when missing. */
	labels: Map<string, string>;
	/** Status ID -> title, from top-level `<StatusSettings><StatusItems>`. */
	statuses: Map<string, string>;
	/** Project keyword vocabulary. Keyword ID -> title. Walked from
	 *  top-level `<Keywords>` recursively (Scrivener supports nesting
	 *  via `<Children>` inside a Keyword; the importer flattens to a
	 *  lookup table since per § 5 keywords map to flat
	 *  Obsidian `tags:`). */
	keywords: Map<string, string>;
	/** Custom metadata field definitions, from top-level
	 *  `<CustomMetaDataSettings>`. Keyed by the writer-assigned field
	 *  ID (a slug like "povcharacter", not a UUID). */
	customMetaDataFields: Map<string, CustomMetaDataField>;
	/** Non-fatal observations (unrecognized sections, missing optional
	 *  blocks, etc.). Surfaced to the writer in the import error log. */
	warnings: string[];
}

export interface CustomMetaDataField {
	id: string;
	title: string;
	/** Field-type tag from the `Type` attribute. Common values:
	 *  "Text" | "Checkbox" | "Date" | "List". Preserved as-is; the
	 *  importer doesn't validate the set. */
	fieldType: string;
}

export interface BinderItem {
	/** UUID attribute on the BinderItem element. Falls back to the
	 *  `ID` attribute on the off chance an older 3.x export uses it. */
	id: string;
	/** `Type` attribute. Known values: "DraftFolder" | "ResearchFolder"
	 *  | "TrashFolder" | "Folder" | "Text" | "Image" | "PDF" |
	 *  "WebArchive" | "Other". Preserved verbatim; the importer maps
	 *  Type -> DB target type via the Hierarchy step (step 7). */
	type: string;
	title: string;
	/** Resolved keyword titles (looked up via the project keywords map
	 *  during the parse pass). Order matches the document. */
	keywords: string[];
	/** `<StatusID>` value as string; null when missing. Resolve via the
	 *  project's `statuses` map. Negative IDs (e.g. "-1" for "No
	 *  Status") are valid and preserved verbatim. */
	statusId: string | null;
	/** `<LabelID>` value; null when missing. Resolve via `labels`. */
	labelId: string | null;
	/** `<IncludeInCompile>` parsed: true when "Yes" or missing, false
	 *  when "No". Scrivener's default is on, so missing is true. */
	includeInCompile: boolean;
	/** Per-document custom metadata. Field ID -> string value. Lookup
	 *  the field name + type via the project's `customMetaDataFields`
	 *  map. */
	customMetaData: Map<string, string>;
	/** `Created` attribute; preserved verbatim (Scrivener emits its own
	 *  date format). Empty when missing. */
	created: string;
	/** `Modified` attribute; same convention as `created`. */
	modified: string;
	/** Child binder items, in document order. */
	children: BinderItem[];
}

export class ScrivxParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ScrivxParseError';
	}
}

/**
 * Parse a `.scrivx` XML string into a structured project tree. Throws
 * `ScrivxParseError` on malformed XML or missing root element; everything
 * else is best-effort with warnings.
 */
export function parseScrivx(xml: string): ScrivProject {
	// Two ways malformed XML surfaces depending on the DOMParser
	// implementation: the native browser parser embeds a <parsererror>
	// element inside an otherwise-valid Document; xmldom (test-side
	// polyfill) throws synchronously. Cover both.
	let doc: Document;
	try {
		doc = new DOMParser().parseFromString(xml, 'text/xml');
	} catch (e) {
		throw new ScrivxParseError(
			`Malformed .scrivx XML: ${(e as Error).message}`
		);
	}

	const errEl = doc.getElementsByTagName('parsererror')[0];
	if (errEl) {
		throw new ScrivxParseError(
			`Malformed .scrivx XML: ${errEl.textContent ?? 'unknown error'}`
		);
	}

	const root = doc.documentElement;
	if (!root || root.nodeName !== 'ScrivenerProject') {
		throw new ScrivxParseError(
			`Expected <ScrivenerProject> root element, got <${root?.nodeName ?? 'nothing'}>`
		);
	}

	const warnings: string[] = [];
	const labels = readVocabTable(root, 'LabelSettings', 'Labels', 'Label');
	const statuses = readVocabTable(
		root,
		'StatusSettings',
		'StatusItems',
		'Status'
	);
	const keywords = readKeywords(root);
	const customMetaDataFields = readCustomMetaDataFields(root);

	return {
		binder: readBinder(root, keywords, warnings),
		labels,
		statuses,
		keywords,
		customMetaDataFields,
		warnings,
	};
}

/**
 * Generic vocab-table reader for top-level settings blocks.
 *
 * `<{settingsName}>`           e.g. LabelSettings
 *   `<{listName}>`             e.g. Labels
 *     `<{itemName} ID="N">Title</{itemName}>`  e.g. Label
 *
 * Returns a Map keyed by the ID attribute; titles are the element text.
 * Empty Map when the path doesn't resolve. The Scrivener 3 schema
 * places these blocks at the project root, NOT under a `<Settings>`
 * wrapper despite the section names.
 */
function readVocabTable(
	root: Element,
	settingsName: string,
	listName: string,
	itemName: string
): Map<string, string> {
	const out = new Map<string, string>();
	const block = childByName(root, settingsName);
	if (!block) return out;
	const list = childByName(block, listName);
	if (!list) return out;
	for (const item of childrenByName(list, itemName)) {
		const id = item.getAttribute('ID');
		if (id === null) continue;
		out.set(id, (item.textContent ?? '').trim());
	}
	return out;
}

/**
 * Walk top-level `<Keywords>` recursively into a flat ID -> title
 * lookup. Scrivener supports nested keywords (writer can group them
 * under a parent via `<Children>`); the importer treats them flat
 * per § 5 (keywords -> Obsidian `tags:` frontmatter), so we discard
 * the hierarchy.
 */
function readKeywords(root: Element): Map<string, string> {
	const out = new Map<string, string>();
	const top = childByName(root, 'Keywords');
	if (!top) return out;
	walkKeywordTree(top, out);
	return out;
}

function walkKeywordTree(parent: Element, out: Map<string, string>): void {
	for (const child of elementChildren(parent)) {
		if (child.nodeName === 'Keyword') {
			const id = child.getAttribute('ID');
			if (id !== null) {
				const title = childByName(child, 'Title');
				out.set(id, (title?.textContent ?? '').trim());
			}
			const children = childByName(child, 'Children');
			if (children) walkKeywordTree(children, out);
		} else if (child.nodeName === 'Children') {
			walkKeywordTree(child, out);
		}
	}
}

/**
 * Read top-level `<CustomMetaDataSettings><MetaDataField>` field
 * definitions. Returns a Map keyed by field ID. The `Type` attribute
 * carries the field-type tag ("Text" | "Checkbox" | "Date" | "List");
 * unknown values are preserved verbatim.
 */
function readCustomMetaDataFields(
	root: Element
): Map<string, CustomMetaDataField> {
	const out = new Map<string, CustomMetaDataField>();
	const block = childByName(root, 'CustomMetaDataSettings');
	if (!block) return out;
	for (const field of childrenByName(block, 'MetaDataField')) {
		const id = field.getAttribute('ID');
		if (id === null) continue;
		const title = childByName(field, 'Title');
		out.set(id, {
			id,
			title: (title?.textContent ?? '').trim(),
			fieldType: field.getAttribute('Type') ?? '',
		});
	}
	return out;
}

/** Read top-level `<Binder>` and walk children into BinderItem trees. */
function readBinder(
	root: Element,
	keywords: Map<string, string>,
	warnings: string[]
): BinderItem[] {
	const binder = childByName(root, 'Binder');
	if (!binder) {
		warnings.push('No <Binder> element found; importing nothing.');
		return [];
	}
	return childrenByName(binder, 'BinderItem').map((bi) =>
		readBinderItem(bi, keywords, warnings)
	);
}

/** Recursively read a `<BinderItem>` element. */
function readBinderItem(
	el: Element,
	keywords: Map<string, string>,
	warnings: string[]
): BinderItem {
	const id = el.getAttribute('UUID') ?? el.getAttribute('ID') ?? '';
	if (id === '') {
		warnings.push(
			`BinderItem with no UUID/ID attribute encountered; assigned empty id (will not resolve cross-document links).`
		);
	}

	const titleEl = childByName(el, 'Title');
	const meta = childByName(el, 'MetaData');
	// Per-document <Keywords> is a sibling of <MetaData> on the
	// BinderItem element, NOT nested inside it. Read accordingly.
	const kwBlock = childByName(el, 'Keywords');

	const item: BinderItem = {
		id,
		type: el.getAttribute('Type') ?? '',
		title: (titleEl?.textContent ?? '').trim(),
		keywords: [],
		statusId: null,
		labelId: null,
		includeInCompile: true,
		customMetaData: new Map(),
		created: el.getAttribute('Created') ?? '',
		modified: el.getAttribute('Modified') ?? '',
		children: [],
	};

	if (meta) readBinderItemMetaData(meta, item);
	if (kwBlock) readBinderItemKeywords(kwBlock, item, keywords);

	const childrenEl = childByName(el, 'Children');
	if (childrenEl) {
		item.children = childrenByName(childrenEl, 'BinderItem').map((bi) =>
			readBinderItem(bi, keywords, warnings)
		);
	}

	return item;
}

function readBinderItemMetaData(meta: Element, item: BinderItem): void {
	const inc = childByName(meta, 'IncludeInCompile');
	if (inc) {
		item.includeInCompile = (inc.textContent ?? '').trim() !== 'No';
	}

	const labelId = childByName(meta, 'LabelID');
	if (labelId) {
		const v = (labelId.textContent ?? '').trim();
		item.labelId = v === '' ? null : v;
	}

	const statusId = childByName(meta, 'StatusID');
	if (statusId) {
		const v = (statusId.textContent ?? '').trim();
		item.statusId = v === '' ? null : v;
	}

	const cmd = childByName(meta, 'CustomMetaData');
	if (cmd) {
		for (const mdi of childrenByName(cmd, 'MetaDataItem')) {
			// Scrivener 3 emits FieldID + Value as child elements,
			// not as attributes on MetaDataItem.
			const fieldIdEl = childByName(mdi, 'FieldID');
			const valueEl = childByName(mdi, 'Value');
			if (!fieldIdEl) continue;
			const fieldId = (fieldIdEl.textContent ?? '').trim();
			if (fieldId === '') continue;
			item.customMetaData.set(
				fieldId,
				(valueEl?.textContent ?? '').trim()
			);
		}
	}
}

function readBinderItemKeywords(
	kwBlock: Element,
	item: BinderItem,
	keywords: Map<string, string>
): void {
	for (const kid of childrenByName(kwBlock, 'KeywordID')) {
		const id = (kid.textContent ?? '').trim();
		const title = keywords.get(id);
		if (title !== undefined) item.keywords.push(title);
	}
}

// ---- Element traversal helpers -----------------------------------------
//
// xmldom doesn't implement Element.children (HTMLCollection of element
// kids); we walk childNodes and filter to nodeType === 1. These helpers
// keep the parser readable by avoiding repeated filter loops.

const ELEMENT_NODE = 1;

function elementChildren(parent: Element): Element[] {
	const out: Element[] = [];
	const nodes = parent.childNodes;
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes.item(i);
		if (n && n.nodeType === ELEMENT_NODE) out.push(n as Element);
	}
	return out;
}

function childByName(parent: Element, name: string): Element | null {
	for (const child of elementChildren(parent)) {
		if (child.nodeName === name) return child;
	}
	return null;
}

function childrenByName(parent: Element, name: string): Element[] {
	return elementChildren(parent).filter((c) => c.nodeName === name);
}
