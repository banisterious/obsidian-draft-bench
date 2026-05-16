/**
 * Postinstall patch: strip dead-code branches from docx's bundled
 * setImmediate polyfills that the community-plugin scanner flags.
 *
 * Sites removed (all unreachable in Obsidian's Electron runtime):
 *   - The IE8- createElement("script") + onreadystatechange fallback in
 *     docx's bundled MutationObserver-based scheduler. The MutationObserver
 *     branch earlier in the same chain always fires in Electron.
 *   - The IE8- createElement("script") branch + new Function("" + e4)
 *     string-callback shim in the bundled setimmediate npm package
 *     polyfill. The MessageChannel branch earlier fires first; the
 *     string-callback path is unused (docx always passes functions).
 *
 * Each substitution carries an idempotency marker so re-running the patch
 * is a no-op. If an ORIGINAL string isn't found (vendor update), the patch
 * logs a warning and skips that substitution; it never silently mis-edits.
 *
 * docx ships four module-format variants (index.cjs, index.mjs,
 * index.iife.js, index.umd.cjs); patches apply to whichever exist on disk
 * so esbuild's resolution path is covered regardless of bundle config.
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, 'node_modules', 'docx', 'dist');
const TARGETS = ['index.cjs', 'index.mjs', 'index.iife.js', 'index.umd.cjs'].map((name) =>
	path.join(DIST_DIR, name)
);
const MARKER = 'draft-bench-postinstall-patch';

const REPLACEMENTS = [
	{
		name: 'MutationObserver IE8 fallback',
		original: `          } else if (t2.setImmediate || void 0 === t2.MessageChannel) r = "document" in t2 && "onreadystatechange" in t2.document.createElement("script") ? function() {
            var e3 = t2.document.createElement("script");
            e3.onreadystatechange = function() {
              u(), e3.onreadystatechange = null, e3.parentNode.removeChild(e3), e3 = null;
            }, t2.document.documentElement.appendChild(e3);
          } : function() {
            setTimeout(u, 0);
          };`,
		patched: `          } else if (t2.setImmediate || void 0 === t2.MessageChannel) r = function() {
            setTimeout(u, 0); /* ${MARKER}: IE8 dynamic-script branch removed */
          };`,
	},
	{
		name: 'setimmediate IE8 createElement branch',
		original: `              }) : l && "onreadystatechange" in l.createElement("script") ? (s = l.documentElement, function(e4) {
                var t3 = l.createElement("script");
                t3.onreadystatechange = function() {
                  c(e4), t3.onreadystatechange = null, s.removeChild(t3), t3 = null;
                }, s.appendChild(t3);
              }) : function(e4) {`,
		patched: `              }) : function(e4) { /* ${MARKER}: IE8 dynamic-script branch removed */`,
	},
	{
		name: 'setimmediate string-callback shim',
		original: `                "function" != typeof e4 && (e4 = new Function("" + e4));`,
		patched: `                /* ${MARKER}: string-callback shim removed (e4 is always a function in docx's usage) */`,
	},
];

let totalWarnings = 0;

for (const target of TARGETS) {
	const label = `[patch-docx] ${path.basename(target)}`;

	if (!fs.existsSync(target)) {
		console.log(`${label}: not found; skipping.`);
		continue;
	}

	let source = fs.readFileSync(target, 'utf8');
	let mutated = false;

	for (const r of REPLACEMENTS) {
		if (source.includes(r.patched)) {
			console.log(`${label} ${r.name}: already patched.`);
			continue;
		}
		if (!source.includes(r.original)) {
			console.warn(
				`${label} ${r.name}: ORIGINAL string not found. ` +
					'Vendor may have updated; skipping this substitution.'
			);
			totalWarnings += 1;
			continue;
		}
		source = source.replace(r.original, r.patched);
		mutated = true;
		console.log(`${label} ${r.name}: patched.`);
	}

	if (mutated) {
		fs.writeFileSync(target, source, 'utf8');
	}
}

if (totalWarnings > 0) {
	console.warn(`[patch-docx] ${totalWarnings} substitution(s) skipped across docx variants; review docx's release notes.`);
}
