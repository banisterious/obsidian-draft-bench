import { App, Modal, Notice, Setting, type TFile } from 'obsidian';
import type { DbenchStatus } from '../../model/types';
import { DBENCH_STATUSES } from '../../model/types';
import type { DraftBenchSettings } from '../../model/settings';
import { createScene } from '../../core/scenes';
import { findProjects, type ProjectNote } from '../../core/discovery';
import type { DraftBenchLinker } from '../../core/linker';

/**
 * "New scene in project" form modal.
 *
 * Project picker (dropdown of all discoverable projects), title,
 * optional order, and initial status. Submit runs createScene
 * inside `linker.withSuspended(...)` so the linker doesn't react
 * to the intermediate two-file write state.
 */
export class NewSceneModal extends Modal {
	private projects: ProjectNote[];
	private selectedProjectId = '';
	private titleInput = '';
	private orderInput = '';
	private status: DbenchStatus = 'idea';
	private submitButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private settings: DraftBenchSettings,
		private linker: DraftBenchLinker
	) {
		super(app);
		this.projects = findProjects(app);
		if (this.projects.length > 0) {
			this.selectedProjectId = this.projects[0].frontmatter['dbench-id'];
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'New scene in project' });

		if (this.projects.length === 0) {
			contentEl.createEl('p', {
				text: 'No projects exist yet. Create a project first via the command palette.',
			});
			const closeButton = contentEl.createEl('button', {
				text: 'Close',
				cls: 'mod-cta',
			});
			closeButton.addEventListener('click', () => this.close());
			return;
		}

		new Setting(contentEl)
			.setName('Project')
			.setDesc('The project this scene belongs to.')
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
			.setName('Title')
			.setDesc("The scene's title; used as the scene note's filename.")
			.addText((text) =>
				text.setPlaceholder('Chapter one').onChange((value) => {
					this.titleInput = value;
				})
			);

		new Setting(contentEl)
			.setName('Order')
			.setDesc('Position in story order. Leave blank to add at the end.')
			.addText((text) => {
				text.inputEl.type = 'number';
				text.setPlaceholder('Next available').onChange((value) => {
					this.orderInput = value;
				});
			});

		new Setting(contentEl)
			.setName('Status')
			.setDesc('Initial workflow status.')
			.addDropdown((dropdown) => {
				for (const s of DBENCH_STATUSES) {
					dropdown.addOption(s, s);
				}
				dropdown.setValue(this.status).onChange((value) => {
					this.status = value as DbenchStatus;
				});
			});

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
			const project = this.projects.find(
				(p) => p.frontmatter['dbench-id'] === this.selectedProjectId
			);
			if (!project) {
				throw new Error('Selected project no longer exists.');
			}

			const order = this.orderInput.trim() === ''
				? undefined
				: Number.parseInt(this.orderInput, 10);
			if (order !== undefined && Number.isNaN(order)) {
				throw new Error('Order must be a number.');
			}

			const file = await this.linker.withSuspended(() =>
				createScene(this.app, this.settings, {
					project,
					title: this.titleInput,
					order,
					status: this.status,
				})
			);

			new Notice(`\u2713 Created scene ${file.basename}`);
			this.close();
			await this.openSceneNote(file);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not create scene. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Create';
			}
		}
	}

	private async openSceneNote(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}
