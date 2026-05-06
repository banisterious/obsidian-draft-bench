import { Component, MarkdownRenderer, setIcon, TFile, type App } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import { CompileService } from '../../../core/compile-service';
import { HEADING_MARKER_CLASS } from '../../../core/compile/content-rules';
import { buildContinuousPreset } from '../../../core/compile/continuous-preset';
import {
	findScenesInProject,
	type ProjectNote,
} from '../../../core/discovery';
import { attachWikilinkOpenAffordances } from './open-affordances';
import {
	applyPreviewTypography,
	renderPreviewToolbar,
} from '../../shared/preview-toolbar';

const SPINNER_THRESHOLD_MS = 250;

/*
 * File-save reactivity debounce window (per [docs/planning/manuscript-view-continuous-mode.md § 4](../../../../docs/planning/manuscript-view-continuous-mode.md)).
 * Vault modify events for project members trigger a Continuous re-
 * render after this many milliseconds of quiescence. 400ms matches
 * the Manuscript Builder leaf's debounce so writers experience a
 * consistent reactivity cadence across both surfaces.
 */
const FILE_SAVE_DEBOUNCE_MS = 400;

/**
 * Handle returned by `renderContinuousBody` so the host can release
 * resources (the `MarkdownRenderer.render` Component, plus any
 * staleness token) before destroying the body's DOM. The host should
 * call `dispose()` whenever the leaf re-renders or unmounts.
 */
export interface ContinuousBodyHandle {
	dispose(): void;
}

/**
 * Continuous mode body for the Manuscript view. Mounts the shared
 * preview-typography toolbar above an empty render container, then
 * fires an async render: feed a synthetic preset through
 * `CompileService.generate`, hand the resulting markdown to
 * `MarkdownRenderer.render`. Per [docs/planning/manuscript-view-continuous-mode.md § 5](../../../../docs/planning/manuscript-view-continuous-mode.md):
 * single-pass render, no chunking, no virtualization. A 250ms-threshold
 * spinner covers slow renders; sub-threshold renders skip it so the
 * common case doesn't flash.
 *
 * The toolbar's scope element is the continuous root so the
 * `--dbench-preview-*` CSS variables apply only to the rendered prose
 * container, not the leaf as a whole. The render-token guard prevents
 * stale writes when a faster render replaces an in-flight one (file-
 * save reactivity in step 9 makes this load-bearing; step 6 already
 * benefits from it on slow vaults).
 */
