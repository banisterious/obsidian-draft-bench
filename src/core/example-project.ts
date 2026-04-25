import type { App, TFile } from 'obsidian';
import type { DraftBenchSettings } from '../model/settings';
import type { DraftBenchLinker } from './linker';
import type { ProjectNote, SceneNote } from './discovery';
import { findProjects } from './discovery';
import { createProject } from './projects';
import { createScene } from './scenes';
import { createDraft } from './drafts';
import { createCompilePreset } from './compile-presets';
import {
	SCENE_1_EARLIER_DRAFT_BODY,
	SCENE_1_FINAL_BODY,
	SCENE_2_BODY,
	SCENE_3_BODY,
} from './example-project-content';

/**
 * Example-project generator. Orchestrates the same `createProject` /
 * `createScene` / `createDraft` / `createCompilePreset` primitives a
 * user would invoke by hand, producing a working three-scene short-
 * story project plus one prior draft and one compile preset.
 *
 * Per [docs/planning/onboarding.md](../../docs/planning/onboarding.md)
 * § Tier 2 the example demonstrates the full V1 workflow: scene 1 is
 * `final` with a prior draft (showing the versioning model), scene 2
 * is `revision` with a partial draft + planning sections (mid-process),
 * scene 3 is `idea` with planning only (pre-draft). The compile preset
 * is `Workshop MD` (format md, output vault) — cheapest format to demo
 * because compiling lands a file at a stable vault path with no save
 * dialog.
 *
 * Idempotency by basename match: if a project with the example
 * basename already exists, the function returns `{ outcome:
 * 'already-exists', file }` without rewriting anything. Writers who
 * deleted the example folder + frontmatter can re-run the command and
 * get a fresh copy.
 *
 * Defaults respected: the example lands in the writer's configured
 * `defaultProjectFolder`, uses their `scenesFolder` /
 * `draftsFolderPlacement` / `sceneTemplatePath`, and respects the first
 * status-vocabulary entry as fallback. The status names hardcoded for
 * each scene (`final` / `revision` / `idea`) match the V1 default
 * vocabulary; if a writer has customized their vocabulary to omit
 * these, the scenes carry out-of-vocabulary status values, which the
 * Manuscript view's breakdown handles natively.
 *
 * UI concerns (notice, opening the project note, prompting to overwrite
 * an existing example) live in the calling command layer, not here.
 */

/**
 * Project basename. Used both for path resolution at create time and
 * for idempotency detection. Distinct from the dev-vault's
 * `Lighthouse Keeper` project (gitignored).
 */
export const EXAMPLE_PROJECT_BASENAME = 'Example - The Last Lighthouse';

/**
 * Compile-preset name and book metadata. The title is the in-fiction
 * story name (without the "Example -" prefix) so the compiled output
 * reads as a real workshop submission.
 */
export const EXAMPLE_COMPILE_PRESET_NAME = 'Workshop MD';
export const EXAMPLE_COMPILE_TITLE = 'The Last Lighthouse';

/**
 * Project-level word target. Picked to land the three scenes' actual
 * word count near 50% on the progress hero, so the bar reads as a
 * meaningful in-progress state rather than overflow or near-zero.
 */
export const EXAMPLE_PROJECT_TARGET_WORDS = 2000;

export interface ExampleProjectResult {
	outcome: 'created' | 'already-exists';
	file: TFile;
}

interface ExampleSceneSpec {
	title: string;
	order: number;
	status: string;
	body: string;
}

const EXAMPLE_SCENES: readonly ExampleSceneSpec[] = [
	{ title: 'Arrival', order: 1, status: 'final', body: SCENE_1_FINAL_BODY },
	{ title: 'The Long Watch', order: 2, status: 'revision', body: SCENE_2_BODY },
	{ title: 'Last Light', order: 3, status: 'idea', body: SCENE_3_BODY },
];

/**
 * Find the existing example project if one is already in the vault,
 * matched by basename (idempotency key). Lookup is O(n) over project
 * notes, which is fine — running this command is a once-per-vault
 * action.
 */
