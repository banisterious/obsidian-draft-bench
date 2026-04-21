import { PluginSettingTab, Setting, type App } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftsFolderPlacement } from '../model/settings';
import { FileSuggest } from './suggesters/file-suggest';
import { FolderSuggest } from './suggesters/folder-suggest';

/**
 * Plugin settings tab rendered under Obsidian's Settings →
 * Community plugins → Draft Bench.
 *
 * Sections:
 *   - Folders      : projects / scenes / templates folder paths
 *   - Drafts       : drafts-folder placement + name
 *   - Sync         : bidirectional linker toggles
 *   - About        : version + repository link
 *
 * Folder-path inputs get a `FolderSuggest` autocomplete for quick
 * entry. `draftsFolderName` stays a plain text field (it's a folder
 * name, not a path — suggestions don't apply).
 */
export class DraftBenchSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: DraftBenchPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('dbench-settings');

		this.renderFolders();
		this.renderDrafts();
		this.renderTemplates();
		this.renderSync();
		this.renderAbout();
	}

	private renderFolders(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;

		new Setting(containerEl).setName('Folders').setHeading();

		new Setting(containerEl)
			.setName('Projects folder')
			.setDesc(
				'Default location for new projects. The {project} token is replaced with the project title at creation time.'
			)
			.addText((text) => {
				text
					.setPlaceholder('Draft Bench/{project}/')
					.setValue(settings.projectsFolder)
					.onChange(async (value) => {
						settings.projectsFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName('Scenes folder')
			.setDesc(
				'Relative to the project folder. Leave empty to place scenes alongside the project note, or enter a subfolder name to nest them.'
			)
			.addText((text) => {
				text
					.setPlaceholder('')
					.setValue(settings.scenesFolder)
					.onChange(async (value) => {
						settings.scenesFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName('Templates folder')
			.setDesc(
				'Where scene templates live. The built-in default template is created here on first project creation if absent.'
			)
			.addText((text) => {
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder('Draft Bench/Templates/')
					.setValue(settings.templatesFolder)
					.onChange(async (value) => {
						settings.templatesFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});
	}

	private renderDrafts(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;

		new Setting(containerEl).setName('Drafts').setHeading();

		new Setting(containerEl)
			.setName('Drafts folder placement')
			.setDesc('Where per-scene drafts are stored.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('project-local', 'Inside each project')
					.addOption('per-scene', 'Per-scene sibling folder')
					.addOption('vault-wide', 'Vault-wide root')
					.setValue(settings.draftsFolderPlacement)
					.onChange(async (value) => {
						settings.draftsFolderPlacement =
							value as DraftsFolderPlacement;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Drafts folder name')
			.setDesc(
				'The drafts folder\'s name. Used by the project-local and vault-wide placements; ignored by per-scene, which derives the name from the scene title.'
			)
			.addText((text) =>
				text
					.setPlaceholder('Drafts')
					.setValue(settings.draftsFolderName)
					.onChange(async (value) => {
						settings.draftsFolderName = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private renderTemplates(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;

		new Setting(containerEl).setName('Templates').setHeading();

		new Setting(containerEl)
			.setName('Scene template')
			.setDesc(
				'Markdown file used for new scenes. Leave empty to use scene-template.md inside the templates folder; set to override with any markdown file in the vault. Plugin tokens like {{scene_title}} and {{project_title}} are substituted at creation time.'
			)
			.addText((text) => {
				text
					.setPlaceholder('Draft Bench/Templates/scene-template.md')
					.setValue(settings.sceneTemplatePath)
					.onChange(async (value) => {
						settings.sceneTemplatePath = value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});
	}

	private renderSync(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;

		new Setting(containerEl).setName('Bidirectional sync').setHeading();

		new Setting(containerEl)
			.setName('Enable bidirectional sync')
			.setDesc(
				'Master toggle for the relationship-integrity linker. When off, the linker is dormant; you can still trigger a manual repair from the command palette.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(settings.enableBidirectionalSync)
					.onChange(async (value) => {
						settings.enableBidirectionalSync = value;
						await this.plugin.saveSettings();
						this.restartLinker();
					})
			);

		new Setting(containerEl)
			.setName('Sync on file modify')
			.setDesc(
				'Reconcile forward and reverse references in real time when files change. Disable for performance on very large vaults.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(settings.syncOnFileModify)
					.onChange(async (value) => {
						settings.syncOnFileModify = value;
						await this.plugin.saveSettings();
						this.restartLinker();
					})
			);
	}

	private renderAbout(): void {
		const { containerEl } = this;

		new Setting(containerEl).setName('About').setHeading();

		new Setting(containerEl)
			.setName('Version')
			.setDesc(this.plugin.manifest.version);

		new Setting(containerEl)
			.setName('Repository')
			.setDesc('github.com/banisterious/obsidian-draft-bench');
	}

	private restartLinker(): void {
		this.plugin.linker.stop();
		this.plugin.linker.start();
	}
}
