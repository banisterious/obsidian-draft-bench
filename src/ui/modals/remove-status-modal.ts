import { App, Modal, Setting } from 'obsidian';

/**
 * Confirmation modal for removing a status that is still in use on
 * existing notes. Offers the writer three paths:
 *
 * 1. **Rename**: pick a replacement status from the remaining
 *    vocabulary; the modal reports the count that will be rewritten.
 * 2. **Remove anyway**: leaves the notes carrying an out-of-vocab
 *    status (they stay visible and keep whatever value they had; they
 *    just can't be re-picked from dropdowns until the writer adds the
 *    status back or renames them manually).
 * 3. **Cancel**: no change.
 *
 * The modal is purely UI: it resolves with a result object, and the
 * caller (settings tab) does the actual rename + vocabulary write.
 *
 * @example
 *   const result = await RemoveStatusModal.open(app, {
 *     status: 'revision',
 *     count: 7,
 *     otherStatuses: ['idea', 'draft', 'final'],
 *   });
 *   if (result === null) return;                  // cancel
 *   if (result.renameTo) await renameStatus(...); // migrate first
 *   // then remove from vocabulary
 */

export interface RemoveStatusOptions {
	status: string;
	count: number;
	otherStatuses: string[];
}

export interface RemoveStatusResult {
	/**
	 * When non-null, the caller should rename all matching notes to
	 * this value before removing the old status from the vocabulary.
	 * When null, remove without migrating.
	 */
	renameTo: string | null;
}

export class RemoveStatusModal extends Modal {
	private resolve: ((value: RemoveStatusResult | null) => void) | null = null;
	private renameTarget: string | null;

	constructor(
		app: App,
		private readonly options: RemoveStatusOptions
	) {
		super(app);
		// Default the rename target to the first alternative so the
		// Rename button works without an explicit dropdown touch.
		this.renameTarget = options.otherStatuses[0] ?? null;
	}

	static open(
		app: App,
		options: RemoveStatusOptions
	): Promise<RemoveStatusResult | null> {
		return new Promise((resolve) => {
			const modal = new RemoveStatusModal(app, options);
			modal.resolve = resolve;
			modal.open();
		});
	}

	onOpen(): void {
		const { contentEl, options } = this;
		contentEl.empty();
		contentEl.addClass('dbench-remove-status-modal');

		contentEl.createEl('h2', { text: `Remove "${options.status}"` });

		const noun = options.count === 1 ? 'note' : 'notes';
		contentEl.createEl('p', {
			text: `${options.count} ${noun} currently use this status.`,
		});

		const canRename = options.otherStatuses.length > 0;

		if (canRename) {
			new Setting(contentEl)
				.setName('Rename those notes to')
				.setDesc(
					'Pick another status to migrate the affected notes before removing.'
				)
				.addDropdown((dropdown) => {
					for (const s of options.otherStatuses) {
						dropdown.addOption(s, s);
					}
					if (this.renameTarget !== null) {
						dropdown.setValue(this.renameTarget);
					}
					dropdown.onChange((value) => {
						this.renameTarget = value;
					});
				});
		} else {
			contentEl.createEl('p', {
				cls: 'dbench-remove-status-modal__note',
				text: 'No other statuses are defined, so rename is not available. Remove will leave the notes with their current value.',
			});
		}

		const buttonRow = contentEl.createDiv({
			cls: 'modal-button-container',
		});

		const cancel = buttonRow.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => {
			this.finish(null);
		});

		const removeAnyway = buttonRow.createEl('button', {
			text: 'Remove without migrating',
		});
		removeAnyway.addEventListener('click', () => {
			this.finish({ renameTo: null });
		});

		if (canRename) {
			const renameAndRemove = buttonRow.createEl('button', {
				text: 'Rename and remove',
				cls: 'mod-cta',
			});
			renameAndRemove.addEventListener('click', () => {
				this.finish({ renameTo: this.renameTarget });
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
		// If the modal was dismissed by the X button or Esc, resolve as
		// cancelled so the caller's await doesn't hang.
		if (this.resolve) {
			this.resolve(null);
			this.resolve = null;
		}
	}

	private finish(result: RemoveStatusResult | null): void {
		if (this.resolve) {
			this.resolve(result);
			this.resolve = null;
		}
		this.close();
	}
}
