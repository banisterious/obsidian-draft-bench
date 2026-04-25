import { Modal } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import { runCreateExampleProject } from '../../commands/create-example-project';
import { activateManuscriptView } from '../manuscript-view/activate';
import { appendBrandMark } from '../brand-mark';

/**
 * Onboarding welcome modal. Single screen, no steps. Auto-shown on the
 * first plugin load (gated by `settings.welcomeShown`); resurfaceable
 * via the `Show welcome screen` palette command.
 *
 * Layout:
 *   - Brand mark + tagline
 *   - Pitch paragraph
 *   - Three primary CTAs (vertical stack):
 *       1. Create your first project
 *       2. Try with an example project
 *       3. Show the manuscript view
 *   - Text link to the wiki Getting Started page
 *
 * Any close path (CTA click, X button, escape, click-outside) flips
 * `settings.welcomeShown` to true and saves settings, so the modal
 * doesn't reappear next session. The "Don't show again" affordance is
 * implicit — clicking anything dismisses for good. No checkbox needed.
 *
 * Per [docs/planning/onboarding.md](../../../docs/planning/onboarding.md)
 * § Tier 1.
 */
export class WelcomeModal extends Modal {
	private static readonly WIKI_GETTING_STARTED_URL =
		'https://github.com/banisterious/obsidian-draft-bench/wiki/Getting-Started';

	constructor(private plugin: DraftBenchPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dbench-welcome-modal');

		const header = contentEl.createDiv({ cls: 'dbench-welcome-modal__header' });
		appendBrandMark(header, 'dbench-welcome-modal__brand-mark');
		header.createEl('h2', {
			cls: 'dbench-welcome-modal__title',
			text: 'Welcome to Draft Bench',
		});
		header.createEl('p', {
			cls: 'dbench-welcome-modal__tagline',
			text: 'A writing workflow for Obsidian',
		});

		const pitch = contentEl.createDiv({ cls: 'dbench-welcome-modal__pitch' });
		pitch.createEl('p', {
			text: 'Draft Bench manages projects, scenes, and versioned drafts as plain Markdown notes.',
		});
		pitch.createEl('p', {
			text: "Compile your manuscript to MD, ODT, or PDF when you're ready to share it.",
		});

		const actions = contentEl.createDiv({ cls: 'dbench-welcome-modal__actions' });

		this.createActionButton(
			actions,
			'Create your first project',
			'mod-cta',
			() => {
				this.close();
				this.runCommand('draft-bench:create-project');
			}
		);

		this.createActionButton(
			actions,
			'Try with an example project',
			'',
			() => {
				this.close();
				void runCreateExampleProject(this.plugin, this.plugin.linker);
			}
		);

		this.createActionButton(
			actions,
			'Show the manuscript view',
			'',
			() => {
				this.close();
				void activateManuscriptView(this.plugin.app);
			}
		);

		const footer = contentEl.createDiv({ cls: 'dbench-welcome-modal__footer' });
		const link = footer.createEl('a', {
			cls: 'dbench-welcome-modal__docs-link',
			text: 'Read the getting-started guide',
			href: WelcomeModal.WIKI_GETTING_STARTED_URL,
		});
		link.setAttribute('target', '_blank');
		link.setAttribute('rel', 'noopener');
	}

	onClose(): void {
		// Any close path flips the seen flag. Auto-save so a subsequent
		// reload doesn't re-open the modal even if the user closes it
		// unconventionally (workspace switch, plugin disable, etc.).
		if (!this.plugin.settings.welcomeShown) {
			this.plugin.settings.welcomeShown = true;
			void this.plugin.saveSettings();
		}
		this.contentEl.empty();
	}

	private createActionButton(
		parent: HTMLElement,
		text: string,
		extraClass: string,
		onClick: () => void
	): HTMLButtonElement {
		const cls = ['dbench-welcome-modal__action'];
		if (extraClass !== '') cls.push(extraClass);
		const button = parent.createEl('button', { text, cls: cls.join(' ') });
		button.addEventListener('click', onClick);
		return button;
	}

	private runCommand(commandId: string): void {
		const commands = (
			this.plugin.app as unknown as {
				commands?: { executeCommandById: (id: string) => boolean };
			}
		).commands;
		commands?.executeCommandById(commandId);
	}
}
