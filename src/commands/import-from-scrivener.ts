import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from '../core/linker';
import { ScrivenerImportWizardModal } from '../import/scrivener/import-wizard-modal';

/**
 * Register the "Draft Bench: Import from Scrivener" command. Opens
 * the import wizard at step 1 (Source).
 *
 * Cross-platform: registers on every platform DB supports (the
 * importer reads `.scriv` bundles via `app.vault.adapter`, no
 * Electron / Node `fs` dependency). Per scrivener-import.md § 13.
 *
 * The `getSettings` thunk is used (rather than a captured snapshot)
 * so the wizard sees the latest settings if the writer edits them
 * between sessions; `linker` and `saveSettings` are passed by
 * reference for the import write pass to use during execution.
 */
export function registerImportFromScrivenerCommand(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings,
	linker: DraftBenchLinker,
	saveSettings: () => Promise<void>
): void {
	plugin.addCommand({
		id: 'import-from-scrivener',
		name: 'Import from Scrivener',
		callback: () => {
			new ScrivenerImportWizardModal(
				plugin.app,
				getSettings(),
				linker,
				saveSettings
			).open();
		},
	});
}
