import type { TabContext, TabDefinition } from './types';

function render(container: HTMLElement, _context: TabContext): void {
	container.createEl('p', {
		cls: 'dbench-control-center__placeholder',
		text: 'Template management arrives in a later phase. Scenes use the built-in scene template for now.',
	});
}

export const templatesTab: TabDefinition = {
	id: 'templates',
	name: 'Templates',
	icon: 'file-text',
	render,
};
