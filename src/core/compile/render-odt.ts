import type { App } from 'obsidian';
import type { CompileResult } from '../compile-service';
import type { CompilePresetNote, ProjectNote } from '../discovery';
import { ZipBuilder } from '../../utils/zip';
import { getElectron, getNodeFs } from './disk-deps';
import { parseMarkdownForOdt } from './odt/parser';
import {
	buildContentXml,
	ODT_MANIFEST_XML,
	ODT_MIMETYPE,
	ODT_STYLES_XML,
} from './odt/xml';
import { type RenderVaultResult, writeCompiledFile } from './vault-output';

/**
 * ODT output renderer for the compile pipeline.
 *
 * Per [D-06 § Output format](../../../docs/planning/decisions/D-06-compile-preset-storage-and-content-rules.md):
 *
 * - `format: odt` + `output: vault` -> `renderOdtToVault` writes to
 *   `<project folder>/Compiled/<preset name>.odt` inside the vault via
 *   the shared `writeCompiledFile` helper (mobile-compatible).
 * - `format: odt` + `output: disk` -> `renderOdtToDisk` prompts with
 *   the OS save dialog and writes outside the vault. Desktop-only by
 *   construction (Electron's `remote.dialog` + Node `fs`).
 *
 * The archive contains the four required ODT entries: `mimetype`
 * (stored uncompressed, first in the archive per spec),
 * `META-INF/manifest.xml`, `styles.xml`, `content.xml`.
 *
 * V1 renders a capped subset of markdown: headings, paragraphs,
 * bullet + numbered lists, bold + italic inline runs. Blockquotes,
 * code blocks, tables, and footnotes degrade to plain paragraphs
 * (acceptable V1 tradeoff per D-06). Page-break support requires
 * scene metadata that isn't currently threaded into the renderer —
 * revisit when PDF needs it too and a shared scene-set plumbing
 * change becomes worth the churn.
 *
 * The zip layer is fflate (via the thin `ZipBuilder` adapter at
 * `src/utils/zip.ts`). Statically imported and bundled into `main.js`.
 * fflate ships at ~8 KB minified with zero transitive deps, replacing
 * jszip's ~90 KB + IE-era polyfill chain that 0.6.1 had to work around
 * in `esbuild.config.mjs`. See `docs/developer/third-party-libraries.md`.
 */

/**
 * Build the ODT archive from the compile result and write it to the
 * preset's canonical vault location. Thin orchestrator over
 * `buildOdtArchive` + `writeCompiledFile`.
 */
export async function renderOdtToVault(
	app: App,
	project: ProjectNote,
	preset: CompilePresetNote,
	result: CompileResult
): Promise<RenderVaultResult> {
	const bytes = await buildOdtArchive(result.markdown);
	return await writeCompiledFile(app, project, preset, 'odt', bytes);
}

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
 * uncompressed per the ODT spec. `ZipBuilder` (fflate) preserves
 * insertion order when adding files; `{ compression: 'STORE' }` maps
 * to fflate's `level: 0` (no DEFLATE) for that entry.
 */
export async function buildOdtArchive(markdown: string): Promise<Uint8Array> {
	const zip = new ZipBuilder();
	zip.file('mimetype', ODT_MIMETYPE, { compression: 'STORE' });
	zip.file('META-INF/manifest.xml', ODT_MANIFEST_XML);
	zip.file('styles.xml', ODT_STYLES_XML);
	zip.file('content.xml', buildContentXml(parseMarkdownForOdt(markdown)));
	const blob = await zip.generateAsync({
		mimeType: 'application/vnd.oasis.opendocument.text',
	});
	return new Uint8Array(await blob.arrayBuffer());
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

