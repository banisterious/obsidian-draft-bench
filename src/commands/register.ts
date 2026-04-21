import type { Plugin } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import { registerCreateProjectCommand } from './create-project';

/**
 * Central command registration. Called from `main.ts` once during
 * `onload()`. Each command's registration helper handles its own
 * plugin.addCommand wiring; this is just the dispatch point.
 *
 * The `getSettings` thunk is forwarded so commands always read the
 * latest settings (if the user changes them, the next command
 * invocation sees the new values without needing re-registration).
 */
export function registerCommands(
	plugin: Plugin,
	getSettings: () => DraftBenchSettings
): void {
	registerCreateProjectCommand(plugin, getSettings);
}
