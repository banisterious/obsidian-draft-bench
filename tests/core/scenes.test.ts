import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	createScene,
	nextSceneOrder,
	nextSceneOrderInChapter,
	resolveScenePaths,
} from '../../src/core/scenes';
import { createChapter } from '../../src/core/chapters';
import { createProject } from '../../src/core/projects';
import {
	findChaptersInProject,
	findProjects,
	findScenesInChapter,
	findScenesInProject,
} from '../../src/core/discovery';
import { isValidDbenchId } from '../../src/core/id';
import { DEFAULT_SETTINGS, type DraftBenchSettings } from '../../src/model/settings';

async function seedProject(app: App, settings: DraftBenchSettings, title: string) {
	await createProject(app, settings, { title, shape: 'folder' });
	const projects = findProjects(app);
	if (projects.length === 0) throw new Error('seedProject failed');
	return projects[projects.length - 1];
}

function stripFrontmatter(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
	return match ? match[1] : content;
}

describe('resolveScenePaths', () => {
	const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };

	it('defaults to the project folder (empty scenesFolder)', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		const paths = resolveScenePaths(settings, project, {
			project,
			title: 'Chapter 1',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel');
		expect(paths.filePath).toBe('Draft Bench/My Novel/Chapter 1.md');
	});

	it('nests scenes in a subfolder when location is set', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		const paths = resolveScenePaths(settings, project, {
			project,
			title: 'Scene',
			location: 'Scenes/',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel/Scenes');
		expect(paths.filePath).toBe('Draft Bench/My Novel/Scenes/Scene.md');
	});

	it('expands {project} inside a custom subfolder template', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');

		const paths = resolveScenePaths(settings, project, {
			project,
			title: 'Scene',
			location: '{project} Scenes/',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel/My Novel Scenes');
		expect(paths.filePath).toBe(
			'Draft Bench/My Novel/My Novel Scenes/Scene.md'
		);
	});

	it('expands {chapter} to the parent chapter basename (chapter-aware nesting per #11)', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');
		await createChapter(app, settings, { project, title: 'Chapter 1' });
		const chapter = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];

		const paths = resolveScenePaths(settings, project, {
			project,
			chapter,
			title: 'Opening',
		});
		// Default `{chapter}/` template nests scenes under the chapter folder.
		expect(paths.folderPath).toBe('Draft Bench/My Novel/Chapter 1');
		expect(paths.filePath).toBe('Draft Bench/My Novel/Chapter 1/Opening.md');
	});

	it('expands {chapter} to empty for chapter-less scenes (degrades to project root)', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');
		// Chapter-less project + default `{chapter}/` template: token
		// expands to '', collapses to flat-at-project-root.
		const paths = resolveScenePaths(settings, project, {
			project,
			title: 'Standalone',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel');
		expect(paths.filePath).toBe('Draft Bench/My Novel/Standalone.md');
	});

	it('expands {chapter} inside a custom location override', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'My Novel');
		await createChapter(app, settings, { project, title: 'Ch01' });
		const chapter = findChaptersInProject(
			app,
			project.frontmatter['dbench-id']
		)[0];

		const paths = resolveScenePaths(settings, project, {
			project,
			chapter,
			title: 'Opening',
			location: 'Scenes/{chapter}/',
		});
		expect(paths.folderPath).toBe('Draft Bench/My Novel/Scenes/Ch01');
		expect(paths.filePath).toBe(
			'Draft Bench/My Novel/Scenes/Ch01/Opening.md'
		);
	});

	it('rejects empty title and forbidden characters', async () => {
		const app = new App();
		const project = await seedProject(app, settings, 'Project');

		expect(() =>
			resolveScenePaths(settings, project, { project, title: '' })
		).toThrow(/empty/i);
		expect(() =>
			resolveScenePaths(settings, project, { project, title: 'Bad/Scene' })
		).toThrow(/not allowed/i);
	});
});

describe('nextSceneOrder', () => {
	it('returns 1 when no scenes exist', async () => {
		const app = new App();
		const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Project');
		expect(nextSceneOrder(app, project.frontmatter['dbench-id'])).toBe(1);
	});

	it('returns max+1 when scenes exist', async () => {
		const app = new App();
		const settings: DraftBenchSettings = { ...DEFAULT_SETTINGS };
		const project = await seedProject(app, settings, 'Project');

		await createScene(app, settings, { project, title: 'A' });
		await createScene(app, settings, { project, title: 'B' });
		await createScene(app, settings, { project, title: 'C' });

		expect(nextSceneOrder(app, project.frontmatter['dbench-id'])).toBe(4);
	});
});