export function renderContinuousBody(
	parent: HTMLElement,
	plugin: DraftBenchPlugin,
	project: ProjectNote
): ContinuousBodyHandle {
	const root = parent.createDiv({
		cls: 'dbench-manuscript-view__continuous',
	});

	renderPreviewToolbar(root, plugin, root);
	applyPreviewTypography(root, plugin.settings.previewTypography);

	const body = root.createDiv({
		cls: 'dbench-manuscript-view__continuous-body',
	});

	let renderToken = 0;
	let component: Component | null = null;
	let fileSaveDebounceTimer: number | null = null;
	// Set by the file-save listener *before* startRender empties the
	// body; consumed (and cleared to null) on the next successful
	// render. Tab / project changes leave it null so those re-renders
	// land at the top of the prose. The leaf's own scroll-container
	// (containerEl.children[1]) is what scrolls; the parent of `parent`
	// is that container in the manuscript-view layout.
	const scrollContainer = parent.parentElement;
	let nextRenderScrollTop: number | null = null;
	const eventsComponent = new Component();
	eventsComponent.load();

	const startRender = async (): Promise<void> => {
		const token = ++renderToken;

		// Read-and-clear the captured scroll position. Only the file-
		// save reactivity path sets this; tab / project changes leave
		// it null so those re-renders land at the top.
		const savedScrollTop = nextRenderScrollTop;
		nextRenderScrollTop = null;

		const spinnerTimer = window.setTimeout(() => {
			if (token !== renderToken) return;
			renderSpinner(body);
		}, SPINNER_THRESHOLD_MS);

		const preset = buildContinuousPreset(project);
		let markdown: string;
		let scenesCompiled: number;
		try {
			const result = await new CompileService(plugin.app).generate(preset, {
				emitHeadingMarkers: true,
			});
			markdown = result.markdown;
			scenesCompiled = result.scenesCompiled;
		} catch (err) {
			window.clearTimeout(spinnerTimer);
			if (token !== renderToken) return;
			console.error('[DraftBench] continuous compile failed:', err);
			renderError(body, err);
			return;
		}

		window.clearTimeout(spinnerTimer);
		if (token !== renderToken) return;

		if (scenesCompiled === 0) {
			const total = findScenesInProject(
				plugin.app,
				project.frontmatter['dbench-id']
			).length;
			renderEmpty(
				body,
				total === 0
					? 'No scenes in this project yet.'
					: 'No scenes available to render.',
				total === 0
					? 'Create scenes from the List view tab.'
					: 'The compile pipeline returned an empty document.'
			);
			return;
		}

		// Tear down the previous render's component before swapping in
		// the new one so embeds / dataview blocks release cleanly. Step
		// 9 (file-save reactivity) re-enters this path repeatedly; step
		// 6 only sees the first render.
		if (component) {
			component.unload();
			component = null;
		}

		body.empty();
		const proseEl = body.createDiv({
			cls: 'dbench-manuscript-view__continuous-prose',
		});

		const renderComponent = new Component();
		renderComponent.load();
		component = renderComponent;

		const sourcePath = project.file.path;
		try {
			await MarkdownRenderer.render(
				plugin.app,
				markdown,
				proseEl,
				sourcePath,
				renderComponent
			);
			if (token !== renderToken) return;
			liftHeadingMarkers(proseEl);
			attachHeadingAffordances(proseEl, plugin.app, project.file.path);
			// Restore scroll position on file-save re-renders so the
			// writer doesn't lose their place. rAF lets the new DOM
			// finish initial layout before we set scrollTop; embeds
			// or other lazily-loading content can still drift the
			// position slightly, but the typical edit (one paragraph,
			// no embed change) lands the writer back where they were.
			if (
				savedScrollTop !== null &&
				scrollContainer &&
				token === renderToken
			) {
				window.requestAnimationFrame(() => {
					if (token === renderToken) {
						scrollContainer.scrollTop = savedScrollTop;
					}
				});
			}
		} catch (err) {
			if (token !== renderToken) return;
			console.error('[DraftBench] continuous render failed:', err);
			renderError(body, err);
		}
	};

	void startRender();

	// File-save reactivity. Re-fires the compile + MarkdownRenderer
	// pass when a project-member file is saved (debounced 400ms).
	// Body edits update the rendered prose without tearing down the
	// surrounding tab strip / toolbar; the leaf-level listener in
	// `manuscript-view.ts` skips its full re-render when Continuous
	// is active so we don't double-fire.
	eventsComponent.registerEvent(
		plugin.app.vault.on('modify', (file) => {
			if (!(file instanceof TFile)) return;
			if (!isFileInProject(plugin.app, project, file)) return;
			if (fileSaveDebounceTimer !== null) {
				window.clearTimeout(fileSaveDebounceTimer);
			}
			fileSaveDebounceTimer = window.setTimeout(() => {
				fileSaveDebounceTimer = null;
				// Capture scroll *before* startRender empties the body
				// (the empty + refill cycle clamps scrollTop to 0 mid-
				// way through). startRender restores after the new
				// DOM has laid out via rAF.
				if (scrollContainer) {
					nextRenderScrollTop = scrollContainer.scrollTop;
				}
				void startRender();
			}, FILE_SAVE_DEBOUNCE_MS);
		})
	);

	return {
		dispose() {
			renderToken++;
			if (fileSaveDebounceTimer !== null) {
				window.clearTimeout(fileSaveDebounceTimer);
				fileSaveDebounceTimer = null;
			}
			eventsComponent.unload();
			if (component) {
				component.unload();
				component = null;
			}
		},
	};
}

/**
 * Cheap project-member predicate used by the file-save listener.
 * Checks the file's frontmatter via metadataCache rather than walking
 * the project's discovery results on every modify event. Drafts and
 * compile presets don't trigger Continuous re-renders — only manuscript-
 * shape types (project / chapter / scene / sub-scene).
 */
