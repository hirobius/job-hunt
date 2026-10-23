// Add starter messages waits for cloud sync like Documents does: on a new device a stock message
// must not land before the user's own edited ones have arrived (review of rf-visual-031).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddStarterMessages } from './StarterMessages';
import { getAllDocuments } from './documents';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';

const withSync = (settled: boolean) => (
  <CloudSyncContext.Provider value={{ settled } as CloudSyncApi}>
    <AddStarterMessages />
  </CloudSyncContext.Provider>
);

afterEach(cleanup);

describe('AddStarterMessages', () => {
  it('does nothing until sync settles, then adds the starters', async () => {
    const before = getAllDocuments().length;
    const r = render(withSync(false));
    const button = screen.getByRole('button', { name: 'Add starter messages' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(getAllDocuments().length).toBe(before);
    r.rerender(withSync(true));
    await userEvent.click(screen.getByRole('button', { name: 'Add starter messages' }));
    expect(getAllDocuments().length).toBeGreaterThan(before);
  });

  it('outside the provider (tests) it counts as settled', () => {
    render(<AddStarterMessages />);
    expect(screen.getByRole('button', { name: 'Add starter messages' })).toBeEnabled();
  });
});
