import type { App } from 'obsidian';

/**
 * Folder-into-vault import helpers for the Scrivener wizard's Source
 * step. Two entry points feed the same copy pipeline:
 *
 * - `copyFromDataTransfer(app, dataTransfer, targetParent)` — drag-
 *   drop path. Uses `webkitGetAsEntry()` to walk the dropped folder.
 *   Desktop only (touch UIs don't fire drag events).
 * - `copyFromFileList(app, fileList, targetParent)` — `<input
 *   type="file" webkitdirectory>` path. Uses `File.webkitRelativePath`
 *   to reconstruct in-folder paths. Desktop + Android (where webkit-
 *   directory is supported); iOS WKWebView ignores `webkitdirectory`.
 *
 * Both validate that the dropped/picked folder contains a `.scrivx`
 * file before any copy happens; both refuse to overwrite an existing
 * destination so writers don't lose work to an accidental drop.
 *
 * Returns the in-vault path of the newly-copied folder so the caller
 * (the wizard's Source step) can auto-select it as `formData.sourcePath`.
 */

export interface FolderImportResult {
	/** Vault-relative path of the newly-copied folder root. */
	vaultPath: string;
	/** Number of files copied (informational). */
	filesCopied: number;
}

export class FolderImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FolderImportError';
	}
}

/** Feature detection for `<input type="file" webkitdirectory>`. The
 *  attribute exists on the prototype on most platforms; we additionally
 *  check that setting it persists via the property accessor (a coarse
 *  proxy for actual support). iOS WKWebView returns `false` for the
 *  property even when the attribute is set, so this rejects iOS. */
export function supportsDirectoryInput(): boolean {
	if (typeof document === 'undefined') return false;
	if (!('webkitdirectory' in HTMLInputElement.prototype)) return false;
	const el = document.createElement('input');
	el.type = 'file';
	try {
		el.webkitdirectory = true;
	} catch {
		return false;
	}
	return el.webkitdirectory === true;
}

/**
 * Drag-drop entry point. Walks the first dropped folder via
 * `webkitGetAsEntry()` and copies it into the vault under
 * `<targetParent>/<rootName>/`.
 */
export async function copyFromDataTransfer(
	app: App,
	dataTransfer: DataTransfer,
	targetParent: string
): Promise<FolderImportResult> {
	const items = dataTransfer.items;
	let folderEntry: FileSystemDirectoryEntry | null = null;
	for (let i = 0; i < items.length; i++) {
		const entry = items[i].webkitGetAsEntry?.();
		if (entry && entry.isDirectory) {
			folderEntry = entry as FileSystemDirectoryEntry;
			break;
		}
	}
	if (!folderEntry) {
		throw new FolderImportError(
			'Drop a folder, not a single file. The .scriv bundle is a folder containing .scrivx + Files/ + Settings/.'
		);
	}

	const collected = await collectEntries(folderEntry);
	return await copyFiles(app, folderEntry.name, collected, targetParent);
}

/**
 * `<input type="file" webkitdirectory>` entry point. Reconstructs the
 * folder structure from `File.webkitRelativePath`. The first path
 * segment is the picked-folder root.
 */
export async function copyFromFileList(
	app: App,
	fileList: FileList,
	targetParent: string
): Promise<FolderImportResult> {
	if (fileList.length === 0) {
		throw new FolderImportError(
			'No files were selected. Make sure you picked a folder, not a single file.'
		);
	}

	const collected: CollectedFile[] = [];
	let rootName: string | null = null;
	for (let i = 0; i < fileList.length; i++) {
		const f = fileList[i];
		const rel = f.webkitRelativePath;
		if (!rel || rel === '') {
			throw new FolderImportError(
				'The picker returned files without folder paths. Folder selection is not supported on this device; copy the .scriv folder into your vault using your file manager instead.'
			);
		}
		const parts = rel.split('/');
		const root = parts[0];
		if (rootName === null) rootName = root;
		else if (rootName !== root) {
			throw new FolderImportError(
				'Selected files come from multiple folders. Pick a single .scriv folder.'
			);
		}
		const relativeUnderRoot = parts.slice(1).join('/');
		collected.push({ relativePath: relativeUnderRoot, file: f });
	}

	if (rootName === null) {
		throw new FolderImportError('Could not determine root folder name.');
	}

	return await copyFiles(app, rootName, collected, targetParent);
}

