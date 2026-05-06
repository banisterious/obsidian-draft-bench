import type DraftBenchPlugin from '../../../../main';
import {
	applyPreviewTypography,
	renderPreviewToolbar,
} from '../../shared/preview-toolbar';

/**
 * Continuous mode body for the Manuscript view. Mounts the shared
 * preview-typography toolbar above an empty render container; the
 * container is populated in step 6 of [docs/planning/manuscript-view-continuous-mode.md](../../../../docs/planning/manuscript-view-continuous-mode.md)
 * by feeding a synthetic default-preset through `CompileService.generate`
 * and handing the resulting markdown to `MarkdownRenderer.render`.
 *
 * The toolbar's scope element is the continuous body root so the
 * `--dbench-preview-*` CSS variables apply only to the rendered
 * prose container, not the leaf as a whole.
 */
export function renderContinuousBody(
	parent: HTMLElement,
	plugin: DraftBenchPlugin
): HTMLElement {
	const root = parent.createDiv({
		cls: 'dbench-manuscript-view__continuous',
	});

	renderPreviewToolbar(root, plugin, root);
	applyPreviewTypography(root, plugin.settings.previewTypography);

	const body = root.createDiv({
		cls: 'dbench-manuscript-view__continuous-body',
	});
	body.createEl('p', {
		cls: 'dbench-manuscript-view__placeholder',
		text: 'Continuous mode is being built.',
	});

	return root;
}
