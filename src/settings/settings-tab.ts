import { Notice, PluginSettingTab, Setting, setIcon, type App } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import type { DraftsFolderPlacement } from '../model/settings';
import { countStatusUsage, renameStatus } from '../core/statuses';
import { RemoveStatusModal } from '../ui/modals/remove-status-modal';
import { FileSuggest } from './suggesters/file-suggest';
import { FolderSuggest } from './suggesters/folder-suggest';

/**
 * Plugin settings tab rendered under Obsidian's Settings →
 * Community plugins → Draft Bench.
 *
 * Sections (each rendered as a collapsible `<details>` block per #18):
 *   - Folders      : projects / scenes / sub-scenes / templates / bases paths
 *   - Drafts       : drafts-folder placement + name
 *   - Templates    : scene / chapter / sub-scene template files
 *   - Statuses     : editable workflow-status vocabulary
 *   - Bidirectional sync : linker toggles
 *   - About        : version + repository link
 *
 * Folder-path inputs get a `FolderSuggest` autocomplete for quick
 * entry. `draftsFolderName` stays a plain text field (it's a folder
 * name, not a path — suggestions don't apply).
 *
 * Sections default to open. State preservation across re-renders is
 * deferred per [docs/planning/settings-organization-reference.md § 6](../../docs/planning/settings-organization-reference.md);
 * adopt when the re-collapse-on-re-render behavior actually surfaces
 * as friction.
 */
export class DraftBenchSettingTab extends PluginSettingTab {
	private statusFocusIndex = 0;
	private statusDragFromIndex: number | null = null;

	constructor(
		app: App,
		private readonly plugin: DraftBenchPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		// `dbench-scope` exposes the plugin's spacing / radius scale to
		// CSS variable references inside this tab.
		containerEl.addClass('dbench-settings', 'dbench-scope');

		this.renderFolders(this.openSection('Folders', 'Where Draft Bench stores and finds notes'));
		this.renderDrafts(this.openSection('Drafts', 'Per-scene draft placement'));
		this.renderTemplates(this.openSection('Templates', 'Markdown files used for new notes'));
		this.renderStatuses(this.openSection('Statuses', 'Workflow vocabulary for scenes and projects'));
		this.renderSync(this.openSection('Bidirectional sync', 'Live integrity reconciliation'));
		this.renderAbout(this.openSection('About', 'Version and repository'));
	}

	/**
	 * Build a collapsible `<details>` section with a styled summary
	 * (title + right-aligned description + chevron). Returns the
	 * content container the section renderer should populate. Per
	 * [settings-organization-reference.md § 3](../../docs/planning/settings-organization-reference.md):
	 * native `<details>` so the browser handles open/close, no custom
	 * JS toggle logic, with a CSS chevron rotated via the `[open]`
	 * attribute selector.
	 */
	private openSection(title: string, desc: string): HTMLElement {
		const details = this.containerEl.createEl('details', {
			cls: 'dbench-settings-section',
			attr: { open: 'true' },
		});
		details.dataset.sectionName = title.toLowerCase().replace(/\s+/g, '-');

		const summary = details.createEl('summary');
		summary.createSpan({ text: title });
		summary.createSpan({
			cls: 'dbench-settings-section__desc',
			text: desc,
		});

		return details.createDiv({ cls: 'dbench-settings-section__content' });
	}