describe('createScene', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('creates a scene note with stamped essentials', async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const file = await createScene(app, settings, {
			project,
			title: 'Opening',
		});

		expect(file.path).toBe('Draft Bench/My Novel/Opening.md');
		expect(file.basename).toBe('Opening');

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('scene');
		expect(isValidDbenchId(fm?.['dbench-id'])).toBe(true);
		expect(fm?.['dbench-project']).toBe('[[My Novel]]');
		expect(fm?.['dbench-project-id']).toBe(project.frontmatter['dbench-id']);
		expect(fm?.['dbench-order']).toBe(1);
		expect(fm?.['dbench-status']).toBe('idea');
		expect(fm?.['dbench-drafts']).toEqual([]);
		expect(fm?.['dbench-draft-ids']).toEqual([]);
	});

	it("appends to project's reverse arrays", async () => {
		const project = await seedProject(app, settings, 'My Novel');
		const scene = await createScene(app, settings, {
			project,
			title: 'Chapter 1',
		});

		// Re-read project frontmatter from cache
		const projectFm = app.metadataCache.getFileCache(project.file)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual(['[[Chapter 1]]']);
		const sceneId = app.metadataCache.getFileCache(scene)?.frontmatter?.[
			'dbench-id'
		];
		expect(projectFm?.['dbench-scene-ids']).toEqual([sceneId]);
	});

	it('appends multiple scenes in creation order', async () => {
		const project = await seedProject(app, settings, 'Novel');
		await createScene(app, settings, { project, title: 'One' });
		await createScene(app, settings, { project, title: 'Two' });
		await createScene(app, settings, { project, title: 'Three' });

		const projectFm = app.metadataCache.getFileCache(project.file)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual([
			'[[One]]',
			'[[Two]]',
			'[[Three]]',
		]);
	});

	it('honors an explicit order parameter', async () => {
		const project = await seedProject(app, settings, 'Project');
		const scene = await createScene(app, settings, {
			project,
			title: 'Custom',
			order: 42,
		});
		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-order']).toBe(42);
	});

	it('honors an explicit status parameter', async () => {
		const project = await seedProject(app, settings, 'Project');
		const scene = await createScene(app, settings, {
			project,
			title: 'Done',
			status: 'final',
		});
		const fm = app.metadataCache.getFileCache(scene)?.frontmatter;
		expect(fm?.['dbench-status']).toBe('final');
	});

	it('writes the V1 template body into the scene file', async () => {
		const project = await seedProject(app, settings, 'Project');
		const scene = await createScene(app, settings, {
			project,
			title: 'Templated',
		});
		const content = await app.vault.read(scene);
		expect(content).toContain('## Source passages');
		expect(content).toContain('## Beat outline');
		expect(content).toContain('## Open questions');
		expect(content).toContain('## Draft');
	});

	it('seeds scene-template.md in templatesFolder on first scene creation', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'First' });

		const templatePath = `${settings.templatesFolder.replace(/\/+$/, '')}/scene-template.md`;
		const seeded = app.vault.getAbstractFileByPath(templatePath);
		expect(seeded).not.toBeNull();
	});

	it('honors a user-customized scene-template.md when present', async () => {
		const project = await seedProject(app, settings, 'Project');
		const templatePath = `${settings.templatesFolder.replace(/\/+$/, '')}/scene-template.md`;
		const folder = templatePath.slice(0, templatePath.lastIndexOf('/'));
		await app.vault.createFolder(folder);
		await app.vault.create(templatePath, '# {{scene_title}}\n\nProject: {{project_title}}\n');

		const scene = await createScene(app, settings, {
			project,
			title: 'Custom',
		});
		const body = stripFrontmatter(await app.vault.read(scene));
		expect(body).toContain('# Custom');
		expect(body).toContain('Project: Project');
	});

	it('populates {{previous_scene_title}} on subsequent scenes', async () => {
		const project = await seedProject(app, settings, 'Project');
		const templatePath = `${settings.templatesFolder.replace(/\/+$/, '')}/scene-template.md`;
		const folder = templatePath.slice(0, templatePath.lastIndexOf('/'));
		await app.vault.createFolder(folder);
		await app.vault.create(templatePath, 'Previous: {{previous_scene_title}}\n');

		const first = await createScene(app, settings, { project, title: 'First' });
		expect(stripFrontmatter(await app.vault.read(first))).toContain(
			'Previous: '
		);
		expect(stripFrontmatter(await app.vault.read(first))).not.toContain(
			'Previous: First'
		);

		const second = await createScene(app, settings, { project, title: 'Second' });
		expect(stripFrontmatter(await app.vault.read(second))).toContain(
			'Previous: First'
		);
	});

	it('refuses to overwrite an existing file', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Dup' });

		await expect(
			createScene(app, settings, { project, title: 'Dup' })
		).rejects.toThrow(/already exists/i);
	});

	it('produces a discoverable scene (findScenesInProject sees it)', async () => {
		const project = await seedProject(app, settings, 'Project');
		await createScene(app, settings, { project, title: 'Visible' });

		const scenes = findScenesInProject(app, project.frontmatter['dbench-id']);
		expect(scenes).toHaveLength(1);
		expect(scenes[0].file.basename).toBe('Visible');
	});

	it('honors a custom location (nested subfolder)', async () => {
		const project = await seedProject(app, settings, 'Project');
		const scene = await createScene(app, settings, {
			project,
			title: 'Elsewhere',
			location: 'Writing/Drafted/',
		});
		expect(scene.path).toBe(
			'Draft Bench/Project/Writing/Drafted/Elsewhere.md'
		);
	});
});

