import { App, Modal, Notice, Setting } from 'obsidian';
import {
	findScenesInProject,
	type SceneNote,
	type SubSceneNote,
} from '../../core/discovery';
import { moveSubSceneToScene } from '../../core/move-to-scene';

/**
 * "Move to scene" form modal for a single sub-scene.
 *
 * Lists scenes in the sub-scene's project; defaults to the sub-scene's
 * current parent scene. Apply writes `dbench-scene` + `dbench-scene-id`
 * on the sub-scene; the linker handles reverse-array updates on the
 * source and target scenes (per Step 4's sub-scene RelationshipConfig).
 *
 * Single-file scope mirroring `MoveToChapterModal`; multi-select bulk
 * moves are post-V1 per [sub-scene-type.md § 8](../../../docs/planning/sub-scene-type.md).
 */
export class MoveToSceneModal extends Modal {
	private scenes: SceneNote[];
	private selectedSceneId: string;
	private submitButton: HTMLButtonElement | null = null;

	constructor(app: App, private subScene: SubSceneNote) {
		super(app);
		this.scenes = sortScenes(
			findScenesInProject(app, subScene.frontmatter['dbench-project-id'] || '')
		);
		const currentSceneId = subScene.frontmatter['dbench-scene-id'];
		this.selectedSceneId =
			(typeof currentSceneId === 'string' && currentSceneId !== ''
				? currentSceneId
				: this.scenes[0]?.frontmatter['dbench-id']) ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Move to scene' });

		if (this.scenes.length === 0) {
			contentEl.createEl('p', {
				text: 'This sub-scene’s project has no other scenes. Create a scene first via the command palette.',
			});
			const closeButton = contentEl.createEl('button', {
				text: 'Close',
				cls: 'mod-cta',
			});
			closeButton.addEventListener('click', () => this.close());
			return;
		}

		new Setting(contentEl)
			.setName('Sub-scene')
			.setDesc(this.subScene.file.basename);

		new Setting(contentEl)
			.setName('Target scene')
			.setDesc('Pick the scene this sub-scene should belong to.')
			.addDropdown((dropdown) => {
				for (const s of this.scenes) {
					dropdown.addOption(
						s.frontmatter['dbench-id'],
						s.file.basename
					);
				}
				dropdown.setValue(this.selectedSceneId).onChange((value) => {
					this.selectedSceneId = value;
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
			const target = this.scenes.find(
				(s) => s.frontmatter['dbench-id'] === this.selectedSceneId
			);
			if (!target) {
				throw new Error('Selected scene no longer exists.');
			}

			await moveSubSceneToScene(this.app, this.subScene, target);

			new Notice(
				`✓ Moved ${this.subScene.file.basename} to ${target.file.basename}`
			);
			this.close();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not move sub-scene. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Move';
			}
		}
	}
}

function sortScenes(scenes: SceneNote[]): SceneNote[] {
	return [...scenes].sort(
		(a, b) =>
			(a.frontmatter['dbench-order'] ?? 0) -
			(b.frontmatter['dbench-order'] ?? 0)
	);
}
