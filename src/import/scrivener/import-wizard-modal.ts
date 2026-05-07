import { App, FuzzySuggestModal, Modal, Setting, TFile, TFolder } from 'obsidian';
import type { DraftBenchSettings } from '../../model/settings';
import { resolveProjectPaths } from '../../core/projects';
import {
	parseScrivx,
	ScrivxParseError,
	type BinderItem,
	type ScrivProject,
} from './scrivx-parser';
import {
	countSnapshots,
	summarizeProject,
	type ProjectSummary,
} from './scriv-summary';
import {
	autoDetectHierarchy,
	effectiveTarget,
	HIERARCHY_TARGETS,
	type HierarchyMapping,
	type HierarchyTarget,
} from './hierarchy-mapping';
import {
	countDocumentsByStatus,
	initialMetadataMapping,
	type CustomFieldTarget,
	type MetadataMapping,
	type StatusTarget,
} from './metadata-mapping';

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
 * meta-level lock). Cross-platform: reads `.scriv` bundles from
 * inside the vault via `app.vault.adapter` per the 2026-05-06
 * cross-platform expansion in scrivener-import.md.
 */

/** 0-based step index into the 8-step layout. */
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Steps shown as dots in the indicator strip. Steps 6 (in-progress
 *  import) and 7 (completion summary) are hidden per the CR Import
 *  Wizard pattern of compacting the indicator to the configuration
 *  flow only. */
const VISIBLE_INDICATOR_STEPS = 6;

/**
 * Cached parse output for the Parse step. Computed once per source
 * pick; survives Back/Next navigation as long as `sourcePath` doesn't
 * change. Cleared and recomputed when the writer goes back to Source
 * and picks a different bundle.
 */
interface ParsedBundle {
	project: ScrivProject;
	summary: ProjectSummary;
	snapshotCount: number;
}

/**
 * Cross-step form data, kept on the modal instance. Each step reads
 * + mutates the relevant slice; render functions populate controls
 * from this state on each render so back-navigation preserves prior
 * input.
 *
 * Fields are added incrementally as steps land in the implementation
 * sequence.
 */
interface ScrivenerImportFormData {
	/** Vault path to the `.scriv` folder bundle. Set by the Source
	 *  step (0). Empty until the writer picks one. */
	sourcePath: string;
	/** Destination project name (becomes the project folder name +
	 *  project-note basename). Prefilled from the source bundle's
	 *  basename when the Parse step first runs; writer can edit. */
	destinationName: string;
	/** Parse-step cache. Null until the Parse step has read +
	 *  successfully parsed the source bundle. */
	parsedBundle: ParsedBundle | null;
	/** Parse-step error message. Non-null when the most recent parse
	 *  attempt failed; mutually exclusive with `parsedBundle`. */
	parseError: string | null;
	/** The `sourcePath` value that produced `parsedBundle` /
	 *  `parseError`. When this drifts from the current `sourcePath`
	 *  (writer went back to Source and picked a different bundle),
	 *  the cache is invalidated and the Parse step re-reads. */
	parsedSourcePath: string;
	/** Per-binder-item hierarchy target overrides. Empty until the
	 *  Hierarchy step (3) has been touched. Effective target =
	 *  override ?? auto-detected (see `effectiveTarget` helper).
	 *  Cleared alongside `parsedBundle` when the source bundle
	 *  changes — the auto-detect re-runs from scratch. */
	hierarchyOverrides: Map<string, HierarchyTarget>;
	/** Resolved metadata mapping for the Metadata step (4). Null
	 *  until first entry to that step; populated via
	 *  `initialMetadataMapping` and mutated in place by writer
	 *  edits to the dropdowns / label-key field. Cleared on source
	 *  change. */
	metadataMapping: MetadataMapping | null;
}

function getDefaultFormData(): ScrivenerImportFormData {
	return {
		sourcePath: '',
		destinationName: '',
		parsedBundle: null,
		parseError: null,
		parsedSourcePath: '',
		hierarchyOverrides: new Map(),
		metadataMapping: null,
	};
}

