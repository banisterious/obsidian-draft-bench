import JSZip from 'jszip';
import type { CompileResult } from '../compile-service';
import type { CompilePresetNote } from '../discovery';
import { parseMarkdownForOdt } from './odt/parser';
import {
	buildContentXml,
	ODT_MANIFEST_XML,
	ODT_MIMETYPE,
	ODT_STYLES_XML,
} from './odt/xml';

/**
 * ODT output renderer for the compile pipeline.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * ODT output is disk-only (no vault path) and always goes through the
 * OS save dialog. The archive contains the four required ODT
 * entries: `mimetype` (stored uncompressed, first in the archive per
 * spec), `META-INF/manifest.xml`, `styles.xml`, `content.xml`.
 *
 * V1 renders a capped subset of markdown: headings, paragraphs,
 * bullet + numbered lists, bold + italic inline runs. Blockquotes,
 * code blocks, tables, and footnotes degrade to plain paragraphs
 * (acceptable V1 tradeoff per D-06). Page-break support requires
 * scene metadata that isn't currently threaded into the renderer —
 * revisit when PDF needs it too and a shared scene-set plumbing
 * change becomes worth the churn.
 *
 * JSZip is statically imported (bundled into `main.js`). Dynamic
 * import would add ~1 MB saving only when ODT is never used, and
 * esbuild's default non-split configuration inlines dynamic imports
 * anyway. Revisit if bundle size becomes a real concern.
 */

export interface OdtDiskDeps {
	/** Prompt the user for a save-to path; `null` = cancel. */
	pickPath(options: { defaultName: string }): Promise<string | null>;
	/** Write the ODT bytes to an absolute OS filesystem path. */
	writeFile(absolutePath: string, content: Uint8Array): Promise<void>;
}

export type RenderOdtDiskResult =
	| { kind: 'written'; path: string }
	| { kind: 'canceled' };

/**
 * Prompt the user for a save location, build the ODT archive from
 * `result.markdown`, and write the bytes to the chosen path.
 */
export async function renderOdtToDisk(
	preset: CompilePresetNote,
	result: CompileResult,
	deps: OdtDiskDeps
): Promise<RenderOdtDiskResult> {
	const chosen = await deps.pickPath({
		defaultName: `${preset.file.basename}.odt`,
	});
	if (chosen === null) return { kind: 'canceled' };
	const bytes = await buildOdtArchive(result.markdown);
	await deps.writeFile(chosen, bytes);
	return { kind: 'written', path: chosen };
}

/**
 * Build a complete ODT archive as a `Uint8Array` from a compile
 * markdown string. Pure with respect to the filesystem — pass the
 * returned bytes to a writer of choice (disk, vault adapter, etc.).
 *
 * The `mimetype` file must be first in the archive and stored
 * uncompressed per the ODT spec. JSZip preserves insertion order
 * when adding files; `{ compression: 'STORE' }` disables DEFLATE for
 * that entry.
 */
export async function buildOdtArchive(markdown: string): Promise<Uint8Array> {
	const zip = new JSZip();
	zip.file('mimetype', ODT_MIMETYPE, { compression: 'STORE' });
	zip.file('META-INF/manifest.xml', ODT_MANIFEST_XML);
	zip.file('styles.xml', ODT_STYLES_XML);
	zip.file('content.xml', buildContentXml(parseMarkdownForOdt(markdown)));
	return await zip.generateAsync({ type: 'uint8array' });
}

/**
 * Runtime wiring for `OdtDiskDeps`: Electron's save dialog plus
 * Node's `fs.promises.writeFile`. Filter list scopes the picker to
 * `.odt`. Not unit-tested; every branch depends on host-process
 * APIs. Covered by manual dev-vault walkthroughs when the
 * run-compile command lands (P3.E).
 */
export function createOdtDiskDeps(): OdtDiskDeps {
	return {
		async pickPath({ defaultName }) {
			const electron = getElectron();
			const dialog = electron?.remote?.dialog ?? electron?.dialog;
			if (!dialog) {
				throw new Error(
					'Save dialog unavailable: Electron remote.dialog is not accessible from this runtime.'
				);
			}
			const response = await dialog.showSaveDialog({
				defaultPath: defaultName,
				filters: [{ name: 'OpenDocument Text', extensions: ['odt'] }],
			});
			if (response.canceled || !response.filePath) return null;
			return response.filePath;
		},
		async writeFile(absolutePath, content) {
			const fs = getNodeFs();
			if (!fs) {
				throw new Error(
					'Disk write unavailable: Node fs module is not accessible from this runtime.'
				);
			}
			await fs.promises.writeFile(absolutePath, content);
		},
	};
}

// Host-process accessors mirror render-md.ts. Factor-out candidate if
// a third consumer (PDF) lands with the same shape.

interface ElectronDialog {
	showSaveDialog(options: {
		defaultPath?: string;
		filters?: Array<{ name: string; extensions: string[] }>;
	}): Promise<{ canceled: boolean; filePath?: string }>;
}

interface ElectronModule {
	remote?: { dialog?: ElectronDialog };
	dialog?: ElectronDialog;
}

interface NodeFsModule {
	promises: {
		writeFile(path: string, content: Uint8Array): Promise<void>;
	};
}

function getElectron(): ElectronModule | null {
	const req = (window as unknown as { require?: (m: string) => unknown })
		.require;
	if (typeof req !== 'function') return null;
	try {
		return req('electron') as ElectronModule;
	} catch {
		return null;
	}
}

function getNodeFs(): NodeFsModule | null {
	const req = (window as unknown as { require?: (m: string) => unknown })
		.require;
	if (typeof req !== 'function') return null;
	try {
		return req('fs') as NodeFsModule;
	} catch {
		return null;
	}
}
