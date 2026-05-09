import {
	App,
	Modal,
	Notice,
	Platform,
	Setting,
	setIcon,
	TFile,
	TFolder,
} from 'obsidian';
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
	loadSnapshots,
	type SnapshotMetadata,
} from './snapshots';
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
import {
	buildImportPlan,
	type ImportPlan,
	type PlanEntry,
} from './import-plan';
import {
	executeImportPlan,
	type ImportResult,
} from './import-write';
import {
	copyFromDataTransfer,
	copyFromFileList,
	FolderImportError,
	supportsDirectoryInput,
} from './folder-import';
import type { DraftBenchLinker } from '../../core/linker';

/** Vault folder where dropped / picked `.scriv` bundles get copied
 *  before the wizard imports from them. Defaulting here for V1; can
 *  surface as a setting later if writers ask. */
const IMPORT_STAGING_FOLDER = 'Imports';

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
export interface ParsedBundle {
	project: ScrivProject;
	summary: ProjectSummary;
	/** Total snapshot count surfaced on the Parse step's summary card.
	 *  Cheap to compute (just counts `.rtf` files); see also
	 *  `snapshotsByUuid` for the rich metadata used by the Plan +
	 *  Write passes. */
	snapshotCount: number;
	/** Per-document snapshot metadata, keyed by binder UUID. Populated
	 *  by `loadSnapshots` during `loadAndParseBundle`. Documents without
	 *  snapshots don't appear in the map. */
	snapshotsByUuid: Map<string, SnapshotMetadata[]>;
	/** Best-effort warnings from `loadSnapshots` (malformed `index.xml`,
	 *  missing RTF bodies, etc.). Surfaced in the import error log
	 *  alongside the parser's own warnings. */
	snapshotWarnings: string[];
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
export interface ScrivenerImportFormData {
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
	/** Writer-driven import options from step 5. Independent of the
	 *  source bundle (not reset on source change). Defaults match
	 *  the meta-level locks in scrivener-import.md (Research off,
	 *  snapshots off, etc.). */
	options: ImportOptions;
}

/**
 * Per-import writer options surfaced in the Options step (5). Defaults
 * track the planning doc's safe-default principle (off-by-default for
 * anything that produces additional vault content like snapshots or
 * Research-folder bulk).
 */
export interface ImportOptions {
	/** Import the bundle's Research folder + custom-root folders
	 *  (Characters / Places / Front Matter / etc.). Default off
	 *  per § 7. */
	importResearch: boolean;
	/** Import per-document snapshots as DB drafts. Default off per
	 *  § 4 (avoids bulk vault material on first import). */
	importSnapshots: boolean;
	/** Snapshot cap per scene when importSnapshots is on. Per § 4:
	 *  options 1 / 3 / 5 / "all"; default 3. */
	snapshotCap: SnapshotCap;
	/** Filename template for imported snapshots. Variables: `{scene}`
	 *  `{title}` `{date}` `{date_compact}` `{time}` `{n}` (per § 4
	 *  amendment 2026-05-06). Default matches native DB drafts. */
	snapshotFilenameTemplate: string;
	/** Vault folder where inline images get extracted (per § 6).
	 *  Relative to the new project's folder. */
	imageExtractionFolder: string;
	/** When on, create an "Imported defaults" compile preset stub so
	 *  the writer has a starting point. Default off per § "compile
	 *  settings: skipped entirely" — opt-in convenience. */
	createDefaultCompilePreset: boolean;
}

export type SnapshotCap = 1 | 3 | 5 | 'all';

export const DEFAULT_SNAPSHOT_FILENAME_TEMPLATE =
	'{scene} - Draft {n} ({date_compact})';

export const DEFAULT_IMAGE_EXTRACTION_FOLDER = 'Research/Images/';

function getDefaultImportOptions(): ImportOptions {
	return {
		importResearch: false,
		importSnapshots: false,
		snapshotCap: 3,
		snapshotFilenameTemplate: DEFAULT_SNAPSHOT_FILENAME_TEMPLATE,
		imageExtractionFolder: DEFAULT_IMAGE_EXTRACTION_FOLDER,
		createDefaultCompilePreset: false,
	};
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
		options: getDefaultImportOptions(),
	};
}

