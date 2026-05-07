import { describe, expect, it } from 'vitest';
import {
	DEFAULT_IMAGE_EXTRACTION_FOLDER,
	DEFAULT_SNAPSHOT_FILENAME_TEMPLATE,
	type ImportOptions,
	type SnapshotCap,
} from '../../../src/import/scrivener/import-wizard-modal';

/**
 * Tests for the import-options defaults and constants surfaced by the
 * Options step. Wizard rendering itself isn't covered (existing test
 * pattern skips DOM); this pins the constants the Import write pass
 * (step 11) will eventually consume.
 */

describe('import options constants', () => {
	it('default snapshot filename template matches native draft pattern', () => {
		// Mirrors `resolveDraftFilename` in core/drafts.ts so imported
		// snapshots sit indistinguishably alongside natively-created
		// drafts (per § 4 amendment 2026-05-06).
		expect(DEFAULT_SNAPSHOT_FILENAME_TEMPLATE).toBe(
			'{scene} - Draft {n} ({date_compact})'
		);
	});

	it('default image extraction folder is Research/Images/', () => {
		expect(DEFAULT_IMAGE_EXTRACTION_FOLDER).toBe('Research/Images/');
	});

	it('SnapshotCap permits 1, 3, 5, and "all" values', () => {
		const valid: SnapshotCap[] = [1, 3, 5, 'all'];
		expect(valid).toHaveLength(4);
	});

	it('ImportOptions structurally matches the writer-driven settings shape', () => {
		// Type-level smoke test: an object with all fields satisfies
		// the interface. Build failures here would catch interface
		// drift early.
		const sample: ImportOptions = {
			importResearch: false,
			importSnapshots: false,
			snapshotCap: 3,
			snapshotFilenameTemplate: DEFAULT_SNAPSHOT_FILENAME_TEMPLATE,
			imageExtractionFolder: DEFAULT_IMAGE_EXTRACTION_FOLDER,
			createDefaultCompilePreset: false,
		};
		expect(sample.importResearch).toBe(false);
	});
});