function isFileInProject(
	app: App,
	project: ProjectNote,
	file: TFile
): boolean {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return false;
	const type = fm['dbench-type'];
	if (
		type !== 'project' &&
		type !== 'chapter' &&
		type !== 'scene' &&
		type !== 'sub-scene'
	) {
		return false;
	}
	const projectId = project.frontmatter['dbench-id'];
	if (type === 'project') return fm['dbench-id'] === projectId;
	return fm['dbench-project-id'] === projectId;
}

/**
 * Walk the rendered prose, find each `span.dbench-mark[data-source]`
 * marker the compile pipeline emitted inside title headings, and lift
 * its `data-source` value onto the parent `h1`/`h2`/`h3` as
 * `data-source-path`. The marker is removed after lifting so it
 * doesn't leak into the visible DOM. Step 8 attaches click handlers
 * keyed on the lifted attribute.
 *
 * Markers that aren't direct children of a recognized heading are
 * left alone (defensive — shouldn't happen with the V1 pipeline, but
 * harmless if a future content-rule wraps the heading).
 */
function liftHeadingMarkers(root: HTMLElement): void {
	const markers = root.querySelectorAll<HTMLElement>(
		`span.${HEADING_MARKER_CLASS}[data-source]`
	);
	markers.forEach((marker) => {
		const heading = marker.closest('h1, h2, h3');
		const sourcePath = marker.getAttribute('data-source');
		if (heading && sourcePath) {
			heading.setAttribute('data-source-path', sourcePath);
		}
		marker.remove();
	});
}

/**
 * Attach Obsidian-standard wikilink affordances to every heading
 * carrying a `data-source-path` attribute. Tap opens the source file
 * in the active leaf; ctrl/cmd-click opens a new tab; +shift = split;
 * +alt = window; right-click / long-press surfaces the same options
 * via the existing context menu (per
 * [docs/planning/manuscript-view-continuous-mode.md § 3](../../../../docs/planning/manuscript-view-continuous-mode.md)).
 *
 * Writer-authored H2/H3s inside scene bodies are not attributed by
 * the pipeline (only chapter / scene / sub-scene title headings get
 * the `data-source-path`), so they're left untouched and remain
 * inert prose structure.
 */
function attachHeadingAffordances(
	root: HTMLElement,
	app: App,
	contextPath: string
): void {
	const headings = root.querySelectorAll<HTMLElement>(
		'h1[data-source-path], h2[data-source-path], h3[data-source-path]'
	);
	headings.forEach((heading) => {
		const target = heading.getAttribute('data-source-path');
		if (!target) return;
		heading.classList.add('dbench-manuscript-view__continuous-heading--clickable');
		attachWikilinkOpenAffordances(heading, (spec) => {
			void app.workspace.openLinkText(target, contextPath, spec);
		});
	});
}

function renderSpinner(body: HTMLElement): void {
	body.empty();
	const wrap = body.createDiv({
		cls: 'dbench-manuscript-view__continuous-spinner',
		attr: { role: 'status', 'aria-live': 'polite' },
	});
	const icon = wrap.createSpan({
		cls: 'dbench-manuscript-view__continuous-spinner-icon dbench-spinner',
		attr: { 'aria-hidden': 'true' },
	});
	setIcon(icon, 'loader-2');
	wrap.createSpan({
		cls: 'dbench-manuscript-view__continuous-spinner-text',
		text: 'Rendering...',
	});
}

function renderEmpty(
	body: HTMLElement,
	message: string,
	hint: string
): void {
	body.empty();
	const wrap = body.createDiv({
		cls: 'dbench-manuscript-view__continuous-empty',
	});
	wrap.createEl('p', {
		cls: 'dbench-manuscript-view__continuous-empty-message',
		text: message,
	});
	wrap.createEl('p', {
		cls: 'dbench-manuscript-view__continuous-empty-hint',
		text: hint,
	});
}

function renderError(body: HTMLElement, err: unknown): void {
	const message = err instanceof Error ? err.message : String(err);
	renderEmpty(
		body,
		`Continuous render failed: ${message}`,
		'Check the developer console for details; the project may have inconsistent frontmatter.'
	);
}
