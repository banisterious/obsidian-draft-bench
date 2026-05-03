/**
 * Minimal mock of the Obsidian runtime API for Vitest.
 *
 * Expand incrementally as test coverage grows. The goal is "enough to unit-test
 * core/ and model/ code paths", not full fidelity with the real runtime.
 */

export class TFile {
	path: string;
	basename: string;
	extension: string;
	stat: { mtime: number; ctime: number; size: number };
	parent: TFolder | null;

	constructor(args: {
		path: string;
		basename: string;
		extension: string;
		stat?: { mtime: number; ctime: number; size: number };
		parent?: TFolder | null;
	}) {
		this.path = args.path;
		this.basename = args.basename;
		this.extension = args.extension;
		this.stat = args.stat ?? { mtime: 0, ctime: 0, size: 0 };
		this.parent = args.parent ?? null;
	}
}

export class TFolder {
	path: string;
	name: string;
	children: (TFile | TFolder)[];

	constructor(args: {
		path: string;
		name: string;
		children?: (TFile | TFolder)[];
	}) {
		this.path = args.path;
		this.name = args.name;
		this.children = args.children ?? [];
	}
}

export interface CachedMetadata {
	frontmatter?: Record<string, unknown>;
	frontmatterPosition?: { start: unknown; end: unknown };
	frontmatterLinks?: FrontmatterLinkCache[];
}

/**
 * Mirrors Obsidian's `FrontmatterLinkCache`. Populated for each
 * resolved wikilink reference in a file's frontmatter. `key` is the
 * frontmatter property name; `link` is the link target (basename or
 * path, possibly with subpath like `#section` or `^block`); `original`
 * is the raw text. Tests seed this via `MetadataCache._setFrontmatterLinks`.
 */
export interface FrontmatterLinkCache {
	key: string;
	link: string;
	original?: string;
	displayText?: string;
}

/**
 * Vault event names supported by the mock. Real Obsidian has more
 * (`create`, `closed`, etc.); add as tests need them.
 */
export type VaultEventName = 'modify' | 'delete' | 'rename';

/**
 * MetadataCache event names supported by the mock. `changed` fires
 * after Obsidian has reparsed a file's frontmatter (later than
 * `vault.on('modify')`); `resolved` fires after the initial vault
 * load completes; `deleted` fires when a tracked file is removed
 * from the vault.
 */
export type MetadataCacheEventName = 'changed' | 'resolved' | 'deleted';

/**
 * Opaque handle returned by `Vault.on()` / `MetadataCache.on()`.
 * Used with `offref()` to remove the listener. The event tag carries
 * the source name so `Vault.offref` and `MetadataCache.offref` can
 * route by event.
 */
export interface EventRef {
	event: VaultEventName | MetadataCacheEventName;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	callback: (...args: any[]) => void;
}

export class Vault {
	files = new Map<string, TFile>();
	folders = new Map<string, TFolder>();
	private content = new Map<string, string>();
	private cacheRef: MetadataCache | null = null;
	private listeners = new Map<VaultEventName, Set<EventRef>>();

