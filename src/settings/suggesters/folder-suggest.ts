import { AbstractInputSuggest, TFolder, type App } from 'obsidian';
import { filterFolders } from './filter';

/**
 * Folder-path autocomplete for a plain text input. Mirrors the
 * pattern used by Templater and other Obsidian plugins: subclass
 * `AbstractInputSuggest<string>`, filter the vault's folder list by
 * the current query, and write the selected path back into the input.
 *
 * Construction: `new FolderSuggest(app, textComponent.inputEl)`.
 * No separate wiring is needed — Obsidian handles the popover and
 * keyboard navigation once the subclass exists.
 *
 * On selection, a synthetic `input` event is dispatched so any
 * `TextComponent.onChange(...)` listeners fire and the settings save.
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
	private readonly el: HTMLInputElement | HTMLDivElement;

	constructor(app: App, inputEl: HTMLInputElement | HTMLDivElement) {
		super(app, inputEl);
		this.el = inputEl;
	}

	protected getSuggestions(query: string): string[] {
		return filterFolders(collectFolderPaths(this.app), query);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.textContent = value;
	}

	selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
		this.setValue(value);
		this.el.dispatchEvent(new Event('input', { bubbles: true }));
		this.close();
	}
}

/** Walk the vault's loaded files, keeping folder paths (excluding root). */
function collectFolderPaths(app: App): string[] {
	return app.vault
		.getAllLoadedFiles()
		.filter((f): f is TFolder => f instanceof TFolder)
		.map((f) => f.path)
		.filter((p) => p !== '' && p !== '/');
}
