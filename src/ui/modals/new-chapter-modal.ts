import { App, Modal, Notice, Setting, type TFile } from 'obsidian';
import type { DbenchStatus } from '../../model/types';
import type { DraftBenchSettings } from '../../model/settings';
import { createChapter } from '../../core/chapters';
import { findProjects, type ProjectNote } from '../../core/discovery';
import type { DraftBenchLinker } from '../../core/linker';

/**
 * "New chapter in project" form modal.
 *
 * Mirrors `NewSceneModal`: project picker (dropdown of all
 * discoverable projects), title, optional order, and initial status.
 * Submit runs `createChapter` inside `linker.withSuspended(...)` so
 * the linker doesn't react to the intermediate two-file write
 * state (new chapter file + project's reverse-array append).
 *
 * The chapter template is writer-customizable: the built-in body lives
 * at `BUILTIN_CHAPTER_TEMPLATE` in `src/core/templates.ts`, seeded as
 * `<templatesFolder>/chapter-template.md` on first chapter creation.
 * Settings.chapterTemplatePath overrides the path; Templater runs
 * pass-through when installed.
 *
 * Mixed-children rule: per chapter-type.md § 9, a project that
 * already has direct scenes (scenes without a chapter parent)
 * cannot gain chapters until those scenes are moved into chapters
 * first. `createChapter` throws on that case; the modal surfaces
 * the message via Notice and re-enables the submit button so the
 * writer can cancel and run "Move to chapter" against the orphan
 * scenes instead.
 */
export class NewChapterModal extends Modal {
	private projects: ProjectNote[];
	private selectedProjectId = '';
	private titleInput = '';
	private orderInput = '';
	private status: DbenchStatus;
	private submitButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private settings: DraftBenchSettings,
		private linker: DraftBenchLinker,
		initialProject: ProjectNote | null = null
	) {
		super(app);
		this.projects = findProjects(app);
		this.selectedProjectId =
			initialProject?.frontmatter['dbench-id'] ??
			this.projects[0]?.frontmatter['dbench-id'] ??
			'';
		this.status = settings.statusVocabulary[0];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'New chapter in project' });

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
			.setDesc('The project this chapter belongs to.')
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
			.setDesc("The chapter's title; used as the chapter note's filename.")
			.addText((text) =>
				text.setPlaceholder('The departure').onChange((value) => {
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
				createChapter(this.app, this.settings, {
					project,
					title: this.titleInput,
					order,
					status: this.status,
				})
			);

			new Notice(`✓ Created chapter ${file.basename}`);
			this.close();
			await this.openChapterNote(file);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not create chapter. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Create';
			}
		}
	}

	private async openChapterNote(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}

function capitalize(s: string): string {
	if (s.length === 0) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}
