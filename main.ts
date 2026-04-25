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

		this.addRibbonIcon('scroll-text', 'Open Draft Bench', () => {
			void activateManuscriptView(this.app);
		});

		this.addSettingTab(new DraftBenchSettingTab(this.app, this));

		// Style Settings race workaround. Obsidian's plugin-CSS injection
		// can land after Style Settings' initial parseCSS pass, leaving
		// SS's `settingsList` empty for our `@settings` block — surfaced
		// as "No settings found" under our manifest's section. Nudge SS
		// to re-parse after the workspace is fully ready, by which time
		// our `<style>` tag is definitely in the DOM.
		this.app.workspace.onLayoutReady(() => {
			this.nudgeStyleSettingsParse();
		});
	}

	/**
	 * Reach into the Style Settings plugin (if installed) and trigger
	 * a re-parse. The `parseCSS` method has been stable on SS for
	 * years, but it isn't a published API contract — wrap in try/catch
	 * so a future SS rename doesn't break our load.
	 */
	private nudgeStyleSettingsParse(): void {
		const plugins = (
			this.app as unknown as {
				plugins: { plugins: Record<string, unknown> };
			}
		).plugins;
		const ss = plugins.plugins['obsidian-style-settings'] as
			| { parseCSS?: () => void }
			| undefined;
		if (!ss || typeof ss.parseCSS !== 'function') return;
		try {
			ss.parseCSS();
		} catch (err) {
			console.warn(
				'[DraftBench] Style Settings parseCSS nudge failed:',
				err
			);
		}
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
