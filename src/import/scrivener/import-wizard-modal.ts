import { App, FuzzySuggestModal, Modal, TFolder } from 'obsidian';

/**
 * Scrivener `.scriv` import wizard. DB's first wizard, built standalone
 * per the [DB commitments in wizards-reference.md](../../../docs/planning/wizards-reference.md):
 * no shared abstract base; the patterns (step-dispatcher, step-indicator,
 * footer rendering) live inline. Future wizards (onboarding, compile
 * preset editor) can extract a shared base when DB has 3+ wizards.
 *
 * Implementation tracks the 8-step layout from
 * [scrivener-import.md § 1](../../../docs/planning/scrivener-import.md):
 *
 * | # | Step | Indicator |
 * |---|---|---|
 * | 0 | Source | yes |
 * | 1 | Parse | yes |
 * | 2 | Hierarchy mapping | yes |
 * | 3 | Metadata mapping | yes |
 * | 4 | Options | yes |
 * | 5 | Preview | yes |
 * | 6 | Import | hidden |
 * | 7 | Complete | hidden |
 *
 * Step-indices are 0-based for array-friendliness; the visible labels
 * "Step 1 of 6" etc. add 1 in render.
 *
 * In-session form-data persistence only (no cross-session resume per
 * meta-level lock). The shell is desktop-only by construction (the
 * importer reads external `.scriv` bundles via Electron + Node `fs`,
 * gated to desktop in the discoverability surfaces per scrivener-
 * import.md § 13).
 */

/** 0-based step index into the 8-step layout. */
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Steps shown as dots in the indicator strip. Steps 6 (in-progress
 *  import) and 7 (completion summary) are hidden per the CR Import
 *  Wizard pattern of compacting the indicator to the configuration
 *  flow only. */
const VISIBLE_INDICATOR_STEPS = 6;

/**
 * Cross-step form data, kept on the modal instance. Each step reads
 * + mutates the relevant slice; render functions populate controls
 * from this state on each render so back-navigation preserves prior
 * input.
 *
 * Fields are added incrementally as steps land in the implementation
 * sequence; the skeleton starts with just source + destination so the
 * gating in `canProceedToNextStep` has something to read.
 */
interface ScrivenerImportFormData {
	/** Absolute filesystem path to the `.scriv` folder bundle. Set
	 *  by the Source step (0). Empty until the writer picks one. */
	sourcePath: string;
	/** Destination project name (becomes the project folder name +
	 *  project-note basename). Prefilled from the parsed `.scrivx`
	 *  project title in the Parse step (1); writer can edit there. */
	destinationName: string;
}

function getDefaultFormData(): ScrivenerImportFormData {
	return {
		sourcePath: '',
		destinationName: '',
	};
}

export class ScrivenerImportWizardModal extends Modal {
	private currentStep: StepIndex = 0;
	private formData: ScrivenerImportFormData = getDefaultFormData();

	constructor(app: App) {
		super(app);
		this.modalEl.addClass('dbench-import-wizard');
	}

