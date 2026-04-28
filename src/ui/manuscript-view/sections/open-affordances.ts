import { Menu } from 'obsidian';

/**
 * Pane-type spec passed to `Workspace.getLeaf()` when opening a file.
 *
 * - `false` — current leaf (Obsidian's default for plain wikilink click).
 * - `'tab'` — new tab in the current group.
 * - `'split'` — new pane to the right of the current group.
 * - `'window'` — new popout window.
 *
 * Mirrors Obsidian's `PaneType` shape so callers can pass directly to
 * `app.workspace.getLeaf(spec)`.
 */
export type OpenSpec = false | 'tab' | 'split' | 'window';

/**
 * Compute the pane-type for a modifier-click on a wikilink-shaped link.
 * Mirrors Obsidian core: cmd/ctrl alone -> new tab; cmd/ctrl + shift ->
 * split; cmd/ctrl + alt -> new window; plain click -> current leaf.
 */
export function paneTypeFromMouseEvent(evt: MouseEvent): OpenSpec {
	const mod = evt.ctrlKey || evt.metaKey;
	if (!mod) return false;
	if (evt.altKey) return 'window';
	if (evt.shiftKey) return 'split';
	return 'tab';
}

/**
 * Wire Obsidian-standard wikilink affordances onto `el`:
 *
 * - Click (left): open with modifier-respecting spec (cmd/ctrl =
 *   new tab, +shift = split, +alt = new window).
 * - Auxclick (middle): open in a new tab.
 * - Contextmenu (right): show "Open in new tab / split / window"
 *   menu at the mouse position.
 *
 * All three handlers `preventDefault()` and `stopPropagation()` so the
 * click doesn't trigger the surrounding card's collapse toggle and the
 * browser's native context menu doesn't appear.
 *
 * The caller's `openWith(spec)` does the actual opening — typically:
 *
 * ```ts
 * (spec) => app.workspace.getLeaf(spec).openFile(file)
 * ```
 *
 * This indirection lets callers route through their existing onOpen
 * dispatch instead of taking an `App` reference here.
 */
export function attachWikilinkOpenAffordances(
	el: HTMLElement,
	openWith: (spec: OpenSpec) => void
): void {
	el.addEventListener('click', (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		openWith(paneTypeFromMouseEvent(evt));
	});

	el.addEventListener('auxclick', (evt) => {
		if (evt.button !== 1) return;
		evt.preventDefault();
		evt.stopPropagation();
		openWith('tab');
	});

	el.addEventListener('contextmenu', (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle('Open in new tab')
				.setIcon('lucide-file-plus')
				.onClick(() => openWith('tab'))
		);
		menu.addItem((item) =>
			item
				.setTitle('Open to the right')
				.setIcon('lucide-separator-vertical')
				.onClick(() => openWith('split'))
		);
		menu.addItem((item) =>
			item
				.setTitle('Open in new window')
				.setIcon('lucide-picture-in-picture-2')
				.onClick(() => openWith('window'))
		);
		menu.showAtMouseEvent(evt);
	});
}
