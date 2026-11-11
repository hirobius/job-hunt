import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { Job } from './types';

const feed = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock('./feed/fetchFeed', async (orig) => ({
  ...(await orig<typeof import('./feed/fetchFeed')>()),
  liveFetchJson: (u: string) => feed.fetchJson(u),
}));

import { LivenessCheck } from './LivenessViews';
import { useClosedOnBoard } from './useClosedOnBoard';
import { liveness, resetLivenessSession } from './livenessStore';
import { JobBadges } from './JobRowParts';
import { dedupKey } from './store';

const A = 'https://jobs.ashbyhq.com/ramp/aaaa';
const B = 'https://jobs.ashbyhq.com/ramp/bbbb';
const job = (url: string, label: string): Job => ({ url, label, status: 'Saved' });
const board = (...ids: string[]) => ({
  jobs: ids.map((id) => ({ id, jobUrl: `https://jobs.ashbyhq.com/ramp/${id}` })),
});

beforeEach(() => {
  localStorage.clear();
  liveness.set({});
  resetLivenessSession();
  feed.fetchJson.mockReset();
});
afterEach(cleanup);

/** The list's status line as Apply draws it: the count, then the closed tail (#601). */
function StatusLine({ jobs }: { jobs: Job[] }) {
  const tail = useClosedOnBoard(jobs);
  return (
    <>
      <p role="status">
        Active · {jobs.length} jobs{tail}
      </p>
      <LivenessCheck jobs={jobs} />
    </>
  );
}

describe('liveness on Apply (#601)', () => {
  it('renders no action when no saved job is on a supported board', () => {
    render(<StatusLine jobs={[job('https://x.example/1', 'x')]} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Active · 1 jobs')).toBeInTheDocument();
  });

  it('checks on open, then counts the closed jobs on the status line, with no second link', async () => {
    feed.fetchJson.mockResolvedValue(board('aaaa'));
    const { container } = render(<StatusLine jobs={[job(A, 'Open role'), job(B, 'Gone role')]} />);
    expect(await screen.findByText('Active · 2 jobs · 1 closed on the board')).toBeInTheDocument();
    // The closed job is already in the list with its Closed badge: no link, no date line.
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Closed on the board' })).toBeNull();
    expect(screen.queryByText(/Checked live/i)).toBeNull();
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('the button re-checks on demand', async () => {
    feed.fetchJson.mockResolvedValue(board('aaaa', 'bbbb'));
    render(<StatusLine jobs={[job(A, 'a'), job(B, 'b')]} />);
    await waitFor(() => expect(feed.fetchJson).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/closed on the board/i)).toBeNull();
    feed.fetchJson.mockResolvedValue(board('aaaa'));
    await userEvent.click(screen.getByRole('button', { name: /check which are still open/i }));
    expect(await screen.findByText(/1 closed on the board/)).toBeInTheDocument();
  });

  it('says it could not check when the board is unreachable, and flags nothing', async () => {
    feed.fetchJson.mockRejectedValue(new Error('offline'));
    render(<StatusLine jobs={[job(A, 'a')]} />);
    await userEvent.click(screen.getByRole('button', { name: /check which are still open/i }));
    expect(await screen.findByText(/could not check/i)).toBeInTheDocument();
    expect(screen.queryByText(/closed on the board/i)).not.toBeInTheDocument();
  });

  it('the Closed badge stays in the badge row (#419)', () => {
    liveness.set({ [dedupKey(A)]: { state: 'closed', checkedAt: '2026-10-15T12:00:00.000Z' } });
    render(<JobBadges job={{ ...job(A, 'Designer'), closedAt: '2026-10-15T12:00:00.000Z' }} />);
    const badges = [...document.querySelectorAll('span')].map((s) => s.textContent);
    expect(badges.indexOf('Saved')).toBeLessThan(badges.indexOf('Closed'));
  });
});
