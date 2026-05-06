import { Component, MarkdownRenderer, setIcon } from 'obsidian';
import type DraftBenchPlugin from '../../../../main';
import { CompileService } from '../../../core/compile-service';
import { HEADING_MARKER_CLASS } from '../../../core/compile/content-rules';
import { buildContinuousPreset } from '../../../core/compile/continuous-preset';
import {
	findScenesInProject,
	type ProjectNote,
} from '../../../core/discovery';
import {
	applyPreviewTypography,
	renderPreviewToolbar,
} from '../../shared/preview-toolbar';

const SPINNER_THRESHOLD_MS = 250;

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

	const startRender = async (): Promise<void> => {
		const token = ++renderToken;

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
		} catch (err) {
			if (token !== renderToken) return;
			console.error('[DraftBench] continuous render failed:', err);
			renderError(body, err);
		}
	};

	void startRender();

	return {
		dispose() {
			renderToken++;
			if (component) {
				component.unload();
				component = null;
			}
		},
	};
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
