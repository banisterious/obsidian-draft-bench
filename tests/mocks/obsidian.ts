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
	private files = new Map<string, TFile>();
	private content = new Map<string, string>();

	getMarkdownFiles(): TFile[] {
		return [...this.files.values()].filter((f) => f.extension === 'md');
	}

	getAbstractFileByPath(path: string): TFile | null {
		return this.files.get(path) ?? null;
	}

	async read(file: TFile): Promise<string> {
		return this.content.get(file.path) ?? '';
	}

	async modify(file: TFile, data: string): Promise<void> {
		this.content.set(file.path, data);
	}

	// Test helper: seed a file into the mock vault
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

	// Test helper: seed metadata for a file
	_setFrontmatter(file: TFile, frontmatter: Record<string, unknown>): void {
		this.cache.set(file.path, { frontmatter });
	}
}

export class FileManager {
	constructor(private vault: Vault) {}

	async processFrontMatter(
		file: TFile,
		fn: (frontmatter: Record<string, unknown>) => void
	): Promise<void> {
		const content = await this.vault.read(file);
		const { frontmatter, body } = parseFrontMatter(content);
		fn(frontmatter);
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
	vault = new Vault();
	metadataCache = new MetadataCache();
	fileManager = new FileManager(this.vault);
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
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	return `---\n${lines.join('\n')}\n---\n${body}`;
}
