import type { ProjectNote } from '../../../core/discovery';
import type { ProjectWordCounts } from '../../../core/word-count-cache';
import { formatProgress } from '../../../core/targets';

/**
 * Project-summary section body renderer. Adapted from the Control
 * Center's former Project-tab rendering; scoped to a leaf section
 * (no tab chrome). The outer section — collapsible header, ARIA
 * accordion, lazy-render hook — is provided by the section-base
 * primitive; this function fills in the body.
 *
 * Rendering is split into a sync phase (meta rows, placeholder) and
 * an async phase (word counts). The caller is responsible for
 * invoking the async phase via the word-count cache and re-rendering
 * when values arrive.
 */
export function renderProjectSummaryBody(
	body: HTMLElement,
	project: ProjectNote,
	vocabulary: readonly string[],
	wordCountsPromise: Promise<ProjectWordCounts>
): void {
	body.empty();

	const meta = body.createEl('dl', {
		cls: 'dbench-manuscript-view__meta',
	});
	appendMetaRow(meta, 'Status', project.frontmatter['dbench-status']);

	// Shape + Identifier are technical metadata writers rarely need
	// day-to-day. Tucked behind a native `<details>` disclosure so
	// they remain one click away (debugging, support) without
	// consuming primary sidebar real estate. Using the native element
	// inherits theme styling for the summary row + chevron.
	const detailsEl = body.createEl('details', {
		cls: 'dbench-manuscript-view__details',
	});
	detailsEl.createEl('summary', {
		cls: 'dbench-manuscript-view__details-summary',
		text: 'Details',
	});
	const detailsMeta = detailsEl.createEl('dl', {
		cls: 'dbench-manuscript-view__meta dbench-manuscript-view__meta--details',
	});
	appendMetaRow(detailsMeta, 'Shape', project.frontmatter['dbench-project-shape']);
	appendMetaRow(detailsMeta, 'Identifier', project.frontmatter['dbench-id']);

	const wordCounts = body.createDiv({
		cls: 'dbench-manuscript-view__word-counts',
	});
	const wordCountsBody = wordCounts.createDiv({
		cls: 'dbench-manuscript-view__word-counts-body',
	});
	wordCountsBody.createEl('p', {
		cls: 'dbench-manuscript-view__placeholder',
		text: 'Counting...',
	});

	void wordCountsPromise
		.then((counts) => {
			if (!wordCountsBody.isConnected) return;
			wordCountsBody.empty();
			wordCountsBody.appendChild(buildWordCountsView(counts, vocabulary));
		})
		.catch((err: unknown) => {
			if (!wordCountsBody.isConnected) return;
			const message = err instanceof Error ? err.message : String(err);
			wordCountsBody.empty();
			wordCountsBody.createEl('p', {
				cls: 'dbench-manuscript-view__placeholder',
				text: `Could not load word counts: ${message}`,
			});
		});
}

function buildWordCountsView(
	counts: ProjectWordCounts,
	vocabulary: readonly string[]
): HTMLElement {
	const wrapper = document.createElement('div');

	// Targeted project: the progress hero carries "1,553 / 5,000 words
	// (31%)" + the fill bar, so the big-number total below it would
	// duplicate the count. Targetless project: show the big-number
	// total since there's no hero to carry the count.
	if (counts.projectTarget !== null) {
		wrapper.appendChild(buildProgressHero(counts.total, counts.projectTarget));
	} else {
		const total = wrapper.createDiv({
			cls: 'dbench-manuscript-view__word-counts-total',
		});
		total.createEl('span', {
			cls: 'dbench-manuscript-view__word-counts-total-value',
			text: formatNumber(counts.total),
		});
		total.createEl('span', {
			cls: 'dbench-manuscript-view__word-counts-total-label',
			text: counts.total === 1 ? 'word' : 'words',
		});
	}

	const breakdown = wrapper.createEl('dl', {
		cls: 'dbench-manuscript-view__status-breakdown',
	});

	// Iterate the writer's configured vocabulary first (so rows appear in
	// their chosen order), then append any out-of-vocab buckets the cache
	// discovered on scenes (statuses the writer has since removed but
	// haven't been migrated off existing notes). Empty buckets are skipped.
	const seen = new Set<string>();
	const rows: string[] = [];
	for (const status of vocabulary) {
		if (!seen.has(status)) {
			seen.add(status);
			rows.push(status);
		}
	}
	for (const status of Object.keys(counts.scenesByStatus)) {
		if (!seen.has(status)) {
			seen.add(status);
			rows.push(status);
		}
	}

	let renderedAny = false;
	for (const status of rows) {
		const sceneCount = counts.scenesByStatus[status] ?? 0;
		if (sceneCount === 0) continue;
		renderedAny = true;
		appendStatusRow(
			breakdown,
			status,
			counts.wordsByStatus[status] ?? 0,
			sceneCount
		);
	}

	if (!renderedAny) {
		wrapper.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: 'No scenes in this project yet.',
		});
	}

	return wrapper;
}

function buildProgressHero(count: number, target: number): HTMLElement {
	const view = formatProgress(count, target);
	const hero = document.createElement('div');
	hero.className = 'dbench-manuscript-view__progress-hero';
	if (view.overage) {
		hero.classList.add('dbench-manuscript-view__progress-hero--overage');
	}

	hero.createEl('div', {
		cls: 'dbench-manuscript-view__progress-label',
		text: view.label,
	});

	const track = hero.createDiv({
		cls: 'dbench-manuscript-view__progress-track',
	});
	const fill = track.createDiv({
		cls: 'dbench-manuscript-view__progress-fill',
	});
	fill.style.width = `${view.percent}%`;

	return hero;
}

function appendStatusRow(
	dl: HTMLElement,
	status: string,
	words: number,
	scenes: number
): void {
	// `data-status` drives the ::before colored-dot style in
	// manuscript-view.css; lowercased so CSS selectors match
	// regardless of vocabulary casing.
	dl.createEl('dt', {
		cls: 'dbench-manuscript-view__status-label',
		text: status,
		attr: { 'data-status': status.toLowerCase() },
	});
	dl.createEl('dd', {
		cls: 'dbench-manuscript-view__status-value',
		text: `${scenes} ${scenes === 1 ? 'scene' : 'scenes'}, ${formatNumber(
			words
		)} ${words === 1 ? 'word' : 'words'}`,
	});
}

function appendMetaRow(dl: HTMLElement, label: string, value: string): void {
	dl.createEl('dt', {
		cls: 'dbench-manuscript-view__meta-label',
		text: label,
	});
	dl.createEl('dd', {
		cls: 'dbench-manuscript-view__meta-value',
		text: value === '' ? '-' : value,
	});
}

function formatNumber(n: number): string {
	return n.toLocaleString();
}
