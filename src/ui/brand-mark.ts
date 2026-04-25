/**
 * Inline the Draft Bench favicon mark — three fanned manuscript pages
 * — into the given container.
 *
 * `stroke="currentcolor"` lets the mark pick up its theme color through
 * the consumer's CSS rule (set `color: var(--text-accent)` on the
 * passed-in class to get the accent-tinted variant). Source of truth
 * for the shape lives at `docs/assets/branding/draft-bench-favicon-mark.svg`;
 * this helper is a narrow runtime copy so the plugin doesn't ship a
 * separate asset path + fetch.
 *
 * Used by the Manuscript leaf empty state and the onboarding welcome
 * modal. Each consumer owns its own CSS rule for size / opacity / color.
 */
export function appendBrandMark(
	container: HTMLElement,
	className: string
): void {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', className);
	svg.setAttribute('viewBox', '0 0 200 200');
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', 'Draft Bench');

	const outer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	outer.setAttribute('transform', 'translate(100 100)');

	for (const rotation of [-18, 18, 0]) {
		const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		group.setAttribute('transform', `translate(0 40) rotate(${rotation})`);
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('x', '-25');
		rect.setAttribute('y', '-80');
		rect.setAttribute('width', '50');
		rect.setAttribute('height', '80');
		rect.setAttribute('rx', '3');
		rect.setAttribute('fill', 'none');
		rect.setAttribute('stroke', 'currentcolor');
		rect.setAttribute('stroke-width', '5');
		rect.setAttribute('stroke-linecap', 'round');
		group.appendChild(rect);
		outer.appendChild(group);
	}

	svg.appendChild(outer);
	container.appendChild(svg);
}
