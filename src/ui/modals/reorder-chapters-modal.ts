import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type { DraftBenchLinker } from '../../core/linker';
import { reorderChapters } from '../../core/reorder';
import {
	findChaptersInProject,
	findProjects,
	type ChapterNote,
	type ProjectNote,
} from '../../core/discovery';

/**
 * "Reorder chapters" modal.
 *
 * Mirrors `ReorderScenesModal` for chapter notes per chapter-type.md
 * § 8 ("single Reorder modal parameterized by parent scope").
 * Sibling implementation rather than a shared generic for now —
 * with two reorder contexts (scenes-in-project, chapters-in-project)
 * the duplication is light; the natural genericize trigger is the
 * third context (scenes-in-chapter, deferred per the Step 9 plan).
 *
 * - Project picker at top (pre-selected from the active file when
 *   it belongs to a project).
 * - Scrollable chapter list in current `dbench-order`.
 * - Per row: drag handle, position number, title, status.
 * - Mouse: grab the handle and drag; drop indicators mark the target slot.
 * - Keyboard: focus a row and press up/down (or k/j) to move the row.
 * - Apply writes via `core/reorder` inside `linker.withSuspended(...)`.
 */
export class ReorderChaptersModal extends Modal {
	private projects: ProjectNote[];
	private selectedProject: ProjectNote | null = null;
	private ordered: ChapterNote[] = [];
	private listEl: HTMLOListElement | null = null;
	private applyButton: HTMLButtonElement | null = null;
	private focusedIndex = 0;
	private dragFromIndex: number | null = null;

