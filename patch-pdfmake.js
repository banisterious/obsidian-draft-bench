/**
 * Postinstall patch: strip dead-code branches from pdfmake's bundled
 * core-js + webpack runtime that the community-plugin scanner flags.
 *
 * Sites removed (all unreachable in Obsidian's Electron runtime):
 *   - IE8- setImmediate fallback in pdfmake's bundled core-js task.js
 *     (createElement('script') + onreadystatechange). The earlier
 *     MessageChannel branch always fires in Electron.
 *   - globalThis-polyfill IIFE bodies guarded by
 *     `typeof globalThis === "object"` early returns, which always fire
 *     in modern V8. The fallback bodies contain `new Function("return this")`.
 *
 * Each substitution carries an idempotency marker so re-running the patch
 * is a no-op. If an ORIGINAL string isn't found (vendor update), the patch
 * logs a warning and skips that substitution; it never silently mis-edits.
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, 'node_modules', 'pdfmake', 'build', 'pdfmake.js');
const MARKER = 'draft-bench-postinstall-patch';

const REPLACEMENTS = [
	{
		name: 'core-js IE8 setImmediate',
		original: `  // IE8-
  } else if (ONREADYSTATECHANGE in createElement('script')) {
    defer = function (id) {
      html.appendChild(createElement('script'))[ONREADYSTATECHANGE] = function () {
        html.removeChild(this);
        run(id);
      };
    };
  // Rest old browsers
  } else {`,
		patched: `  // IE8- polyfill branch removed (${MARKER}: unreachable in Electron)
  // Rest old browsers
  } else {`,
	},
	{
		name: 'core-js globalThis polyfill',
		original: `  if (typeof globalThis === "object") {
    return globalThis;
  }
  var g;
  try {
    // This works if eval is allowed (see CSP)
    // eslint-disable-next-line no-new-func
    g = this || new Function("return this")();
  } catch (e) {
    // This works if the window reference is available
    if (typeof window === "object") {
      return window;
    }

    // This works if the self reference is available
    if (typeof self === "object") {
      return self;
    }

    // This works if the global reference is available
    if (typeof __webpack_require__.g !== "undefined") {
      return __webpack_require__.g;
    }
  }
  return g;`,
		patched: `  // Dead-code fallbacks removed (${MARKER}: globalThis early-return always fires)
  return globalThis;`,
	},
	{
		name: 'webpack runtime/global',
		original: `/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();`,
		patched: `/******/ 		__webpack_require__.g = globalThis; /* ${MARKER}: globalThis fallback only */`,
	},
];

if (!fs.existsSync(TARGET)) {
	console.log('[patch-pdfmake] pdfmake.js not found; skipping.');
	process.exit(0);
}

let source = fs.readFileSync(TARGET, 'utf8');
let mutated = false;
let warnings = 0;

for (const r of REPLACEMENTS) {
	if (source.includes(r.patched)) {
		console.log(`[patch-pdfmake] ${r.name}: already patched.`);
		continue;
	}
	if (!source.includes(r.original)) {
		console.warn(
			`[patch-pdfmake] ${r.name}: ORIGINAL string not found. ` +
				'Vendor may have updated; skipping this substitution.'
		);
		warnings += 1;
		continue;
	}
	source = source.replace(r.original, r.patched);
	mutated = true;
	console.log(`[patch-pdfmake] ${r.name}: patched.`);
}

if (mutated) {
	fs.writeFileSync(TARGET, source, 'utf8');
}

if (warnings > 0) {
	console.warn(`[patch-pdfmake] ${warnings} substitution(s) skipped; review pdfmake's release notes.`);
}
