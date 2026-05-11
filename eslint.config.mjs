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
		],
	},

	// Use the plugin's recommended config (matches what the review bot uses).
	// Includes: TypeScript ESLint recommended (type-checked), Microsoft SDL,
	// no-unsanitized, depend, the obsidianmd ruleset (commands, settings-tab,
	// vault, ui/sentence-case, prefer-* rules, validate-manifest, etc.), and
	// rule-custom-message wrapping no-console.
	...obsidianmd.configs.recommended,

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
			// Type-checked TS rules — disabled to match the review bot's
			// actual scope. These flag legitimate any-from-API patterns
			// throughout the codebase that the bot doesn't validate
			// against. Revisit if the bot's scope expands.
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",

			// prefer-create-el / prefer-active-doc — useful guidance but
			// the bot doesn't enforce them. Surface as warnings so
			// they're visible without failing the build.
			"obsidianmd/prefer-create-el": "warn",
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
