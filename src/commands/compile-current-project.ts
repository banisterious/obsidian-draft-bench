import { Notice } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import {
	compileAndNotify,
	pickPresetAndCompile,
	resolveProjectForActive,
} from '../core/compile/operations';
import { isCompilePresetFrontmatter } from '../model/compile-preset';

/**
 * Register the "Draft Bench: Compile current project" palette command.
 *
 * Narrower than Run compile — requires an active file that belongs to
 * a project (project note, scene, draft, or preset). Refuses to fall
 * back to a project picker: the point is "compile the project this
 * note is part of," and asking which one defeats that. Loud notice
 * instead when context is missing.
 */
export function registerCompileCurrentProjectCommand(
	plugin: DraftBenchPlugin
): void {
	plugin.addCommand({
		id: 'compile-current-project',
		name: 'Compile current project',
		callback: () => {
			void runCommand(plugin);
		},
	});
}

async function runCommand(plugin: DraftBenchPlugin): Promise<void> {
	const app = plugin.app;
	const active = app.workspace.getActiveFile();
	if (!active) {
		notifyNoContext();
		return;
	}
	const fm = app.metadataCache.getFileCache(active)?.frontmatter;
	if (!fm) {
		notifyNoContext();
		return;
	}

	if (isCompilePresetFrontmatter(fm)) {
		await compileAndNotify(app, { file: active, frontmatter: fm });
		return;
	}

	const project = resolveProjectForActive(app, active, fm);
	if (!project) {
		notifyNoContext();
		return;
	}
	await pickPresetAndCompile(plugin, project);
}

function notifyNoContext(): void {
	new Notice(
		'Open a project, scene, draft, or compile preset to use this command.'
	);
}