export class ScrivenerImportWizardModal extends Modal {
	private currentStep: StepIndex = 0;
	private formData: ScrivenerImportFormData = getDefaultFormData();
	/** Reference to the Next button so input handlers can flip its
	 *  disabled state in place without re-rendering the whole step. */
	private nextButtonEl: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private settings: DraftBenchSettings
	) {
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
		this.nextButtonEl = null;
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
			this.nextButtonEl = nextBtn;
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
				return (
					this.formData.parsedBundle !== null &&
					validateDestinationName(
						this.app,
						this.settings,
						this.formData.destinationName
					).ok
				);
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

	/**
	 * Parse step. Three states cycle here:
	 *
	 * - **Cache miss / source changed:** kick off the async parse,
	 *   render a "Reading bundle..." placeholder until it resolves.
	 * - **Parsed:** render the summary (counts) + destination name
	 *   input with real-time conflict validation.
	 * - **Errored:** render the error message + a hint to go back to
	 *   Source.
	 *
	 * The cache lives on `formData.parsedBundle` (and its sibling
	 * `parseError`) so back-and-forth navigation doesn't re-parse;
	 * `parsedSourcePath` invalidates the cache when the writer goes
	 * back to Source and picks a different bundle.
	 */
	private renderParseStep(body: HTMLElement): void {
		const fd = this.formData;

		if (fd.parsedSourcePath !== fd.sourcePath) {
			fd.parsedBundle = null;
			fd.parseError = null;
			fd.hierarchyOverrides.clear();
			fd.metadataMapping = null;
		}

		if (fd.parsedBundle !== null) {
			this.renderParseSummary(body, fd.parsedBundle);
			return;
		}
		if (fd.parseError !== null) {
			this.renderParseError(body, fd.parseError);
			return;
		}

		body.createEl('p', {
			cls: 'dbench-import-wizard__progress',
			text: 'Reading bundle…',
		});

		void this.runParse();
	}

	private async runParse(): Promise<void> {
		const fd = this.formData;
		const sourceAtStart = fd.sourcePath;
		try {
			const bundle = await loadAndParseBundle(this.app, sourceAtStart);
			// Discard the result if the writer navigated away or
			// changed source while we were parsing.
			if (this.currentStep !== 1 || fd.sourcePath !== sourceAtStart) {
				return;
			}
			fd.parsedBundle = bundle;
			fd.parseError = null;
			fd.parsedSourcePath = sourceAtStart;
			if (fd.destinationName === '') {
				fd.destinationName = defaultDestinationName(sourceAtStart);
			}
		} catch (err) {
			if (this.currentStep !== 1 || fd.sourcePath !== sourceAtStart) {
				return;
			}
			fd.parsedBundle = null;
			fd.parseError = err instanceof Error ? err.message : String(err);
			fd.parsedSourcePath = sourceAtStart;
		}
		this.renderCurrentStep();
	}

	private renderParseError(body: HTMLElement, message: string): void {
		body.createEl('p', {
			cls: 'dbench-import-wizard__error',
			text: `Could not parse bundle: ${message}`,
		});
		body.createEl('p', {
			cls: 'dbench-import-wizard__hint',
			text: 'Go back and pick a different folder, or check that the .scriv bundle contains a readable .scrivx file.',
		});
	}

	private renderParseSummary(
		body: HTMLElement,
		bundle: ParsedBundle
	): void {
		const summaryEl = body.createDiv({
			cls: 'dbench-import-wizard__summary',
		});
		summaryEl.createEl('h3', {
			cls: 'dbench-import-wizard__summary-title',
			text: 'What’s in this bundle',
		});
		const list = summaryEl.createEl('ul', {
			cls: 'dbench-import-wizard__summary-list',
		});
		const summary = bundle.summary;
		appendSummaryRow(
			list,
			`Manuscript: ${summary.draftFolders} ${pluralize('folder', summary.draftFolders)}, ${summary.draftDocuments} ${pluralize('document', summary.draftDocuments)}`
		);
		if (summary.researchItems > 0) {
			appendSummaryRow(
				list,
				`Research: ${summary.researchItems} ${pluralize('item', summary.researchItems)} (optional in Options)`
			);
		}
		if (summary.customRootItems > 0) {
			appendSummaryRow(
				list,
				`Other top-level folders: ${summary.customRootItems} ${pluralize('item', summary.customRootItems)} (optional in Options)`
			);
		}
		if (summary.trashItems > 0) {
			appendSummaryRow(
				list,
				`Trash: ${summary.trashItems} ${pluralize('item', summary.trashItems)} (always skipped)`
			);
		}
		if (summary.images > 0 || summary.pdfs > 0) {
			const parts: string[] = [];
			if (summary.images > 0) {
				parts.push(`${summary.images} ${pluralize('image', summary.images)}`);
			}
			if (summary.pdfs > 0) {
				parts.push(`${summary.pdfs} ${pluralize('PDF', summary.pdfs)}`);
			}
			appendSummaryRow(list, `Media: ${parts.join(', ')}`);
		}
		if (bundle.snapshotCount > 0) {
			appendSummaryRow(
				list,
				`Snapshots: ${bundle.snapshotCount} (off by default; toggle in Options)`
			);
		}

		this.renderDestinationField(body);
	}

	private renderDestinationField(body: HTMLElement): void {
		const fd = this.formData;

		new Setting(body)
			.setName('Destination project name')
			.setDesc(
				'The folder + project note name created in this vault. Edit if you want a different name from the source bundle.'
			)
			.addText((text) => {
				text.setPlaceholder('My novel')
					.setValue(fd.destinationName)
					.onChange((value) => {
						fd.destinationName = value;
						refreshValidationMessage();
						this.refreshNextButtonEnabled();
					});
			});

		const messageEl = body.createEl('p', {
			cls: 'dbench-import-wizard__validation',
		});

		const refreshValidationMessage = (): void => {
			const v = validateDestinationName(
				this.app,
				this.settings,
				fd.destinationName
			);
			messageEl.setText(v.message);
			messageEl.removeClass('dbench-import-wizard__validation--ok');
			messageEl.removeClass('dbench-import-wizard__validation--error');
			messageEl.addClass(
				v.ok
					? 'dbench-import-wizard__validation--ok'
					: 'dbench-import-wizard__validation--error'
			);
		};
		refreshValidationMessage();
	}

	/** Update the Next button's disabled state based on the current
	 *  step's gating without re-rendering the whole step. Called by
	 *  in-place input handlers (e.g., the destination name field). */
	private refreshNextButtonEnabled(): void {
		if (!this.nextButtonEl) return;
		this.nextButtonEl.disabled = !this.canProceedToNextStep();
	}

	/**
	 * Hierarchy mapping step. Renders the DraftFolder subtree with
	 * the auto-detected DB target per row and a per-row override
	 * dropdown. Items outside the Draft (Research / Trash / custom
	 * roots) aren't shown here — they're handled by the Options
	 * step (step 9). Non-Folder / non-Text items inside the Draft
	 * (Image / PDF / etc.) are filtered out: they auto-map to `skip`
	 * and the media-extraction pass handles them separately.
	 *
	 * Validation gate is trivially true (auto-detect fills every
	 * item); the writer can override but can't unset.
	 */
	private renderHierarchyStep(body: HTMLElement): void {
		const fd = this.formData;
		if (!fd.parsedBundle) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__hint',
				text: 'No parsed bundle yet — go back to the previous step.',
			});
			return;
		}
		const draftRoot = fd.parsedBundle.project.binder.find(
			(b) => b.type === 'DraftFolder'
		);
		if (!draftRoot) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__error',
				text: 'No manuscript folder found in this bundle. Nothing narrative to import.',
			});
			return;
		}

		const auto = autoDetectHierarchy(draftRoot);

		body.createEl('p', {
			cls: 'dbench-import-wizard__help-text',
			text:
				auto.sceneDepth === 0
					? 'No scenes auto-detected. Override individual rows below if you want to import them.'
					: `Auto-detected scene depth: ${auto.sceneDepth}. Override any row whose mapping looks wrong.`,
		});

		const summaryEl = body.createDiv({
			cls: 'dbench-import-wizard__hier-summary',
		});
		const treeEl = body.createDiv({
			cls: 'dbench-import-wizard__hier-tree',
		});
		this.renderHierarchyTree(treeEl, draftRoot.children, 1, auto, () => {
			renderHierarchyCounts(summaryEl, auto, fd.hierarchyOverrides);
		});
		renderHierarchyCounts(summaryEl, auto, fd.hierarchyOverrides);
	}

	private renderHierarchyTree(
		parent: HTMLElement,
		items: BinderItem[],
		depth: number,
		auto: HierarchyMapping,
		onChange: () => void
	): void {
		for (const item of items) {
			if (item.type === 'Folder' || item.type === 'Text') {
				this.renderHierarchyRow(parent, item, depth, auto, onChange);
			}
			if (item.children.length > 0) {
				this.renderHierarchyTree(
					parent,
					item.children,
					depth + 1,
					auto,
					onChange
				);
			}
		}
	}

	private renderHierarchyRow(
		parent: HTMLElement,
		item: BinderItem,
		depth: number,
		auto: HierarchyMapping,
		onChange: () => void
	): void {
		const fd = this.formData;
		const row = parent.createDiv({
			cls: 'dbench-import-wizard__hier-row',
		});
		row.style.paddingLeft = `${(depth - 1) * 1.25}rem`;

		row.createSpan({
			cls: 'dbench-import-wizard__hier-title',
			text: item.title === '' ? '(untitled)' : item.title,
		});
		row.createSpan({
			cls: 'dbench-import-wizard__hier-itemtype',
			text: item.type,
		});

		const select = row.createEl('select', {
			cls: 'dbench-import-wizard__hier-target',
		});
		const current = effectiveTarget(item.id, auto, fd.hierarchyOverrides);
		for (const t of HIERARCHY_TARGETS) {
			const option = select.createEl('option', {
				value: t,
				text: targetLabel(t),
			});
			if (t === current) option.selected = true;
		}
		select.addEventListener('change', () => {
			fd.hierarchyOverrides.set(item.id, select.value as HierarchyTarget);
			onChange();
		});
	}

	/**
	 * Metadata mapping step. Three sub-tables per § 3 of
	 * scrivener-import.md:
	 *
	 * 1. Status mapping — one row per Scrivener status (with
	 *    document count) and a dropdown picking an existing DB
	 *    status, "Add as new", or "Drop".
	 * 2. Label frontmatter key — a single text input. Default
	 *    `scrivener-label`.
	 * 3. Custom metadata mapping — one row per Scrivener custom
	 *    field with a dropdown picking the target frontmatter key
	 *    (`scrivener-<id>`, `dbench-<id>`, or drop).
	 *
	 * Validation: always passes (defaults are safe). Always-passes
	 * matches the planning doc's § 1 gate for this step.
	 */
	private renderMetadataStep(body: HTMLElement): void {
		const fd = this.formData;
		if (!fd.parsedBundle) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__hint',
				text: 'No parsed bundle yet — go back to the previous step.',
			});
			return;
		}
		if (fd.metadataMapping === null) {
			fd.metadataMapping = initialMetadataMapping(
				fd.parsedBundle.project,
				this.settings.statusVocabulary
			);
		}
		const mapping = fd.metadataMapping;
		const project = fd.parsedBundle.project;
		const docCounts = countDocumentsByStatus(project);

		this.renderStatusMappingTable(body, project, mapping, docCounts);
		this.renderLabelKeyField(body, mapping);
		this.renderCustomFieldsTable(body, project, mapping);
	}

	private renderStatusMappingTable(
		body: HTMLElement,
		project: ScrivProject,
		mapping: MetadataMapping,
		docCounts: Map<string, number>
	): void {
		body.createEl('h3', {
			cls: 'dbench-import-wizard__meta-section-title',
			text: 'Statuses',
		});
		if (project.statuses.size === 0) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__hint',
				text: 'No statuses defined in this project.',
			});
			return;
		}
		body.createEl('p', {
			cls: 'dbench-import-wizard__help-text',
			text: 'Pick a target for each source status.',
		});

		const table = body.createDiv({
			cls: 'dbench-import-wizard__meta-table',
		});
		for (const [scrivId, scrivTitle] of project.statuses) {
			const row = table.createDiv({
				cls: 'dbench-import-wizard__meta-row',
			});
			row.createSpan({
				cls: 'dbench-import-wizard__meta-row-name',
				text: scrivTitle === '' ? '(unnamed)' : scrivTitle,
			});
			const count = docCounts.get(scrivId) ?? 0;
			row.createSpan({
				cls: 'dbench-import-wizard__meta-row-count',
				text: `${count} ${pluralize('doc', count)}`,
			});
			this.renderStatusDropdown(row, scrivId, mapping);
		}
	}

	private renderStatusDropdown(
		parent: HTMLElement,
		scrivId: string,
		mapping: MetadataMapping
	): void {
		const select = parent.createEl('select', {
			cls: 'dbench-import-wizard__meta-target',
		});
		const current = mapping.statuses.get(scrivId) ?? { kind: 'drop' };

		// Existing DB statuses
		for (const dbStatus of this.settings.statusVocabulary) {
			const option = select.createEl('option', {
				value: encodeStatusOption({ kind: 'existing', dbStatus }),
				text: dbStatus,
			});
			if (
				current.kind === 'existing' &&
				current.dbStatus === dbStatus
			) {
				option.selected = true;
			}
		}

		// Add as new
		const addNewValue = encodeStatusOption({
			kind: 'new',
			statusName: '',
		});
		const addNewOption = select.createEl('option', {
			value: addNewValue,
			text: 'Add as new status',
		});
		if (current.kind === 'new') {
			addNewOption.selected = true;
			// Display the new-status name in the option label so the
			// writer sees what would be added without re-rendering.
			addNewOption.textContent = `Add as new: ${current.statusName}`;
		}

		// Drop
		const dropValue = encodeStatusOption({ kind: 'drop' });
		const dropOption = select.createEl('option', {
			value: dropValue,
			text: 'Drop (use default)',
		});
		if (current.kind === 'drop') dropOption.selected = true;

		select.addEventListener('change', () => {
			const decoded = decodeStatusOption(select.value);
			// For 'new', preserve the auto-detected statusName from the
			// previous mapping (writer's choice was "add this scriv
			// status as new" — name comes from the Scrivener title).
			if (decoded.kind === 'new') {
				const existing = mapping.statuses.get(scrivId);
				if (existing && existing.kind === 'new') {
					mapping.statuses.set(scrivId, existing);
				} else {
					// Fall back to the Scrivener title verbatim.
					const project = this.formData.parsedBundle?.project;
					const title = project?.statuses.get(scrivId) ?? '';
					mapping.statuses.set(scrivId, {
						kind: 'new',
						statusName: title,
					});
				}
			} else {
				mapping.statuses.set(scrivId, decoded);
			}
		});
	}

	private renderLabelKeyField(
		body: HTMLElement,
		mapping: MetadataMapping
	): void {
		body.createEl('h3', {
			cls: 'dbench-import-wizard__meta-section-title',
			text: 'Labels',
		});
		new Setting(body)
			.setName('Label frontmatter key')
			.setDesc(
				'Label values from the source bundle are written to this frontmatter key on each scene at import.'
			)
			.addText((text) => {
				text.setValue(mapping.labelKey).onChange((value) => {
					mapping.labelKey = value;
				});
			});
	}

	private renderCustomFieldsTable(
		body: HTMLElement,
		project: ScrivProject,
		mapping: MetadataMapping
	): void {
		body.createEl('h3', {
			cls: 'dbench-import-wizard__meta-section-title',
			text: 'Custom metadata',
		});
		if (project.customMetaDataFields.size === 0) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__hint',
				text: 'No custom metadata fields defined in this project.',
			});
			return;
		}
		body.createEl('p', {
			cls: 'dbench-import-wizard__help-text',
			text: 'Pick the frontmatter key for each custom field, or drop the field at import.',
		});

		const table = body.createDiv({
			cls: 'dbench-import-wizard__meta-table',
		});
		for (const [
			fieldId,
			field,
		] of project.customMetaDataFields) {
			const row = table.createDiv({
				cls: 'dbench-import-wizard__meta-row',
			});
			row.createSpan({
				cls: 'dbench-import-wizard__meta-row-name',
				text: field.title === '' ? fieldId : field.title,
			});
			row.createSpan({
				cls: 'dbench-import-wizard__meta-row-count',
				text: field.fieldType,
			});
			renderCustomFieldDropdown(row, fieldId, mapping);
		}
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

