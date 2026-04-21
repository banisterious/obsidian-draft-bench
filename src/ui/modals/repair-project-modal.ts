import { App, Modal, Notice, Setting } from 'obsidian';
import type { DraftBenchLinker } from '../../core/linker';
import {
	applyRepairs,
	scanProject,
	type IntegrityIssue,
	type IntegrityReport,
} from '../../core/integrity';
import { findProjects, type ProjectNote } from '../../core/discovery';

/**
 * "Repair project links" modal.
 *
 * Preview -> confirm -> execute -> summary pattern per
 * [ui-reference.md § Batch operations](docs/planning/ui-reference.md):
 *
 * - Picker at top (pre-selected from active file if it's a project).
 * - Re-scan runs on open and on project change.
 * - Issues grouped by auto-repairable vs. manual review.
 * - Apply writes via `linker.withSuspended(...)` so the intermediate
 *   repair state doesn't fire modify events back through the linker.
 */
export class RepairProjectModal extends Modal {
	private projects: ProjectNote[];
	private selectedProject: ProjectNote | null = null;
	private report: IntegrityReport | null = null;
	private bodyEl: HTMLElement | null = null;
	private applyButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private readonly linker: DraftBenchLinker,
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
		contentEl.addClass('dbench-repair-modal');

		contentEl.createEl('h2', { text: 'Repair project links' });

		if (this.projects.length === 0) {
			contentEl.createEl('p', {
				text: 'No projects exist yet. Create a project first.',
			});
			const close = contentEl.createEl('button', {
				text: 'Close',
				cls: 'mod-cta',
			});
			close.addEventListener('click', () => this.close());
			return;
		}

		new Setting(contentEl)
			.setName('Project')
			.setDesc('Which project to scan.')
			.addDropdown((dropdown) => {
				for (const p of this.projects) {
					dropdown.addOption(p.frontmatter['dbench-id'], p.file.basename);
				}
				if (this.selectedProject) {
					dropdown.setValue(this.selectedProject.frontmatter['dbench-id']);
				}
				dropdown.onChange((value) => {
					this.selectedProject =
						this.projects.find(
							(p) => p.frontmatter['dbench-id'] === value
						) ?? null;
					this.runScan();
					this.renderBody();
				});
			});

		this.bodyEl = contentEl.createDiv({ cls: 'dbench-repair-modal__body' });

		const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = buttonRow.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.close());

		const apply = buttonRow.createEl('button', {
			text: 'Apply repairs',
			cls: 'mod-cta',
		});
		apply.addEventListener('click', () => {
			void this.handleApply();
		});
		this.applyButton = apply;

		this.runScan();
		this.renderBody();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private runScan(): void {
		if (!this.selectedProject) {
			this.report = null;
			return;
		}
		this.report = scanProject(this.app, this.selectedProject);
	}

	private renderBody(): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();

		if (!this.report) return;

		const { issues } = this.report;
		const autoRepairable = issues.filter((i) => i.autoRepairable);
		const conflicts = issues.filter((i) => !i.autoRepairable);

		if (issues.length === 0) {
			this.bodyEl.createEl('p', {
				cls: 'dbench-repair-modal__clean',
				text: `✓ No integrity issues found in ${this.report.project.file.basename}.`,
			});
			if (this.applyButton) this.applyButton.disabled = true;
			return;
		}

		this.bodyEl.createEl('p', {
			cls: 'dbench-repair-modal__summary',
			text:
				`Found ${issues.length} ${pluralize(issues.length, 'issue')} ` +
				`(${autoRepairable.length} auto-repairable, ` +
				`${conflicts.length} needs manual review).`,
		});

		if (autoRepairable.length > 0) {
			this.bodyEl.createEl('h3', { text: 'Auto-repairable' });
			renderIssueList(this.bodyEl, autoRepairable);
		}

		if (conflicts.length > 0) {
			this.bodyEl.createEl('h3', { text: 'Manual review needed' });
			const desc = this.bodyEl.createEl('p', {
				cls: 'dbench-repair-modal__conflict-hint',
				text: 'Conflicts need manual review in the note\'s frontmatter; this action won\'t change them.',
			});
			void desc;
			renderIssueList(this.bodyEl, conflicts);
		}

		if (this.applyButton) {
			this.applyButton.disabled = autoRepairable.length === 0;
		}
	}

	private async handleApply(): Promise<void> {
		if (!this.report) return;
		const button = this.applyButton;
		if (button) {
			button.disabled = true;
			button.textContent = 'Applying…';
		}

		try {
			const result = await this.linker.withSuspended(() =>
				applyRepairs(this.app, this.report!)
			);

			const parts: string[] = [];
			if (result.repaired > 0) {
				parts.push(
					`${result.repaired} ${pluralize(result.repaired, 'issue')} repaired`
				);
			}
			if (result.conflictsSkipped > 0) {
				parts.push(
					`${result.conflictsSkipped} ${pluralize(result.conflictsSkipped, 'conflict')} flagged`
				);
			}
			if (result.errors > 0) {
				parts.push(
					`${result.errors} ${pluralize(result.errors, 'error')}`
				);
			}
			if (parts.length === 0) {
				new Notice('Nothing to repair.');
			} else {
				const prefix = result.errors === 0 ? '✓ ' : '';
				new Notice(
					`${prefix}Repair project links: ${parts.join(', ')}.`
				);
			}
			this.close();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Could not apply repairs. ${message}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Apply repairs';
			}
		}
	}
}

function renderIssueList(parent: HTMLElement, issues: IntegrityIssue[]): void {
	const list = parent.createEl('ul', { cls: 'dbench-repair-modal__issue-list' });
	for (const issue of issues) {
		list.createEl('li', {
			cls: 'dbench-repair-modal__issue',
			text: issue.description,
		});
	}
}

function pluralize(n: number, singular: string): string {
	return n === 1 ? singular : `${singular}s`;
}