	onOpen(): void {
		this.renderCurrentStep();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * Step dispatcher. Empties the content area, re-renders the four
	 * persistent regions (header, indicator, body, footer), then runs
	 * the step-specific body render. Called on initial open and on
	 * every Back / Next.
	 */
	private renderCurrentStep(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dbench-import-wizard__content');

		this.renderHeader(contentEl);
		this.renderStepIndicator(contentEl);
		const body = contentEl.createDiv({
			cls: 'dbench-import-wizard__body',
		});

		switch (this.currentStep) {
			case 0:
				this.renderSourceStep(body);
				break;
			case 1:
				this.renderParseStep(body);
				break;
			case 2:
				this.renderHierarchyStep(body);
				break;
			case 3:
				this.renderMetadataStep(body);
				break;
			case 4:
				this.renderOptionsStep(body);
				break;
			case 5:
				this.renderPreviewStep(body);
				break;
			case 6:
				this.renderImportStep(body);
				break;
			case 7:
				this.renderCompleteStep(body);
				break;
		}

		this.renderFooter(contentEl);
	}

	private renderHeader(parent: HTMLElement): void {
		const header = parent.createDiv({
			cls: 'dbench-import-wizard__header',
		});
		header.createEl('h2', {
			cls: 'dbench-import-wizard__title',
			text: 'Import from Scrivener',
		});
	}

	/**
	 * Indicator strip rendering steps 0..VISIBLE_INDICATOR_STEPS-1 as
	 * numbered circles with connectors between them. Three visual
	 * states per circle: upcoming (gray), active (accent + larger),
	 * completed (accent + checkmark). Steps 6 / 7 (Import in flight,
	 * Complete) don't render in the strip.
	 */
	private renderStepIndicator(parent: HTMLElement): void {
		const strip = parent.createDiv({
			cls: 'dbench-import-wizard__step-indicator',
		});
		for (let i = 0; i < VISIBLE_INDICATOR_STEPS; i++) {
			const dot = strip.createDiv({
				cls: 'dbench-import-wizard__step',
			});
			if (i === this.currentStep) {
				dot.addClass('dbench-import-wizard__step--active');
			} else if (i < this.currentStep) {
				dot.addClass('dbench-import-wizard__step--completed');
			}
			dot.createSpan({ text: String(i + 1) });

			if (i < VISIBLE_INDICATOR_STEPS - 1) {
				const conn = strip.createDiv({
					cls: 'dbench-import-wizard__step-connector',
				});
				if (i < this.currentStep) {
					conn.addClass(
						'dbench-import-wizard__step-connector--completed'
					);
				}
			}
		}
	}

	/**
	 * Three-region footer: Back (left), spacer, primary action
	 * (right). Buttons appear / hide / change label based on
	 * `currentStep`:
	 *
	 * - Step 0: no Back; right shows "Next."
	 * - Steps 1-4: Back left; right shows "Next."
	 * - Step 5 (Preview): Back left; right shows "Import" (primary
	 *   action shifts to commit-now language).
	 * - Step 6 (Import in flight): no buttons (auto-advances).
	 * - Step 7 (Complete): no Back; right shows "Done" (also clears
	 *   formData on close so reopening starts fresh).
	 */
	private renderFooter(parent: HTMLElement): void {
		const footer = parent.createDiv({
			cls: 'dbench-import-wizard__footer',
		});

		const left = footer.createDiv({
			cls: 'dbench-import-wizard__footer-left',
		});
		const right = footer.createDiv({
			cls: 'dbench-import-wizard__footer-right',
		});

		// Back button — present on configuration steps that have a
		// previous step the writer might want to revisit.
		if (this.currentStep > 0 && this.currentStep <= 5) {
			const backBtn = left.createEl('button', {
				cls: 'dbench-import-wizard__btn',
				text: 'Back',
			});
			backBtn.addEventListener('click', () => {
				if (this.currentStep > 0) {
					this.currentStep = (this.currentStep - 1) as StepIndex;
					this.renderCurrentStep();
				}
			});
		}

		// Right side: Next / Import / Done depending on step.
		if (this.currentStep < 5) {
			const nextBtn = right.createEl('button', {
				cls: 'dbench-import-wizard__btn mod-cta',
				text: 'Next',
			});
			const canProceed = this.canProceedToNextStep();
			nextBtn.disabled = !canProceed;
			nextBtn.addEventListener('click', () => {
				if (this.canProceedToNextStep()) {
					this.currentStep = (this.currentStep + 1) as StepIndex;
					this.renderCurrentStep();
				}
			});
		} else if (this.currentStep === 5) {
			const importBtn = right.createEl('button', {
				cls: 'dbench-import-wizard__btn mod-cta',
				text: 'Import',
			});
			importBtn.addEventListener('click', () => {
				this.currentStep = 6;
				this.renderCurrentStep();
			});
		} else if (this.currentStep === 7) {
			const doneBtn = right.createEl('button', {
				cls: 'dbench-import-wizard__btn mod-cta',
				text: 'Done',
			});
			doneBtn.addEventListener('click', () => this.close());
		}
		// Step 6 (Import in flight) renders no buttons; the import
		// pass auto-advances to step 7 on completion.
	}

	/**
	 * Validation gate. Each step returns whether the writer can move
	 * forward. The Next button's `disabled` state and click handler
	 * both check this. Per the wizards-reference doc's binary-gating
	 * pattern: the Next button either works or it doesn't; no inline
	 * field-level error messages.
	 *
	 * Skeleton-stage gates: Source (0) requires a non-empty path,
	 * Parse (1) requires a non-empty destination name. Other steps
	 * default to true; specific gates land per-step in the
	 * implementation sequence.
	 */
	private canProceedToNextStep(): boolean {
		switch (this.currentStep) {
			case 0:
				return this.formData.sourcePath !== '';
			case 1:
				return this.formData.destinationName !== '';
			case 2:
			case 3:
			case 4:
			case 5:
				return true;
			default:
				return false;
		}
	}

	// ---- Step bodies (placeholders) -----------------------------------
	//
	// Each step renders into `body` (the leaf div between indicator
	// and footer). Skeleton bodies are minimal placeholders; concrete
	// rendering lands in subsequent commits per the implementation
	// sequence.

	private renderSourceStep(body: HTMLElement): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__help-text',
			text: 'Your .scriv folder must be inside the vault first. Copy it in via your file manager, share sheet, or sync — then pick it here.',
		});

		const candidates = findScrivProjectFolders(this.app);

		if (candidates.length === 0) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__empty-state',
				text: 'No .scriv folders found in the vault yet. Copy one in, then reopen this wizard.',
			});
			return;
		}

		// Current selection display
		const selection = body.createDiv({
			cls: 'dbench-import-wizard__selection',
		});
		if (this.formData.sourcePath !== '') {
			selection.createSpan({
				cls: 'dbench-import-wizard__selection-icon',
				text: '✓',
			});
			selection.createSpan({
				cls: 'dbench-import-wizard__selection-path',
				text: this.formData.sourcePath,
			});
		} else {
			selection.createSpan({
				cls: 'dbench-import-wizard__selection-empty',
				text: 'No folder selected.',
			});
		}

		// Pick button
		const pickBtn = body.createEl('button', {
			cls: 'dbench-import-wizard__btn',
			text:
				this.formData.sourcePath !== ''
					? 'Choose a different folder'
					: 'Choose .scriv folder',
		});
		pickBtn.addEventListener('click', () => {
			new ScrivFolderSuggestModal(this.app, candidates, (folder) => {
				this.formData.sourcePath = folder.path;
				this.renderCurrentStep();
			}).open();
		});

		// Candidate count hint when there's more than one
		if (candidates.length > 1) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__hint',
				text: `${candidates.length} .scriv folders available in this vault.`,
			});
		}
	}

	private renderParseStep(body: HTMLElement): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__placeholder',
			text: 'Parse step — async parse + destination name. (Skeleton placeholder.)',
		});
	}

	private renderHierarchyStep(body: HTMLElement): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__placeholder',
			text: 'Hierarchy mapping — binder tree with per-row type override. (Skeleton placeholder.)',
		});
	}

	private renderMetadataStep(body: HTMLElement): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__placeholder',
			text: 'Metadata mapping — status / labels / custom fields. (Skeleton placeholder.)',
		});
	}

	private renderOptionsStep(body: HTMLElement): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__placeholder',
			text: 'Options — research import, snapshots, snapshot template, etc. (Skeleton placeholder.)',
		});
	}

	private renderPreviewStep(body: HTMLElement): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__placeholder',
			text: 'Preview — file tree, image asset list, counts, warnings. (Skeleton placeholder.)',
		});
	}

	private renderImportStep(body: HTMLElement): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__placeholder',
			text: 'Import — async write with progress. (Skeleton placeholder.)',
		});
	}

	private renderCompleteStep(body: HTMLElement): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__placeholder',
			text: 'Complete — summary + Done + Import another. (Skeleton placeholder.)',
		});
	}
}

