import { App, Modal, Notice, type TFile } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import type { DraftBenchLinker } from '../../core/linker';
import { createDraft, resolveDraftPaths } from '../../core/drafts';
import type { SceneNote } from '../../core/discovery';

/**
 * "New draft of this scene" confirm-and-execute modal.
 *
 * Shows a preview of the computed draft number and filename, then
 * snapshots the scene via `createDraft` on confirm. Runs inside
 * `linker.withSuspended(...)` so the two-file write (new draft +
 * scene reverse-array append) doesn't trigger intermediate sync.
 */
export class NewDraftModal extends Modal {
	private submitButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private settings: DraftBenchSettings,
		private linker: DraftBenchLinker,
		private scene: SceneNote
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'New draft of this scene' });

		const preview = resolveDraftPaths(this.app, this.settings, this.scene);

		contentEl.createEl('p', {
			text: `Snapshot ${this.scene.file.basename} as Draft ${preview.draftNumber}?`,
		});

		const detail = contentEl.createEl('p', {
			cls: 'dbench-new-draft-modal__detail',
		});
		detail.createEl('span', { text: 'The snapshot will be saved to ' });
		detail.createEl('code', { text: preview.filePath });
		detail.createEl('span', {
			text: '. Your scene note stays as the working draft.',
		});

		const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelButton = buttonRow.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());

		const submitButton = buttonRow.createEl('button', {
			text: 'Create draft',
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
			const file = await this.linker.withSuspended(() =>
				createDraft(this.app, this.settings, { scene: this.scene })
			);

			const number = this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				'dbench-draft-number'
			];
			new Notice(
				`\u2713 Created Draft ${number} of ${this.scene.file.basename}`
			);
			this.close();
			await this.openDraftNote(file);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not create draft. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Create draft';
			}
		}
	}

	private async openDraftNote(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}