	getMarkdownFiles(): TFile[] {
		return [...this.files.values()].filter((f) => f.extension === 'md');
	}

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		return this.files.get(path) ?? this.folders.get(path) ?? null;
	}

	async read(file: TFile): Promise<string> {
		return this.content.get(file.path) ?? '';
	}

	async modify(file: TFile, data: string): Promise<void> {
		this.content.set(file.path, data);
		this._fire('modify', file);
	}

	async create(path: string, data: string): Promise<TFile> {
		if (this.files.has(path)) {
			throw new Error(`File already exists: ${path}`);
		}
		const filename = path.split('/').pop() ?? path;
		const dotIdx = filename.lastIndexOf('.');
		const file = new TFile({
			path,
			basename: dotIdx > 0 ? filename.slice(0, dotIdx) : filename,
			extension: dotIdx > 0 ? filename.slice(dotIdx + 1) : '',
			stat: { mtime: Date.now(), ctime: Date.now(), size: data.length },
		});
		this.files.set(path, file);
		this.content.set(path, data);
		return file;
	}

	async createFolder(path: string): Promise<TFolder> {
		const normalized = path.replace(/\/+$/, '');
		if (this.folders.has(normalized)) {
			return this.folders.get(normalized)!;
		}
		const name = normalized.split('/').pop() ?? normalized;
		const folder = new TFolder({ path: normalized, name });
		this.folders.set(normalized, folder);
		return folder;
	}

	on(event: 'modify', callback: (file: TFile) => void): EventRef;
	on(event: 'delete', callback: (file: TFile) => void): EventRef;
	on(event: 'rename', callback: (file: TFile, oldPath: string) => void): EventRef;
	on(
		event: VaultEventName,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		callback: (...args: any[]) => void
	): EventRef {
		const ref: EventRef = { event, callback };
		let set = this.listeners.get(event);
		if (!set) {
			set = new Set();
			this.listeners.set(event, set);
		}
		set.add(ref);
		return ref;
	}

	offref(ref: EventRef): void {
		this.listeners.get(ref.event as VaultEventName)?.delete(ref);
	}

	// Wire up the metadata cache so that processFrontMatter can keep it in sync.
	_attachMetadataCache(cache: MetadataCache): void {
		this.cacheRef = cache;
	}

	_getMetadataCache(): MetadataCache | null {
		return this.cacheRef;
	}

	// Test helper: seed a file into the mock vault.
	_addFile(file: TFile, content = ''): void {
		this.files.set(file.path, file);
		this.content.set(file.path, content);
	}

	/**
	 * Test helper: simulate Obsidian's rename behavior. Moves the file's
	 * vault entries, mutates its `path` and `basename`, and moves the
	 * metadata-cache entry under the new path. Does not fire the rename
	 * event — the caller decides when to do that via `_fire`.
	 */
	_rename(file: TFile, newPath: string): string {
		const oldPath = file.path;
		const content = this.content.get(oldPath) ?? '';
		this.files.delete(oldPath);
		this.content.delete(oldPath);

		const filename = newPath.split('/').pop() ?? '';
		const dotIdx = filename.lastIndexOf('.');
		file.path = newPath;
		file.basename = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
		file.extension = dotIdx > 0 ? filename.slice(dotIdx + 1) : '';

		this.files.set(newPath, file);
		this.content.set(newPath, content);

		if (this.cacheRef) {
			this.cacheRef._moveCacheEntry(oldPath, newPath);
		}
		return oldPath;
	}

	/**
	 * Test helper: simulate Obsidian's folder rename. Updates the
	 * folder's path + name, then recursively path-prefix-rewrites every
	 * descendant file and folder. Cache entries for descendant files are
	 * re-keyed under their new paths. Does NOT fire any rename events
	 * (production Obsidian fires for the folder and each descendant
	 * file; the mock keeps the surface minimal — tests that need event
	 * firing can call `_fire` themselves).
	 *
	 * Used by `FileManager.renameFile(folder, ...)` to back the linker's
	 * § 10 sub-scene-folder auto-rename.
	 */
	_renameFolder(folder: TFolder, newPath: string): string {
		const oldPath = folder.path;
		const oldPrefix = `${oldPath}/`;
		const newPrefix = `${newPath}/`;

		// Move the folder entry.
		this.folders.delete(oldPath);
		folder.path = newPath;
		folder.name = newPath.split('/').pop() ?? newPath;
		this.folders.set(newPath, folder);

		// Rewrite descendant folder paths.
		const folderPathsToMove: Array<[string, TFolder]> = [];
		for (const [path, f] of this.folders) {
			if (path.startsWith(oldPrefix)) folderPathsToMove.push([path, f]);
		}
		for (const [path, f] of folderPathsToMove) {
			const updatedPath = newPrefix + path.slice(oldPrefix.length);
			this.folders.delete(path);
			f.path = updatedPath;
			f.name = updatedPath.split('/').pop() ?? updatedPath;
			this.folders.set(updatedPath, f);
		}

		// Rewrite descendant file paths + content map + cache entries.
		const filePathsToMove: Array<[string, TFile]> = [];
		for (const [path, f] of this.files) {
			if (path.startsWith(oldPrefix)) filePathsToMove.push([path, f]);
		}
		for (const [path, f] of filePathsToMove) {
			const updatedPath = newPrefix + path.slice(oldPrefix.length);
			const content = this.content.get(path) ?? '';
			this.files.delete(path);
			this.content.delete(path);
			f.path = updatedPath;
			this.files.set(updatedPath, f);
			this.content.set(updatedPath, content);
			if (this.cacheRef) {
				this.cacheRef._moveCacheEntry(path, updatedPath);
			}
		}

		return oldPath;
	}

	// Test helper: fire an event manually (for testing event-driven code).
	_fire(event: 'modify', file: TFile): void;
	_fire(event: 'delete', file: TFile): void;
	_fire(event: 'rename', file: TFile, oldPath: string): void;
	_fire(event: VaultEventName, ...args: unknown[]): void {
		const set = this.listeners.get(event);
		if (!set) return;
		for (const ref of set) {
			ref.callback(...args);
		}
	}

	_listenerCount(event: VaultEventName): number {
		return this.listeners.get(event)?.size ?? 0;
	}
}

