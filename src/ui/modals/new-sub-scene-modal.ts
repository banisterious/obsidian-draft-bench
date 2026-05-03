import { App, Modal, Notice, Setting, type TFile } from 'obsidian';
import type { DbenchStatus } from '../../model/types';
import type { DraftBenchSettings } from '../../model/settings';
import { createSubScene, nextSubSceneOrder } from '../../core/sub-scenes';
import type { ProjectNote, SceneNote } from '../../core/discovery';
import type { DraftBenchLinker } from '../../core/linker';
import {
	discoverTemplates,
	type TemplateInfo,
} from '../../core/templates';

/**
 * "New sub-scene in scene" form modal.
 *
 * Invoked from the scene-card affordance (per [sub-scene-type.md § 6](../../../docs/planning/sub-scene-type.md))
 * with both `project` and `scene` known up front — no project picker.
 * Title placeholder defaults to `Sub-scene <next-order>` per the
 * resolved open question on title defaults; the writer almost always
 * replaces it. Submit runs `createSubScene` inside
 * `linker.withSuspended(...)` so the linker doesn't react to the
 * intermediate two-file write state.
 */
export class NewSubSceneModal extends Modal {
	private templates: TemplateInfo[];
	private selectedTemplatePath = '';
	private titleInput = '';
	private orderInput = '';
	private status: DbenchStatus;
	private submitButton: HTMLButtonElement | null = null;
	private titlePlaceholder: string;

	constructor(
		app: App,
		private settings: DraftBenchSettings,
		private linker: DraftBenchLinker,
		private project: ProjectNote,
		private scene: SceneNote
	) {
		super(app);
		this.templates = discoverTemplates(app, settings, 'sub-scene');
		if (this.templates.length > 0) {
			this.selectedTemplatePath = this.templates[0].file.path;
		}
		this.status = settings.statusVocabulary[0];
		const next = nextSubSceneOrder(app, scene.frontmatter['dbench-id']);
		this.titlePlaceholder = `Sub-scene ${next}`;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'New sub-scene in scene' });

		new Setting(contentEl)
			.setName('Parent scene')
			.setDesc('The scene this sub-scene belongs to.')
			.addText((text) => {
				text.setValue(this.scene.file.basename).setDisabled(true);
			});

		// Template picker — same surfacing rule as NewSceneModal: shown
		// only when at least one custom (non-default) template exists.
		if (this.templates.some((t) => !t.isDefault)) {
			new Setting(contentEl)
				.setName('Template')
				.setDesc(
					'Body template applied to the new sub-scene. The default seeds the built-in template; custom templates need `dbench-template-type: sub-scene` in their frontmatter to appear here.'
				)
				.addDropdown((dropdown) => {
					for (const tpl of this.templates) {
						const label = tpl.isDefault
							? `${tpl.name} (default)`
							: tpl.name;
						dropdown.addOption(tpl.file.path, label);
					}
					dropdown
						.setValue(this.selectedTemplatePath)
						.onChange((value) => {
							this.selectedTemplatePath = value;
						});
				});
		}

		new Setting(contentEl)
			.setName('Title')
			.setDesc("The sub-scene's title; used as the sub-scene note's filename.")
			.addText((text) =>
				text
					.setPlaceholder(this.titlePlaceholder)
					.onChange((value) => {
						this.titleInput = value;
					})
			);

		new Setting(contentEl)
			.setName('Order')
			.setDesc('Position within the parent scene. Leave blank to add at the end.')
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
				for (const s of this.settings.statusVocabulary) {
					dropdown.addOption(s, capitalize(s));
				}
				dropdown.setValue(this.status).onChange((value) => {
					this.status = value;
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
			button.textContent = 'Creating…';
		}

		try {
			const order = this.orderInput.trim() === ''
				? undefined
				: Number.parseInt(this.orderInput, 10);
			if (order !== undefined && Number.isNaN(order)) {
				throw new Error('Order must be a number.');
			}

			const title =
				this.titleInput.trim() === '' ? this.titlePlaceholder : this.titleInput;

			const templateFile = this.templates.find(
				(t) => t.file.path === this.selectedTemplatePath
			)?.file;

			const file = await this.linker.withSuspended(() =>
				createSubScene(this.app, this.settings, {
					project: this.project,
					scene: this.scene,
					title,
					order,
					status: this.status,
					templateFile,
				})
			);

			new Notice(`✓ Created sub-scene ${file.basename}`);
			this.close();
			await this.openNote(file);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not create sub-scene. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Create';
			}
		}
	}

	private async openNote(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}

function capitalize(s: string): string {
	if (s.length === 0) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}
