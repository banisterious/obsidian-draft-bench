import { App, Modal, Notice, Setting, setIcon, type TFile } from 'obsidian';
import type { DraftBenchLinker } from '../../core/linker';

/**
 * Generic "reorder N items in a parent" modal, parameterized by a
 * `ReorderModalConfig`. Per [sub-scene-type.md § 8](../../../docs/planning/sub-scene-type.md):
 * the sub-scenes-in-scene context was the third reorder trigger, which
 * tipped the design toward genericization. Three contexts now share
 * this modal:
 *
 * - `Reorder chapters in project`
 * - `Reorder scenes` (in a project)
 * - `Reorder sub-scenes in scene`
 *
 * UX is identical across contexts: parent picker at top, scrollable
 * list of items in current `dbench-order`, drag handles + keyboard
 * (arrow keys, j/k) for moves, Apply commits the new order via the
 * caller-supplied `applyOrder` (run inside `linker.withSuspended`).
 */

export interface ReorderItem {
	file: TFile;
	frontmatter: { 'dbench-order': number; 'dbench-status'?: string };
}

export interface ReorderModalConfig<T extends ReorderItem> {
	/** Modal heading, e.g., "Reorder scenes". */
	title: string;
	/** Singular item label, e.g., "scene" — used in success/empty notices. */
	itemLabel: string;
	/** Plural item label, e.g., "scenes". */
	itemLabelPlural: string;
	/** Parent picker label, e.g., "Project" or "Scene". */
	parentLabel: string;
	/** Parent picker description text. */
	parentDesc: string;
	/** Hint text shown above the list (drag/keyboard guidance). */
	hint: string;
	/** ARIA label for the list, e.g., "Scenes in story order". */
	listLabel: string;
	/** Empty-state text when the selected parent has no items. */
	emptyText: string;
	/**
	 * Empty-state text when no parents exist at all — distinct from
	 * `emptyText` (which fires when a parent IS selected but has no
	 * children). Optional; falls back to a generic message.
	 */
	noParentsText?: string;
	/** Available parent choices (id + display label). */
	parents: ReadonlyArray<{ id: string; label: string }>;
	/** Initially selected parent id, or null to default to the first. */
	initialParentId: string | null;
	/**
	 * Resolve items belonging to `parentId`. Returned in any order; the
	 * modal sorts by `dbench-order` itself. Empty array OK.
	 */
	loadItems(parentId: string): T[];
	/**
	 * Commit the new order to disk. Returns count of items actually
	 * changed (idempotent skip for already-correct positions).
	 */
	applyOrder(ordered: T[]): Promise<number>;
}

export class ReorderChildrenModal<T extends ReorderItem> extends Modal {
	private selectedParentId: string;
	private ordered: T[] = [];
	private listEl: HTMLOListElement | null = null;
	private applyButton: HTMLButtonElement | null = null;
	private focusedIndex = 0;
	private dragFromIndex: number | null = null;

	constructor(
		app: App,
		private linker: DraftBenchLinker,
		private config: ReorderModalConfig<T>
	) {
		super(app);
		this.selectedParentId =
			config.initialParentId ?? config.parents[0]?.id ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dbench-reorder-modal');

		contentEl.createEl('h2', { text: this.config.title });

		if (this.config.parents.length === 0) {
			contentEl.createEl('p', {
				text:
					this.config.noParentsText ??
					`No ${this.config.parentLabel.toLowerCase()} options exist yet.`,
			});
			const closeButton = contentEl.createEl('button', {
				text: 'Close',
				cls: 'mod-cta',
			});
			closeButton.addEventListener('click', () => this.close());
			return;
		}

		new Setting(contentEl)
			.setName(this.config.parentLabel)
			.setDesc(this.config.parentDesc)
			.addDropdown((dropdown) => {
				for (const p of this.config.parents) {
					dropdown.addOption(p.id, p.label);
				}
				if (this.selectedParentId !== '') {
					dropdown.setValue(this.selectedParentId);
				}
				dropdown.onChange((value) => {
					this.selectedParentId = value;
					this.loadAndSort();
					this.renderList();
				});
			});

		contentEl.createEl('p', {
			cls: 'dbench-reorder-modal__hint',
			text: this.config.hint,
		});

		this.listEl = contentEl.createEl('ol', {
			cls: 'dbench-reorder-modal__list',
			attr: { role: 'listbox', 'aria-label': this.config.listLabel },
		});

		this.loadAndSort();
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

	private loadAndSort(): void {
		if (this.selectedParentId === '') {
			this.ordered = [];
			return;
		}
		const items = this.config.loadItems(this.selectedParentId);
		this.ordered = [...items].sort(
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
				text: this.config.emptyText,
			});
			if (this.applyButton) this.applyButton.disabled = true;
			return;
		}

		if (this.applyButton) this.applyButton.disabled = false;

		this.ordered.forEach((item, index) => {
			const row = this.listEl!.createEl('li', {
				cls: 'dbench-reorder-modal__row',
				attr: {
					role: 'option',
					tabindex: index === this.focusedIndex ? '0' : '-1',
					'aria-selected':
						index === this.focusedIndex ? 'true' : 'false',
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
				text: item.file.basename,
			});
			row.createEl('span', {
				cls: 'dbench-reorder-modal__status',
				text: String(item.frontmatter['dbench-status'] ?? ''),
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
				row.removeClass(
					'dbench-reorder-modal__row--drop-before',
					'dbench-reorder-modal__row--drop-after'
				);
				row.addClass(
					before
						? 'dbench-reorder-modal__row--drop-before'
						: 'dbench-reorder-modal__row--drop-after'
				);
			});
			row.addEventListener('dragleave', () => {
				row.removeClass(
					'dbench-reorder-modal__row--drop-before',
					'dbench-reorder-modal__row--drop-after'
				);
			});
			row.addEventListener('drop', (ev) => {
				ev.preventDefault();
				row.removeClass(
					'dbench-reorder-modal__row--drop-before',
					'dbench-reorder-modal__row--drop-after'
				);
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
				row.removeClass(
					'dbench-reorder-modal__row--dragging',
					'dbench-reorder-modal__row--drop-before',
					'dbench-reorder-modal__row--drop-after'
				);
				for (const sibling of Array.from(
					this.listEl!.children
				) as HTMLElement[]) {
					sibling.removeClass(
						'dbench-reorder-modal__row--drop-before',
						'dbench-reorder-modal__row--drop-after'
					);
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
				this.config.applyOrder(this.ordered)
			);
			if (changed === 0) {
				new Notice(`${capitalize(this.config.itemLabel)} order was already up to date.`);
			} else {
				const suffix =
					changed === 1
						? this.config.itemLabel
						: this.config.itemLabelPlural;
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

function capitalize(s: string): string {
	if (s.length === 0) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}