export class MetadataCache {
	private cache = new Map<string, CachedMetadata>();
	private listeners = new Map<MetadataCacheEventName, Set<EventRef>>();

	getFileCache(file: TFile): CachedMetadata | null {
		return this.cache.get(file.path) ?? null;
	}

	// Internal: update the cache when a file's frontmatter changes.
	// Does NOT fire 'changed' — production Obsidian fires that event
	// after its own reparse step, and tests prefer to control the
	// firing explicitly via `_fire` so they can assert pre/post-event
	// state independently of cache mutation order.
	_updateFrontmatter(file: TFile, frontmatter: Record<string, unknown>): void {
		this.cache.set(file.path, { frontmatter });
	}

	// Test helper: seed metadata for a file.
	_setFrontmatter(file: TFile, frontmatter: Record<string, unknown>): void {
		const existing = this.cache.get(file.path);
		this.cache.set(file.path, { ...existing, frontmatter });
	}

	// Test helper: seed Obsidian's resolved frontmatter-link cache for a
	// file. Use this when a test needs to exercise the linker's
	// `frontmatterLinks`-first resolution path (issue #6) — e.g., when
	// the underlying YAML stored a wikilink as YAML flow notation
	// (`dbench-scene: [[Foo]]` parses as a nested array but Obsidian
	// still resolves it via `frontmatterLinks`).
	_setFrontmatterLinks(file: TFile, links: FrontmatterLinkCache[]): void {
		const existing = this.cache.get(file.path) ?? {};
		this.cache.set(file.path, { ...existing, frontmatterLinks: links });
	}

	// Internal: used by Vault._rename to re-key a cache entry.
	_moveCacheEntry(oldPath: string, newPath: string): void {
		const entry = this.cache.get(oldPath);
		if (entry) {
			this.cache.set(newPath, entry);
			this.cache.delete(oldPath);
		}
	}

	on(
		event: 'changed',
		callback: (file: TFile, data: string, cache: CachedMetadata) => void
	): EventRef;
	on(event: 'resolved', callback: () => void): EventRef;
	on(
		event: 'deleted',
		callback: (file: TFile, prevCache: CachedMetadata | null) => void
	): EventRef;
	on(
		event: MetadataCacheEventName,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		callback: (...args: any[]) => void
	): EventRef {
		const ref: EventRef = { event, callback };
		let set = this.listeners.get(event);
		if (!set) {
			set = new Set();
			this.listeners.set(event, set);
		}
		set.add(ref);
		return ref;
	}

	offref(ref: EventRef): void {
		const set = this.listeners.get(ref.event as MetadataCacheEventName);
		set?.delete(ref);
	}

	// Test helper: fire a metadataCache event manually. The 'changed'
	// callback signature in real Obsidian is `(file, data, cache)`; the
	// mock forwards whatever args are given so tests can pass just the
	// file when the linker doesn't read data/cache.
	_fire(event: 'changed', file: TFile, data?: string, cache?: CachedMetadata): void;
	_fire(event: 'resolved'): void;
	_fire(event: 'deleted', file: TFile, prevCache?: CachedMetadata | null): void;
	_fire(event: MetadataCacheEventName, ...args: unknown[]): void {
		const set = this.listeners.get(event);
		if (!set) return;
		for (const ref of set) {
			ref.callback(...args);
		}
	}

	_listenerCount(event: MetadataCacheEventName): number {
		return this.listeners.get(event)?.size ?? 0;
	}
}

export class FileManager {
	constructor(
		private vault: Vault,
		private metadataCache: MetadataCache
	) {}

