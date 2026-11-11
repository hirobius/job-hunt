import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Button, Checkbox, Input } from '@hirobius/design-system';
import { ActionDock } from './ActionDock';
import { isTypingField, SHOW_AFTER_MS } from './fieldFocus';

// #535 and the interaction review (2026-11-11): the dock hides (inert, aria-hidden) at once when a
// typing field takes focus, stays hidden while focus moves field to field, and comes back only
// after focus has been out of every field for SHOW_AFTER_MS. No keys: no dock, no spacer.
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function page() {
  render(
    <>
      <Input label="Note" />
      <Input label="Other" />
      <Checkbox label="Done" checked={false} onChange={() => {}} />
      <ActionDock docked label="Actions for X">
        <Button>Open application</Button>
      </ActionDock>
    </>,
  );
  return () => document.querySelector('.rjb-dock') as HTMLElement;
}

describe('ActionDock', () => {
  it('hides at once on a field, and comes back 150ms after focus leaves every field', () => {
    const dock = page();
    expect(dock()).toHaveAttribute('data-hidden', 'false');
    act(() => screen.getByLabelText('Note').focus());
    expect(dock()).toHaveAttribute('data-hidden', 'true');
    expect(dock()).toHaveAttribute('inert');
    expect(dock()).toHaveAttribute('aria-hidden', 'true');
    // A checkbox brings no keyboard up, but the dock waits out the delay first.
    act(() => screen.getByLabelText('Done').focus());
    expect(dock()).toHaveAttribute('data-hidden', 'true');
    act(() => vi.advanceTimersByTime(SHOW_AFTER_MS));
    expect(dock()).toHaveAttribute('data-hidden', 'false');
    expect(dock()).not.toHaveAttribute('inert');
  });

  it('does not flash while focus moves from one field to the next', () => {
    const dock = page();
    const seen: string[] = [];
    const obs = new MutationObserver(() => seen.push(dock().getAttribute('data-hidden')!));
    act(() => screen.getByLabelText('Note').focus());
    obs.observe(dock(), { attributes: true, attributeFilter: ['data-hidden'] });
    act(() => screen.getByLabelText('Other').focus());
    act(() => vi.advanceTimersByTime(SHOW_AFTER_MS * 2));
    obs.disconnect();
    expect(seen).not.toContain('false');
    expect(dock()).toHaveAttribute('data-hidden', 'true');
  });

  it('with no keys shows no dock (so main keeps no dock padding)', () => {
    render(
      <ActionDock docked label="Actions for X">
        {[false, null]}
      </ActionDock>,
    );
    expect(document.querySelector('.rjb-dock')).toBeNull();
  });

  it('sits inline (no dock) from lg', () => {
    render(
      <ActionDock docked={false} label="Actions for X">
        <Button>Open application</Button>
      </ActionDock>,
    );
    expect(screen.getByRole('group', { name: 'Actions for X' })).toHaveClass('rjb-dock-row');
  });

  it('knows a typing field', () => {
    const t = document.createElement('textarea');
    const r = document.createElement('input');
    r.type = 'radio';
    expect(isTypingField(t)).toBe(true);
    expect(isTypingField(r)).toBe(false);
    expect(isTypingField(null)).toBe(false);
  });
});

// #540 contract, #593: a state change from sync (another device) changes the keys. A focused key
// that leaves hands focus to the new filled key, or to onKeysGone; a key that stays keeps it.
describe('ActionDock focus when the keys change', () => {
  beforeEach(() => vi.useRealTimers());

  const dock = (keys: string[], docked: boolean, onKeysGone?: () => void) => (
    <ActionDock docked={docked} label="Actions for X" onKeysGone={onKeysGone}>
      {keys.map((k) => (
        <Button key={k}>{k}</Button>
      ))}
    </ActionDock>
  );

  for (const docked of [true, false]) {
    const where = docked ? 'docked' : 'inline';

    it(`${where}: the focused key leaves, focus goes to the new filled key`, () => {
      const { rerender } = render(dock(['Open application', 'Mark applied', 'Not a fit'], docked));
      act(() => screen.getByRole('button', { name: 'Not a fit' }).focus());
      rerender(dock(['Copy follow-up', 'Mark followed up', 'Close out'], docked));
      expect(screen.getByRole('button', { name: 'Copy follow-up' })).toHaveFocus();
    });

    it(`${where}: a focused key that stays keeps its focus`, () => {
      const { rerender } = render(dock(['Mark applied', 'Add link', 'Not a fit'], docked));
      act(() => screen.getByRole('button', { name: 'Mark applied' }).focus());
      rerender(dock(['Open application', 'Mark applied', 'Not a fit'], docked));
      expect(screen.getByRole('button', { name: 'Mark applied' })).toHaveFocus();
    });

    it(`${where}: no key left, focus goes to onKeysGone`, () => {
      const gone = vi.fn();
      const { rerender } = render(dock(['Add interview'], docked, gone));
      act(() => screen.getByRole('button', { name: 'Add interview' }).focus());
      rerender(dock([], docked, gone));
      expect(gone).toHaveBeenCalledTimes(1);
    });
  }

  it('focus elsewhere on the page is never moved', async () => {
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    document.body.appendChild(outside);
    const { rerender } = render(dock(['Open application', 'Mark applied'], true));
    act(() => screen.getByRole('button', { name: 'Mark applied' }).focus());
    act(() => outside.focus());
    // The blur's check runs on the next frame.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    rerender(dock(['Copy follow-up'], true));
    expect(outside).toHaveFocus();
    // Focus left the dock for the page, then dropped to body: a later key change takes nothing.
    act(() => outside.blur());
    rerender(dock(['Open application'], true));
    expect(document.body).toHaveFocus();
    outside.remove();
  });

  it('reserves one row for one key and two for more', () => {
    const { rerender } = render(dock(['Add interview'], true));
    expect(document.querySelector('.rjb-dock')).toHaveAttribute('data-rows', '1');
    rerender(dock(['Open application', 'Mark applied', 'Not a fit'], true));
    expect(document.querySelector('.rjb-dock')).toHaveAttribute('data-rows', '2');
  });
});
