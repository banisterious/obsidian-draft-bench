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

	container.createEl('p', {
		cls: 'dbench-control-center__placeholder',
		text: 'Synopsis and word counts arrive in a later phase.',
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

export const projectTab: TabDefinition = {
	id: 'project',
	name: 'Project',
	icon: 'book-open',
	render,
};