	async processFrontMatter(
		file: TFile,
		fn: (frontmatter: Record<string, unknown>) => void
	): Promise<void> {
		// Start from cached frontmatter if present (round-trips arrays / objects
		// without going through the lossy YAML round-trip below).
		const cached = this.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const frontmatter: Record<string, unknown> = { ...cached };

		// Fall back to parsing file content if the cache is empty (matches what
		// real Obsidian does on first read).
		if (Object.keys(frontmatter).length === 0) {
			const content = await this.vault.read(file);
			const parsed = parseFrontMatter(content);
			Object.assign(frontmatter, parsed.frontmatter);
		}

		fn(frontmatter);

		// Update the cache (real Obsidian does this asynchronously via a
		// metadata observer; the mock does it inline for test simplicity).
		this.metadataCache._updateFrontmatter(file, frontmatter);

		// Serialize back to disk. The mock serializer is YAML-lossy for arrays
		// and objects but adequate for tests that only verify cache state.
		const content = await this.vault.read(file);
		const { body } = parseFrontMatter(content);
		const serialized = serializeFrontMatter(frontmatter, body);
		await this.vault.modify(file, serialized);
	}

	/**
	 * Mock for Obsidian's `app.fileManager.renameFile`. Supports both
	 * files and folders. For files, behaves like `Vault._rename` + fires
	 * a rename event. For folders, recursively updates the paths of
	 * descendant files and folders (path-prefix replacement) and re-keys
	 * cache entries; fires a rename event for the folder itself.
	 *
	 * Used by the linker's § 10 sub-scene-folder auto-rename behavior.
	 */
	async renameFile(file: TFile | TFolder, newPath: string): Promise<void> {
		if (file instanceof TFile) {
			const oldPath = this.vault._rename(file, newPath);
			this.vault._fire('rename', file, oldPath);
			return;
		}
		this.vault._renameFolder(file, newPath);
	}
}

export class Notice {
	message: string;
	constructor(message: string, _timeout?: number) {
		this.message = message;
	}
}

// Component / View / ItemView stubs. Real Obsidian instantiates these
// into DOM surfaces; tests only need the constructors so that
// `class X extends ItemView {}` doesn't blow up at module-load time.
// None of the unit tests invoke `.open()` / `.onOpen()` paths.
export class Component {
	load(): void {}
	unload(): void {}
	onload(): void {}
	onunload(): void {}
	addChild<T extends Component>(child: T): T {
		return child;
	}
	removeChild<T extends Component>(child: T): T {
		return child;
	}
	register(_cb: () => void): void {}
	registerEvent(_eventRef: EventRef): void {}
	registerDomEvent(): void {}
	registerInterval(_id: number): void {}
}

export class View extends Component {
	app: App;
	containerEl = {} as HTMLElement;
	icon = '';
	navigation = false;

	constructor(_leaf: unknown) {
		super();
		this.app = {} as App;
	}

	getViewType(): string {
		return '';
	}
	getDisplayText(): string {
		return '';
	}
	getIcon(): string {
		return this.icon;
	}
	onOpen(): Promise<void> {
		return Promise.resolve();
	}
	onClose(): Promise<void> {
		return Promise.resolve();
	}
}

export class ItemView extends View {
	contentEl = {} as HTMLElement;
}

// Modal hierarchy stubs. Real Obsidian instantiates these into DOM
// surfaces; tests only need the constructors so that `class X extends
// Modal {}` doesn't blow up at module-load time. None of the unit
// tests invoke modal `.open()` paths, so the bodies stay no-op.
export class Modal {
	app: App;
	contentEl = {} as HTMLElement;
	titleEl = {} as HTMLElement;
	containerEl = {} as HTMLElement;
	modalEl = {} as HTMLElement;

	constructor(app: App) {
		this.app = app;
	}

	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class SuggestModal<T> extends Modal {
	getSuggestions(_query: string): T[] | Promise<T[]> {
		return [];
	}
	renderSuggestion(_item: T, _el: HTMLElement): void {}
	onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
}

export interface FuzzyMatch<T> {
	item: T;
	match: { score: number; matches: number[][] };
}

export class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
	getItems(): T[] {
		return [];
	}
	getItemText(_item: T): string {
		return '';
	}
	onChooseItem(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
}

export class AbstractInputSuggest<T> {
	constructor(_app: App, _inputEl: HTMLInputElement) {}
	protected getSuggestions(_query: string): T[] | Promise<T[]> {
		return [];
	}
	renderSuggestion(_value: T, _el: HTMLElement): void {}
	selectSuggestion(_value: T): void {}
}

/**
 * Mock for Obsidian's `MenuItem`. Methods are chainable and capture
 * the configured state on the instance for test inspection. `setSubmenu`
 * lazily constructs a child `Menu` that tests can drill into via
 * `_findItem(...).submenu` or via the parent menu's helpers.
 */
export class MenuItem {
	title = '';
	icon = '';
	section = '';
	submenu: Menu | null = null;
	clickHandler: (() => void | Promise<void>) | null = null;

