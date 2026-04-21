import type { TabContext, TabDefinition } from './types';

function render(container: HTMLElement, _context: TabContext): void {
	container.createEl('p', {
		cls: 'dbench-control-center__placeholder',
		text: 'File compilation arrives in a later phase.',
	});
}

export const compileTab: TabDefinition = {
	id: 'compile',
	name: 'Compile',
	icon: 'book-marked',
	render,
};
