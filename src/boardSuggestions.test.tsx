// #576 item 5: board suggestions are shown in Companies and followed only on a tap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, ToastProvider } from '@hirobius/design-system';

const dismiss = vi.fn(async (_b: unknown) => {});
const rows = vi.hoisted(() => ({
  list: [] as { company: string; board: { kind: string; slug: string }; jobs: number }[],
}));
vi.mock('./boardSuggestions', async (orig) => ({
  ...(await orig<typeof import('./boardSuggestions')>()),
  loadSuggestions: async () => rows.list,
  dismissSuggestion: (b: unknown) => dismiss(b),
}));

import CompaniesDialog from './CompaniesDialog';
import { suggestionFromRow } from './boardSuggestions';
import { addSources, getSources } from './sources';

describe('suggestionFromRow', () => {
  it('keeps a well-formed row and drops any other', () => {
    expect(suggestionFromRow({ kind: 'ashby', slug: 'ramp', company: 'Ramp', jobs: 4 })).toEqual({
      company: 'Ramp',
      board: { kind: 'ashby', slug: 'ramp' },
      jobs: 4,
    });
    for (const bad of [
      null,
      { kind: 'workday', slug: 'x', company: 'X' },
      { kind: 'lever', slug: '../x', company: 'X' },
      { kind: 'lever', slug: 'x', company: '' },
    ])
      expect(suggestionFromRow(bad)).toBeNull();
  });
});

describe('Companies → Suggested', () => {
  beforeEach(() => {
    localStorage.clear();
    rows.list = [
      { company: 'Acme', board: { kind: 'greenhouse', slug: 'acme' }, jobs: 3 },
      { company: 'Zed', board: { kind: 'lever', slug: 'zed' }, jobs: 0 },
    ];
  });
  afterEach(() => cleanup());

  const open = () =>
    render(
      <ToastProvider>
        <Dialog open>
          <CompaniesDialog />
        </Dialog>
      </ToastProvider>,
    );

  it('lists suggestions without following them; Follow adds the board, Dismiss drops it', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('radio', { name: 'Suggested (2)' }));
    expect(screen.getByText('Acme · Greenhouse (3 open)')).toBeTruthy();
    expect(getSources().some((s) => s.ref === 'acme')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Follow Acme on Greenhouse' }));
    expect(getSources()).toEqual([
      expect.objectContaining({ kind: 'greenhouse', ref: 'acme', label: 'Acme' }),
    ]);
    expect(dismiss).toHaveBeenCalledWith({ kind: 'greenhouse', slug: 'acme' });

    await user.click(screen.getByRole('button', { name: 'Dismiss Zed' }));
    expect(dismiss).toHaveBeenCalledWith({ kind: 'lever', slug: 'zed' });
    expect(getSources()).toHaveLength(1);
  });

  it('links each suggestion to its board, so it can be checked first', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('radio', { name: 'Suggested (2)' }));
    const link = screen.getByRole('link', { name: 'Open board for Acme' });
    expect(link.getAttribute('href')).toBe('https://boards.greenhouse.io/acme');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('never suggests a company the user ignored', async () => {
    addSources([{ kind: 'company', ref: 'zed', label: 'Zed', muted: true }]);
    open();
    expect(await screen.findByRole('radio', { name: 'Suggested (1)' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Ignored (1)' })).toBeTruthy();
  });

  it('goes back to Followed when the last suggestion leaves', async () => {
    rows.list = [rows.list[0]];
    addSources([{ kind: 'ashby', ref: 'ramp', label: 'Ramp' }]);
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('radio', { name: 'Suggested (1)' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss Acme' }));
    expect(screen.queryByRole('radio', { name: /Suggested/ })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Followed (1)' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });
});