export function findExampleProject(app: App): ProjectNote | null {
	const match = findProjects(app).find(
		(p) => p.file.basename === EXAMPLE_PROJECT_BASENAME
	);
	return match ?? null;
}

/**
 * Create the example project end to end. Wraps all writes in
 * `linker.withSuspended(...)` so the multi-file dance doesn't trigger
 * intermediate sync events.
 */
export async function createExampleProject(
	app: App,
	settings: DraftBenchSettings,
	linker: DraftBenchLinker
): Promise<ExampleProjectResult> {
	const existing = findExampleProject(app);
	if (existing !== null) {
		return { outcome: 'already-exists', file: existing.file };
	}

	const projectFile = await linker.withSuspended(async () => {
		const { file } = await createProject(app, settings, {
			title: EXAMPLE_PROJECT_BASENAME,
			shape: 'folder',
		});

		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter['dbench-target-words'] = EXAMPLE_PROJECT_TARGET_WORDS;
		});

		const projectNote: ProjectNote = readProjectNote(app, file);

		// Scene 1 needs special handling: the prior draft snapshot must
		// capture the *earlier* wording, then the scene body gets the
		// polished final wording. createDraft snapshots whatever's there
		// at call time, so order matters.
		const scene1 = await createScene(app, settings, {
			project: projectNote,
			title: EXAMPLE_SCENES[0].title,
			order: EXAMPLE_SCENES[0].order,
			status: EXAMPLE_SCENES[0].status,
		});
		await replaceSceneBody(app, scene1, SCENE_1_EARLIER_DRAFT_BODY);

		const scene1Note = readSceneNote(app, scene1);
		await createDraft(app, settings, { scene: scene1Note });

		await replaceSceneBody(app, scene1, SCENE_1_FINAL_BODY);

		// Scenes 2 and 3 are straightforward: create + body replacement.
		for (const spec of EXAMPLE_SCENES.slice(1)) {
			const scene = await createScene(app, settings, {
				project: projectNote,
				title: spec.title,
				order: spec.order,
				status: spec.status,
			});
			await replaceSceneBody(app, scene, spec.body);
		}

		const { file: presetFile } = await createCompilePreset(app, {
			project: projectNote,
			name: EXAMPLE_COMPILE_PRESET_NAME,
			format: 'md',
		});
		await app.fileManager.processFrontMatter(presetFile, (frontmatter) => {
			frontmatter['dbench-compile-title'] = EXAMPLE_COMPILE_TITLE;
			frontmatter['dbench-compile-output'] = 'vault';
		});

		return file;
	});

	return { outcome: 'created', file: projectFile };
}

/**
 * Replace a scene file's body while preserving its frontmatter block.
 * Used after `createScene` to swap out the user's template-rendered
 * body for the example's hand-authored prose.
 */
async function replaceSceneBody(
	app: App,
	file: TFile,
	body: string
): Promise<void> {
	const current = await app.vault.read(file);
	const match = current.match(/^---\n[\s\S]*?\n---\n?/);
	const frontmatterBlock = match ? match[0] : '';
	await app.vault.modify(file, frontmatterBlock + body);
}

/**
 * Re-fetch a project's frontmatter from the metadata cache and bundle
 * it with the file as a `ProjectNote`. The cache is populated
 * synchronously by `processFrontMatter` writes, so this is safe to call
 * immediately after `createProject` + a frontmatter update.
 */
function readProjectNote(app: App, file: TFile): ProjectNote {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) {
		throw new Error(
			`Could not read frontmatter for newly-created project "${file.basename}".`
		);
	}
	return { file, frontmatter: fm as ProjectNote['frontmatter'] };
}

/**
 * Re-fetch a scene's frontmatter from the metadata cache and bundle
 * it with the file as a `SceneNote`. Required because `createDraft`
 * takes a `SceneNote` (not a raw `TFile`) so it can read the parent
 * project's wikilink and id from the scene's frontmatter.
 */
function readSceneNote(app: App, file: TFile): SceneNote {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) {
		throw new Error(
			`Could not read frontmatter for newly-created scene "${file.basename}".`
		);
	}
	return { file, frontmatter: fm as SceneNote['frontmatter'] };
}
