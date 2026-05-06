import { setIcon } from 'obsidian';
import type DraftBenchPlugin from '../../../main';
import type {
	PreviewFontFamily,
	PreviewReadingWidth,
	PreviewTextAlign,
	PreviewTypography,
} from '../../model/settings';

/*
 * Reading-width values are tuned against the Manuscript Builder modal's
 * `min(960px, 92vw)` width; reused for the Manuscript view's Continuous
 * mode (per docs/planning/manuscript-view-continuous-mode.md § 6: same
 * controls + same values across both surfaces). 50em (~800px) and 40em
 * (~640px) give visibly distinct widths on a 960px modal; in a wider
 * leaf they cap the column similarly, and in a narrow leaf the column
 * uses the leaf width without changing.
 */
const PREVIEW_READING_WIDTH_VALUE: Record<PreviewReadingWidth, string> = {
	full: 'none',
	medium: '50em',
	narrow: '40em',
};

const PREVIEW_FONT_FAMILY_VALUE: Record<PreviewFontFamily, string> = {
	default: 'var(--font-text)',
	serif: 'Georgia, "Times New Roman", serif',
	sans: 'system-ui, -apple-system, sans-serif',
	mono: 'var(--font-monospace)',
};

const PREVIEW_FONT_SIZE_MIN = 12;
const PREVIEW_FONT_SIZE_MAX = 24;

/**
 * Apply the four preview-typography settings as inline
 * `--dbench-preview-*` CSS variables on `scopeEl`. The CSS rules
 * (declared in styles/manuscript-builder.css and applied on the
 * Continuous body in styles/manuscript-view.css) consume these vars
 * to control text alignment, max-width, font-size, and font-family
 * within the rendered prose container.
 */
export function applyPreviewTypography(
	scopeEl: HTMLElement,
	t: PreviewTypography
): void {
	scopeEl.style.setProperty('--dbench-preview-text-align', t.textAlign);
	scopeEl.style.setProperty(
		'--dbench-preview-max-width',
		PREVIEW_READING_WIDTH_VALUE[t.readingWidth]
	);
	scopeEl.style.setProperty(
		'--dbench-preview-font-size',
		`${t.fontSize}px`
	);
	scopeEl.style.setProperty(
		'--dbench-preview-font-family',
		PREVIEW_FONT_FAMILY_VALUE[t.fontFamily]
	);
}

/**
 * Render the four-control preview typography toolbar. Mounted by the
 * Manuscript Builder Preview tab (sticky-header region) and by the
 * Manuscript view's Continuous mode body. Each control writes its new
 * value into `plugin.settings.previewTypography`, persists via
 * `saveSettings()`, and re-applies the inline CSS variables on
 * `scopeEl` so the typography updates without a re-render.
 *
 * @returns the toolbar root element so callers can move / remove it.
 */
export function renderPreviewToolbar(
	parent: HTMLElement,
	plugin: DraftBenchPlugin,
	scopeEl: HTMLElement
): HTMLElement {
	const toolbar = parent.createDiv({
		cls: 'dbench-preview-toolbar',
		attr: { role: 'toolbar', 'aria-label': 'Preview typography' },
	});
	renderTextAlignToggle(toolbar, plugin, scopeEl);
	renderReadingWidthToggle(toolbar, plugin, scopeEl);
	renderFontSizeStepper(toolbar, plugin, scopeEl);
	renderFontFamilyDropdown(toolbar, plugin, scopeEl);
	return toolbar;
}

function renderTextAlignToggle(
	parent: HTMLElement,
	plugin: DraftBenchPlugin,
	scopeEl: HTMLElement
): void {
	const group = parent.createDiv({
		cls: 'dbench-preview-toolbar__group',
		attr: { role: 'group', 'aria-label': 'Text alignment' },
	});
	const buttons = new Map<PreviewTextAlign, HTMLElement>();
	const setActive = (value: PreviewTextAlign): void => {
		buttons.forEach((btn, val) => {
			btn.toggleClass(
				'dbench-preview-toolbar__button--active',
				val === value
			);
		});
	};
	const make = (
		value: PreviewTextAlign,
		label: string,
		icon: string
	): void => {
		const btn = group.createEl('button', {
			cls: 'dbench-preview-toolbar__button',
			attr: { type: 'button', 'aria-label': label },
		});
		setIcon(btn, icon);
		btn.addEventListener('click', () => {
			plugin.settings.previewTypography.textAlign = value;
			void plugin.saveSettings();
			applyPreviewTypography(scopeEl, plugin.settings.previewTypography);
			setActive(value);
		});
		buttons.set(value, btn);
	};
	make('left', 'Align left', 'align-left');
	make('justify', 'Justify', 'align-justify');
	setActive(plugin.settings.previewTypography.textAlign);
}

