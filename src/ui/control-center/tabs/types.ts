import type { App, IconName } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import type { DraftBenchLinker } from '../../../core/linker';
import type { ProjectNote, SceneNote } from '../../../core/discovery';

/**
 * Context object passed to every tab renderer. Bundles the app/plugin
 * handles, the currently selected project (if any), and the cached
 * ordered scene list for that project. Tabs that need to close the
 * modal (e.g., to navigate to a note) call `requestClose`.
 */
export interface TabContext {
	app: App;
	plugin: DraftBenchPlugin;
	linker: DraftBenchLinker;
	selectedProject: ProjectNote | null;
	scenes: SceneNote[] | null;
	requestClose: () => void;
}

export type TabRender = (container: HTMLElement, context: TabContext) => void;

export interface TabDefinition {
	id: string;
	name: string;
	icon: IconName;
	render: TabRender;
}
