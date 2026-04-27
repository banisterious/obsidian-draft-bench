import { App, Modal, Notice, type TFile } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import type { DraftBenchLinker } from '../../core/linker';
import {
	createChapterDraft,
	resolveChapterDraftPaths,
} from '../../core/chapter-drafts';
import type { ChapterNote } from '../../core/discovery';

/**
 * "New draft of this chapter" confirm-and-execute modal.
 *
 * Shows a preview of the computed draft number and target filename,
 * then snapshots the chapter via `createChapterDraft` on confirm.
 * Runs inside `linker.withSuspended(...)` so the two-file write (new
 * draft + chapter reverse-array append) doesn't trigger intermediate
 * sync.
 *
 * Mirrors `NewDraftModal` for the chapter side per
 * [chapter-type.md § 4](../../../docs/planning/chapter-type.md).
 */
export class NewChapterDraftModal extends Modal {
	private submitButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private settings: DraftBenchSettings,
		private linker: DraftBenchLinker,
		private chapter: ChapterNote
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'New draft of this chapter' });

		const preview = resolveChapterDraftPaths(
			this.app,
			this.settings,
			this.chapter
		);

		contentEl.createEl('p', {
			text: `Snapshot ${this.chapter.file.basename} as Draft ${preview.draftNumber}?`,
		});

		const detail = contentEl.createEl('p', {
			cls: 'dbench-new-chapter-draft-modal__detail',
		});
		detail.createEl('span', {
			text: 'The snapshot will combine the chapter body with each scene in order, separated by scene boundary markers, and save to ',
		});
		detail.createEl('code', { text: preview.filePath });
		detail.createEl('span', {
			text: '. Your chapter and scene notes are unchanged.',
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
				createChapterDraft(this.app, this.settings, {
					chapter: this.chapter,
				})
			);

			const number = this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				'dbench-draft-number'
			];
			new Notice(
				`✓ Created Draft ${number} of ${this.chapter.file.basename}`
			);
			this.close();
			await this.openDraftNote(file);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not create chapter draft. ${message}`);
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
