import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from './src/model/settings';
import { registerCommands } from './src/commands/register';
import { registerContextMenu } from './src/context-menu/register';
import { DraftBenchLinker } from './src/core/linker';
import { ProjectSelection } from './src/core/selection';
import { WordCountCache } from './src/core/word-count-cache';
import { DraftBenchSettingTab } from './src/settings/settings-tab';
import { LeafStyles } from './src/ui/leaf-styles';
import { activateManuscriptView } from './src/ui/manuscript-view/activate';
import {
	ManuscriptView,
	VIEW_TYPE_MANUSCRIPT,
} from './src/ui/manuscript-view/manuscript-view';

export default class DraftBenchPlugin extends Plugin {
	settings!: DraftBenchSettings;
	linker!: DraftBenchLinker;
	leafStyles!: LeafStyles;
	wordCounts!: WordCountCache;
	selection!: ProjectSelection;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.selection = new ProjectSelection();
		// Pre-populate from settings so reload restores the last-
		// selected project before the leaf's onOpen runs.
		this.selection.set(this.settings.lastSelectedProjectId);
		// Persist selection changes through plugin settings. Obsidian's
		// workspace-state persistence (`requestSaveLayout`) is debounced
		// and unreliable for late-session mutations; plugin data.json is
		// saved synchronously via saveSettings and round-trips cleanly
		// across reloads.
		this.register(
			this.selection.onChange((id) => {
				this.settings.lastSelectedProjectId = id;
				void this.saveSettings();
			})
		);

		this.linker = new DraftBenchLinker(this.app, () => this.settings);
		this.linker.start();
		this.register(() => this.linker.stop());

		this.wordCounts = new WordCountCache(this.app);
		this.register(() => this.wordCounts.clear());

		this.leafStyles = new LeafStyles(this);
		this.leafStyles.start();

		this.registerView(
			VIEW_TYPE_MANUSCRIPT,
			(leaf) => new ManuscriptView(leaf, this)
		);

		registerCommands(this, () => this.settings, this.linker);
		registerContextMenu(this, this.linker);

		this.addRibbonIcon('pencil-ruler', 'Open Draft Bench', () => {
			void activateManuscriptView(this.app);
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
