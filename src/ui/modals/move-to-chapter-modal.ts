import { App, Modal, Notice, Setting } from 'obsidian';
import {
	findChaptersInProject,
	type ChapterNote,
	type SceneNote,
} from '../../core/discovery';
import { moveSceneToChapter } from '../../core/move-to-chapter';

/**
 * "Move to chapter" form modal for a single scene.
 *
 * Lists chapters in the scene's project; defaults to the scene's
 * current chapter when set. Apply writes `dbench-chapter` +
 * `dbench-chapter-id` on the scene; the linker handles reverse-array
 * updates on the source and target chapters.
 *
 * Single-file scope per chapter-type Q2 deferral; multi-select bulk
 * moves are post-V1.
 */
export class MoveToChapterModal extends Modal {
	private chapters: ChapterNote[];
	private selectedChapterId: string;
	private submitButton: HTMLButtonElement | null = null;

	constructor(app: App, private scene: SceneNote) {
		super(app);
		this.chapters = sortChapters(
			findChaptersInProject(app, scene.frontmatter['dbench-project-id'])
		);
		const currentChapterId = readCurrentChapterId(scene);
		this.selectedChapterId =
			currentChapterId ?? this.chapters[0]?.frontmatter['dbench-id'] ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Move to chapter' });

		if (this.chapters.length === 0) {
			contentEl.createEl('p', {
				text: 'This scene’s project has no chapters yet. Create a chapter first via the command palette.',
			});
			const closeButton = contentEl.createEl('button', {
				text: 'Close',
				cls: 'mod-cta',
			});
			closeButton.addEventListener('click', () => this.close());
			return;
		}

		new Setting(contentEl)
			.setName('Scene')
			.setDesc(this.scene.file.basename);

		new Setting(contentEl)
			.setName('Target chapter')
			.setDesc('Pick the chapter this scene should belong to.')
			.addDropdown((dropdown) => {
				for (const c of this.chapters) {
					dropdown.addOption(
						c.frontmatter['dbench-id'],
						c.file.basename
					);
				}
				dropdown.setValue(this.selectedChapterId).onChange((value) => {
					this.selectedChapterId = value;
				});
			});

		const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelButton = buttonRow.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());

		const submitButton = buttonRow.createEl('button', {
			text: 'Move',
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
			button.textContent = 'Moving…';
		}

		try {
			const target = this.chapters.find(
				(c) => c.frontmatter['dbench-id'] === this.selectedChapterId
			);
			if (!target) {
				throw new Error('Selected chapter no longer exists.');
			}

			await moveSceneToChapter(this.app, this.scene, target);

			new Notice(`✓ Moved ${this.scene.file.basename} to ${target.file.basename}`);
			this.close();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not move scene. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Move';
			}
		}
	}
}

function sortChapters(chapters: ChapterNote[]): ChapterNote[] {
	return [...chapters].sort(
		(a, b) =>
			(a.frontmatter['dbench-order'] ?? 0) -
			(b.frontmatter['dbench-order'] ?? 0)
	);
}

/**
 * Read the scene's current `dbench-chapter-id` defensively. The field
 * is optional on `SceneFrontmatter` (chapter-less scenes don't carry
 * it), so we read through an unknown cast.
 */
function readCurrentChapterId(scene: SceneNote): string | null {
	const fm = scene.frontmatter as unknown as Record<string, unknown>;
	const id = fm['dbench-chapter-id'];
	return typeof id === 'string' && id !== '' ? id : null;
}
