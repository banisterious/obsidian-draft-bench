// Bundle-size measurement for the audit. Runs a production esbuild with
// metafile output, writes meta.json next to this script (gitignored),
// and prints esbuild's built-in analyze report. Independent of the
// production build pipeline; safe to run without affecting `main.js`.
//
// Usage: node scripts/audit/measure-bundle.mjs
//
// Output:
//   scripts/audit/meta.json     - raw metafile (gitignored)
//   stdout                      - human-readable size report

import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const metaPath = join(here, "meta.json");

const result = await esbuild.build({
	entryPoints: ["main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
	],
	format: "cjs",
	target: "es2022",
	metafile: true,
	write: false,
	logLevel: "warning",
	treeShaking: true,
	sourcemap: false,
});

await writeFile(metaPath, JSON.stringify(result.metafile, null, 2));

const report = await esbuild.analyzeMetafile(result.metafile, {
	verbose: false,
});
console.log(report);