	private renderFolders(container: HTMLElement): void {
		const { settings } = this.plugin;

		// Section-level info box: shared token semantics, kept out of
		// individual setDesc() lines so each input row stays scannable.
		const tokensInfo = container.createDiv({ cls: 'dbench-info-box' });
		tokensInfo.appendText('Path templates support ');
		tokensInfo.createEl('code', { text: '{project}' });
		tokensInfo.appendText(', ');
		tokensInfo.createEl('code', { text: '{chapter}' });
		tokensInfo.appendText(', and ');
		tokensInfo.createEl('code', { text: '{scene}' });
		tokensInfo.appendText(
			" tokens, which expand to the relevant note's basename at creation time. Tokens that don't apply to a given note (e.g., "
		);
		tokensInfo.createEl('code', { text: '{chapter}' });
		tokensInfo.appendText(
			' for a chapter-less scene) expand to an empty string and collapse out of the resolved path.'
		);

		new Setting(container)
			.setName('Projects folder')
			.setDesc('Default location for new projects.')
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

		new Setting(container)
			.setName('Scenes folder')
			.setDesc(
				"Relative to the project folder. Default {chapter}/ nests scenes under their chapter for chapter-aware projects and stays flat for chapter-less ones."
			)
			.addText((text) => {
				text
					.setPlaceholder('{chapter}/')
					.setValue(settings.scenesFolder)
					.onChange(async (value) => {
						settings.scenesFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(container)
			.setName('Sub-scenes folder')
			.setDesc(
				"Relative to the parent scene's folder. Default {scene}/ nests sub-scenes next to their parent scene wherever it lives."
			)
			.addText((text) => {
				text
					.setPlaceholder('{scene}/')
					.setValue(settings.subScenesFolder)
					.onChange(async (value) => {
						settings.subScenesFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(container)
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

		// Bases folder folded in from the previous standalone Bases
		// section (#18); single setting didn't justify its own section.
		new Setting(container)
			.setName('Bases folder')
			.setDesc(
				'Where the install command writes starter .base files. The folder is created if absent; existing files are never overwritten.'
			)
			.addText((text) => {
				text
					.setPlaceholder('Draft Bench/Bases')
					.setValue(settings.basesFolder)
					.onChange(async (value) => {
						settings.basesFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});
	}

	private renderDrafts(container: HTMLElement): void {
		const { settings } = this.plugin;

		new Setting(container)
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

		new Setting(container)
			.setName('Drafts folder name')
			.setDesc(
				"The drafts folder's name. Used by the project-local and vault-wide placements; ignored by per-scene, which derives the name from the scene title."
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

	private renderTemplates(container: HTMLElement): void {
		const { settings } = this.plugin;

		// Section-level info box: shared template-token semantics +
		// the leave-empty-to-use-default convention.
		const templatesInfo = container.createDiv({ cls: 'dbench-info-box' });
		templatesInfo.appendText(
			'Template files use plugin tokens like '
		);
		templatesInfo.createEl('code', { text: '{{scene_title}}' });
		templatesInfo.appendText(', ');
		templatesInfo.createEl('code', { text: '{{project_title}}' });
		templatesInfo.appendText(
			', and so on, substituted at note-creation time. Leave a path empty to use the built-in default at '
		);
		templatesInfo.createEl('code', { text: '<templates folder>/<type>-template.md' });
		templatesInfo.appendText(
			', or set to override with any markdown file in the vault.'
		);

		new Setting(container)
			.setName('Scene template')
			.setDesc('Markdown file used for new scenes.')
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

		new Setting(container)
			.setName('Chapter template')
			.setDesc('Markdown file used for new chapters.')
			.addText((text) => {
				text
					.setPlaceholder('Draft Bench/Templates/chapter-template.md')
					.setValue(settings.chapterTemplatePath)
					.onChange(async (value) => {
						settings.chapterTemplatePath = value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		new Setting(container)
			.setName('Sub-scene template')
			.setDesc('Markdown file used for new sub-scenes.')
			.addText((text) => {
				text
					.setPlaceholder('Draft Bench/Templates/sub-scene-template.md')
					.setValue(settings.subSceneTemplatePath)
					.onChange(async (value) => {
						settings.subSceneTemplatePath = value;
						await this.plugin.saveSettings();
					});
				new FileSuggest(this.app, text.inputEl);
			});
	}

	private renderStatuses(container: HTMLElement): void {
		const { settings } = this.plugin;

		new Setting(container)
			.setName('Workflow vocabulary')
			.setDesc(
				'The ordered list of statuses available on scenes and projects. The first value is the default for new scenes. Drag by the handle, or focus a row and press up/down, to reorder.'
			);

		const list = container.createEl('ol', {
			cls: 'dbench-statuses__list',
			attr: {
				role: 'listbox',
				'aria-label': 'Status vocabulary',
			},
		});

		settings.statusVocabulary.forEach((status, index) => {
			this.renderStatusRow(list, status, index);
		});

		const addButton = container.createEl('button', {
			text: 'Add status',
			cls: 'dbench-statuses__add',
		});
		addButton.addEventListener('click', () => {
			void this.handleAddStatus();
		});
	}

	private renderStatusRow(
		list: HTMLOListElement,
		status: string,
		index: number
	): void {
		const { settings } = this.plugin;
		const isDefault = index === 0;

		const row = list.createEl('li', {
			cls: 'dbench-statuses__row',
			attr: {
				role: 'option',
				tabindex: index === this.statusFocusIndex ? '0' : '-1',
				'aria-selected':
					index === this.statusFocusIndex ? 'true' : 'false',
				draggable: 'true',
			},
		});

		const handle = row.createEl('span', {
			cls: 'dbench-statuses__handle',
			attr: { 'aria-hidden': 'true', title: 'Drag to reorder' },
		});
		setIcon(handle, 'grip-vertical');

		const input = row.createEl('input', {
			cls: 'dbench-statuses__input',
			type: 'text',
			attr: { 'aria-label': `Status ${index + 1}`, value: status },
		});
		input.value = status;
		input.addEventListener('change', () => {
			void this.handleRenameStatus(index, input.value);
		});

		if (isDefault) {
			row.createEl('span', {
				cls: 'dbench-statuses__badge',
				text: 'Default',
			});
		}

		const removeButton = row.createEl('button', {
			cls: 'dbench-statuses__remove',
			attr: {
				'aria-label': `Remove "${status}"`,
				title: 'Remove status',
			},
		});
		setIcon(removeButton, 'x');
		removeButton.disabled = settings.statusVocabulary.length <= 1;
		removeButton.addEventListener('click', () => {
			void this.handleRemoveStatus(index);
		});

		row.addEventListener('keydown', (ev) => {
			if (ev.target !== row) return; // don't hijack input typing
			if (ev.key === 'ArrowUp' || ev.key === 'k' || ev.key === 'K') {
				ev.preventDefault();
				void this.moveStatus(index, -1);
			} else if (
				ev.key === 'ArrowDown' ||
				ev.key === 'j' ||
				ev.key === 'J'
			) {
				ev.preventDefault();
				void this.moveStatus(index, 1);
			}
		});

		row.addEventListener('focus', () => {
			this.statusFocusIndex = index;
		});

		row.addEventListener('dragstart', (ev) => {
			this.statusDragFromIndex = index;
			row.addClass('dbench-statuses__row--dragging');
			if (ev.dataTransfer) {
				ev.dataTransfer.effectAllowed = 'move';
				ev.dataTransfer.setData('text/plain', String(index));
			}
		});
		row.addEventListener('dragover', (ev) => {
			if (this.statusDragFromIndex === null) return;
			ev.preventDefault();
			if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
			const rect = row.getBoundingClientRect();
			const before = ev.clientY - rect.top < rect.height / 2;
			row.removeClass(
				'dbench-statuses__row--drop-before',
				'dbench-statuses__row--drop-after'
			);
			row.addClass(
				before
					? 'dbench-statuses__row--drop-before'
					: 'dbench-statuses__row--drop-after'
			);
		});
		row.addEventListener('dragleave', () => {
			row.removeClass(
				'dbench-statuses__row--drop-before',
				'dbench-statuses__row--drop-after'
			);
		});
		row.addEventListener('drop', (ev) => {
			ev.preventDefault();
			row.removeClass(
				'dbench-statuses__row--drop-before',
				'dbench-statuses__row--drop-after'
			);
			const from = this.statusDragFromIndex;
			if (from === null || from === index) return;
			const rect = row.getBoundingClientRect();
			const before = ev.clientY - rect.top < rect.height / 2;
			let to = before ? index : index + 1;
			if (from < to) to -= 1;
			this.statusDragFromIndex = null;
			void this.moveStatusTo(from, to);
		});
		row.addEventListener('dragend', () => {
			this.statusDragFromIndex = null;
			row.removeClass(
				'dbench-statuses__row--dragging',
				'dbench-statuses__row--drop-before',
				'dbench-statuses__row--drop-after'
			);
		});

		if (index === this.statusFocusIndex) {
			queueMicrotask(() => row.focus());
		}
	}

	private async moveStatus(from: number, delta: number): Promise<void> {
		await this.moveStatusTo(from, from + delta);
	}

	private async moveStatusTo(from: number, to: number): Promise<void> {
		const vocab = this.plugin.settings.statusVocabulary;
		const clamped = Math.max(0, Math.min(vocab.length - 1, to));
		if (clamped === from) return;
		const [moved] = vocab.splice(from, 1);
		vocab.splice(clamped, 0, moved);
		this.statusFocusIndex = clamped;
		await this.plugin.saveSettings();
		this.display();
	}

	private async handleAddStatus(): Promise<void> {
		const vocab = this.plugin.settings.statusVocabulary;
		const base = 'new status';
		let candidate = base;
		let counter = 1;
		while (vocab.includes(candidate)) {
			counter += 1;
			candidate = `${base} ${counter}`;
		}
		vocab.push(candidate);
		this.statusFocusIndex = vocab.length - 1;
		await this.plugin.saveSettings();
		this.display();
	}

	private async handleRenameStatus(
		index: number,
		rawValue: string
	): Promise<void> {
		const vocab = this.plugin.settings.statusVocabulary;
		const current = vocab[index];
		const trimmed = rawValue.trim();

		if (trimmed === '') {
			new Notice('Status cannot be empty.');
			this.display();
			return;
		}
		if (trimmed === current) return;
		if (
			vocab.some((s, i) => i !== index && s === trimmed)
		) {
			new Notice(`Status "${trimmed}" already exists.`);
			this.display();
			return;
		}

		// Migrate any notes using the old value to the new one, so
		// renaming a still-in-use status stays non-destructive.
		const affected = countStatusUsage(this.app, current);
		if (affected > 0) {
			await this.plugin.linker.withSuspended(() =>
				renameStatus(this.app, current, trimmed)
			);
		}
		vocab[index] = trimmed;
		await this.plugin.saveSettings();
		if (affected > 0) {
			const noun = affected === 1 ? 'note' : 'notes';
			new Notice(
				`✓ Renamed status on ${affected} ${noun}: ${current} -> ${trimmed}`
			);
		}
		this.display();
	}

	private async handleRemoveStatus(index: number): Promise<void> {
		const vocab = this.plugin.settings.statusVocabulary;
		if (vocab.length <= 1) {
			new Notice('At least one status is required.');
			return;
		}
		const target = vocab[index];
		const usage = countStatusUsage(this.app, target);

		if (usage === 0) {
			vocab.splice(index, 1);
			this.statusFocusIndex = Math.max(0, Math.min(index, vocab.length - 1));
			await this.plugin.saveSettings();
			this.display();
			return;
		}

		const others = vocab.filter((_, i) => i !== index);
		const result = await RemoveStatusModal.open(this.app, {
			status: target,
			count: usage,
			otherStatuses: others,
		});
		if (result === null) return;

		if (result.renameTo !== null) {
			const changed = await this.plugin.linker.withSuspended(() =>
				renameStatus(this.app, target, result.renameTo as string)
			);
			const noun = changed === 1 ? 'note' : 'notes';
			new Notice(
				`✓ Migrated ${changed} ${noun}: ${target} -> ${result.renameTo}`
			);
		}

		vocab.splice(index, 1);
		this.statusFocusIndex = Math.max(0, Math.min(index, vocab.length - 1));
		await this.plugin.saveSettings();
		this.display();
	}

	private renderSync(container: HTMLElement): void {
		const { settings } = this.plugin;

		new Setting(container)
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

		new Setting(container)
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

	private renderAbout(container: HTMLElement): void {
		new Setting(container)
			.setName('Version')
			.setDesc(this.plugin.manifest.version);

		new Setting(container)
			.setName('Repository')
			.setDesc('github.com/banisterious/obsidian-draft-bench');
	}

	private restartLinker(): void {
		this.plugin.linker.stop();
		this.plugin.linker.start();
	}
}