	setTitle(title: string): this {
		this.title = title;
		return this;
	}

	setIcon(icon: string): this {
		this.icon = icon;
		return this;
	}

	setSection(section: string): this {
		this.section = section;
		return this;
	}

	setSubmenu(): Menu {
		this.submenu = new Menu();
		return this.submenu;
	}

	onClick(handler: () => void | Promise<void>): this {
		this.clickHandler = handler;
		return this;
	}
}

/**
 * Mock for Obsidian's `Menu`. Captures items + separators in insertion
 * order; tests assert on the captured state via `_items()` and
 * convenience finders (`_findItem`, `_findSubmenu`).
 */
export class Menu {
	private entries: Array<MenuItem | { separator: true }> = [];

	addItem(callback: (item: MenuItem) => void): this {
		const item = new MenuItem();
		callback(item);
		this.entries.push(item);
		return this;
	}

	addSeparator(): this {
		this.entries.push({ separator: true });
		return this;
	}

	/** Test helper: return all real items (excluding separators) in order. */
	_items(): MenuItem[] {
		return this.entries.filter(
			(e): e is MenuItem => !('separator' in e)
		);
	}

	/** Test helper: full entry list including separators. */
	_entries(): Array<MenuItem | { separator: true }> {
		return [...this.entries];
	}

	/** Test helper: find an item by exact title. */
	_findItem(title: string): MenuItem | null {
		return this._items().find((i) => i.title === title) ?? null;
	}

	/** Test helper: get the submenu Menu attached to a titled item. */
	_findSubmenu(title: string): Menu | null {
		return this._findItem(title)?.submenu ?? null;
	}
}

/**
 * Mock for Obsidian's `Platform`. Mutable so tests can flip `isMobile`
 * to exercise the mobile-flat fallback branch. Reset in `beforeEach`
 * to avoid cross-test bleed.
 */
export const Platform = {
	isDesktop: true,
	isMobile: false,
};

/**
 * Minimal `app.plugins` stub. Tests that need to emulate an installed
 * plugin call `_register(id, instance)`; everything else returns null.
 */
export class Plugins {
	private installed = new Map<string, unknown>();

	getPlugin(id: string): unknown | null {
		return this.installed.get(id) ?? null;
	}

	_register(id: string, instance: unknown): void {
		this.installed.set(id, instance);
	}

	_unregister(id: string): void {
		this.installed.delete(id);
	}
}

/**
 * Mock for Obsidian's `MetadataTypeManager`. Captures property-type
 * registrations so tests can assert which fields were typed and as
 * what. Tracks insertion order so callers can verify call sequences
 * if they care.
 */
export class MetadataTypeManager {
	private types = new Map<string, string>();

	setType(name: string, type: string): void {
		this.types.set(name, type);
	}

	/** Test helper: read back the registered type for a property. */
	_getType(name: string): string | undefined {
		return this.types.get(name);
	}

	/** Test helper: full registry as a record. */
	_allTypes(): Record<string, string> {
		return Object.fromEntries(this.types);
	}
}

export class App {
	vault: Vault;
	metadataCache: MetadataCache;
	fileManager: FileManager;
	plugins: Plugins;
	metadataTypeManager: MetadataTypeManager;

	constructor() {
		this.vault = new Vault();
		this.metadataCache = new MetadataCache();
		this.fileManager = new FileManager(this.vault, this.metadataCache);
		this.vault._attachMetadataCache(this.metadataCache);
		this.plugins = new Plugins();
		this.metadataTypeManager = new MetadataTypeManager();
	}
}

// Simple frontmatter parser/serializer for the mock. Real Obsidian uses a more
// sophisticated YAML handler; this is enough for unit-test round-trips.
function parseFrontMatter(content: string): {
	frontmatter: Record<string, unknown>;
	body: string;
} {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: content };
	const fm: Record<string, unknown> = {};
	for (const line of match[1].split('\n')) {
		const kv = line.match(/^([^:]+):\s*(.*)$/);
		if (!kv) continue;
		fm[kv[1].trim()] = kv[2].trim();
	}
	return { frontmatter: fm, body: match[2] };
}

function serializeFrontMatter(
	frontmatter: Record<string, unknown>,
	body: string
): string {
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
	return `---\n${lines.join('\n')}\n---\n${body}`;
}
