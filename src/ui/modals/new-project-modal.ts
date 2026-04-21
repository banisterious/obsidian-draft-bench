import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type { ProjectShape } from '../../model/types';
import type { DraftBenchSettings } from '../../model/settings';
import { createProject } from '../../core/projects';

/**
 * "Create project" form modal.
 *
 * Collects title, shape, and (optional) location override, then calls
 * `core/projects.createProject`. On success, opens the new project
 * note in a new leaf and shows a success notice. On failure, shows
 * an error notice and leaves the modal open so the user can correct.
 */
export class NewProjectModal extends Modal {
	private titleInput = '';
	private shape: ProjectShape = 'folder';
	private locationInput: string;
	private submitButton: HTMLButtonElement | null = null;

	constructor(app: App, private settings: DraftBenchSettings) {
		super(app);
		this.locationInput = settings.projectsFolder;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Create project' });

		new Setting(contentEl)
			.setName('Title')
			.setDesc('The name of your project. Used as the project note\'s filename.')
			.addText((text) =>
				text.setPlaceholder('My novel').onChange((value) => {
					this.titleInput = value;
				})
			);

		new Setting(contentEl)
			.setName('Shape')
			.setDesc(
				'Folder: a folder containing scene notes. Single-scene: one note that is the whole work (flash fiction, poems).'
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('folder', 'Folder')
					.addOption('single', 'Single scene')
					.setValue(this.shape)
					.onChange((value) => {
						this.shape = value as ProjectShape;
					})
			);

		new Setting(contentEl)
			.setName('Location')
			.setDesc(
				'Where to create the project. The {project} token is replaced with the title.'
			)
			.addText((text) =>
				text
					.setPlaceholder(this.settings.projectsFolder)
					.setValue(this.locationInput)
					.onChange((value) => {
						this.locationInput = value;
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
			button.textContent = 'Creating\u2026';
		}

		try {
			const file = await createProject(this.app, this.settings, {
				title: this.titleInput,
				shape: this.shape,
				location: this.locationInput,
			});

			new Notice(`\u2713 Created project ${file.basename}`);
			this.close();
			await this.openProjectNote(file);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not create project. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Create';
			}
		}
	}

	private async openProjectNote(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}