describe('createScene with Templater installed', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('routes the template through Templater when installed, then applies plugin tokens', async () => {
		const calls: Array<{ template: string; target: string }> = [];
		app.plugins._register('templater-obsidian', {
			templater: {
				create_running_config: (
					template: { path: string },
					target: { path: string }
				) => {
					calls.push({ template: template.path, target: target.path });
					return { template, target };
				},
				read_and_parse_template: async () => {
					// Emit a body that still contains a plugin token so we can
					// verify the pipeline substitutes it after Templater runs.
					return 'Processed by Templater.\n{{scene_title}} ends here.';
				},
			},
		});

		const project = await seedProject(app, settings, 'My Novel');
		const file = await createScene(app, settings, {
			project,
			title: 'Opening',
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].target).toBe('Draft Bench/My Novel/Opening.md');

		const body = await app.vault.read(file);
		const withoutFm = body.replace(/^---\n[\s\S]*?\n---\n/, '');
		expect(withoutFm).toContain('Processed by Templater.');
		expect(withoutFm).toContain('Opening ends here.');
		// Frontmatter still got stamped after Templater + body write.
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('scene');
	});

	it('falls back to the plain template body when Templater throws', async () => {
		app.plugins._register('templater-obsidian', {
			templater: {
				create_running_config: () => ({}),
				read_and_parse_template: async () => {
					throw new Error('template parse error');
				},
			},
		});

		const project = await seedProject(app, settings, 'Novel');
		const file = await createScene(app, settings, {
			project,
			title: 'Safe',
		});

		const body = await app.vault.read(file);
		const withoutFm = body.replace(/^---\n[\s\S]*?\n---\n/, '');
		// The built-in template's headings come through (with plugin tokens
		// substituted — the template doesn't actually contain any of our
		// tokens in the body, so this is a structural check).
		expect(withoutFm).toContain('## Draft');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-type']).toBe('scene');
	});

	it('uses the plain flow when Templater is not registered', async () => {
		// Same as the default path, just asserting explicitly that the
		// Templater branch doesn't run when the plugin isn't present.
		const project = await seedProject(app, settings, 'Novel');
		const file = await createScene(app, settings, {
			project,
			title: 'Plain',
		});

		const body = await app.vault.read(file);
		const withoutFm = body.replace(/^---\n[\s\S]*?\n---\n/, '');
		expect(withoutFm).toContain('## Draft');
	});
});

