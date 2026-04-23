import * as pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { CompileResult } from '../compile-service';
import type { CompilePresetNote } from '../discovery';
import { parseMarkdown } from './md-ast';
import { buildPdfDocDefinition } from './pdf/doc-definition';

/**
 * PDF output renderer for the compile pipeline.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md),
 * PDF output is disk-only (no vault path) and always goes through
 * the OS save dialog. Rendering is delegated to pdfmake with its
 * bundled Roboto VFS; fonts register once per plugin session on
 * first compile.
 *
 * V1 scope matches the ODT renderer: headings, paragraphs, bullet +
 * numbered lists, bold + italic. Blockquotes, code blocks, tables,
 * and footnotes degrade to plain paragraphs (D-06 V1 tradeoff).
 *
 * Bundle impact: pdfmake + vfs_fonts add ~2 MB to `main.js` once
 * this module is reachable from the plugin entry (i.e., when a P3.E
 * command imports it). Until then, main.js stays lean.
 */

export interface PdfDiskDeps {
	/** Prompt the user for a save-to path; `null` = cancel. */
	pickPath(options: { defaultName: string }): Promise<string | null>;
	/** Write PDF bytes to an absolute OS filesystem path. */
	writeFile(absolutePath: string, content: Uint8Array): Promise<void>;
	/**
	 * Produce the PDF bytes from compile markdown + preset settings.
	 * Injectable so unit tests can skip pdfmake's runtime machinery;
	 * production callers use `createPdfDiskDeps` which wires the real
	 * builder.
	 */
	buildBytes(
		markdown: string,
		preset: CompilePresetNote['frontmatter']
	): Promise<Uint8Array>;
}

export type RenderPdfDiskResult =
	| { kind: 'written'; path: string }
	| { kind: 'canceled' };

/**
 * Prompt, render, write. Orchestrator logic only — all heavy lifting
 * (markdown parsing, pdfmake doc-definition assembly, byte
 * generation) happens inside `deps.buildBytes`.
 */
export async function renderPdfToDisk(
	preset: CompilePresetNote,
	result: CompileResult,
	deps: PdfDiskDeps
): Promise<RenderPdfDiskResult> {
	const chosen = await deps.pickPath({
		defaultName: `${preset.file.basename}.pdf`,
	});
	if (chosen === null) return { kind: 'canceled' };
	const bytes = await deps.buildBytes(result.markdown, preset.frontmatter);
	await deps.writeFile(chosen, bytes);
	return { kind: 'written', path: chosen };
}

/**
 * Build PDF bytes from compile markdown using pdfmake + the bundled
 * Roboto VFS. Registers the VFS + font declarations once per plugin
 * session (idempotent via the `fontsInitialized` guard).
 *
 * Not unit-tested directly: pdfmake has a large Node-centric runtime
 * that's awkward to stand up in Vitest. The pure translator
 * (`buildPdfDocDefinition` in `pdf/doc-definition.ts`) is tested
 * exhaustively; the piece that actually calls pdfmake is narrow
 * enough to be covered by dev-vault walkthroughs once P3.E commands
 * ship.
 */
export async function buildPdfBytes(
	markdown: string,
	preset: CompilePresetNote['frontmatter']
): Promise<Uint8Array> {
	ensureFonts();
	const blocks = parseMarkdown(markdown);
	const pageSize =
		preset['dbench-compile-page-size'] === 'a4' ? 'A4' : 'LETTER';
	const docDefinition = buildPdfDocDefinition(blocks, { pageSize });
	const pdf = pdfMake.createPdf(docDefinition);
	const buffer = await pdf.getBuffer();
	return new Uint8Array(buffer);
}

let fontsInitialized = false;

function ensureFonts(): void {
	if (fontsInitialized) return;
	pdfMake.addVirtualFileSystem(pdfFonts);
	pdfMake.addFonts({
		Roboto: {
			normal: 'Roboto-Regular.ttf',
			bold: 'Roboto-Medium.ttf',
			italics: 'Roboto-Italic.ttf',
			bolditalics: 'Roboto-MediumItalic.ttf',
		},
	});
	fontsInitialized = true;
}

/**
 * Runtime wiring for `PdfDiskDeps`: Electron save dialog, Node `fs`,
 * and the real `buildPdfBytes`. Not unit-tested — host-process APIs.
 */
export function createPdfDiskDeps(): PdfDiskDeps {
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
				filters: [{ name: 'PDF', extensions: ['pdf'] }],
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
		buildBytes: buildPdfBytes,
	};
}

// Host-process accessors mirror render-md.ts / render-odt.ts. Factor
// out if a fourth consumer arrives — three copies isn't yet worth
// the dependency churn.

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
