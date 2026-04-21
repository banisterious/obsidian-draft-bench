import { AbstractInputSuggest, type App } from 'obsidian';
import { filterFiles } from './file-filter';

/**
 * Markdown-file-path autocomplete for a plain text input. Built on the
 * same `AbstractInputSuggest<string>` pattern as `FolderSuggest` but
 * over the vault's markdown files.
 *
 * Construction: `new FileSuggest(app, textComponent.inputEl)`.
 * Obsidian handles popover and keyboard navigation once the subclass
 * exists.
 *
 * On selection, a synthetic `input` event is dispatched so any
 * `TextComponent.onChange(...)` listeners fire and the settings save.
 */
export class FileSuggest extends AbstractInputSuggest<string> {
	private readonly el: HTMLInputElement | HTMLDivElement;

	constructor(app: App, inputEl: HTMLInputElement | HTMLDivElement) {
		super(app, inputEl);
		this.el = inputEl;
	}

	protected getSuggestions(query: string): string[] {
		return filterFiles(collectMarkdownPaths(this.app), query);
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

function collectMarkdownPaths(app: App): string[] {
	return app.vault.getMarkdownFiles().map((f) => f.path);
}
