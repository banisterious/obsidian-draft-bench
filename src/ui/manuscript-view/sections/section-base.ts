import { setIcon } from 'obsidian';

/**
 * Collapsible section primitive with keyboard / ARIA accordion
 * support. Adapted from the Charted Roots `section-base` pattern (see
 * [dockable-view-reference.md](../../../../docs/planning/dockable-view-reference.md)
 * Part 2). Each section renders as a header (chevron + title +
 * optional summary) plus a body container; the body's expanded state
 * is driven by `options.expanded` and a caller-supplied `onToggle`
 * handler.
 *
 * The function returns the body element so callers can render further
 * content into it. When `options.hidden` is true the section is
 * skipped entirely and `null` is returned.
 *
 * Keyboard: Enter / Space toggle the section; ArrowUp / ArrowDown /
 * Home / End navigate focus across sibling section headers when
 * `options.siblings` is provided.
 *
 * Lazy rendering: if the section starts collapsed AND
 * `options.contentRenderer` is provided, the renderer is deferred
 * until first expand. Useful for sections with heavy DOM work (long
 * scene lists, chart/map integrations).
 */
export interface SectionOptions {
	/** Stable id used for `aria-controls` and for keying persisted state. */
	sectionId: string;
	/** Header title. */
	title: string;
	/** Optional summary shown on the header (e.g., "12 scenes, 8,240 words"). */
	summary?: string;
	/** Whether the section is currently expanded. */
	expanded: boolean;
	/** Called with the new expanded state when the section is toggled. */
	onToggle: (sectionId: string, expanded: boolean) => void;
	/** Optional Lucide icon shown left of the chevron. */
	icon?: string;
	/** Skip rendering entirely. Returns `null` from `renderSection`. */
	hidden?: boolean;
	/**
	 * Deferred renderer for the body. When present AND the section
	 * starts collapsed, the renderer is called on first expand; when
	 * the section starts expanded, it is called immediately. Callers
	 * that do their own rendering can omit this and populate the
	 * returned body element directly.
	 */
	contentRenderer?: (body: HTMLElement) => void;
	/** Called after the section collapses (runtime teardown hook). */
	onCollapse?: () => void;
	/** Called after the section expands (runtime setup hook). */
	onExpand?: () => void;
}

/**
 * Render a collapsible section into `parent`. Returns the body
 * element when the section is rendered, or `null` when `hidden`.
 */
export function renderSection(
	parent: HTMLElement,
	options: SectionOptions
): HTMLElement | null {
	if (options.hidden) return null;

	const section = parent.createEl('section', {
		cls: 'dbench-manuscript-view__section',
	});
	if (options.expanded) {
		section.addClass('dbench-manuscript-view__section--expanded');
	}

	const headerId = `dbench-section-header-${options.sectionId}`;
	const bodyId = `dbench-section-body-${options.sectionId}`;

	const header = section.createEl('div', {
		cls: 'dbench-manuscript-view__section-header',
		attr: {
			id: headerId,
			role: 'button',
			tabindex: '0',
			'aria-expanded': String(options.expanded),
			'aria-controls': bodyId,
		},
	});

	const chevron = header.createEl('span', {
		cls: 'dbench-manuscript-view__section-chevron',
		attr: { 'aria-hidden': 'true' },
	});
	setIcon(chevron, options.expanded ? 'chevron-down' : 'chevron-right');

	if (options.icon) {
		const iconEl = header.createEl('span', {
			cls: 'dbench-manuscript-view__section-icon',
			attr: { 'aria-hidden': 'true' },
		});
		setIcon(iconEl, options.icon);
	}

	header.createEl('span', {
		cls: 'dbench-manuscript-view__section-title',
		text: options.title,
	});

	if (options.summary) {
		header.createEl('span', {
			cls: 'dbench-manuscript-view__section-summary',
			text: options.summary,
		});
	}

	const body = section.createEl('div', {
		cls: 'dbench-manuscript-view__section-body',
		attr: {
			id: bodyId,
			role: 'region',
			'aria-labelledby': headerId,
		},
	});
	if (!options.expanded) {
		body.addClass('dbench-manuscript-view__section-body--collapsed');
	}

	// Lazy-render pattern: if a contentRenderer is provided, delay
	// calling it until the section first expands. If already expanded,
	// call it now.
	let rendered = false;
	const renderIfNeeded = (): void => {
		if (rendered || !options.contentRenderer) return;
		rendered = true;
		options.contentRenderer(body);
	};
	if (options.expanded) renderIfNeeded();

	const toggle = (): void => {
		const nextExpanded = !section.hasClass(
			'dbench-manuscript-view__section--expanded'
		);
		section.toggleClass('dbench-manuscript-view__section--expanded', nextExpanded);
		body.toggleClass(
			'dbench-manuscript-view__section-body--collapsed',
			!nextExpanded
		);
		header.setAttribute('aria-expanded', String(nextExpanded));
		setIcon(chevron, nextExpanded ? 'chevron-down' : 'chevron-right');

		if (nextExpanded) {
			renderIfNeeded();
			options.onExpand?.();
		} else {
			options.onCollapse?.();
		}

		options.onToggle(options.sectionId, nextExpanded);
	};

	header.addEventListener('click', (ev) => {
		ev.preventDefault();
		toggle();
	});

	header.addEventListener('keydown', (ev) => {
		if (ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			toggle();
		}
	});

	return body;
}