export class ScrivenerImportWizardModal extends Modal {
	private currentStep: StepIndex = 0;
	private formData: ScrivenerImportFormData = getDefaultFormData();
	/** Reference to the Next button so input handlers can flip its
	 *  disabled state in place without re-rendering the whole step. */
	private nextButtonEl: HTMLButtonElement | null = null;

	private importResult: ImportResult | null = null;
	private importStatus = '';
	private importDone = false;
	/** Re-entrancy guard. Set true at the start of `runImport`; the
	 *  Import-step renderer skips re-triggering the pass while it's
	 *  still running. Without this, `onProgress`-driven re-renders
	 *  would call `runImport` again mid-flight, each new call racing
	 *  the previous on file creation and throwing "file exists" on
	 *  the second creator. */
	private importStarted = false;

	constructor(
		app: App,
		private settings: DraftBenchSettings,
		private linker: DraftBenchLinker,
		private saveSettings: () => Promise<void>
	) {
		super(app);
		this.modalEl.addClass('dbench-import-wizard', 'dbench-scope');
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Scrivener" is the product name (proper noun)
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

	/**
	 * Source step. Three intake paths, layered by platform support:
	 *
	 * - **Drag-drop zone** (desktop only). Drop a `.scriv` folder onto
	 *   the wizard; the handler walks via `webkitGetAsEntry()` and
	 *   copies into the vault under `Imports/<name>.scriv/`.
	 * - **"Pick a folder from your device" button** (desktop + Android
	 *   where `webkitdirectory` is supported). Same copy logic, driven
	 *   by `<input type="file" webkitdirectory>`.
	 * - **Detected folders list** (all platforms). Already-in-vault
	 *   `.scriv` bundles surfaced via `findScrivProjectFolders`.
	 *
	 * When the picker isn't supported (iOS WKWebView), an explicit
	 * note explains the file-manager copy flow so writers don't waste
	 * time looking for a missing button.
	 */
	private renderSourceStep(body: HTMLElement): void {
		const candidates = findScrivProjectFolders(this.app);
		const pickerSupported = supportsDirectoryInput();
		const showDropZone = Platform.isDesktopApp;
		const widgetVisible = showDropZone || pickerSupported;

		if (widgetVisible) {
			this.renderDropPickWidget(body, showDropZone, pickerSupported);
		}

		if (candidates.length > 0) {
			this.renderInVaultPicker(body, candidates);
		} else if (!widgetVisible) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__empty-state',
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Scrivener" is the product name (proper noun)
				text: 'No .scriv folders in this vault yet. Use your device\'s file manager to copy a Scrivener project bundle into your vault folder, then reopen this wizard.',
			});
		}
	}

	/**
	 * Combined drop-or-pick widget. The whole zone is both a drop
	 * target (when on desktop) and a click target that triggers a
	 * hidden `<input type="file" webkitdirectory>` (when the picker is
	 * supported). Visual layout: icon + main heading + subtext, all
	 * `pointer-events: none` so clicks land on the zone itself.
	 */
	private renderDropPickWidget(
		parent: HTMLElement,
		showDropZone: boolean,
		pickerSupported: boolean
	): void {
		const zone = parent.createDiv({
			cls: 'dbench-import-wizard__dropzone',
		});
		const content = zone.createDiv({
			cls: 'dbench-import-wizard__dropzone-content',
		});
		const iconWrap = content.createDiv({
			cls: 'dbench-import-wizard__dropzone-icon',
		});
		setIcon(iconWrap, 'upload');
		const mainText = content.createDiv({
			cls: 'dbench-import-wizard__dropzone-text',
		});
		const subText = content.createDiv({
			cls: 'dbench-import-wizard__dropzone-subtext',
		});

		if (showDropZone && pickerSupported) {
			mainText.setText('Drop a .scriv folder here');
			subText.setText('Or click to browse');
		} else if (pickerSupported) {
			mainText.setText('Tap to pick a .scriv folder');
			subText.setText('Choose from your device');
		} else {
			// Drop-only (rare; desktop without webkitdirectory).
			mainText.setText('Drop a .scriv folder here');
			subText.setText('');
		}

		let input: HTMLInputElement | null = null;
		if (pickerSupported) {
			input = zone.createEl('input', {
				cls: 'dbench-import-wizard__source-picker-input',
				attr: { type: 'file', multiple: 'true' },
			});
			input.webkitdirectory = true;
			input.addEventListener('change', () => {
				if (input && input.files && input.files.length > 0) {
					void this.handleFolderPick(input.files);
				}
			});
			zone.addClass('dbench-import-wizard__dropzone--clickable');
			zone.addEventListener('click', () => input?.click());
		}

		if (showDropZone) {
			zone.addEventListener('dragover', (ev) => {
				ev.preventDefault();
				zone.addClass('dbench-import-wizard__dropzone--active');
			});
			zone.addEventListener('dragleave', () => {
				zone.removeClass('dbench-import-wizard__dropzone--active');
			});
			zone.addEventListener('drop', (ev) => {
				ev.preventDefault();
				zone.removeClass('dbench-import-wizard__dropzone--active');
				if (!ev.dataTransfer) return;
				void this.handleFolderDrop(ev.dataTransfer);
			});
		}
	}

	/**
	 * Render an inline dropdown of `.scriv` folders detected in the
	 * vault. Replaces the older FuzzySuggestModal popup with a Setting
	 * + Dropdown for cleaner UX — typical vaults have 1-3 candidates,
	 * which fit comfortably in a select. The dropdown's value is
	 * controlled by `formData.sourcePath`; selecting an option updates
	 * `formData` and refreshes the Next-button gating in place.
	 */
	private renderInVaultPicker(
		parent: HTMLElement,
		candidates: TFolder[]
	): void {
		const candidatePaths = new Set(candidates.map((c) => c.path));
		const initial = candidatePaths.has(this.formData.sourcePath)
			? this.formData.sourcePath
			: '';

		new Setting(parent)
			.setName('Or pick from your vault')
			.setDesc(
				candidates.length === 1
					? '1 folder available.'
					: `${candidates.length} folders available.`
			)
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Select a folder…');
				for (const folder of candidates) {
					dropdown.addOption(folder.path, folder.path);
				}
				dropdown.setValue(initial);
				dropdown.onChange((value) => {
					this.formData.sourcePath = value;
					this.refreshNextButtonEnabled();
				});
			});
	}

	private async handleFolderDrop(dataTransfer: DataTransfer): Promise<void> {
		try {
			const result = await copyFromDataTransfer(
				this.app,
				dataTransfer,
				IMPORT_STAGING_FOLDER
			);
			new Notice(
				`Copied ${result.filesCopied} file${result.filesCopied === 1 ? '' : 's'} into ${result.vaultPath}.`
			);
			this.formData.sourcePath = result.vaultPath;
			this.renderCurrentStep();
		} catch (err) {
			this.surfaceFolderImportError(err);
		}
	}

	private async handleFolderPick(fileList: FileList): Promise<void> {
		try {
			const result = await copyFromFileList(
				this.app,
				fileList,
				IMPORT_STAGING_FOLDER
			);
			new Notice(
				`Copied ${result.filesCopied} file${result.filesCopied === 1 ? '' : 's'} into ${result.vaultPath}.`
			);
			this.formData.sourcePath = result.vaultPath;
			this.renderCurrentStep();
		} catch (err) {
			this.surfaceFolderImportError(err);
		}
	}

	private surfaceFolderImportError(err: unknown): void {
		const message =
			err instanceof FolderImportError
				? err.message
				: err instanceof Error
					? err.message
					: String(err);
		new Notice(`Could not import folder: ${message}`);
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

		body.createEl('p', {
			cls: 'dbench-import-wizard__help-text',
			text: 'Decide how source statuses, labels, and custom fields land in the new project. To rename or reorder existing statuses, edit your status vocabulary in plugin settings.',
		});

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
		body.createEl('h4', {
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
			const targetCell = row.createDiv({
				cls: 'dbench-import-wizard__meta-row-target-cell',
			});
			this.renderStatusTargetCell(targetCell, scrivId, mapping);
		}
	}

	/**
	 * Render the dropdown plus an optional inline text input for
	 * customizing the new-status name. The cell stacks: dropdown on
	 * top, input below (only when "Add as new" is selected). Input
	 * additions / removals happen on dropdown change without re-
	 * rendering the rest of the step.
	 */
	private renderStatusTargetCell(
		parent: HTMLElement,
		scrivId: string,
		mapping: MetadataMapping
	): void {
		const select = parent.createEl('select', {
			cls: 'dbench-import-wizard__meta-target',
		});
		const current = mapping.statuses.get(scrivId) ?? { kind: 'drop' };

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

		const addNewValue = encodeStatusOption({ kind: 'new', statusName: '' });
		const addNewOption = select.createEl('option', {
			value: addNewValue,
			text: 'Add as new status',
		});
		if (current.kind === 'new') addNewOption.selected = true;

		const dropValue = encodeStatusOption({ kind: 'drop' });
		const dropOption = select.createEl('option', {
			value: dropValue,
			text: 'Drop (use default)',
		});
		if (current.kind === 'drop') dropOption.selected = true;

		// New-status-name input. Visible only when target.kind === 'new';
		// re-attached / detached on dropdown change so writers can
		// rename before the import write phase commits to the vocab.
		let nameInput: HTMLInputElement | null = null;
		const ensureNameInput = (): void => {
			const target = mapping.statuses.get(scrivId);
			if (target?.kind !== 'new') {
				if (nameInput) {
					nameInput.remove();
					nameInput = null;
				}
				return;
			}
			if (!nameInput) {
				nameInput = parent.createEl('input', {
					cls: 'dbench-import-wizard__meta-new-name',
					attr: { type: 'text', placeholder: 'New status name' },
				});
				nameInput.value = target.statusName;
				nameInput.addEventListener('input', () => {
					if (!nameInput) return;
					const ex = mapping.statuses.get(scrivId);
					if (ex?.kind === 'new') {
						mapping.statuses.set(scrivId, {
							kind: 'new',
							statusName: nameInput.value,
						});
					}
				});
			}
		};

		select.addEventListener('change', () => {
			const decoded = decodeStatusOption(select.value);
			if (decoded.kind === 'new') {
				const existing = mapping.statuses.get(scrivId);
				if (existing && existing.kind === 'new') {
					mapping.statuses.set(scrivId, existing);
				} else {
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
			ensureNameInput();
		});

		ensureNameInput();
	}

	private renderLabelKeyField(
		body: HTMLElement,
		mapping: MetadataMapping
	): void {
		body.createEl('h4', {
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
		body.createEl('h4', {
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

	/**
	 * Options step. Toggles + inputs for writer-driven import
	 * preferences: Research / custom-root inclusion, snapshot import
	 * (cap + filename template), image extraction folder, default
	 * compile preset stub. Validation gate trivially passes per § 1.
	 *
	 * The snapshot filename-template field is conditionally rendered
	 * (only when the snapshot toggle is on); toggling re-renders the
	 * step so the field appears / disappears in place.
	 */
	private renderOptionsStep(body: HTMLElement): void {
		const opts = this.formData.options;

		new Setting(body)
			.setName('Import research')
			.setDesc(
				'Bring in the research folder and other non-manuscript top-level folders alongside the manuscript.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(opts.importResearch)
					.onChange((value) => {
						opts.importResearch = value;
					})
			);

		new Setting(body)
			.setName('Import snapshots')
			.setDesc(
				'Bring in per-document snapshots as draft files alongside each scene.'
			)
			.addToggle((toggle) =>
				toggle.setValue(opts.importSnapshots).onChange((value) => {
					opts.importSnapshots = value;
					this.renderCurrentStep();
				})
			);

		if (opts.importSnapshots) {
			new Setting(body)
				.setName('Snapshots per scene')
				.setDesc(
					'Cap how many snapshots to import per scene (most recent first).'
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOption('1', 'Most recent 1')
						.addOption('3', 'Most recent 3')
						.addOption('5', 'Most recent 5')
						.addOption('all', 'All')
						.setValue(String(opts.snapshotCap))
						.onChange((value) => {
							opts.snapshotCap = decodeSnapshotCap(value);
						})
				);

			new Setting(body)
				.setName('Snapshot filename template')
				.setDesc(
					'Variables: {scene} {title} {date} {date_compact} {time} {n}. Default matches native draft files.'
				)
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SNAPSHOT_FILENAME_TEMPLATE)
						.setValue(opts.snapshotFilenameTemplate)
						.onChange((value) => {
							opts.snapshotFilenameTemplate = value;
						})
				);
		}

		new Setting(body)
			.setName('Image extraction folder')
			.setDesc(
				'Vault folder under the new project where inline images get extracted.'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_IMAGE_EXTRACTION_FOLDER)
					.setValue(opts.imageExtractionFolder)
					.onChange((value) => {
						opts.imageExtractionFolder = value;
					})
			);

		new Setting(body)
			.setName('Create default compile preset')
			.setDesc(
				'Add a starter compile preset so the project has somewhere to begin.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(opts.createDefaultCompilePreset)
					.onChange((value) => {
						opts.createDefaultCompilePreset = value;
					})
			);
	}

	/**
	 * Preview step. Builds an `ImportPlan` from accumulated form data
	 * and renders three sections: a count summary, a warnings list,
	 * and the tree of vault files / folders that the Import write
	 * pass will create. Validation gate trivially passes per § 1
	 * (review-only step).
	 */
	private renderPreviewStep(body: HTMLElement): void {
		const fd = this.formData;
		if (!fd.parsedBundle) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__hint',
				text: 'No parsed bundle yet — go back to the previous step.',
			});
			return;
		}

		const auto = autoDetectHierarchy(
			fd.parsedBundle.project.binder.find(
				(b) => b.type === 'DraftFolder'
			) ?? {
				id: '',
				type: 'DraftFolder',
				title: '',
				keywords: [],
				statusId: null,
				labelId: null,
				includeInCompile: true,
				customMetaData: new Map(),
				created: '',
				modified: '',
				children: [],
			}
		);
		const plan = buildImportPlan(
			fd.parsedBundle.project,
			auto,
			fd.hierarchyOverrides,
			fd.destinationName,
			this.settings,
			fd.options
		);

		this.renderPreviewCounts(body, plan);
		if (plan.warnings.length > 0) {
			this.renderPreviewWarnings(body, plan.warnings);
		}
		this.renderPreviewTree(body, plan.entries);
	}

	private renderPreviewCounts(body: HTMLElement, plan: ImportPlan): void {
		body.createEl('h3', {
			cls: 'dbench-import-wizard__preview-section-title',
			text: 'Counts',
		});
		const list = body.createEl('ul', {
			cls: 'dbench-import-wizard__summary-list',
		});
		const c = plan.counts;
		const rows: Array<[string, number]> = [
			['Chapters', c.chapters],
			['Scenes', c.scenes],
			['Sub-scenes', c.subScenes],
			['Parts / extras above', c.extrasAbove],
			['Items merged into parents', c.extrasBelow],
			['Skipped', c.skipped],
			['Images', c.images],
		];
		for (const [name, n] of rows) {
			if (n === 0) continue;
			list.createEl('li', {
				cls: 'dbench-import-wizard__summary-row',
				text: `${name}: ${n}`,
			});
		}
	}

	private renderPreviewWarnings(
		body: HTMLElement,
		warnings: string[]
	): void {
		body.createEl('h3', {
			cls: 'dbench-import-wizard__preview-section-title',
			text: 'Warnings',
		});
		const list = body.createEl('ul', {
			cls: 'dbench-import-wizard__summary-list',
		});
		for (const w of warnings) {
			list.createEl('li', {
				cls: 'dbench-import-wizard__warning-row',
				text: w,
			});
		}
	}

	private renderPreviewTree(
		body: HTMLElement,
		entries: PlanEntry[]
	): void {
		body.createEl('h3', {
			cls: 'dbench-import-wizard__preview-section-title',
			text: 'Files to be created',
		});
		const tree = body.createDiv({
			cls: 'dbench-import-wizard__preview-tree',
		});
		for (const entry of entries) {
			const row = tree.createDiv({
				cls: `dbench-import-wizard__preview-row dbench-import-wizard__preview-row--${entry.kind}`,
			});
			row.style.paddingLeft = `${entry.depth * 1.25}rem`;
			row.createSpan({
				cls: 'dbench-import-wizard__preview-icon',
				text: previewIcon(entry.kind),
			});
			row.createSpan({
				cls: 'dbench-import-wizard__preview-path',
				text: entry.path,
			});
		}
	}

	/**
	 * Import step. Runs `executeImportPlan` once on first entry; renders
	 * progress (last status message + current/total counter). Auto-
	 * advances to the Complete step (7) when the import finishes,
	 * regardless of success / partial failure.
	 */
	private renderImportStep(body: HTMLElement): void {
		const fd = this.formData;
		body.createEl('p', {
			cls: 'dbench-import-wizard__progress',
			text:
				this.importStatus === ''
					? 'Starting import…'
					: this.importStatus,
		});

		if (
			this.importDone ||
			this.importResult !== null ||
			this.importStarted
		) {
			return;
		}
		if (!fd.parsedBundle || !fd.parsedSourcePath) {
			this.importDone = true;
			return;
		}

		void this.runImport();
	}

	private async runImport(): Promise<void> {
		this.importStarted = true;
		const fd = this.formData;
		if (!fd.parsedBundle) return;
		try {
			this.importResult = await executeImportPlan({
				app: this.app,
				settings: this.settings,
				linker: this.linker,
				saveSettings: this.saveSettings,
				bundle: fd.parsedBundle,
				bundleRootPath: fd.parsedSourcePath,
				formData: fd,
				onProgress: (message, current, total) => {
					this.importStatus = `${message} (${current}/${total})`;
					if (this.currentStep === 6) {
						this.renderCurrentStep();
					}
				},
			});
		} catch (err) {
			this.importResult = {
				projectFile: null,
				filesCreated: 0,
				errors: [
					{
						binderItemId: '',
						itemTitle: '(top-level)',
						message: err instanceof Error ? err.message : String(err),
					},
				],
				warnings: [],
			};
		}
		this.importDone = true;
		if (this.importResult && this.importResult.errors.length > 0) {
			new Notice(
				`Import finished with ${this.importResult.errors.length} error${this.importResult.errors.length === 1 ? '' : 's'}. Check the Complete step or the import errors file in the new project folder.`
			);
		}
		if (this.currentStep === 6) {
			this.currentStep = 7;
			this.renderCurrentStep();
		}
	}

	/**
	 * Complete step. Summary of created files + per-error list (if
	 * any) + Done button. Closes the wizard on Done.
	 */
	private renderCompleteStep(body: HTMLElement): void {
		const result = this.importResult;
		if (!result) {
			body.createEl('p', {
				cls: 'dbench-import-wizard__hint',
				text: 'No import result available.',
			});
			return;
		}

		body.createEl('h3', {
			cls: 'dbench-import-wizard__preview-section-title',
			text:
				result.errors.length === 0
					? 'Import complete'
					: 'Import complete with errors',
		});

		body.createEl('p', {
			cls: 'dbench-import-wizard__help-text',
			text: `${result.filesCreated} ${pluralize('file', result.filesCreated)} created${
				result.errors.length > 0
					? `, ${result.errors.length} ${pluralize('error', result.errors.length)} encountered`
					: ''
			}.`,
		});

		if (result.warnings.length > 0) {
			const wList = body.createEl('ul', {
				cls: 'dbench-import-wizard__summary-list',
			});
			for (const w of result.warnings) {
				wList.createEl('li', {
					cls: 'dbench-import-wizard__warning-row',
					text: w,
				});
			}
		}

		if (result.errors.length > 0) {
			body.createEl('h3', {
				cls: 'dbench-import-wizard__preview-section-title',
				text: 'Errors',
			});
			const errList = body.createEl('ul', {
				cls: 'dbench-import-wizard__summary-list',
			});
			for (const err of result.errors) {
				const item = errList.createEl('li', {
					cls: 'dbench-import-wizard__warning-row',
				});
				item.createSpan({
					cls: 'dbench-import-wizard__error-title',
					text: err.itemTitle,
				});
				item.createSpan({
					text: `: ${err.message}`,
				});
			}
			body.createEl('p', {
				cls: 'dbench-import-wizard__hint',
				text: 'Also written to the import errors file in the new project folder.',
			});
		}
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
	const { snapshotsByUuid, warnings: snapshotWarnings } =
		await loadSnapshots(app.vault.adapter, bundlePath);

	return {
		project,
		summary,
		snapshotCount,
		snapshotsByUuid,
		snapshotWarnings,
	};
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

/** Short text tag rendered next to each preview row indicating what
 *  kind of entry it is. Keeps the tree readable without emoji. */
function previewIcon(kind: PlanEntry['kind']): string {
	switch (kind) {
		case 'folder':
			return 'dir';
		case 'project-note':
			return 'proj';
		case 'chapter-note':
			return 'chap';
		case 'scene-note':
			return 'scn';
		case 'sub-scene-note':
			return 'sub';
	}
}

/** Decode the snapshot-cap dropdown value back to its typed form.
 *  The dropdown stores cap as a string; numeric-string values become
 *  numbers, "all" stays as the literal sentinel. */
function decodeSnapshotCap(value: string): SnapshotCap {
	if (value === 'all') return 'all';
	const n = parseInt(value, 10);
	if (n === 1 || n === 3 || n === 5) return n;
	return 3;
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
