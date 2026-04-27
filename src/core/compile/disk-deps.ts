/**
 * Shared host-process accessors for the compile-pipeline disk-write
 * renderers (render-md / render-odt / render-pdf / render-docx).
 *
 * Each renderer's `createXxxDiskDeps` factory needs the same two host
 * lookups: Electron's save dialog (for path picking) and Node's `fs`
 * module (for byte / string writes). Until DOCX landed, three copies
 * of these helpers lived inline across renderers; the fourth copy
 * triggered the factor-out flagged in render-pdf.ts:155-157.
 *
 * Both accessors return `null` in any environment where the lookup
 * fails (Vitest, Obsidian mobile, web embed contexts). Renderers
 * wrap a null return with a renderer-specific error message so the
 * Notice shown to the writer reflects which format was attempted.
 *
 * Not unit-tested directly: every branch depends on host-process
 * APIs (`window.require`). The failure paths are covered by the
 * renderers' integration code throwing when these return null.
 */

export interface ElectronDialog {
	showSaveDialog(options: {
		defaultPath?: string;
		filters?: Array<{ name: string; extensions: string[] }>;
	}): Promise<{ canceled: boolean; filePath?: string }>;
}

export interface ElectronModule {
	remote?: { dialog?: ElectronDialog };
	dialog?: ElectronDialog;
}

/**
 * Permissive `fs.promises.writeFile` shape that satisfies both the
 * binary renderers (Uint8Array content, no encoding) and the
 * markdown renderer (string content, 'utf8' encoding). Mirrors
 * Node's actual fs.promises.writeFile signature, which accepts
 * either content type.
 */
export interface NodeFsModule {
	promises: {
		writeFile(
			path: string,
			content: Uint8Array | string,
			encoding?: 'utf8'
		): Promise<void>;
	};
}

export function getElectron(): ElectronModule | null {
	const req = (window as unknown as { require?: (m: string) => unknown })
		.require;
	if (typeof req !== 'function') return null;
	try {
		return req('electron') as ElectronModule;
	} catch {
		return null;
	}
}

export function getNodeFs(): NodeFsModule | null {
	const req = (window as unknown as { require?: (m: string) => unknown })
		.require;
	if (typeof req !== 'function') return null;
	try {
		return req('fs') as NodeFsModule;
	} catch {
		return null;
	}
}
