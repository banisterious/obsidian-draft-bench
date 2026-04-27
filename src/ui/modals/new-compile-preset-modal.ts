import { App, Modal, Notice, Setting, type TFile } from 'obsidian';
import type { DraftBenchLinker } from '../../core/linker';
import { createCompilePreset } from '../../core/compile-presets';
import { findProjects, type ProjectNote } from '../../core/discovery';
import type { CompileFormat } from '../../model/compile-preset';

/**
 * "Create compile preset" form modal.
 *
 * Three fields per D-06 § UI surfaces: preset name (becomes filename),
 * project (dropdown of all discoverable projects, pre-selected from
 * file context when available), and output format (radio md / pdf /
 * odt, default md).
 *
 * On submit: creates the preset note via `createCompilePreset` inside
 * `linker.withSuspended(...)` so the linker doesn't react to the
 * two-file write (new preset + project reverse-array append) as
 * separate events.
 *
 * Compile-as-artifact: all other preset fields (metadata, inclusion
 * filters, content-handling overrides, state) are stamped with defaults
 * by `stampCompilePresetEssentials`. Writers tune them via the
 * Properties panel or the Compile tab form after creation.
 */
export class NewCompilePresetModal extends Modal {
	private projects: ProjectNote[];
	private selectedProjectId: string;
	private nameInput = '';
	private format: CompileFormat = 'md';
	private submitButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private linker: DraftBenchLinker,
		initialProject: ProjectNote | null = null
	) {
		super(app);
		this.projects = findProjects(app);
		this.selectedProjectId =
			initialProject?.frontmatter['dbench-id'] ??
			this.projects[0]?.frontmatter['dbench-id'] ??
			'';
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Create compile preset' });

		if (this.projects.length === 0) {
			contentEl.createEl('p', {
				text: 'No projects exist yet. Create a project first, then come back here to add a compile preset.',
			});
			const closeButton = contentEl.createEl('button', {
				text: 'Close',
				cls: 'mod-cta',
			});
			closeButton.addEventListener('click', () => this.close());
			return;
		}

		new Setting(contentEl)
			.setName('Name')
			.setDesc("The preset's name. Used as the preset note's filename.")
			.addText((text) =>
				text.setPlaceholder('Workshop draft').onChange((value) => {
					this.nameInput = value;
				})
			);

		new Setting(contentEl)
			.setName('Project')
			.setDesc('The project this preset compiles.')
			.addDropdown((dropdown) => {
				for (const p of this.projects) {
					dropdown.addOption(
						p.frontmatter['dbench-id'],
						p.file.basename
					);
				}
				dropdown.setValue(this.selectedProjectId).onChange((value) => {
					this.selectedProjectId = value;
				});
			});

		new Setting(contentEl)
			.setName('Output format')
			.setDesc(
				'Markdown compiles into the vault; other formats export through a save dialog.'
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('md', 'Markdown')
					.addOption('pdf', 'PDF')
					.addOption('odt', 'ODT')
					.addOption('docx', 'DOCX')
					.setValue(this.format)
					.onChange((value) => {
						this.format = value as CompileFormat;
					})
			);

		const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelButton = buttonRow.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());

		const submitButton = buttonRow.createEl('button', {
			text: 'Create',
			cls: 'mod-cta',
		});
		submitButton.addEventListener('click', () => {
			void this.handleSubmit();
		});
		this.submitButton = submitButton;
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async handleSubmit(): Promise<void> {
		const button = this.submitButton;
		if (button) {
			button.disabled = true;
			button.textContent = 'Creating…';
		}

		try {
			const project = this.projects.find(
				(p) => p.frontmatter['dbench-id'] === this.selectedProjectId
			);
			if (!project) {
				throw new Error('Select a project before creating a preset.');
			}

			const { file } = await this.linker.withSuspended(() =>
				createCompilePreset(this.app, {
					name: this.nameInput,
					project,
					format: this.format,
				})
			);

			new Notice(`✓ Created compile preset ${file.basename}`);
			this.close();
			await this.openPresetNote(file);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not create compile preset. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Create';
			}
		}
	}

	private async openPresetNote(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}
