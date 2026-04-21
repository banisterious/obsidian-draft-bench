# Coding Standards

## Table of Contents

- [1. Overview](#1-overview)
- [2. TypeScript Standards](#2-typescript-standards)
  - [2.1. Naming Conventions](#21-naming-conventions)
  - [2.2. Code Style](#22-code-style)
  - [2.3. Type Safety](#23-type-safety)
  - [2.4. Variable Declarations](#24-variable-declarations)
  - [2.5. Unused Variables](#25-unused-variables)
- [3. CSS Standards](#3-css-standards)
  - [3.1. Naming Conventions](#31-naming-conventions)
  - [3.2. Custom Properties](#32-custom-properties)
  - [3.3. Code Style](#33-code-style)
  - [3.4. Color Notation](#34-color-notation)
  - [3.5. Obsidian Native CSS Classes](#35-obsidian-native-css-classes)
- [4. Obsidian-Specific Guidelines](#4-obsidian-specific-guidelines)
- [5. Obsidian UI Guidelines](#5-obsidian-ui-guidelines)
  - [5.1. Sentence Case Requirement](#sentence-case-requirement)
  - [5.2. Proper Noun Exceptions](#proper-noun-exceptions)
  - [5.3. Settings Headings](#settings-headings)
  - [5.4. Use .setHeading() for Headings](#use-setheading-for-headings)
- [6. Linting Commands](#6-linting-commands)
- [7. Common Issues and Solutions](#7-common-issues-and-solutions)
- [8. Shared Utilities and Factories](#8-shared-utilities-and-factories)

---

## 1. Overview

This document defines coding standards for Draft Bench to ensure consistency and maintainability. These standards are enforced by ESLint (TypeScript) and Stylelint (CSS).

**Key Principles:**
- Write code that passes linting before committing
- Follow Obsidian API best practices
- Maintain consistent naming across the codebase
- Prioritize readability and type safety

---

## 2. TypeScript Standards

### 2.1. Naming Conventions

#### Files and Directories
- **Files**: Use kebab-case: `scene-note-writer.ts`, `project-graph.ts`
- **Directories**: Use kebab-case: `src/core/`, `src/ui/`

#### Code Identifiers

| Type | Convention | Example |
|------|------------|---------|
| **Interfaces** | PascalCase | `SceneData`, `DraftBenchSettings` |
| **Classes** | PascalCase | `ControlCenterModal`, `ProjectPicker` |
| **Functions** | camelCase | `createSceneNote()`, `loadProject()` |
| **Variables** | camelCase | `frontmatter`, `sceneCount` |
| **Constants** | SCREAMING_SNAKE_CASE | `DEFAULT_SETTINGS`, `DB_PROPERTY_PREFIX` |
| **Type Parameters** | Single uppercase letter or PascalCase | `T`, `TNode`, `SceneType` |

#### Settings Properties

**IMPORTANT: Use camelCase for all settings properties, NOT Sentence Case.**

```typescript
// ✅ CORRECT
export interface DraftBenchSettings {
  defaultProjectFolder: string;
  templatesFolder: string;
  defaultStatus: string;
  showWordCounts: boolean;
}

// ❌ WRONG - Do NOT use Sentence Case or spaces
export interface DraftBenchSettings {
  "Default Project Folder": string;  // Never do this!
  default_status: string;             // Avoid snake_case in TS
}
```

**Settings UI Display:**
- Use `.setName()` for user-facing labels with **sentence case** (per Obsidian style guide)
- Use `.setDesc()` for descriptions in sentence case

```typescript
// ✅ CORRECT - Sentence case for labels
new Setting(containerEl)
  .setName('Default project folder')           // Sentence case (lowercase after first word)
  .setDesc('Where new projects are created')   // Sentence case
  .addText(text => text
    .setValue(this.plugin.settings.defaultProjectFolder));  // camelCase property

// ❌ WRONG - Title Case
new Setting(containerEl)
  .setName('Default Project Folder')           // Title Case - Don't do this!
  .setDesc('Where new projects are created')
```

**Reference:** [Obsidian Style Guide - Sentence case](https://docs.obsidian.md/Contributing+to+Obsidian/Style+guide#Sentence+case)

#### Frontmatter Properties

All plugin-managed frontmatter keys are namespaced with the `dbench-` prefix:

```typescript
// ✅ CORRECT - dbench- prefix on plugin-managed properties
await this.app.fileManager.processFrontMatter(file, (fm) => {
  fm['dbench-type'] = 'scene';
  fm['dbench-project'] = projectName;
  fm['dbench-order'] = nextOrder;
  fm['dbench-status'] = 'draft';
});

// ❌ WRONG - Bare keys collide with user/other-plugin properties
fm.type = 'scene';
fm.project = projectName;
```

The `dbench-` namespace is enforced by convention, not by ESLint. Reviewing diffs for property names is part of code review.

### 2.2. Code Style

#### Indentation and Formatting
- **Indentation**: Use tabs
- **Line Length**: Aim for 100 characters maximum
- **Quotes**: Prefer single quotes for strings
- **Semicolons**: Always use semicolons

#### Function Declarations
```typescript
// ✅ Prefer arrow functions for callbacks
const handleClick = (event: MouseEvent): void => {
  // ...
};

// ✅ Use async/await syntax
async function createSceneNote(
  app: App,
  scene: SceneData
): Promise<TFile> {
  // ...
}

// ✅ Document complex functions with JSDoc
/**
 * Create a scene note with YAML frontmatter
 *
 * @param app - Obsidian app instance
 * @param scene - Scene data
 * @returns The created TFile
 */
export async function createSceneNote(/* ... */) {
  // ...
}
```

#### Import Organization
```typescript
// ✅ Group imports: external -> Obsidian -> internal
import { App, TFile, normalizePath } from 'obsidian';
import { buildSceneFrontmatter } from './frontmatter';
import { getLogger } from './logging';
```

### 2.3. Type Safety

#### Avoid `any`
```typescript
// ❌ AVOID
const frontmatter: Record<string, any> = {};

// ✅ PREFER - Be specific
interface SceneFrontmatter {
  'dbench-type': 'scene';
  'dbench-project': string;
  'dbench-order': number;
  'dbench-status'?: string;
}
const frontmatter: SceneFrontmatter = {
  'dbench-type': 'scene',
  'dbench-project': projectName,
  'dbench-order': order
};

// ✅ ACCEPTABLE - For truly dynamic data, use unknown
const rawData: unknown = JSON.parse(content);
```

**ESLint Rule:** `@typescript-eslint/no-explicit-any: "error"`

If you MUST use `any`, add a comment explaining why:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicData: Record<string, any> = {};  // Needed for arbitrary user-provided frontmatter
```

#### Type Annotations
```typescript
// ✅ Always annotate function parameters and return types
function calculateWordCount(text: string): number {
  // ...
}

// ✅ Annotate complex object literals
const config: CompilePreset = {
  name: 'Manuscript',
  includeStatuses: ['draft', 'revision', 'final'],
  separator: '\n\n* * *\n\n'
};
```

### 2.4. Variable Declarations

#### Use `const` by Default
```typescript
// ✅ CORRECT - Use const for values that don't change
const projectName = file.parent?.name;
const scenes = app.vault.getMarkdownFiles();

// ✅ CORRECT - Use let only when reassigning
let nextOrder = 0;
nextOrder = computeNextOrder(siblings);

// ❌ WRONG - Never use var
var fileName = 'test.md';  // ESLint error: no-var
```

**ESLint Rules:**
- `prefer-const: "error"` - Use const when variable is never reassigned
- `no-var: "error"` - Never use var

### 2.5. Unused Variables

#### Prefix with Underscore
```typescript
// ✅ CORRECT - Prefix unused params with _
function processScene(
  scene: SceneData,
  _index: number,      // Unused parameter
  _array: SceneData[]  // Unused parameter
): void {
  console.log(scene.title);
}

// ✅ CORRECT - Use destructuring to omit unused values
const { title, order } = scene;  // Don't destructure unneeded fields

// ❌ WRONG - Don't declare unused variables
const buffer = createBuffer();  // ESLint error if never used
```

**ESLint Rule:**
```json
"@typescript-eslint/no-unused-vars": [
  "error",
  {
    "args": "none",
    "argsIgnorePattern": "^_",
    "varsIgnorePattern": "^_"
  }
]
```

#### Remove Dead Code
```typescript
// ❌ WRONG - Don't leave commented-out code
// const oldValue = scene.title;
// console.log(oldValue);

// ✅ CORRECT - Remove or use version control for history
```

---

## 3. CSS Standards

### 3.1. Naming Conventions

#### BEM Methodology
All CSS classes MUST follow BEM (Block__Element--Modifier) with project prefix:

**Pattern:** `(dt|draft-bench)-[block](__[element])?(--[modifier])?`

```css
/* ✅ CORRECT - Block */
.dbench-modal-container { }
.draft-bench-card { }

/* ✅ CORRECT - Block + Element */
.dbench-card__header { }
.draft-bench-card__title { }
.dbench-nav-item__icon { }

/* ✅ CORRECT - Block + Modifier */
.dbench-btn--primary { }
.draft-bench-nav-item--active { }

/* ✅ CORRECT - Block + Element + Modifier */
.dbench-nav-item__icon--disabled { }

/* ❌ WRONG - Missing prefix */
.modal-container { }  /* Stylelint error */

/* ❌ WRONG - Camel case */
.dtModalContainer { }  /* Stylelint error */

/* ❌ WRONG - Sentence case or spaces */
.dbench-modal container { }  /* Stylelint error */
```

**Allowed Prefixes:**
- `dbench-` (Draft Bench) - Short prefix, preferred for most cases
- `draft-bench-` - Long form, use when collision risk warrants explicitness

#### Class Naming Examples

| Component | Class Name |
|-----------|------------|
| Modal container | `.dbench-modal-container` |
| Card header | `.dbench-card__header` |
| Primary button | `.dbench-btn--primary` |
| Active nav item | `.dbench-nav-item--active` |
| Scene picker | `.dbench-scene-picker` |
| Manuscript list | `.dbench-manuscript-list` |
| Compile preset row | `.dbench-compile-preset-row` |

### 3.2. Custom Properties

#### Variable Naming
Custom properties (CSS variables) MUST use kebab-case with prefix:

**Pattern:** `--dbench-[name]`

```css
/* ✅ CORRECT - Draft Bench variables */
--dbench-scene-card-width: 240px;
--dbench-spacing-horizontal: 16px;
--dbench-status-color-draft: #888;

/* ❌ WRONG - Missing prefix */
--modal-width: 800px;  /* Stylelint error */

/* ❌ WRONG - Camel case */
--dtModalWidth: 800px;  /* Stylelint error */

/* ❌ WRONG - Defining Obsidian variables in our CSS */
--background-primary: #fff;  /* Only USE, never DEFINE */
```

**Exception:** You can USE Obsidian's built-in CSS variables:

```css
/* ✅ CORRECT - Using Obsidian variables */
.dbench-modal {
  background: var(--background-primary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
}
```

### 3.3. Code Style

#### General Rules
```css
/* ✅ CORRECT - Lowercase everything */
.dbench-button {
  color: #3498db;
  font-family: sans-serif;
}

/* ✅ CORRECT - Double quotes for strings */
.dbench-icon::before {
  content: "->";
}

/* ✅ CORRECT - Shorthand hex colors */
color: #fff;  /* Not #ffffff */

/* ✅ CORRECT - Zero values don't need units */
margin: 0;  /* Not 0px */

/* ❌ WRONG - Redundant values in shorthand */
padding: 0 24px 24px 24px;  /* Use: padding: 0 24px 24px; */
```

#### Spacing and Line Breaks
```css
/* ✅ CORRECT - Empty line before declarations */
.dbench-card {
  padding: 16px;

  background: var(--background-secondary);
  border-radius: 8px;
}

/* ✅ CORRECT - Empty line before rules */
.dbench-card__header {
  font-weight: bold;
}

.dbench-card__content {
  padding: 8px;
}
```

#### Nesting Depth
```css
/* ✅ CORRECT - Max 3 levels */
.dbench-modal {
  .dbench-modal__content {
    .dbench-modal__header {
      /* This is the maximum depth */
    }
  }
}

/* ❌ WRONG - Exceeds max depth */
.dbench-modal {
  .dbench-level1 {
    .dbench-level2 {
      .dbench-level3 {
        .dbench-level4 { /* Stylelint error */ }
      }
    }
  }
}
```

**Stylelint Rule:** `max-nesting-depth: 3`

### 3.4. Color Notation

#### Modern Color Functions
```css
/* ✅ CORRECT - Modern notation with percentages */
background: rgb(0 0 0 / 12%);
box-shadow: 0 1px 3px rgb(0 0 0 / 24%);

/* ❌ WRONG - Legacy notation with decimals */
background: rgba(0, 0, 0, 0.12);  /* Stylelint error */
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.24);  /* Stylelint error */
```

**Stylelint Rules:**
- `color-function-notation: "modern"`
- `alpha-value-notation: "percentage"`

### 3.5. Obsidian Native CSS Classes

#### Prefer Native Classes Over Custom Styling

When Obsidian provides a native CSS class for standard UI elements, prefer using it alone rather than layering custom classes on top:

```typescript
// ✅ CORRECT - Use Obsidian's native dropdown class only
select.className = 'dropdown';

// ❌ AVOID - Custom class layered with native class
select.className = 'dbench-status-select dropdown';
```

**Rationale:**
- Ensures consistency with Obsidian's look and feel across themes
- Respects user themes and CSS snippets that target native classes
- Avoids CSS specificity conflicts between custom and native styling
- Reduces maintenance burden when Obsidian updates its styling
- Works correctly across different platforms (Windows, macOS, Linux/GTK)

**When to Use Custom Classes:**
- Container elements that need custom layout (flexbox, grid)
- Elements that don't have an Obsidian equivalent
- Additional styling that doesn't conflict with native behavior

**Common Obsidian Native Classes:**

| Element | Class | Notes |
|---------|-------|-------|
| Select dropdown | `dropdown` | Use alone, don't override `appearance` |
| Text input | `text-input` | Standard text fields |
| Button | `mod-cta` | Call-to-action button modifier |
| Setting row | `setting-item` | Settings panel rows |
| Clickable icon | `clickable-icon` | Icon buttons |

**Example - Dropdown in a Custom Container:**

```typescript
// ✅ CORRECT - Custom class on container, native class on element
const container = containerEl.createDiv({ cls: 'dbench-status-picker' });
const select = container.createEl('select', { cls: 'dropdown' });
```

```css
/* Custom layout on container only */
.dbench-status-picker {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Don't style the dropdown itself - let Obsidian handle it */
```

---

## 4. Obsidian-Specific Guidelines

This section documents critical requirements from [Obsidian's Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) that must be followed for plugin approval.

### General Best Practices

#### Avoid Global App Instance

**Rule:** Never use the global `app` object. Always use `this.app` from your plugin instance.

```typescript
// ❌ WRONG - Global app instance
const file = app.vault.getAbstractFileByPath(path);

// ✅ CORRECT - Plugin instance reference
export default class DraftBenchPlugin extends Plugin {
  async onload() {
    const file = this.app.vault.getAbstractFileByPath(path);
  }
}
```

**Why:** The global `app` object (`window.app`) is for debugging only and may be removed in future versions.

#### Avoid Unnecessary Console Logging

```typescript
// ❌ WRONG - Excessive logging
console.log('Plugin loaded');
console.log('Processing file:', file.name);
console.log('Done');

// ✅ CORRECT - Only log errors or use structured logging
if (error) {
  console.error('Failed to process file:', error);
}

// ✅ BETTER - Use a structured logging system once one exists in the project
const logger = getLogger('SceneWriter');
logger.error('Failed to process scene', error);
```

**Rule:** Developer console should only show error messages by default. Avoid debug/info logging in production. ESLint config allows `console.warn`, `console.error`, and `console.debug` only.

### Security

#### Avoid `innerHTML`, `outerHTML`, `insertAdjacentHTML`

**CRITICAL:** Building DOM from user input using these methods creates XSS vulnerabilities.

```typescript
// ❌ WRONG - Security vulnerability!
function showTitle(title: string) {
  let container = document.querySelector('.dbench-container');
  container.innerHTML = `<div><b>Scene: </b>${title}</div>`;
  // If title = "<script>alert('XSS')</script>", this executes!
}

// ✅ CORRECT - Use DOM API or Obsidian helpers
function showTitle(title: string) {
  let container = document.querySelector('.dbench-container');
  let div = container.createDiv();
  div.createEl('b', { text: 'Scene: ' });
  div.appendText(title);  // Safe - text is escaped
}

// ✅ BETTER - Obsidian createEl helper
containerEl.createDiv({ cls: 'dbench-container' }, (div) => {
  div.createEl('b', { text: 'Scene: ' });
  div.appendText(title);
});
```

**To cleanup:** Use `el.empty()` instead of setting `innerHTML = ''`.

### Workspace API

#### Avoid `workspace.activeLeaf`

```typescript
// ❌ WRONG - Direct access to activeLeaf
const leaf = this.app.workspace.activeLeaf;

// ✅ CORRECT - Use getActiveViewOfType()
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
  // view is guaranteed to be MarkdownView or null
}

// ✅ CORRECT - For editor access
const editor = this.app.workspace.activeEditor?.editor;
if (editor) {
  // Safe to use editor
}
```

#### Avoid Managing References to Custom Views

```typescript
// ❌ WRONG - Creates memory leaks
export default class DraftBenchPlugin extends Plugin {
  private view: ManuscriptView;

  onload() {
    this.registerView(MANUSCRIPT_VIEW_TYPE, () => this.view = new ManuscriptView());
  }
}

// ✅ CORRECT - Let Obsidian manage the reference
export default class DraftBenchPlugin extends Plugin {
  onload() {
    this.registerView(MANUSCRIPT_VIEW_TYPE, () => new ManuscriptView());
  }

  // Access view when needed
  getManuscriptView(): ManuscriptView | null {
    const leaves = this.app.workspace.getLeavesOfType(MANUSCRIPT_VIEW_TYPE);
    if (leaves.length > 0 && leaves[0].view instanceof ManuscriptView) {
      return leaves[0].view;
    }
    return null;
  }
}
```

### Vault API

#### Prefer Editor API over `Vault.modify` for Active Files

```typescript
// ❌ WRONG - Loses cursor position, selection, folded content
const file = this.app.workspace.getActiveFile();
const content = await this.app.vault.read(file);
const newContent = content.replace('old', 'new');
await this.app.vault.modify(file, newContent);

// ✅ CORRECT - Preserves editor state
const editor = this.app.workspace.activeEditor?.editor;
if (editor) {
  const content = editor.getValue();
  const newContent = content.replace('old', 'new');
  editor.setValue(newContent);
}
```

#### Prefer `Vault.process` over `Vault.modify` for Background Edits

```typescript
// ❌ WRONG - Can conflict with other plugins
const content = await this.app.vault.read(file);
const newContent = content.replace('old', 'new');
await this.app.vault.modify(file, newContent);

// ✅ CORRECT - Atomic, conflict-free
await this.app.vault.process(file, (content) => {
  return content.replace('old', 'new');
});
```

**Why:** `process()` is atomic and prevents conflicts when multiple plugins edit the same file.

#### Prefer `FileManager.processFrontMatter` for Frontmatter

This is a hard rule for Draft Bench — every plugin-managed frontmatter write goes through `processFrontMatter`. We never hand-parse YAML.

```typescript
// ❌ WRONG - Manual YAML parsing
const content = await this.app.vault.read(file);
const match = content.match(/^---\n([\s\S]*?)\n---/);
const yaml = parseYAML(match[1]);
yaml['dbench-status'] = 'draft';
const newContent = content.replace(match[0], `---\n${stringifyYAML(yaml)}\n---`);
await this.app.vault.modify(file, newContent);

// ✅ CORRECT - Atomic, consistent YAML formatting
await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
  frontmatter['dbench-status'] = 'draft';
});
```

**Benefits:**
- Atomic (no conflicts)
- Consistent YAML layout
- Automatic error handling
- Preserves user-authored properties Draft Bench doesn't manage

#### Prefer Vault API over Adapter API

```typescript
// ❌ AVOID - Slower, no safety guarantees
const content = await this.app.vault.adapter.read(path);
await this.app.vault.adapter.write(path, content);

// ✅ PREFER - Cached, safe from race conditions
const file = this.app.vault.getAbstractFileByPath(path);
if (file instanceof TFile) {
  const content = await this.app.vault.read(file);
  await this.app.vault.modify(file, content);
}
```

**Benefits of Vault API:**
- **Performance:** Caching layer speeds up reads
- **Safety:** Serial operations prevent race conditions

#### Avoid Iterating All Files to Find by Path

```typescript
// ❌ WRONG - O(n) performance, slow on large vaults
const file = this.app.vault.getFiles().find(f => f.path === filePath);

// ✅ CORRECT - O(1) lookup
const file = this.app.vault.getFileByPath(filePath);
const folder = this.app.vault.getFolderByPath(folderPath);

// ✅ CORRECT - When you don't know if it's a file or folder
const abstractFile = this.app.vault.getAbstractFileByPath(path);
if (abstractFile instanceof TFile) {
  // It's a file
} else if (abstractFile instanceof TFolder) {
  // It's a folder
}
```

#### Use `normalizePath()` for User-Defined Paths

```typescript
import { normalizePath } from 'obsidian';

// ❌ WRONG - Platform-specific issues, unsafe characters
const path = userInput;  // Could be "//my-folder\file"
const file = this.app.vault.getAbstractFileByPath(path);

// ✅ CORRECT - Clean, safe, cross-platform
const path = normalizePath(userInput);  // Returns "my-folder/file"
const file = this.app.vault.getAbstractFileByPath(path);
```

**What `normalizePath()` does:**
- Cleans forward/backward slashes
- Removes leading/trailing slashes
- Replaces non-breaking spaces with regular spaces
- Normalizes Unicode characters

### Resource Management

#### Clean Up Resources in `onunload()`

```typescript
// ✅ CORRECT - Use register methods for automatic cleanup
export default class DraftBenchPlugin extends Plugin {
  onload() {
    // Auto-cleaned when plugin unloads
    this.registerEvent(
      this.app.vault.on('create', this.onCreate)
    );

    this.addCommand({
      id: 'create-project',
      name: 'Create new project',
      callback: () => { }
    });
  }

  onCreate = (file: TAbstractFile) => {
    // Event handler
  }
}

// ❌ WRONG - Manual cleanup required
export default class DraftBenchPlugin extends Plugin {
  private eventRef: EventRef;

  onload() {
    this.eventRef = this.app.vault.on('create', this.onCreate);
  }

  onunload() {
    this.app.vault.offref(this.eventRef);  // Must remember to clean up
  }
}
```

**Exception:** Don't clean up resources that are automatically garbage-collected (like DOM event listeners on elements that will be removed).

#### Don't Detach Leaves in `onunload`

```typescript
// ❌ WRONG - Leaves won't restore to original position on update
onunload() {
  this.app.workspace.detachLeavesOfType(MANUSCRIPT_VIEW_TYPE);
}

// ✅ CORRECT - Let Obsidian handle leaf lifecycle
onunload() {
  // Don't detach leaves
}
```

**Why:** When plugin updates, leaves are automatically reinitialized at their original position.

### Commands

#### Avoid Default Hotkeys

```typescript
// ❌ WRONG - Can conflict with user settings or other plugins
this.addCommand({
  id: 'create-project',
  name: 'Create new project',
  hotkeys: [{ modifiers: ['Mod'], key: 'k' }],  // Don't do this
  callback: () => { }
});

// ✅ CORRECT - Let users assign their own hotkeys
this.addCommand({
  id: 'create-project',
  name: 'Create new project',
  callback: () => { }
});
```

**Why:**
- Different hotkeys available on different OS
- May conflict with user's existing configuration
- May conflict with other plugins

#### Use Appropriate Callback Types

```typescript
// ✅ Use callback for unconditional commands
this.addCommand({
  id: 'open-control-center',
  name: 'Open Control Center',
  callback: () => {
    // Always executes
  }
});

// ✅ Use checkCallback for conditional commands
this.addCommand({
  id: 'compile-current-project',
  name: 'Compile current project',
  checkCallback: (checking: boolean) => {
    const project = this.getCurrentProject();
    if (checking) {
      return project !== null;  // Return whether command should be enabled
    }
    if (project) {
      // Execute command
    }
  }
});

// ✅ Use editorCallback when you need the editor
this.addCommand({
  id: 'insert-scene-break',
  name: 'Insert scene break',
  editorCallback: (editor: Editor, view: MarkdownView) => {
    editor.replaceSelection('\n* * *\n');
  }
});

// ✅ Use editorCheckCallback for conditional editor commands
this.addCommand({
  id: 'wrap-selection-in-scene',
  name: 'Wrap selection in new scene',
  editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
    const hasSelection = editor.somethingSelected();
    if (checking) {
      return hasSelection;
    }
    if (hasSelection) {
      // Process selection
    }
  }
});
```

### Styling

#### No Hardcoded Styling

```typescript
// ❌ WRONG - Impossible to theme, override with CSS
const el = containerEl.createDiv();
el.style.color = 'white';
el.style.backgroundColor = 'red';

// ✅ CORRECT - Use CSS classes
const el = containerEl.createDiv({ cls: 'dbench-warning' });
```

**In your CSS file:**
```css
.dbench-warning {
  color: var(--text-normal);
  background-color: var(--background-modifier-error);
}
```

**Why:**
- Allows users to customize with themes/snippets
- Respects user's color preferences
- Consistent with Obsidian styling

**Use Obsidian CSS variables:**
- `--text-normal`, `--text-muted`, `--text-faint`
- `--background-primary`, `--background-secondary`
- `--background-modifier-border`, `--background-modifier-error`
- `--interactive-accent`, `--interactive-accent-hover`

See the `obsidian-plugin-ui` skill (`.claude/skills/obsidian-plugin-ui/SKILL.md`) for the full CSS variable reference.

**ESLint Rule:** `obsidianmd/no-static-styles-assignment: "error"` catches direct `.style.*` assignments.

### TypeScript Best Practices

#### Prefer `const` and `let` over `var`

Already covered in [§ 2.4. Variable Declarations](#24-variable-declarations).

#### Prefer async/await over Promises

```typescript
// ❌ WRONG - Harder to read, error-prone
function fetchData(): Promise<string | null> {
  return requestUrl('https://example.com')
    .then(res => res.text)
    .catch(e => {
      console.error(e);
      return null;
    });
}

// ✅ CORRECT - Clearer, easier to debug
async function fetchData(): Promise<string | null> {
  try {
    const res = await requestUrl('https://example.com');
    const text = await res.text;
    return text;
  } catch (e) {
    console.error(e);
    return null;
  }
}
```

**Reference:** [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

### Settings Tab

When the settings tab grows beyond a few sections, decompose `display()` into private render methods for maintainability:

```typescript
// ✅ CORRECT - Decomposed settings tab structure
export class DraftBenchSettingTab extends PluginSettingTab {
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Decomposed into section methods — no monolithic display()
    this.renderProjectsSection(containerEl);
    this.renderTemplatesSection(containerEl);
    this.renderStatusSection(containerEl);
    this.renderCompileSection(containerEl);
    this.renderAdvancedSection(containerEl);
  }

  private renderProjectsSection(containerEl: HTMLElement): void {
    // Use .setHeading() for section headers, sentence case
    new Setting(containerEl)
      .setName('Projects')
      .setHeading();

    // Sentence case for all UI text
    new Setting(containerEl)
      .setName('Default project folder')
      .setDesc('Where new projects are created')
      .addText(text => text
        .setValue(this.plugin.settings.defaultProjectFolder)
        .onChange(async (value) => {
          this.plugin.settings.defaultProjectFolder = value;
          await this.plugin.saveSettings();
        }));
  }
}
```

### ESLint Plugin Enforcement (eslint-plugin-obsidianmd)

The project uses [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin) to enforce Obsidian-specific best practices automatically. These rules catch common anti-patterns that wouldn't be flagged by standard TypeScript linting.

The following rules are active in `eslint.config.mjs`:

#### Core rules

| Rule | What it catches |
|------|-----------------|
| `obsidianmd/no-forbidden-elements` | Attaching forbidden elements to the DOM |
| `obsidianmd/no-static-styles-assignment` | Setting `.style.*` directly on DOM elements: use CSS classes instead |
| `obsidianmd/vault/iterate` | Iterating all files to find one by path: use `getAbstractFileByPath()` |
| `obsidianmd/detach-leaves` | Detaching leaves in `onunload` (Obsidian handles this) |
| `obsidianmd/hardcoded-config-path` | Hard-coded `.obsidian/` paths |
| `obsidianmd/no-plugin-as-component` | Passing the plugin instance as a `Component` to `MarkdownRenderer.render`: causes memory leaks |
| `obsidianmd/no-sample-code` | Unmodified sample-plugin boilerplate remaining in the codebase |
| `obsidianmd/no-tfile-tfolder-cast` | Casting to `TFile`/`TFolder`: use `instanceof` checks instead |
| `obsidianmd/no-view-references-in-plugin` | Storing view references on the plugin instance: causes memory leaks |
| `obsidianmd/platform` | Using the `navigator` API for OS detection: use Obsidian's `Platform` helper |
| `obsidianmd/prefer-file-manager-trash-file` *(warn)* | Using `Vault.trash()`/`Vault.delete()`: prefer `FileManager.trashFile()` so the user's "move to trash" preference is respected |
| `obsidianmd/regex-lookbehind` | Regex lookbehinds: not supported on some iOS versions |
| `obsidianmd/sample-names` | Sample plugin class names (`MyPlugin`, `MyPluginSettingTab`) left unchanged |

#### Command rules

| Rule | What it catches |
|------|-----------------|
| `obsidianmd/commands/no-command-in-command-id` | The word "command" in a command ID |
| `obsidianmd/commands/no-command-in-command-name` | The word "command" in a command name |
| `obsidianmd/commands/no-default-hotkeys` | Providing default hotkeys (hotkeys should be user-configured) |
| `obsidianmd/commands/no-plugin-id-in-command-id` | The plugin ID inside a command ID |
| `obsidianmd/commands/no-plugin-name-in-command-name` | The plugin name inside a command name |

#### Settings-tab rules

| Rule | What it catches |
|------|-----------------|
| `obsidianmd/settings-tab/no-manual-html-headings` | `<h1>`/`<h2>`/etc. for settings headings: use `new Setting().setHeading()` (see § 5.4) |
| `obsidianmd/settings-tab/no-problematic-settings-headings` | Anti-patterns in settings headings (Title Case, plugin name in heading, etc.) |

#### UI rules

| Rule | What it catches |
|------|-----------------|
| `obsidianmd/ui/sentence-case` | UI strings not in sentence case. See § 5.1 for the general requirement and the false-positive guidance immediately below for project-specific exceptions |

#### Handling `ui/sentence-case` false positives

The `obsidianmd/ui/sentence-case` rule produces false positives in any non-trivial codebase. When reviewing warnings:

**Always skip (false positives):**

- HTML element names (`th`, `td`, `li`, `div`, etc.)
- ARIA attributes (`aria-label`, `aria-describedby`)
- Code identifiers and CSS class names
- Separator characters (`, `, ` | `)
- Example/placeholder text (e.g., `e.g., Chapter 1`)
- Navigation symbols (`←`, `->`)

**Usually skip (intentional Title Case):**

- Entity type names when used as labels: `Create new Scene`, `Add to Project as…`
- Button labels referencing UI elements: `Click Project to select`
- Proper nouns not in the brands list

**Review and potentially fix:**

- Generic title-cased phrases that should be sentence case: `Compile Preset` -> `Compile preset`
- Product references: use `Obsidian Bases` (the feature is a proper noun) but `manuscript` (generic noun) not `Manuscript`

**To add recurring false positives permanently:** Edit `eslint.config.mjs` and add terms to the `brands` or `acronyms` arrays in the sentence-case rule config. These arrays REPLACE defaults, so essential defaults are already included.

**Other rules:** the structural rules (everything above `ui/sentence-case` in the tables) catch real anti-patterns. The fix is almost always to refactor rather than disable the rule.

---

## 5. Obsidian UI Guidelines

This section documents Obsidian's official UI text guidelines from the [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#UI+text).

### Sentence Case Requirement

**CRITICAL: All UI text must use sentence case, NOT Title Case.**

[Sentence case](https://en.wiktionary.org/wiki/sentence_case) means only the first word and proper nouns are capitalized.

```typescript
// ✅ CORRECT - Sentence case
.setName('Default project folder')
.setName('Create new scene')
.setName('Compile preset')
.setName('Show word counts')

// ❌ WRONG - Title Case
.setName('Default Project Folder')
.setName('Create New Scene')
.setName('Compile Preset')
.setName('Show Word Counts')
```

**Applies to:**
- Setting names (`.setName()`)
- Button text
- Command names
- Modal titles
- Section headings
- Form labels
- Any user-facing text in the UI

### Proper Noun Exceptions

The following proper nouns should **remain capitalized** even in sentence case contexts:

| Category | Examples |
|----------|----------|
| **Plugin name** | Draft Bench |
| **Feature names** | Control Center, Manuscript, Compile, Book Builder |
| **Third-party plugins / products** | Obsidian Bases, Templater, Dataview, Longform, Excalidraw |
| **External tools** | Pandoc |
| **Acronyms** | UUID, ID, PNG, SVG, CSV, PDF, ODT, MD, XML, JSON, YAML, BRAT |

```typescript
// ✅ CORRECT - Proper nouns stay capitalized
.setTitle('Draft Bench: Open Control Center')  // Plugin name capitalized
.setName('Compile to PDF')                         // Acronym
.setName('Export with Pandoc')                     // External tool
.setName('Open in Bases view')                     // Obsidian Bases is a feature/product name

// ❌ WRONG - Don't lowercase proper nouns
.setTitle('drafting table: Open control center')   // Plugin name should be capitalized
.setName('Compile to pdf')                         // Acronym should be all caps
.setName('Export with pandoc')                     // External tool name should be capitalized
```

### Settings Headings

**Rules for settings headings:**

1. **Only use headings if you have more than one section**
   - Don't add a top-level heading like "General", "Settings", or your plugin name
   - Keep general settings at the top without a heading

2. **Avoid "settings" in heading text**
   - Prefer "Advanced" over "Advanced settings"
   - Prefer "Templates" over "Settings for templates"
   - Everything under the settings tab is already settings—don't be redundant

3. **Use sentence case for headings**
   - Prefer "Compile presets" over "Compile Presets"
   - Prefer "Templates" over "Templates" (already sentence case)

```typescript
// ✅ CORRECT - Settings structure
export class DraftBenchSettingTab extends PluginSettingTab {
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // General settings at top - NO heading
    new Setting(containerEl)
      .setName('Default project folder')
      .setDesc('Where new projects are created');

    // Section heading - sentence case, no "settings"
    new Setting(containerEl)
      .setName('Advanced')
      .setHeading();

    new Setting(containerEl)
      .setName('Enable debug logging')
      .setDesc('Show additional logging information');
  }
}

// ❌ WRONG - Common mistakes
export class DraftBenchSettingTab extends PluginSettingTab {
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ❌ Don't add top-level heading
    containerEl.createEl('h2', { text: 'Draft Bench Settings' });

    // ❌ Title Case
    containerEl.createEl('h3', { text: 'Advanced Settings' });

    // ❌ Redundant "settings" + Title Case
    new Setting(containerEl)
      .setName('Default Project Folder');  // Should be sentence case
  }
}
```

### Use `.setHeading()` for Headings

Use `.setHeading()` instead of HTML heading elements for consistent styling:

```typescript
// ✅ CORRECT
new Setting(containerEl)
  .setName('Advanced')
  .setHeading();

// ❌ WRONG - Inconsistent styling
containerEl.createEl('h3', { text: 'Advanced' });
```

The `obsidianmd/settings-tab/no-manual-html-headings` ESLint rule catches the wrong form.

**Reference:** [Obsidian Plugin Guidelines - UI text](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#UI+text)

---

## 6. Linting Commands

### TypeScript Linting
```bash
# Check for errors
npm run lint

# Auto-fix errors
npm run lint:fix
```

### CSS Linting and Formatting
```bash
# Check CSS
npm run lint:css

# Auto-fix CSS
npm run lint:css:fix

# Format CSS with Prettier
npm run format:css
```

### Build Process
```bash
# Production build (TypeScript typecheck + esbuild bundle)
npm run build

# Watch mode for development
npm run dev
```

The build script invokes `tsc` and `esbuild` via direct `node ./node_modules/<pkg>/bin/<entry>` paths because the project lives on a Windows drive accessed through WSL2's DrvFS, which doesn't support Linux-style symlinks for `node_modules/.bin`. Don't change scripts to bare tool names — `npm install --no-bin-links` (the required install mode) leaves `.bin/` empty.

### Generated files

Three build artifacts live at the repo root and are committed to git so BRAT installs from GitHub work without a release workflow:

- **`styles.css`** — concatenated from `styles/*.css` by `build-css.js` (`npm run build:css`).
- **`main.js`** — bundled from `main.ts` + `src/` by esbuild (`npm run build`).
- **`main.js.map`** — source map, emitted alongside `main.js`.

Rules:

- **Never hand-edit these files.** Edit the sources (`styles/*.css`, `main.ts`, `src/**/*.ts`) and rebuild.
- **Builds are deterministic.** `build-css.js` emits no timestamps; esbuild is reproducible. A diff in any of the three artifacts therefore signals a real content change and should be committed alongside the source change that caused it.
- **Keep the repo state consistent.** When committing source changes, run `npm run build` first so the committed artifacts match the committed sources. If `git status` shows no-op diffs in the artifacts alone, regenerate once to reconcile and commit everything together. Never commit a source change without the matching rebuild.
- **`styles.css` is out of scope for Stylelint and Prettier.** `npm run lint:css` and `npm run format:css` target `styles/**/*.css` (the sources). `.stylelintrc.json` explicitly ignores `styles.css`.

---

## 7. Common Issues and Solutions

### TypeScript Issues

#### Issue: `prefer-const` error
```typescript
// ❌ Error: 'value' is never reassigned. Use 'const' instead
let value = 'test';
console.log(value);

// ✅ Fix: Use const
const value = 'test';
console.log(value);
```

#### Issue: `no-unused-vars` error
```typescript
// ❌ Error: 'result' is assigned a value but never used
const result = calculateValue();

// ✅ Fix 1: Remove if truly unused
// (delete the line)

// ✅ Fix 2: Prefix with _ if intentionally unused
const _result = calculateValue();  // Explicitly ignored

// ✅ Fix 3: Use the variable
const result = calculateValue();
console.log(result);
```

#### Issue: `@typescript-eslint/no-explicit-any` error
```typescript
// ❌ Error: Unexpected any. Specify a different type
const data: any = getValue();

// ✅ Fix 1: Use a proper type
interface SceneFrontmatter {
  'dbench-type': 'scene';
  'dbench-project': string;
  'dbench-order': number;
}
const data: SceneFrontmatter = getValue();

// ✅ Fix 2: Use unknown for truly dynamic data
const data: unknown = getValue();
if (typeof data === 'object' && data !== null) {
  // Type guard to safely use data
}
```

#### Issue: `no-undef` on `createDiv` / `createEl` / `createSpan` / `createFragment`

These are runtime-injected by Obsidian onto the global scope. They're declared as ESLint globals in `eslint.config.mjs`. If you see `no-undef` errors for these, check that the globals block is intact:

```javascript
globals: {
  ...globals.browser,
  ...globals.node,
  // Obsidian adds these to the global scope at runtime
  createDiv: 'readonly',
  createEl: 'readonly',
  createSpan: 'readonly',
  createFragment: 'readonly',
},
```

#### Issue: Regex spaces error
```typescript
// ❌ Error: Spaces are hard to count. Use {2}
const pattern = /^  - (.+)$/gm;

// ✅ Fix: Use quantifier
const pattern = /^ {2}- (.+)$/gm;
```

### CSS Issues

#### Issue: Class name pattern error
```css
/* ❌ Error: Expected ".xyz-modal" to match pattern */
.xyz-modal { }

/* ✅ Fix: Use 'dbench-' or 'draft-bench-' prefix */
.dbench-modal { }
.draft-bench-modal { }

/* ❌ Error: Expected ".modalContainer" to match pattern */
.modalContainer { }

/* ✅ Fix: Use kebab-case with prefix */
.dbench-modal-container { }
.draft-bench-modal-container { }
```

#### Issue: Custom property pattern error
```css
/* ❌ Error: Expected "--modal-width" to match pattern */
:root {
  --modal-width: 800px;
}

/* ✅ Fix: Add 'dbench-' prefix */
:root {
  --dbench-modal-width: 800px;
}
```

#### Issue: Color function notation error
```css
/* ❌ Error: Expected modern color-function notation */
background: rgba(0, 0, 0, 0.12);

/* ✅ Fix: Use modern notation with percentage */
background: rgb(0 0 0 / 12%);
```

#### Issue: Shorthand property redundancy
```css
/* ❌ Error: Expected "0 24px 24px 24px" to be "0 24px 24px" */
padding: 0 24px 24px 24px;

/* ✅ Fix: Remove redundant value */
padding: 0 24px 24px;
```

---

## 8. Shared Utilities and Factories

**Status (2026-04-16):** Draft Bench is pre-implementation. There are no shared utilities yet. This section is a placeholder for the pattern to follow once Phase 1+ work begins.

### When to extract a shared utility

When the same inline pattern appears in three or more places (formatting, normalization, frontmatter shaping, etc.), extract it to a single source under `src/utils/` (or a more specific subfolder) and update callers. Document the new utility here with:

- A short description
- The import path
- A `// ✅ CORRECT: use shared utility` example showing the recommended call
- A `// ❌ WRONG: inline duplication` example showing the anti-pattern it replaces

### When to use plugin factory/getter methods

When services depend on plugin settings, folder filters, or runtime context, expose them via plugin methods (`createXyzService()` for new instances, `getXyzService()` for singletons) rather than letting callers construct + configure manually. This avoids duplicated setup that may miss required steps.

| Service | Plugin method | Pattern | Notes |
|---------|--------------|---------|-------|
| *(none yet)* | | | |

Add rows here as services are introduced.

---

## References

- [eslint.config.mjs](../../eslint.config.mjs) - ESLint configuration
- [.stylelintrc.json](../../.stylelintrc.json) - Stylelint configuration
- [.prettierrc.json](../../.prettierrc.json) - Prettier configuration
- [obsidian-plugin-ui skill](../../.claude/skills/obsidian-plugin-ui/SKILL.md) - Obsidian UI patterns, theming, accessibility
- [specification.md](../planning/specification.md) - Plugin specification (data model, UI, phased plan)
- [Obsidian API Documentation](https://docs.obsidian.md/Reference/TypeScript+API)
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
