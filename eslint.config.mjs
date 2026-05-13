import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	// Ignore patterns
	{
		ignores: [
			"main.js",
			"*.config.mjs",
			"*.config.ts",
			"build-css.js",
			"version-bump.mjs",
			"node_modules/**",
			"docs/**",
			"external/**",
			"dev-vault/**",
			"capture-vault/**",
			"tests/**",
			// Ignore JSON config files. obsidianmd 0.3.0's recommended
			// config tries to lint package.json but its typed rules
			// (no-plugin-as-component etc.) aren't fully gated to TS
			// files. Skip JSON linting locally — the community-store
			// scanner doesn't flag anything in these files anyway.
			"*.json",
			"**/*.json",
		],
	},

	// Use the plugin's recommended config (matches what the review bot uses).
	// Includes: TypeScript ESLint recommended (type-checked), Microsoft SDL,
	// no-unsanitized, depend, the obsidianmd ruleset (commands, settings-tab,
	// vault, ui/sentence-case, prefer-* rules, validate-manifest, etc.), and
	// rule-custom-message wrapping no-console.
	...obsidianmd.configs.recommended,

	// Workaround for 0.3.0's recommended config bug: the typed obsidianmd
	// rules (which call getParserServices()) are registered globally in
	// `recommendedPluginRulesConfig` rather than scoped to **/*.ts. Loading
	// them on a .js/.mjs/.cjs file throws "you have used a rule which
	// requires type information." Explicitly disable them for non-TS files.
	// Re-enabled implicitly for **/*.ts via the recommended config's
	// TS-scoped block. (Refs upstream 0.3.0 release.)
	{
		files: ["**/*.{js,mjs,cjs,jsx}"],
		rules: {
			"obsidianmd/no-plugin-as-component": "off",
			"obsidianmd/no-view-references-in-plugin": "off",
			"obsidianmd/no-unsupported-api": "off",
			"obsidianmd/prefer-file-manager-trash-file": "off",
			"obsidianmd/prefer-instanceof": "off",
		},
	},

	// Project-specific overrides on top of the recommended config.
	{
		files: ["main.ts", "src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
			},
			globals: {
				// PDF renderer uses `Buffer` as a TypeScript type when
				// describing pdfmake's callback API. Recognize Node's
				// Buffer global so no-undef doesn't flag the type
				// references.
				Buffer: "readonly",
			},
		},
		rules: {
			// Type-checked TS rules — disabled here as a categorical
			// posture. The bot's scope has expanded over time (0.1.9 ->
			// 0.2.9 added these as warnings; 0.3.0 keeps them), but the
			// flagged sites are legitimate any-from-API patterns:
			// `metadataCache.getFileCache(file)?.frontmatter` returns
			// `unknown` per Obsidian's typings, and the project narrows
			// via `isProjectFrontmatter` / `isSceneFrontmatter` / the
			// `toGeneric` helper before reading. Treating these as
			// warnings would add ~120 inline disable comments without
			// improving safety. Revisit only if a) the bot upgrades
			// these to "error" severity in its scoring, or b) a real
			// soundness gap surfaces in a frontmatter read site.
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",

			// `prefer-active-doc` — useful guidance for popout-window
			// compatibility. Surface as warning. (`prefer-create-el` was
			// removed in obsidianmd 0.3.0; the spiritual successor
			// `no-static-styles-assignment` is on the 0.3.0 recommended
			// preset already.)
			"obsidianmd/prefer-active-doc": "warn",

			// Custom brand / acronym lists. Providing these REPLACES the
			// plugin's defaults, so we re-include the defaults we use.
			"obsidianmd/ui/sentence-case": ["error", {
				enforceCamelCaseLower: true,
				brands: [
					// Plugin defaults (essential ones)
					"iOS", "iPadOS", "macOS", "Windows", "Android", "Linux",
					"Obsidian", "Obsidian Sync", "Obsidian Publish",
					"Google Drive", "Dropbox", "OneDrive", "iCloud Drive",
					"Markdown", "LaTeX",
					"JavaScript", "TypeScript", "Node.js",
					"npm", "pnpm", "Yarn", "Git", "GitHub", "GitLab",
					"VS Code", "Visual Studio Code",
					// Third-party plugins / tools
					"Bases",
					"Longform",
					"Templater",
					"Dataview",
					"Pandoc",
					"Scrivener",
					// Draft Bench feature names treated as proper nouns
					// so the sentence-case rule doesn't flag them in
					// commands / UI strings. Kept narrow: only the
					// names whose multi-word capitalization is part of
					// the brand. Generic feature labels like "compile
					// preset" and "project note" stay sentence case
					// per Obsidian's own UI conventions.
					"Draft Bench",
					"Manuscript Builder",
				],
				acronyms: [
					// Plugin defaults (essential ones)
					"API", "HTTP", "HTTPS", "URL", "DNS", "TCP", "IP", "SSH", "TLS", "SSL",
					"JSON", "XML", "HTML", "CSS", "PDF", "CSV", "YAML", "SQL",
					"PNG", "JPG", "JPEG", "GIF", "SVG",
					"SDK", "IDE", "CLI", "GUI", "REST",
					"UI", "OK", "ID", "UUID", "GUID",
					"DOM", "CDN", "FAQ", "AI", "ML",
					// Draft Bench specific
					"ODT",
					"MD",
					"BRAT",
				],
			}],
		},
	},
];