/**
 * Read + parse + summarize a `.scriv` bundle from inside the vault.
 * Locates the bundle's `.scrivx` file via `TFolder.children` (so a
 * non-`.scriv` suffix on the bundle folder name still works, matching
 * the discovery rule in `findScrivProjectFolders`), reads it via
 * `app.vault.read`, parses via `parseScrivx`, runs `summarizeProject`,
 * and tallies snapshots via `countSnapshots`. All steps run via the
 * vault adapter — cross-platform.
 */
export async function loadAndParseBundle(
	app: App,
	bundlePath: string
): Promise<ParsedBundle> {
	const folder = app.vault.getFolderByPath(bundlePath);
	if (!folder) {
		throw new Error(
			`Bundle folder not found at ${bundlePath}. Re-pick from the Source step.`
		);
	}
	const scrivxFile = folder.children.find(
		(c): c is TFile => c instanceof TFile && c.extension === 'scrivx'
	);
	if (!scrivxFile) {
		throw new Error(
			`No .scrivx file found in ${bundlePath}. Bundle may be corrupted.`
		);
	}

	const xml = await app.vault.read(scrivxFile);
	let project: ScrivProject;
	try {
		project = parseScrivx(xml);
	} catch (err) {
		if (err instanceof ScrivxParseError) {
			throw new Error(err.message);
		}
		throw err;
	}

	const summary = summarizeProject(project);
	const snapshotCount = await countSnapshots(app.vault.adapter, bundlePath);

	return { project, summary, snapshotCount };
}

