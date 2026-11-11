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
