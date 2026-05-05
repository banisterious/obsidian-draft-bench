import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from './src/model/settings';
import { registerCommands } from './src/commands/register';
import { registerContextMenu } from './src/context-menu/register';
import { DraftBenchLinker } from './src/core/linker';
import { registerPropertyTypes } from './src/core/property-types';
import { ProjectSelection } from './src/core/selection';
import { WordCountCache } from './src/core/word-count-cache';
import { DraftBenchSettingTab } from './src/settings/settings-tab';
import { LeafStyles } from './src/ui/leaf-styles';
import { activateManuscriptBuilderView } from './src/ui/manuscript-builder/activate';
import {
	ManuscriptBuilderView,
	VIEW_TYPE_MANUSCRIPT_BUILDER,
} from './src/ui/manuscript-builder/manuscript-builder-view';
import { activateManuscriptView } from './src/ui/manuscript-view/activate';
import {
	ManuscriptView,
	VIEW_TYPE_MANUSCRIPT,
} from './src/ui/manuscript-view/manuscript-view';
import { WelcomeModal } from './src/ui/modals/welcome-modal';

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

		this.registerView(
			VIEW_TYPE_MANUSCRIPT_BUILDER,
			(leaf) => new ManuscriptBuilderView(leaf, this, this.linker)
		);

		this.addCommand({
			id: 'show-manuscript-builder-leaf',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- branded surface name (parallel to "Manuscript view")
			name: 'Show Manuscript Builder leaf',
			callback: () => {
				void activateManuscriptBuilderView(this.app);
			},
		});

		registerCommands(this, () => this.settings, this.linker);
		registerContextMenu(this, this.linker);

		// Active-note-sync: when a writer opens a Draft Bench-managed
		// note (project / chapter / scene / draft) belonging to a
		// project different from the current selection, switch the
		// leaf's selection to that project. Keeps the Manuscript view
		// in sync with the file the writer is actually working on as
		// they navigate around the vault. Cheap: reads the
		// already-cached frontmatter; early-returns on non-DB notes.
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (!file) return;
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (!fm) return;
				const type = fm['dbench-type'];
				if (
					type !== 'project' &&
					type !== 'chapter' &&
					type !== 'scene' &&
					type !== 'draft'
				) {
					return;
				}
				// For project notes, the project ID is the note's own
				// id. For other types, the parent project ID lives in
				// `dbench-project-id`.
				const projectId =
					type === 'project'
						? fm['dbench-id']
						: fm['dbench-project-id'];
				if (typeof projectId !== 'string' || projectId === '') return;
				if (this.selection.get() === projectId) return;
				this.selection.set(projectId);
			})
		);

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
			registerPropertyTypes(this.app);
			this.maybeShowWelcomeModal();
		});
	}

	/**
	 * On first plugin load (or after a settings reset), show the
	 * onboarding welcome modal once. The modal flips
	 * `settings.welcomeShown` on close, so subsequent loads skip this
	 * path. Writers can resurface the modal via the
	 * `Show welcome screen` palette command.
	 *
	 * Gated on `onLayoutReady` because: (a) the workspace must exist
	 * before a Modal can open; (b) we don't want to compete with
	 * Obsidian's startup activity for the writer's attention. By the
	 * time onLayoutReady fires the chrome is settled.
	 */
	private maybeShowWelcomeModal(): void {
		if (this.settings.welcomeShown) return;
		new WelcomeModal(this).open();
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

		// One-shot migration: chapter-aware `scenesFolder` default
		// (issue #11). Existing installs persisted the V1 default of
		// `''`; the new default is `'{chapter}/'`, which nests scenes
		// under their chapter for chapter-aware projects and degrades
		// to flat for chapter-less ones. Detect "saved file exists,
		// migration flag absent" and upgrade in place. Idempotent:
		// fresh installs (no data file) and already-migrated saves
		// (flag present) skip. A writer who deliberately re-sets `''`
		// after the upgrade keeps that choice on subsequent loads.
		if (data !== null && data.scenesFolderMigrated === undefined) {
			if (this.settings.scenesFolder === '') {
				this.settings.scenesFolder = '{chapter}/';
			}
			this.settings.scenesFolderMigrated = true;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
