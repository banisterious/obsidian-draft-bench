import { describe, expect, it } from 'vitest';
import {
	classifyEmbedPath,
	createStripAccumulator,
	formatStripSummary,
} from '../../../src/core/compile/strip-accumulator';

describe('classifyEmbedPath', () => {
	it('classifies common image extensions', () => {
		expect(classifyEmbedPath('pic.png')).toBe('image');
		expect(classifyEmbedPath('photo.JPG')).toBe('image');
		expect(classifyEmbedPath('svg/diagram.SVG')).toBe('image');
		expect(classifyEmbedPath('frame.webp')).toBe('image');
	});

	it('classifies audio / video / pdf / base', () => {
		expect(classifyEmbedPath('clip.mp3')).toBe('audio');
		expect(classifyEmbedPath('scene.mp4')).toBe('video');
		expect(classifyEmbedPath('reading.PDF')).toBe('pdf');
		expect(classifyEmbedPath('view.base')).toBe('base');
	});

	it('returns null for unknown extensions (note-embed fallback)', () => {
		expect(classifyEmbedPath('Some Note')).toBeNull();
		expect(classifyEmbedPath('other.xyz')).toBeNull();
		expect(classifyEmbedPath('my-doc')).toBeNull();
	});
});

describe('StripAccumulator', () => {
	it('starts with zero counts in every category', () => {
		const s = createStripAccumulator().snapshot();
		expect(s.counts.image).toBe(0);
		expect(s.counts.audio).toBe(0);
		expect(s.counts.video).toBe(0);
		expect(s.counts.pdf).toBe(0);
		expect(s.counts.base).toBe(0);
		expect(s.counts.note).toBe(0);
		expect(s.total).toBe(0);
	});

	it('increments counts on record', () => {
		const acc = createStripAccumulator();
		acc.record('image');
		acc.record('image');
		acc.record('note');
		const s = acc.snapshot();
		expect(s.counts.image).toBe(2);
		expect(s.counts.note).toBe(1);
		expect(s.total).toBe(3);
	});

	it('produces immutable snapshots', () => {
		const acc = createStripAccumulator();
		acc.record('base');
		const first = acc.snapshot();
		acc.record('base');
		acc.record('pdf');
		const second = acc.snapshot();
		expect(first.counts.base).toBe(1);
		expect(first.counts.pdf).toBe(0);
		expect(first.total).toBe(1);
		expect(second.counts.base).toBe(2);
		expect(second.counts.pdf).toBe(1);
		expect(second.total).toBe(3);
	});
});

describe('formatStripSummary', () => {
	it('returns null for a zero-total summary', () => {
		expect(formatStripSummary(createStripAccumulator().snapshot())).toBeNull();
	});

	it('singularizes single-count categories', () => {
		const acc = createStripAccumulator();
		acc.record('image');
		acc.record('base');
		expect(formatStripSummary(acc.snapshot())).toBe(
			'Skipped 1 image embed, 1 base embed.'
		);
	});

	it('pluralizes multi-count categories', () => {
		const acc = createStripAccumulator();
		acc.record('image');
		acc.record('image');
		acc.record('image');
		expect(formatStripSummary(acc.snapshot())).toBe('Skipped 3 image embeds.');
	});

	it('omits zero-count categories and preserves canonical order', () => {
		const acc = createStripAccumulator();
		acc.record('note');
		acc.record('image');
		expect(formatStripSummary(acc.snapshot())).toBe(
			'Skipped 1 image embed, 1 note embed.'
		);
	});

	it('labels pdf with capitalization', () => {
		const acc = createStripAccumulator();
		acc.record('pdf');
		expect(formatStripSummary(acc.snapshot())).toBe('Skipped 1 PDF embed.');
	});
});
