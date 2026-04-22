import { describe, expect, it, vi } from 'vitest';
import { ProjectSelection } from '../../src/core/selection';

describe('ProjectSelection', () => {
	it('starts null', () => {
		const sel = new ProjectSelection();
		expect(sel.get()).toBeNull();
		expect(sel.listenerCount).toBe(0);
	});

	it('set() updates the current value', () => {
		const sel = new ProjectSelection();
		sel.set('abc-123-def-456');
		expect(sel.get()).toBe('abc-123-def-456');
	});

	it('notifies listeners on change', () => {
		const sel = new ProjectSelection();
		const listener = vi.fn();
		sel.onChange(listener);

		sel.set('abc-123-def-456');
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith('abc-123-def-456');
	});

	it('does not notify when the value is unchanged', () => {
		const sel = new ProjectSelection();
		sel.set('same-value');
		const listener = vi.fn();
		sel.onChange(listener);

		sel.set('same-value');
		expect(listener).not.toHaveBeenCalled();
	});

	it('supports multiple listeners, fires in registration order', () => {
		const sel = new ProjectSelection();
		const calls: string[] = [];
		sel.onChange(() => calls.push('a'));
		sel.onChange(() => calls.push('b'));
		sel.onChange(() => calls.push('c'));

		sel.set('id');
		expect(calls).toEqual(['a', 'b', 'c']);
	});

	it('unsubscribe removes the listener', () => {
		const sel = new ProjectSelection();
		const listener = vi.fn();
		const unsubscribe = sel.onChange(listener);

		sel.set('first');
		expect(listener).toHaveBeenCalledTimes(1);

		unsubscribe();
		sel.set('second');
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('can be set back to null', () => {
		const sel = new ProjectSelection();
		const listener = vi.fn();
		sel.onChange(listener);

		sel.set('id');
		sel.set(null);
		expect(sel.get()).toBeNull();
		expect(listener).toHaveBeenCalledTimes(2);
		expect(listener).toHaveBeenNthCalledWith(2, null);
	});
});
