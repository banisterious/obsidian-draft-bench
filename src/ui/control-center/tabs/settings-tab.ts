import { DraftBenchSettingTab } from '../../../settings/settings-tab';
import type { TabContext, TabDefinition } from './types';

function render(container: HTMLElement, context: TabContext): void {
	const embedded = new DraftBenchSettingTab(context.app, context.plugin);
	embedded.containerEl = container;
	embedded.display();
}

export const settingsTab: TabDefinition = {
	id: 'settings',
	name: 'Settings',
	icon: 'settings',
	render,
};
