#!/usr/bin/env node
/**
 * Draft Bench CSS Build System
 *
 * Concatenates component files from styles/ into a single styles.css
 * at the project root (the file Obsidian loads at plugin runtime).
 *
 * Adapted from Charted Roots' build-css.js with simplifications:
 *   - No external dependencies (drops chokidar, chalk).
 *   - No inline format/lint (use `npm run format:css` / `npm run lint:css`).
 *   - No watch mode (re-run manually or via `npm run build` / `npm run dev`).
 *
 * Usage: `node build-css.js` or `npm run build:css`.
 */

const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
	stylesDir: 'styles',
	outputFile: 'styles.css',
	tempFile: 'styles.tmp.css',

	// Component order for concatenation (dependency-aware).
	// Order matters: variables must come before anything that references them;
	// base utilities come before component-specific styles.
	componentOrder: [
		'variables.css',           // CSS custom properties (--dbench-spacing, --dbench-scene-*, etc.)
		'style-settings.css',      // Style Settings plugin configuration block
		'base.css',                // Utility classes, keyframes, reset-ish rules
		'notes.css',               // .dbench-project / .dbench-scene / .dbench-draft leaf styling
		'manuscript-builder.css',  // Manuscript Builder modal (compile preset editor)
		'modals.css',              // Shared modal base styles
		'reorder-modal.css',       // Scene reordering modal (keyboard-first)
		'manuscript-view.css',     // Manuscript workspace-leaf view (dockable)
		'settings-tab.css',        // Plugin settings tab styling
		'responsive.css'           // Breakpoint overrides (last so it can override anything)
	]
};

function log(level, msg) {
	const tag = { info: '[INFO]', success: '[OK]', warn: '[WARN]', error: '[ERR]' }[level] ?? '[INFO]';
	console.log(`${tag} ${msg}`);
}

async function getFileInfo(filePath) {
	try {
		const stats = await fs.stat(filePath);
		const content = await fs.readFile(filePath, 'utf8');
		const lines = content.split('\n').length;
		const sizeKB = parseFloat((stats.size / 1024).toFixed(2));
		return { exists: true, lines, bytes: stats.size, sizeKB };
	} catch {
		return { exists: false };
	}
}

function generateHeader(componentCount) {
	return `/* ==========================================================================
   Draft Bench Plugin Stylesheet (BUILT)
   ==========================================================================

   This file is generated from component files in styles/.
   Do not edit directly. Edit the component files, then run:
     npm run build:css

   Components: ${componentCount}
*/

`;
}

function generateComponentHeader(name, info) {
	return `
/* --------------------------------------------------------------------------
   ${name.toUpperCase()}  (${info.lines} lines, ${info.sizeKB} KB)
   -------------------------------------------------------------------------- */

`;
}

function generateFooter(stats, breakdown) {
	let footer = `
/* ==========================================================================
   BUILD SUMMARY
   ==========================================================================

   Components: ${stats.componentCount}
   Total:      ${stats.totalLines} lines, ${stats.totalKB} KB
`;
	breakdown.forEach((c) => {
		footer += `   - ${c.name}: ${c.lines} lines, ${c.sizeKB} KB\n`;
	});
	footer += `*/\n\n/* End of generated stylesheet */\n`;
	return footer;
}

async function buildCSS() {
	const buildStart = Date.now();
	log('info', 'Starting CSS build...');

	const stylesPath = path.join(process.cwd(), CONFIG.stylesDir);
	try {
		await fs.access(stylesPath);
	} catch {
		log('error', `Styles directory '${CONFIG.stylesDir}/' not found.`);
		process.exit(1);
	}

	let totalLines = 0;
	let totalBytes = 0;
	let componentCount = 0;
	const breakdown = [];

	let content = generateHeader(CONFIG.componentOrder.length);

	log('info', `Processing ${CONFIG.componentOrder.length} components in order...`);

	for (const component of CONFIG.componentOrder) {
		const componentPath = path.join(CONFIG.stylesDir, component);
		const info = await getFileInfo(componentPath);
		if (info.exists) {
			log('info', `  + ${component} (${info.lines} lines, ${info.sizeKB} KB)`);
			content += generateComponentHeader(component, info);
			content += await fs.readFile(componentPath, 'utf8');
			content += `\n\n/* End of ${component} */\n`;
			totalLines += info.lines;
			totalBytes += info.bytes;
			componentCount++;
			breakdown.push({ name: component, lines: info.lines, sizeKB: info.sizeKB });
		} else {
			log('warn', `  - ${component} (not found, skipping)`);
		}
	}

	// Warn about orphaned CSS files
	const allFiles = await fs.readdir(CONFIG.stylesDir);
	const orphans = allFiles.filter(
		(f) => f.endsWith('.css') && !CONFIG.componentOrder.includes(f)
	);
	if (orphans.length > 0) {
		log('warn', `${orphans.length} orphaned CSS file(s) in styles/ (not in componentOrder):`);
		orphans.forEach((f) => log('warn', `  ! ${f}`));
	}

	const buildDuration = ((Date.now() - buildStart) / 1000).toFixed(2);
	const totalKB = parseFloat((totalBytes / 1024).toFixed(2));
	const stats = { componentCount, totalLines, totalKB, buildDuration: parseFloat(buildDuration) };

	content += generateFooter(stats, breakdown);

	// Write atomically via temp file
	await fs.writeFile(CONFIG.tempFile, content, 'utf8');
	await fs.rename(CONFIG.tempFile, CONFIG.outputFile);

	// Compute final stats from the content string (avoids a post-rename
	// fs.stat which sometimes returns ENOENT briefly on WSL/drvfs).
	const finalLines = content.split('\n').length;
	const finalKB = parseFloat((Buffer.byteLength(content, 'utf8') / 1024).toFixed(2));
	log('success', `Built ${CONFIG.outputFile} (${finalLines} lines, ${finalKB} KB) in ${buildDuration}s`);
}

buildCSS().catch((err) => {
	log('error', `Build failed: ${err.message}`);
	process.exit(1);
});