/** Strip the conventional `.scriv` suffix from a bundle folder path
 *  to produce a default destination project name. Matches the writer's
 *  expectation that "My Novel.scriv" imports as "My Novel". */
export function defaultDestinationName(sourcePath: string): string {
	const slash = sourcePath.lastIndexOf('/');
	const folderName = slash < 0 ? sourcePath : sourcePath.slice(slash + 1);
	return folderName.endsWith('.scriv')
		? folderName.slice(0, -'.scriv'.length)
		: folderName;
}

export interface DestinationValidation {
	ok: boolean;
	message: string;
}

/**
 * Real-time conflict + format validation for the destination project
 * name. Wraps `resolveProjectPaths` with try/catch (the resolver
 * throws on forbidden chars or empty title) and adds vault-existence
 * checks against both the resolved folder path and project-note path.
 *
 * Pure-ish: no mutations, but reads from `app.vault` so it can't be
 * a pure function in the strict sense. Cheap enough to call on every
 * keystroke (no I/O; just metadata lookups).
 */
export function validateDestinationName(
	app: App,
	settings: DraftBenchSettings,
	name: string
): DestinationValidation {
	const trimmed = name.trim();
	if (trimmed === '') {
		return { ok: false, message: 'Name cannot be empty.' };
	}
	let folderPath: string;
	let filePath: string;
	try {
		const resolved = resolveProjectPaths(settings, {
			title: trimmed,
			shape: 'folder',
		});
		folderPath = resolved.folderPath;
		filePath = resolved.filePath;
	} catch (err) {
		return {
			ok: false,
			message: err instanceof Error ? err.message : String(err),
		};
	}

	if (
		folderPath !== '' &&
		app.vault.getAbstractFileByPath(folderPath) !== null
	) {
		return {
			ok: false,
			message: `A folder already exists at ${folderPath}. Try a different name.`,
		};
	}
	if (app.vault.getAbstractFileByPath(filePath) !== null) {
		return {
			ok: false,
			message: `A file already exists at ${filePath}. Try a different name.`,
		};
	}
	return {
		ok: true,
		message: `Will create at ${folderPath === '' ? filePath : folderPath}.`,
	};
}

