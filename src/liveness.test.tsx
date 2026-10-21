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

import { JobLivenessNote, PipelineLiveness } from './LivenessViews';
import { liveness, resetLivenessSession } from './livenessStore';
import { JobBadges } from './JobRowParts';
import { dedupKey, jobIdOf } from './store';

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

describe('PipelineLiveness', () => {
  it('renders nothing when no saved job is on a supported board', () => {
    const { container } = render(<PipelineLiveness jobs={[job('https://x.example/1', 'x')]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('checks on open, then names the closed jobs and links to their pages', async () => {
    feed.fetchJson.mockResolvedValue(board('aaaa'));
    const { container } = render(
      <PipelineLiveness jobs={[job(A, 'Open role'), job(B, 'Gone role')]} />,
    );
    const link = await screen.findByRole('link', { name: 'Gone role' });
    expect(link).toHaveAttribute('href', `#/queue/${jobIdOf(B)}`);
    expect(screen.getByText(/1 closed on the board/i)).toBeInTheDocument();
    expect(screen.getByText(/Checked live/i)).toBeInTheDocument();
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('the button re-checks on demand', async () => {
    feed.fetchJson.mockResolvedValue(board('aaaa', 'bbbb'));
    render(<PipelineLiveness jobs={[job(A, 'a'), job(B, 'b')]} />);
    await waitFor(() => expect(feed.fetchJson).toHaveBeenCalledTimes(1));
    await screen.findByText(/Checked live/i);
    feed.fetchJson.mockResolvedValue(board('aaaa'));
    await userEvent.click(screen.getByRole('button', { name: /check which are still open/i }));
    expect(await screen.findByRole('link', { name: 'b' })).toBeInTheDocument();
  });

  it('says it could not check when the board is unreachable, and flags nothing', async () => {
    feed.fetchJson.mockRejectedValue(new Error('offline'));
    render(<PipelineLiveness jobs={[job(A, 'a')]} />);
    await userEvent.click(screen.getByRole('button', { name: /check which are still open/i }));
    expect(await screen.findByText(/could not check/i)).toBeInTheDocument();
    expect(screen.queryByText(/closed on the board/i)).not.toBeInTheDocument();
  });
});

describe('JobLivenessNote', () => {
  it('shows nothing for a job with no check', () => {
    const { container } = render(<JobLivenessNote url={A} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the date; the Closed badge sits in the badge row (rev-3 B)', () => {
    liveness.set({ [dedupKey(A)]: { state: 'closed', checkedAt: '2026-10-15T12:00:00.000Z' } });
    render(<JobLivenessNote url={A} />);
    expect(screen.getByText(/Checked live Oct 15/)).toBeInTheDocument();
    expect(screen.queryByText('Closed on the board')).toBeNull();
    cleanup();
    render(<JobBadges job={job(A, 'Designer')} />);
    const badges = [...document.querySelectorAll('span')].map((s) => s.textContent);
    expect(badges.indexOf('Saved')).toBeLessThan(badges.indexOf('Closed on the board'));
  });

  it('an open job shows the date only', () => {
    liveness.set({ [dedupKey(A)]: { state: 'open', checkedAt: '2026-10-15T12:00:00.000Z' } });
    render(<JobLivenessNote url={A} />);
    expect(screen.getByText(/Checked live Oct 15/)).toBeInTheDocument();
    expect(screen.queryByText('Closed on the board')).not.toBeInTheDocument();
  });
});