describe('createScene with chapter parent', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	async function seedProjectAndChapter(title: string, chapterTitle: string) {
		const project = await seedProject(app, settings, title);
		await createChapter(app, settings, { project, title: chapterTitle });
		const chapters = findChaptersInProject(app, project.frontmatter['dbench-id']);
		return {
			project: findProjects(app).find(
				(p) => p.frontmatter['dbench-id'] === project.frontmatter['dbench-id']
			)!,
			chapter: chapters[0],
		};
	}

	it('stamps chapter refs alongside project refs', async () => {
		const { project, chapter } = await seedProjectAndChapter('Novel', 'Chapter 1');

		const file = await createScene(app, settings, {
			project,
			chapter,
			title: 'Scene 1.1',
		});

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		expect(fm?.['dbench-project']).toBe('[[Novel]]');
		expect(fm?.['dbench-project-id']).toBe(project.frontmatter['dbench-id']);
		expect(fm?.['dbench-chapter']).toBe('[[Chapter 1]]');
		expect(fm?.['dbench-chapter-id']).toBe(chapter.frontmatter['dbench-id']);
	});

	it('lands the scene file nested under the chapter (default {chapter}/ per #11)', async () => {
		const { project, chapter } = await seedProjectAndChapter(
			'Novel',
			'Chapter 1'
		);
		const file = await createScene(app, settings, {
			project,
			chapter,
			title: 'Scene 1.1',
		});
		expect(file.path).toBe(
			'Draft Bench/Novel/Chapter 1/Scene 1.1.md'
		);
	});

	it('updates the chapter reverse array (not the project)', async () => {
		const { project, chapter } = await seedProjectAndChapter('Novel', 'Chapter 1');

		await createScene(app, settings, { project, chapter, title: 'Scene 1.1' });

		const chapterFm = app.metadataCache.getFileCache(chapter.file)?.frontmatter;
		expect(chapterFm?.['dbench-scenes']).toContain('[[Scene 1.1]]');

		const projectFm = app.metadataCache.getFileCache(project.file)?.frontmatter;
		expect(projectFm?.['dbench-scenes']).toEqual([]);
	});

	it('uses within-chapter ordering (each chapter resets to 1)', async () => {
		const { project, chapter } = await seedProjectAndChapter('Novel', 'Chapter 1');

		const s1 = await createScene(app, settings, { project, chapter, title: 'A' });
		const s2 = await createScene(app, settings, { project, chapter, title: 'B' });

		expect(app.metadataCache.getFileCache(s1)?.frontmatter?.['dbench-order']).toBe(1);
		expect(app.metadataCache.getFileCache(s2)?.frontmatter?.['dbench-order']).toBe(2);

		// Second chapter resets the count.
		const refreshedProject = findProjects(app).find(
			(p) => p.frontmatter['dbench-id'] === project.frontmatter['dbench-id']
		)!;
		await createChapter(app, settings, { project: refreshedProject, title: 'Chapter 2' });
		const ch2 = findChaptersInProject(app, project.frontmatter['dbench-id']).find(
			(c) => c.file.basename === 'Chapter 2'
		)!;
		const s3 = await createScene(app, settings, {
			project: refreshedProject,
			chapter: ch2,
			title: 'C',
		});
		expect(app.metadataCache.getFileCache(s3)?.frontmatter?.['dbench-order']).toBe(1);
	});

	it('refuses chapter-less createScene when project has chapters (no-mixed-children)', async () => {
		const { project } = await seedProjectAndChapter('Novel', 'Chapter 1');

		await expect(
			createScene(app, settings, { project, title: 'Direct Scene' })
		).rejects.toThrow(/has chapters/i);
	});

	it('findScenesInChapter returns scenes for that chapter only', async () => {
		const { project, chapter: ch1 } = await seedProjectAndChapter('Novel', 'Chapter 1');
		const refreshedProject = findProjects(app).find(
			(p) => p.frontmatter['dbench-id'] === project.frontmatter['dbench-id']
		)!;
		await createChapter(app, settings, { project: refreshedProject, title: 'Chapter 2' });
		const ch2 = findChaptersInProject(app, project.frontmatter['dbench-id']).find(
			(c) => c.file.basename === 'Chapter 2'
		)!;

		await createScene(app, settings, { project: refreshedProject, chapter: ch1, title: 'A' });
		await createScene(app, settings, { project: refreshedProject, chapter: ch1, title: 'B' });
		await createScene(app, settings, { project: refreshedProject, chapter: ch2, title: 'C' });

		expect(findScenesInChapter(app, ch1.frontmatter['dbench-id'])).toHaveLength(2);
		expect(findScenesInChapter(app, ch2.frontmatter['dbench-id'])).toHaveLength(1);

		// findScenesInProject returns the flat list across all chapters.
		expect(findScenesInProject(app, project.frontmatter['dbench-id'])).toHaveLength(3);
	});
});

describe('nextSceneOrderInChapter', () => {
	let app: App;
	let settings: DraftBenchSettings;

	beforeEach(() => {
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
	});

	it('returns 1 when no scenes exist in the chapter', async () => {
		const project = await seedProject(app, settings, 'Novel');
		await createChapter(app, settings, { project, title: 'Chapter 1' });
		const chapter = findChaptersInProject(app, project.frontmatter['dbench-id'])[0];
		expect(nextSceneOrderInChapter(app, chapter.frontmatter['dbench-id'])).toBe(1);
	});

	it('returns max+1 over scenes in this chapter', async () => {
		const project = await seedProject(app, settings, 'Novel');
		await createChapter(app, settings, { project, title: 'Chapter 1' });
		const refreshedProject = findProjects(app).find(
			(p) => p.frontmatter['dbench-id'] === project.frontmatter['dbench-id']
		)!;
		const chapter = findChaptersInProject(app, project.frontmatter['dbench-id'])[0];

		await createScene(app, settings, { project: refreshedProject, chapter, title: 'A' });
		await createScene(app, settings, { project: refreshedProject, chapter, title: 'B' });

		expect(nextSceneOrderInChapter(app, chapter.frontmatter['dbench-id'])).toBe(3);
	});
});
