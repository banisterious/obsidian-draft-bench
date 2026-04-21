import { Notice } from 'obsidian';
import type DraftBenchPlugin from '../../main';
import {
	installBases,
	isBasesAvailable,
	type InstallBasesResult,
} from '../core/bases';
import { BASE_TEMPLATES } from '../core/bases-templates';

/**
 * Register the "Draft Bench: Install starter Bases views" command.
 *
 * Writes three `.base` files into `settings.basesFolder` (projects,
 * scenes, drafts) covering the V1 starter view palette. Existing
 * files are never overwritten; the summary notice reports created
 * vs. skipped counts.
 *
 * If the Bases core plugin isn't enabled, a separate notice flags
 * that — but the files are created anyway so they're ready for when
 * the user enables Bases later (soft availability gate per
 * bases-reference.md).
 */
export function registerInstallBasesCommand(plugin: DraftBenchPlugin): void {
	plugin.addCommand({
		id: 'install-starter-bases',
		name: 'Install starter Bases views',
		callback: async () => {
			const result = await installBases(
				plugin.app,
				plugin.settings,
				BASE_TEMPLATES
			);
			showInstallNotice(result, isBasesAvailable(plugin.app));
		},
	});
}

function showInstallNotice(
	result: InstallBasesResult,
	basesEnabled: boolean
): void {
	const parts: string[] = [];
	if (result.created.length > 0) {
		parts.push(
			`${result.created.length} ${pluralize(result.created.length, 'base')} created`
		);
	}
	if (result.skipped.length > 0) {
		parts.push(
			`${result.skipped.length} skipped (already exist)`
		);
	}
	if (result.errors.length > 0) {
		parts.push(
			`${result.errors.length} ${pluralize(result.errors.length, 'error')}`
		);
	}

	if (parts.length === 0) {
		new Notice('No Bases templates to install.');
		return;
	}

	const prefix = result.errors.length === 0 ? '✓ ' : '';
	new Notice(`${prefix}Install starter Bases: ${parts.join(', ')}.`);

	if (!basesEnabled && result.created.length > 0) {
		new Notice(
			'Bases core plugin is not enabled. The .base files are saved; enable the core plugin to view them as Bases.'
		);
	}
}

function pluralize(n: number, singular: string): string {
	return n === 1 ? singular : `${singular}s`;
}
