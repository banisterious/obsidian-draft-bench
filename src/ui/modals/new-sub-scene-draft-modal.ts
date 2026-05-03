import { App, Modal, Notice, type TFile } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import type { DraftBenchLinker } from '../../core/linker';
import {
	createSubSceneDraft,
	resolveSubSceneDraftPaths,
} from '../../core/sub-scene-drafts';
import type { SubSceneNote } from '../../core/discovery';

/**
 * "New draft of this sub-scene" confirm-and-execute modal.
 *
 * Shows a preview of the computed draft number and target filename,
 * then snapshots the sub-scene via `createSubSceneDraft` on confirm.
 * Runs inside `linker.withSuspended(...)` so the two-file write (new
 * draft + sub-scene reverse-array append) doesn't trigger intermediate
 * sync.
 *
 * Mirrors `NewDraftModal` and `NewChapterDraftModal` for the sub-scene
 * side per [sub-scene-type.md § 4](../../../docs/planning/sub-scene-type.md).
 */
export class NewSubSceneDraftModal extends Modal {
	private submitButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private settings: DraftBenchSettings,
		private linker: DraftBenchLinker,
		private subScene: SubSceneNote
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'New draft of this sub-scene' });

		const preview = resolveSubSceneDraftPaths(
			this.app,
			this.settings,
			this.subScene
		);

		contentEl.createEl('p', {
			text: `Snapshot ${this.subScene.file.basename} as Draft ${preview.draftNumber}?`,
		});

		const detail = contentEl.createEl('p', {
			cls: 'dbench-new-sub-scene-draft-modal__detail',
		});
		detail.createEl('span', {
			text: 'The snapshot will be saved to ',
		});
		detail.createEl('code', { text: preview.filePath });
		detail.createEl('span', {
			text: '. Your sub-scene note is unchanged.',
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
			button.textContent = 'Creating…';
		}

		try {
			const file = await this.linker.withSuspended(() =>
				createSubSceneDraft(this.app, this.settings, {
					subScene: this.subScene,
				})
			);

			const number = this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				'dbench-draft-number'
			];
			new Notice(
				`✓ Created Draft ${number} of ${this.subScene.file.basename}`
			);
			this.close();
			await this.openDraftNote(file);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not create sub-scene draft. ${message}`);
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
