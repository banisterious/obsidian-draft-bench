import { Packer } from 'docx';
import type { CompileResult } from '../compile-service';
import type { CompilePresetNote } from '../discovery';
import { parseMarkdown } from './md-ast';
import { buildDocxDocument, type DocxPageSize } from './docx/doc-definition';

/**
 * DOCX output renderer for the compile pipeline.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * DOCX output is disk-only (no vault path) and always goes through
 * the OS save dialog. Bytes are produced by the `docx` library
 * (Dolan Miu / docx.js); the pure translator at
 * `docx/doc-definition.ts` is the testable seam.
 *
 * V1 scope mirrors ODT + PDF: headings, paragraphs, bullet +
 * numbered lists, bold + italic. Blockquotes, code blocks, tables,
 * and footnotes degrade to plain paragraphs upstream in the shared
 * markdown parser.
 *
 * Bundle impact: docx adds ~200KB to `main.js` once this module is
 * reachable from the plugin entry. Static import is consistent with
 * JSZip and pdfmake; lazy-loading is the post-V1 lever per the
 * pdf-bundling-reference.
 */

export interface DocxDiskDeps {
	/** Prompt the user for a save-to path; `null` = cancel. */
	pickPath(options: { defaultName: string }): Promise<string | null>;
	/** Write DOCX bytes to an absolute OS filesystem path. */
	writeFile(absolutePath: string, content: Uint8Array): Promise<void>;
	/**
	 * Produce the DOCX bytes from compile markdown + preset settings.
	 * Injectable so unit tests can skip the docx runtime; production
	 * callers use `createDocxDiskDeps` which wires the real builder.
	 */
	buildBytes(
		markdown: string,
		preset: CompilePresetNote['frontmatter']
	): Promise<Uint8Array>;
}

export type RenderDocxDiskResult =
	| { kind: 'written'; path: string }
	| { kind: 'canceled' };

/**
 * Prompt, render, write. Orchestrator only — heavy lifting (markdown
 * parse, doc-definition assembly, byte generation) happens inside
 * `deps.buildBytes`.
 */
export async function renderDocxToDisk(
	preset: CompilePresetNote,
	result: CompileResult,
	deps: DocxDiskDeps
): Promise<RenderDocxDiskResult> {
	const chosen = await deps.pickPath({
		defaultName: `${preset.file.basename}.docx`,
	});
	if (chosen === null) return { kind: 'canceled' };
	const bytes = await deps.buildBytes(result.markdown, preset.frontmatter);
	await deps.writeFile(chosen, bytes);
	return { kind: 'written', path: chosen };
}

/**
 * Build DOCX bytes from compile markdown via the shared markdown
 * parser + the docx-specific translator + the docx library's Packer.
 * Pure with respect to the filesystem.
 */
export async function buildDocxBytes(
	markdown: string,
	preset: CompilePresetNote['frontmatter']
): Promise<Uint8Array> {
	const blocks = parseMarkdown(markdown);
	const pageSize: DocxPageSize =
		preset['dbench-compile-page-size'] === 'a4' ? 'A4' : 'LETTER';
	const doc = buildDocxDocument(blocks, { pageSize });
	const buffer = await Packer.toBuffer(doc);
	return new Uint8Array(buffer);
}

/**
 * Runtime wiring for `DocxDiskDeps`: Electron save dialog, Node fs,
 * and the real `buildDocxBytes`. Not unit-tested — host-process APIs.
 *
 * The four renderers (md / odt / pdf / docx) now each carry their
 * own copy of getElectron + getNodeFs. The factor-out flagged in
 * render-pdf.ts is overdue with the fourth consumer arriving here;
 * it'll land as its own micro-commit so the diff is reviewable
 * without DOCX work mixed in.
 */
export function createDocxDiskDeps(): DocxDiskDeps {
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
				filters: [{ name: 'Word Document', extensions: ['docx'] }],
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
		buildBytes: buildDocxBytes,
	};
}

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