	constructor(
		app: App,
		private linker: DraftBenchLinker,
		initialProject: ProjectNote | null
	) {
		super(app);
		this.projects = findProjects(app);
		this.selectedProject =
			initialProject ??
			(this.projects.length > 0 ? this.projects[0] : null);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dbench-reorder-modal');

		contentEl.createEl('h2', { text: 'Reorder chapters' });

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
			.setDesc('Which project to reorder.')
			.addDropdown((dropdown) => {
				for (const p of this.projects) {
					dropdown.addOption(
						p.frontmatter['dbench-id'],
						p.file.basename
					);
				}
				if (this.selectedProject) {
					dropdown.setValue(this.selectedProject.frontmatter['dbench-id']);
				}
				dropdown.onChange((value) => {
					this.selectedProject =
						this.projects.find(
							(p) => p.frontmatter['dbench-id'] === value
						) ?? null;
					this.loadChapters();
					this.renderList();
				});
			});

		contentEl.createEl('p', {
			cls: 'dbench-reorder-modal__hint',
			text: 'Drag a chapter by its handle, or focus a row and use the up or down arrow keys (or j/k).',
		});

		this.listEl = contentEl.createEl('ol', {
			cls: 'dbench-reorder-modal__list',
			attr: { role: 'listbox', 'aria-label': 'Chapters in story order' },
		});

		this.loadChapters();
		this.renderList();

		const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelButton = buttonRow.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonRow.createEl('button', {
			text: 'Apply order',
			cls: 'mod-cta',
		});
		applyButton.addEventListener('click', () => {
			void this.handleApply();
		});
		this.applyButton = applyButton;
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private loadChapters(): void {
		if (!this.selectedProject) {
			this.ordered = [];
			return;
		}
		const chapters = findChaptersInProject(
			this.app,
			this.selectedProject.frontmatter['dbench-id']
		);
		this.ordered = [...chapters].sort(
			(a, b) =>
				(a.frontmatter['dbench-order'] ?? 0) -
				(b.frontmatter['dbench-order'] ?? 0)
		);
		this.focusedIndex = 0;
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();

		if (this.ordered.length === 0) {
			this.listEl.createEl('li', {
				cls: 'dbench-reorder-modal__empty',
				text: 'This project has no chapters yet.',
			});
			if (this.applyButton) this.applyButton.disabled = true;
			return;
		}

		if (this.applyButton) this.applyButton.disabled = false;

		this.ordered.forEach((chapter, index) => {
			const row = this.listEl!.createEl('li', {
				cls: 'dbench-reorder-modal__row',
				attr: {
					role: 'option',
					tabindex: index === this.focusedIndex ? '0' : '-1',
					'aria-selected': index === this.focusedIndex ? 'true' : 'false',
					draggable: 'true',
				},
			});

			const handle = row.createEl('span', {
				cls: 'dbench-reorder-modal__handle',
				attr: {
					'aria-hidden': 'true',
					title: 'Drag to reorder',
				},
			});
			setIcon(handle, 'grip-vertical');

			row.createEl('span', {
				cls: 'dbench-reorder-modal__position',
				text: `${index + 1}.`,
			});
			row.createEl('span', {
				cls: 'dbench-reorder-modal__title',
				text: chapter.file.basename,
			});
			row.createEl('span', {
				cls: 'dbench-reorder-modal__status',
				text: String(chapter.frontmatter['dbench-status'] ?? ''),
			});

			row.addEventListener('keydown', (ev) => {
				if (ev.target !== row) return;
				if (ev.key === 'ArrowUp' || ev.key === 'k' || ev.key === 'K') {
					ev.preventDefault();
					this.moveBy(index, -1);
				} else if (
					ev.key === 'ArrowDown' ||
					ev.key === 'j' ||
					ev.key === 'J'
				) {
					ev.preventDefault();
					this.moveBy(index, 1);
				}
			});
			row.addEventListener('focus', () => {
				this.focusedIndex = index;
				for (const sibling of Array.from(
					this.listEl!.children
				) as HTMLElement[]) {
					sibling.setAttribute(
						'aria-selected',
						sibling === row ? 'true' : 'false'
					);
				}
			});

			row.addEventListener('dragstart', (ev) => {
				this.dragFromIndex = index;
				row.addClass('dbench-reorder-modal__row--dragging');
				if (ev.dataTransfer) {
					ev.dataTransfer.effectAllowed = 'move';
					ev.dataTransfer.setData('text/plain', String(index));
				}
			});
			row.addEventListener('dragover', (ev) => {
				if (this.dragFromIndex === null) return;
				ev.preventDefault();
				if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
				const rect = row.getBoundingClientRect();
				const before = ev.clientY - rect.top < rect.height / 2;
				row.removeClass('dbench-reorder-modal__row--drop-before', 'dbench-reorder-modal__row--drop-after');
				row.addClass(
					before
						? 'dbench-reorder-modal__row--drop-before'
						: 'dbench-reorder-modal__row--drop-after'
				);
			});
			row.addEventListener('dragleave', () => {
				row.removeClass('dbench-reorder-modal__row--drop-before', 'dbench-reorder-modal__row--drop-after');
			});
			row.addEventListener('drop', (ev) => {
				ev.preventDefault();
				row.removeClass('dbench-reorder-modal__row--drop-before', 'dbench-reorder-modal__row--drop-after');
				const from = this.dragFromIndex;
				if (from === null || from === index) return;
				const rect = row.getBoundingClientRect();
				const before = ev.clientY - rect.top < rect.height / 2;
				let to = before ? index : index + 1;
				if (from < to) to -= 1;
				this.dragFromIndex = null;
				this.moveTo(from, to);
			});
			row.addEventListener('dragend', () => {
				this.dragFromIndex = null;
				row.removeClass('dbench-reorder-modal__row--dragging', 'dbench-reorder-modal__row--drop-before', 'dbench-reorder-modal__row--drop-after');
				for (const sibling of Array.from(
					this.listEl!.children
				) as HTMLElement[]) {
					sibling.removeClass('dbench-reorder-modal__row--drop-before', 'dbench-reorder-modal__row--drop-after');
				}
			});

			if (index === this.focusedIndex) {
				queueMicrotask(() => row.focus());
			}
		});
	}

	private moveBy(from: number, delta: number): void {
		this.moveTo(from, from + delta);
	}

	private moveTo(from: number, to: number): void {
		if (this.ordered.length === 0) return;
		const clamped = Math.max(0, Math.min(this.ordered.length - 1, to));
		if (clamped === from) return;
		const [row] = this.ordered.splice(from, 1);
		this.ordered.splice(clamped, 0, row);
		this.focusedIndex = clamped;
		this.renderList();
	}

	private async handleApply(): Promise<void> {
		if (this.ordered.length === 0) {
			this.close();
			return;
		}
		const button = this.applyButton;
		if (button) {
			button.disabled = true;
			button.textContent = 'Applying…';
		}
		try {
			const changed = await this.linker.withSuspended(() =>
				reorderChapters(this.app, this.ordered)
			);
			if (changed === 0) {
				new Notice('Chapter order was already up to date.');
			} else {
				const suffix = changed === 1 ? 'chapter' : 'chapters';
				new Notice(`✓ Reordered ${changed} ${suffix}.`);
			}
			this.close();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not apply order. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Apply order';
			}
		}
	}
}