interface CollectedFile {
	/** Path relative to the dropped/picked folder root (no leading slash). */
	relativePath: string;
	file: File;
}

/**
 * Shared copy pipeline: validates the bundle has a `.scrivx`, refuses
 * to overwrite an existing destination, then writes each file via
 * `vault.adapter.writeBinary` (works for text + binary uniformly).
 */
async function copyFiles(
	app: App,
	rootName: string,
	files: CollectedFile[],
	targetParent: string
): Promise<FolderImportResult> {
	const hasScrivx = files.some((f) =>
		f.relativePath.toLowerCase().endsWith('.scrivx')
	);
	if (!hasScrivx) {
		throw new FolderImportError(
			'Selected folder does not contain a .scrivx file. Pick a Scrivener project bundle root.'
		);
	}

	const targetParentNormalized = normalizeFolder(targetParent);
	const vaultRoot =
		targetParentNormalized === ''
			? rootName
			: `${targetParentNormalized}/${rootName}`;

	if (app.vault.getAbstractFileByPath(vaultRoot) !== null) {
		throw new FolderImportError(
			`A file or folder already exists at ${vaultRoot}. Rename the source folder or remove the existing destination, then try again.`
		);
	}

	if (
		targetParentNormalized !== '' &&
		app.vault.getAbstractFileByPath(targetParentNormalized) === null
	) {
		await app.vault.createFolder(targetParentNormalized);
	}
	await app.vault.createFolder(vaultRoot);

	const ensuredFolders = new Set<string>([vaultRoot]);
	let filesCopied = 0;
	for (const { relativePath, file } of files) {
		const destPath = `${vaultRoot}/${relativePath}`;
		await ensureParentFolder(app, destPath, ensuredFolders);
		const buffer = await file.arrayBuffer();
		await app.vault.adapter.writeBinary(destPath, buffer);
		filesCopied += 1;
	}

	return { vaultPath: vaultRoot, filesCopied };
}

async function ensureParentFolder(
	app: App,
	filePath: string,
	cache: Set<string>
): Promise<void> {
	const idx = filePath.lastIndexOf('/');
	if (idx < 0) return;
	const folder = filePath.slice(0, idx);
	if (folder === '' || cache.has(folder)) return;
	await ensureParentFolder(app, folder, cache);
	if (app.vault.getAbstractFileByPath(folder) === null) {
		await app.vault.createFolder(folder);
	}
	cache.add(folder);
}

/**
 * Recursively walk a `FileSystemDirectoryEntry`, gathering every
 * descendant file with its path relative to the directory root.
 */
async function collectEntries(
	root: FileSystemDirectoryEntry
): Promise<CollectedFile[]> {
	const out: CollectedFile[] = [];
	await walkDirectory(root, '', out);
	return out;
}

async function walkDirectory(
	dir: FileSystemDirectoryEntry,
	relativePrefix: string,
	out: CollectedFile[]
): Promise<void> {
	const reader = dir.createReader();
	const entries: FileSystemEntry[] = [];
	// readEntries returns batches; loop until empty.
	while (true) {
		const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
			reader.readEntries(resolve, reject);
		});
		if (batch.length === 0) break;
		entries.push(...batch);
	}
	for (const entry of entries) {
		const rel = relativePrefix === ''
			? entry.name
			: `${relativePrefix}/${entry.name}`;
		if (entry.isFile) {
			const file = await new Promise<File>((resolve, reject) => {
				(entry as FileSystemFileEntry).file(resolve, reject);
			});
			out.push({ relativePath: rel, file });
		} else if (entry.isDirectory) {
			await walkDirectory(entry as FileSystemDirectoryEntry, rel, out);
		}
	}
}

function normalizeFolder(path: string): string {
	return path.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}
