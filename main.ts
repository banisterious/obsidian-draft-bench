import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from './src/model/settings';
import { registerCommands } from './src/commands/register';

export default class DraftBenchPlugin extends Plugin {
	settings!: DraftBenchSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		registerCommands(this, () => this.settings);
	}

	onunload(): void {
		// Listeners and intervals registered via `this.register*()` are
		// torn down automatically by Obsidian.
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<DraftBenchSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