function renderReadingWidthToggle(
	parent: HTMLElement,
	plugin: DraftBenchPlugin,
	scopeEl: HTMLElement
): void {
	const group = parent.createDiv({
		cls: 'dbench-preview-toolbar__group',
		attr: { role: 'group', 'aria-label': 'Reading width' },
	});
	const buttons = new Map<PreviewReadingWidth, HTMLElement>();
	const setActive = (value: PreviewReadingWidth): void => {
		buttons.forEach((btn, val) => {
			btn.toggleClass(
				'dbench-preview-toolbar__button--active',
				val === value
			);
		});
	};
	const make = (value: PreviewReadingWidth, label: string): void => {
		const btn = group.createEl('button', {
			cls: 'dbench-preview-toolbar__button dbench-preview-toolbar__button--text',
			text: label,
			attr: { type: 'button', 'aria-label': `Reading width ${label}` },
		});
		btn.addEventListener('click', () => {
			plugin.settings.previewTypography.readingWidth = value;
			void plugin.saveSettings();
			applyPreviewTypography(scopeEl, plugin.settings.previewTypography);
			setActive(value);
		});
		buttons.set(value, btn);
	};
	make('full', 'Full');
	make('medium', 'Med');
	make('narrow', 'Narrow');
	setActive(plugin.settings.previewTypography.readingWidth);
}

function renderFontSizeStepper(
	parent: HTMLElement,
	plugin: DraftBenchPlugin,
	scopeEl: HTMLElement
): void {
	const group = parent.createDiv({
		cls: 'dbench-preview-toolbar__group',
		attr: { role: 'group', 'aria-label': 'Font size' },
	});
	const minus = group.createEl('button', {
		cls: 'dbench-preview-toolbar__button',
		attr: { type: 'button', 'aria-label': 'Decrease font size' },
	});
	setIcon(minus, 'minus');
	const valueEl = group.createSpan({
		cls: 'dbench-preview-toolbar__value',
		text: `${plugin.settings.previewTypography.fontSize}px`,
		attr: { 'aria-live': 'polite' },
	});
	const plus = group.createEl('button', {
		cls: 'dbench-preview-toolbar__button',
		attr: { type: 'button', 'aria-label': 'Increase font size' },
	});
	setIcon(plus, 'plus');

	const refreshDisabled = (): void => {
		const fs = plugin.settings.previewTypography.fontSize;
		minus.disabled = fs <= PREVIEW_FONT_SIZE_MIN;
		plus.disabled = fs >= PREVIEW_FONT_SIZE_MAX;
	};
	const step = (delta: number): void => {
		const current = plugin.settings.previewTypography.fontSize;
		const next = Math.max(
			PREVIEW_FONT_SIZE_MIN,
			Math.min(PREVIEW_FONT_SIZE_MAX, current + delta)
		);
		if (next === current) return;
		plugin.settings.previewTypography.fontSize = next;
		void plugin.saveSettings();
		applyPreviewTypography(scopeEl, plugin.settings.previewTypography);
		valueEl.setText(`${next}px`);
		refreshDisabled();
	};
	minus.addEventListener('click', () => step(-1));
	plus.addEventListener('click', () => step(1));
	refreshDisabled();
}

function renderFontFamilyDropdown(
	parent: HTMLElement,
	plugin: DraftBenchPlugin,
	scopeEl: HTMLElement
): void {
	const select = parent.createEl('select', {
		cls: 'dropdown dbench-preview-toolbar__select',
		attr: { 'aria-label': 'Font family' },
	});
	const options: Array<{ value: PreviewFontFamily; label: string }> = [
		{ value: 'default', label: 'Theme default' },
		{ value: 'serif', label: 'Serif' },
		{ value: 'sans', label: 'Sans-serif' },
		{ value: 'mono', label: 'Monospace' },
	];
	const current = plugin.settings.previewTypography.fontFamily;
	for (const o of options) {
		const opt = select.createEl('option', {
			value: o.value,
			text: o.label,
		});
		if (o.value === current) opt.selected = true;
	}
	select.addEventListener('change', () => {
		plugin.settings.previewTypography.fontFamily =
			select.value as PreviewFontFamily;
		void plugin.saveSettings();
		applyPreviewTypography(scopeEl, plugin.settings.previewTypography);
	});
}
