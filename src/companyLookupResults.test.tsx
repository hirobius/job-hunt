// A board the name matched that doesn't show it is the company's is listed, with why, and is only
// watched when the user says so ("Watch anyway").
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyLookupResults } from './CompanyLookupResults';
import type { DiscoverResult } from './feed/discoverBoards';

afterEach(cleanup);

const result: DiscoverResult = {
  found: [],
  unconfirmed: [
    {
      company: 'Forward',
      board: { kind: 'greenhouse', slug: 'forward' },
      jobs: 2,
      why: 'Its jobs link to getfwd.com, not goforward.com.',
    },
  ],
  missed: [],
  unknown: [],
  alreadyWatched: [],
  done: 1,
  total: 1,
};

describe('CompanyLookupResults: unconfirmed boards', () => {
  it('lists the board with its reason and watches it only on Watch anyway', async () => {
    const watchOne = vi.fn(() => true);
    render(
      <CompanyLookupResults asked="Forward" result={result} watchOne={watchOne} onStar={vi.fn()} />,
    );
    const list = screen.getByRole('list', { name: 'Boards not confirmed' });
    expect(within(list).getByText('Its jobs link to getfwd.com, not goforward.com.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Boards found' })).toBeNull();
    expect(watchOne).not.toHaveBeenCalled();
    await userEvent.click(
      within(list).getByRole('button', { name: 'Watch anyway Greenhouse board for Forward' }),
    );
    expect(watchOne).toHaveBeenCalledWith({ kind: 'greenhouse', slug: 'forward' });
    expect(
      within(list).getByRole('button', { name: 'Watching Greenhouse board for Forward' }),
    ).toHaveProperty('disabled', true);
  });
});
