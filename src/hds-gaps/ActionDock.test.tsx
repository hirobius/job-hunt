import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

afterEach(cleanup);
import { Button, Checkbox, Input } from '@hirobius/design-system';
import { ActionDock } from './ActionDock';
import { isTypingField } from './fieldFocus';

// #535: the dock hides (inert) while a typing field has focus, and comes back on blur.
describe('ActionDock', () => {
  it('docks at the bottom, and hides while a field has focus', async () => {
    render(
      <>
        <Input label="Note" />
        <Checkbox label="Done" checked={false} onChange={() => {}} />
        <ActionDock docked label="Actions for X">
          <Button>Open application</Button>
        </ActionDock>
      </>,
    );
    const dock = screen.getByRole('group', { name: 'Actions for X' });
    expect(dock).toHaveClass('rjb-dock');
    expect(dock).toHaveAttribute('data-hidden', 'false');
    act(() => screen.getByLabelText('Note').focus());
    expect(dock).toHaveAttribute('data-hidden', 'true');
    expect(dock).toHaveAttribute('inert');
    // A checkbox brings no keyboard up.
    await act(async () => screen.getByLabelText('Done').focus());
    expect(dock).toHaveAttribute('data-hidden', 'false');
    await act(async () => (document.activeElement as HTMLElement).blur());
    expect(dock).not.toHaveAttribute('inert');
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
