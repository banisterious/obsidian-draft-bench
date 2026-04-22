import type { ProjectWordCounts } from '../../../core/word-count-cache';
import type { TabContext, TabDefinition } from './types';

function render(container: HTMLElement, context: TabContext): void {
	const { selectedProject } = context;

	if (!selectedProject) {
		container.createEl('p', {
			cls: 'dbench-control-center__empty',
			text: 'Select a project from the dropdown above to view its overview.',
		});
		return;
	}

	const { file, frontmatter } = selectedProject;

	container.createEl('h2', {
		cls: 'dbench-control-center__project-title',
		text: file.basename,
	});

	const meta = container.createEl('dl', {
		cls: 'dbench-control-center__meta',
	});

	appendMetaRow(meta, 'Status', frontmatter['dbench-status']);
	appendMetaRow(meta, 'Shape', frontmatter['dbench-project-shape']);
	appendMetaRow(meta, 'Identifier', frontmatter['dbench-id']);

	renderWordCounts(container, context);
}

function renderWordCounts(container: HTMLElement, context: TabContext): void {
	const section = container.createDiv({
		cls: 'dbench-control-center__word-counts',
	});
	section.createEl('h3', { text: 'Word count' });

	const body = section.createDiv({
		cls: 'dbench-control-center__word-counts-body',
	});
	body.createEl('p', {
		cls: 'dbench-control-center__placeholder',
		text: 'Counting...',
	});

	const project = context.selectedProject;
	if (!project) return;

	void context.plugin.wordCounts
		.countForProject(project)
		.then((counts) => {
			if (!body.isConnected) return;
			body.empty();
			body.appendChild(
				buildWordCountsView(counts, context.plugin.settings.statusVocabulary)
			);
		})
		.catch((err: unknown) => {
			if (!body.isConnected) return;
			const message = err instanceof Error ? err.message : String(err);
			body.empty();
			body.createEl('p', {
				cls: 'dbench-control-center__empty',
				text: `Could not load word counts: ${message}`,
			});
		});
}

function buildWordCountsView(
	counts: ProjectWordCounts,
	vocabulary: readonly string[]
): HTMLElement {
	const wrapper = document.createElement('div');

	const total = wrapper.createDiv({
		cls: 'dbench-control-center__word-counts-total',
	});
	total.createEl('span', {
		cls: 'dbench-control-center__word-counts-total-value',
		text: formatNumber(counts.total),
	});
	total.createEl('span', {
		cls: 'dbench-control-center__word-counts-total-label',
		text: counts.total === 1 ? 'word' : 'words',
	});

	const breakdown = wrapper.createEl('dl', {
		cls: 'dbench-control-center__status-breakdown',
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
		const empty = wrapper.createEl('p', {
			cls: 'dbench-control-center__empty',
			text: 'No scenes in this project yet.',
		});
		void empty;
	}

	return wrapper;
}

function appendStatusRow(
	dl: HTMLElement,
	status: string,
	words: number,
	scenes: number
): void {
	dl.createEl('dt', {
		cls: 'dbench-control-center__status-label',
		text: status,
	});
	dl.createEl('dd', {
		cls: 'dbench-control-center__status-value',
		text: `${scenes} ${scenes === 1 ? 'scene' : 'scenes'}, ${formatNumber(
			words
		)} ${words === 1 ? 'word' : 'words'}`,
	});
}

function appendMetaRow(dl: HTMLElement, label: string, value: string): void {
	dl.createEl('dt', {
		cls: 'dbench-control-center__meta-label',
		text: label,
	});
	dl.createEl('dd', {
		cls: 'dbench-control-center__meta-value',
		text: value === '' ? '-' : value,
	});
}

function formatNumber(n: number): string {
	return n.toLocaleString();
}

export const projectTab: TabDefinition = {
	id: 'project',
	name: 'Project',
	icon: 'book-open',
	render,
};
