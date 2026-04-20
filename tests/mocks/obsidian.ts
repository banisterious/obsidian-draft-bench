/**
 * Minimal mock of the Obsidian runtime API for Vitest.
 *
 * Expand incrementally as test coverage grows. The goal is "enough to unit-test
 * core/ and model/ code paths", not full fidelity with the real runtime.
 */

export interface TFile {
	path: string;
	basename: string;
	extension: string;
	stat: { mtime: number; ctime: number; size: number };
	parent: TFolder | null;
}

export interface TFolder {
	path: string;
	name: string;
	children: (TFile | TFolder)[];
}

export interface CachedMetadata {
	frontmatter?: Record<string, unknown>;
	frontmatterPosition?: { start: unknown; end: unknown };
}

export class Vault {
	files = new Map<string, TFile>();
	folders = new Map<string, TFolder>();
	private content = new Map<string, string>();
	private cacheRef: MetadataCache | null = null;

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
	}

	async create(path: string, data: string): Promise<TFile> {
		if (this.files.has(path)) {
			throw new Error(`File already exists: ${path}`);
		}
		const filename = path.split('/').pop() ?? path;
		const dotIdx = filename.lastIndexOf('.');
		const file: TFile = {
			path,
			basename: dotIdx > 0 ? filename.slice(0, dotIdx) : filename,
			extension: dotIdx > 0 ? filename.slice(dotIdx + 1) : '',
			stat: { mtime: Date.now(), ctime: Date.now(), size: data.length },
			parent: null,
		};
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
		const folder: TFolder = { path: normalized, name, children: [] };
		this.folders.set(normalized, folder);
		return folder;
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
}

export class MetadataCache {
	private cache = new Map<string, CachedMetadata>();

	getFileCache(file: TFile): CachedMetadata | null {
		return this.cache.get(file.path) ?? null;
	}

	// Internal: update the cache when a file's frontmatter changes.
	_updateFrontmatter(file: TFile, frontmatter: Record<string, unknown>): void {
		this.cache.set(file.path, { frontmatter });
	}

	// Test helper: seed metadata for a file.
	_setFrontmatter(file: TFile, frontmatter: Record<string, unknown>): void {
		this.cache.set(file.path, { frontmatter });
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
}

export class Notice {
	message: string;
	constructor(message: string, _timeout?: number) {
		this.message = message;
	}
}

export class App {
	vault: Vault;
	metadataCache: MetadataCache;
	fileManager: FileManager;

	constructor() {
		this.vault = new Vault();
		this.metadataCache = new MetadataCache();
		this.fileManager = new FileManager(this.vault, this.metadataCache);
		this.vault._attachMetadataCache(this.metadataCache);
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
