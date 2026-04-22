import type { App } from 'obsidian';
import type { SceneNote } from '../../../core/discovery';
import { formatProgress, readTargetWords } from '../../../core/targets';
import type { WordCountCache } from '../../../core/word-count-cache';

/**
 * Manuscript-list section body renderer. Scene rows are click-through
 * links to the scene note; the toolbar (New scene / New draft /
 * Reorder / Compile) lives in a separate section above this one.
 *
 * Scene list rendering is adapted from the Control Center's former
 * Manuscript-tab scene-list implementation; the progress-bar +
 * word-badge variants are preserved. `onOpenScene` is the caller's
 * hook for "opening a scene also focuses the editor and may want to
 * close/preserve the leaf" — the leaf itself stays open on scene
 * click, unlike the modal which closed.
 */
export function renderManuscriptListBody(
	body: HTMLElement,
	scenes: SceneNote[],
	app: App,
	wordCountCache: WordCountCache,
	onOpenScene: (scene: SceneNote) => void
): void {
	body.empty();

	if (scenes.length === 0) {
		body.createEl('p', {
			cls: 'dbench-manuscript-view__placeholder',
			text: 'No scenes yet. Add the first one from the toolbar above.',
		});
		return;
	}

	const list = body.createEl('ol', {
		cls: 'dbench-manuscript-view__scene-list',
	});

	const wordBadges: { scene: SceneNote; el: HTMLElement }[] = [];

	for (const scene of scenes) {
		const item = list.createEl('li', {
			cls: 'dbench-manuscript-view__scene-row',
		});

		item.createSpan({
			cls: 'dbench-manuscript-view__scene-order',
			text: String(scene.frontmatter['dbench-order']),
		});

		const titleEl = item.createEl('a', {
			cls: 'dbench-manuscript-view__scene-title',
			text: scene.file.basename,
			href: '#',
		});
		titleEl.addEventListener('click', (evt) => {
			evt.preventDefault();
			onOpenScene(scene);
		});

		item.createSpan({
			cls: 'dbench-manuscript-view__scene-status',
			text: scene.frontmatter['dbench-status'],
		});

		const wordEl = item.createDiv({
			cls: 'dbench-manuscript-view__scene-words',
		});
		wordEl.setText('...');
		wordBadges.push({ scene, el: wordEl });

		const draftCount = scene.frontmatter['dbench-drafts']?.length ?? 0;
		item.createSpan({
			cls: 'dbench-manuscript-view__scene-drafts',
			text: draftCount === 1 ? '1 draft' : `${draftCount} drafts`,
		});
	}

	// Silence the `app` lint unused-var in environments where we don't
	// reference it directly (kept in the signature for future hooks).
	void app;

	for (const { scene, el } of wordBadges) {
		void wordCountCache
			.countForScene(scene)
			.then((count) => {
				if (!el.isConnected) return;
				const target = readTargetWords(
					scene.frontmatter as unknown as Record<string, unknown>
				);
				if (target === null) {
					el.setText(
						`${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
					);
					return;
				}
				renderSceneProgress(el, count, target);
			})
			.catch(() => {
				if (!el.isConnected) return;
				el.setText('-');
			});
	}
}

function renderSceneProgress(
	container: HTMLElement,
	count: number,
	target: number
): void {
	container.empty();
	container.addClass('dbench-manuscript-view__scene-words--with-target');
	const view = formatProgress(count, target);
	if (view.overage) {
		container.addClass('dbench-manuscript-view__scene-words--overage');
	} else {
		container.removeClass('dbench-manuscript-view__scene-words--overage');
	}

	container.createEl('span', {
		cls: 'dbench-manuscript-view__scene-progress-label',
		text: view.label,
	});
	const track = container.createDiv({
		cls: 'dbench-manuscript-view__scene-progress-track',
	});
	const fill = track.createDiv({
		cls: 'dbench-manuscript-view__scene-progress-fill',
	});
	fill.style.width = `${view.percent}%`;
}