/**
 * Walk the vault for `.scriv` bundle roots. A Scrivener project is a
 * folder bundle whose root contains a single `.scrivx` index file (the
 * binder XML); the folder itself is conventionally named with a
 * `.scriv` suffix but the suffix isn't load-bearing — we detect by
 * `.scrivx` presence so writers who renamed the folder still get
 * matched.
 *
 * Multiple `.scrivx` files in one folder would mean a corrupted
 * project; the dedup-by-folder-path map drops duplicates safely.
 *
 * Cross-platform: uses `app.vault.getFiles()` which returns all
 * TFile instances regardless of extension. No Node `fs` or Electron
 * dependency — runs identically on desktop and mobile.
 */
export function findScrivProjectFolders(app: App): TFolder[] {
	const folders = new Map<string, TFolder>();
	for (const file of app.vault.getFiles()) {
		if (file.extension === 'scrivx' && file.parent) {
			folders.set(file.parent.path, file.parent);
		}
	}
	return Array.from(folders.values()).sort((a, b) =>
		a.path.localeCompare(b.path)
	);
}

/**
 * Obsidian-native suggester for picking a `.scriv` bundle root from
 * the candidates `findScrivProjectFolders` returns. Standard
 * `FuzzySuggestModal` shape: items rendered as their path strings;
 * fuzzy-search lets the writer narrow large vaults to the right
 * folder by typing.
 */
class ScrivFolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private folders: TFolder[],
		private onChoose: (folder: TFolder) => void
	) {
		super(app);
		this.setPlaceholder('Pick a .scriv folder...');
	}

	getItems(): TFolder[] {
		return this.folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
