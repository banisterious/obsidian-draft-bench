import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from './src/model/settings';
import { registerCommands } from './src/commands/register';
import { registerContextMenu } from './src/context-menu/register';
import { DraftBenchLinker } from './src/core/linker';
import { WordCountCache } from './src/core/word-count-cache';
import { DraftBenchSettingTab } from './src/settings/settings-tab';
import { ControlCenterModal } from './src/ui/control-center/control-center-modal';
import { LeafStyles } from './src/ui/leaf-styles';

export default class DraftBenchPlugin extends Plugin {
	settings!: DraftBenchSettings;
	linker!: DraftBenchLinker;
	leafStyles!: LeafStyles;
	wordCounts!: WordCountCache;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.linker = new DraftBenchLinker(this.app, () => this.settings);
		this.linker.start();
		this.register(() => this.linker.stop());

		this.wordCounts = new WordCountCache(this.app);
		this.register(() => this.wordCounts.clear());

		this.leafStyles = new LeafStyles(this);
		this.leafStyles.start();

		registerCommands(this, () => this.settings, this.linker);
		registerContextMenu(this, this.linker);

		this.addRibbonIcon('pencil-line', 'Open Draft Bench control center', () => {
			new ControlCenterModal(this.app, this, this.linker).open();
		});

		this.addSettingTab(new DraftBenchSettingTab(this.app, this));
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
