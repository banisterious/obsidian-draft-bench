import type { App, TFile } from 'obsidian';

/**
 * Integration with the Templater plugin
 * (https://github.com/SilentVoid13/Templater).
 *
 * Draft Bench templates can include Templater syntax (`<% ... %>`) when
 * the writer has Templater installed. On scene creation the plugin
 * detects Templater's presence, hands the scene's template + the new
 * scene file to Templater's `read_and_parse_template`, and uses the
 * processed result as the pre-substitution body. Plugin-token
 * substitution (`{{scene_title}}` etc.) runs afterwards on that
 * result — the two token syntaxes don't collide, and this order lets
 * a Templater function emit a plugin token that we then substitute.
 *
 * This is a best-effort integration. If Templater isn't installed, or
 * its API throws, `renderTemplateThroughTemplater` returns `null` and
 * the caller falls through to the plain template-body flow.
 *
 * The Templater API surface used here matches Longform's integration
 * (https://github.com/kevboh/longform/blob/main/src/model/note-utils.ts)
 * so we're on a path Templater's author has kept stable.
 */

const TEMPLATER_PLUGIN_ID = 'templater-obsidian';

/**
 * Minimal shape of the Templater plugin instance we rely on. We only
 * use `templater.create_running_config` and `templater.read_and_parse_template`;
 * everything else is opaque.
 */
interface TemplaterPlugin {
	templater: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		create_running_config: (template: TFile, target: TFile, runMode: number) => any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		read_and_parse_template: (config: any) => Promise<string>;
	};
}

/**
 * Shape of `app.plugins` that we read. Narrower than Obsidian's full
 * `Plugins` class because we only need to poke at one plugin ID.
 */
interface AppPlugins {
	getPlugin(id: string): TemplaterPlugin | null | undefined;
}

/**
 * True iff the Templater plugin is installed and enabled. Safe to call
 * during startup; returns `false` on any internal error.
 */
export function isTemplaterEnabled(app: App): boolean {
	try {
		const plugins = (app as unknown as { plugins?: AppPlugins }).plugins;
		if (!plugins || typeof plugins.getPlugin !== 'function') return false;
		return plugins.getPlugin(TEMPLATER_PLUGIN_ID) != null;
	} catch {
		return false;
	}
}

/**
 * Run `templateFile` through Templater with `targetFile` as the
 * `tp.file.*` context. Returns the processed body string, or `null`
 * when Templater is unavailable or throws.
 *
 * The runMode of `0` matches Longform's usage; Templater interprets it
 * as "create new file with template" which produces the parsed body
 * string without Templater itself writing to disk.
 */
export async function renderTemplateThroughTemplater(
	app: App,
	templateFile: TFile,
	targetFile: TFile
): Promise<string | null> {
	const plugins = (app as unknown as { plugins?: AppPlugins }).plugins;
	const templater = plugins?.getPlugin(TEMPLATER_PLUGIN_ID);
	if (!templater) return null;

	try {
		const config = templater.templater.create_running_config(
			templateFile,
			targetFile,
			0
		);
		const processed = await templater.templater.read_and_parse_template(config);
		return typeof processed === 'string' ? processed : null;
	} catch {
		return null;
	}
}