/** Append a single bullet to the Parse step's summary list. */
function appendSummaryRow(list: HTMLElement, text: string): void {
	list.createEl('li', {
		cls: 'dbench-import-wizard__summary-row',
		text,
	});
}

function pluralize(word: string, n: number): string {
	return n === 1 ? word : `${word}s`;
}

/**
 * Per-target counts rendered into the Hierarchy step's summary
 * region. Computed by combining the auto-detect mapping with current
 * overrides so the badge tracks live edits. Re-rendered (full empty +
 * fill) on every dropdown change since the count totals shift; cheap
 * since the maps are small.
 */
function renderHierarchyCounts(
	parent: HTMLElement,
	auto: HierarchyMapping,
	overrides: Map<string, HierarchyTarget>
): void {
	parent.empty();
	const counts: Record<HierarchyTarget, number> = {
		chapter: 0,
		scene: 0,
		'sub-scene': 0,
		'extras-above': 0,
		'extras-below': 0,
		skip: 0,
	};
	for (const id of auto.byId.keys()) {
		counts[effectiveTarget(id, auto, overrides)] += 1;
	}
	for (const target of HIERARCHY_TARGETS) {
		const n = counts[target];
		if (n === 0) continue;
		parent.createEl('span', {
			cls: `dbench-import-wizard__hier-badge dbench-import-wizard__hier-badge--${target}`,
			text: `${targetLabel(target)}: ${n}`,
		});
	}
}

function targetLabel(target: HierarchyTarget): string {
	switch (target) {
		case 'chapter':
			return 'Chapter';
		case 'scene':
			return 'Scene';
		case 'sub-scene':
			return 'Sub-scene';
		case 'extras-above':
			return 'Part / Book (frontmatter)';
		case 'extras-below':
			return 'Merge into parent';
		case 'skip':
			return 'Skip';
	}
}

/**
 * Encode a `StatusTarget` as a `<select>` option value. The encoding
 * uses a discriminator prefix (`e:` / `n:` / `d:`) followed by the
 * payload string; this is safe even when DB status names contain `:`
 * because we split on the FIRST colon only.
 */
function encodeStatusOption(target: StatusTarget): string {
	if (target.kind === 'existing') return `e:${target.dbStatus}`;
	if (target.kind === 'new') return 'n:';
	return 'd:';
}

function decodeStatusOption(value: string): StatusTarget {
	if (value.startsWith('e:')) {
		return { kind: 'existing', dbStatus: value.slice(2) };
	}
	if (value === 'n:') {
		// `statusName` is filled in by the caller using the Scrivener
		// status title verbatim (the writer doesn't pick it).
		return { kind: 'new', statusName: '' };
	}
	return { kind: 'drop' };
}

/** Per-row custom-field dropdown for the Metadata step. Three options:
 *  `scrivener-<id>` (default), `dbench-<id>` (uncommon), or drop. */
function renderCustomFieldDropdown(
	parent: HTMLElement,
	fieldId: string,
	mapping: MetadataMapping
): void {
	const select = parent.createEl('select', {
		cls: 'dbench-import-wizard__meta-target',
	});
	const scrivKey = `scrivener-${fieldId}`;
	const dbenchKey = `dbench-${fieldId}`;
	const current = mapping.customFields.get(fieldId);

	const optScriv = select.createEl('option', {
		value: scrivKey,
		text: scrivKey,
	});
	if (current === scrivKey) optScriv.selected = true;

	const optDbench = select.createEl('option', {
		value: dbenchKey,
		text: dbenchKey,
	});
	if (current === dbenchKey) optDbench.selected = true;

	const dropSentinel = '__drop__';
	const optDrop = select.createEl('option', {
		value: dropSentinel,
		text: 'Drop',
	});
	if (current === null) optDrop.selected = true;

	select.addEventListener('change', () => {
		const value: CustomFieldTarget =
			select.value === dropSentinel ? null : select.value;
		mapping.customFields.set(fieldId, value);
	});
}
