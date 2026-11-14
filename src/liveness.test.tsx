import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { Job } from './types';

const feed = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock('./feed/fetchFeed', async (orig) => ({
  ...(await orig<typeof import('./feed/fetchFeed')>()),
  liveFetchJson: (u: string) => feed.fetchJson(u),
}));

import { LivenessOnOpen } from './LivenessViews';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';
import { replaceAll, useJobs } from './store';
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
  replaceAll([]);
  feed.fetchJson.mockReset();
});
afterEach(cleanup);

const api = (over: Partial<CloudSyncApi>): CloudSyncApi => ({
  user: { id: 'u1', email: 'sam@example.com' } as CloudSyncApi['user'],
  authResolved: true,
  status: '',
  settled: true,
  offline: false,
  sendLink: async () => null,
  signInWithGoogle: async () => null,
  signInWithLinkedIn: async () => null,
  retry: () => {},
  signOut: () => {},
  deleteMyData: () => {},
  signInOpen: false,
  setSignInOpen: () => {},
  ...over,
});

/** The list's rows' badges as Apply draws them (the one place closed shows since the status line
 *  went, 2026-11-13), with the on-open check mounted as App mounts it. */
function Badges() {
  const jobs = useJobs();
  return (
    <ul>
      {jobs.map((j) => (
        <li key={j.url}>
          <JobBadges job={j} />
        </li>
      ))}
    </ul>
  );
}
function StatusLine({ sync = {} }: { sync?: Partial<CloudSyncApi> }) {
  return (
    <CloudSyncContext.Provider value={api(sync)}>
      <LivenessOnOpen />
      <Badges />
    </CloudSyncContext.Provider>
  );
}
/** Render with the jobs in the store, where LivenessOnOpen reads them. */
function show(jobs: Job[], sync?: Partial<CloudSyncApi>) {
  replaceAll(jobs);
  return render(<StatusLine sync={sync} />);
}

describe('liveness on Apply (#601, on open since #602)', () => {
  it('has no manual action: nothing to press, whatever the jobs', () => {
    show([job(A, 'a'), job('https://x.example/1', 'x')]);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/check which are still open/i)).toBeNull();
  });

  it('checks on open, then the closed job shows its Closed badge, with no second link', async () => {
    feed.fetchJson.mockResolvedValue(board('aaaa'));
    const jobs = [job(A, 'Open role'), job(B, 'Gone role')];
    const { container } = show(jobs);
    expect(await screen.findAllByText('Closed')).toHaveLength(1);
    // Once per board.
    expect(feed.fetchJson).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link')).toBeNull();
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('runs once a page load: a second mount reads nothing', async () => {
    feed.fetchJson.mockResolvedValue(board('aaaa', 'bbbb'));
    const view = show([job(A, 'a'), job(B, 'b')]);
    await waitFor(() => expect(feed.fetchJson).toHaveBeenCalledTimes(1));
    view.unmount();
    show([job(A, 'a'), job(B, 'b')]);
    await new Promise((r) => setTimeout(r, 20));
    expect(feed.fetchJson).toHaveBeenCalledTimes(1);
  });

  it('respects 6 hours: a job checked within them is not asked again on the next load', async () => {
    liveness.set({ [dedupKey(A)]: { state: 'open', checkedAt: new Date().toISOString() } });
    show([job(A, 'a')]);
    await new Promise((r) => setTimeout(r, 20));
    expect(feed.fetchJson).not.toHaveBeenCalled();
  });

  it('a failed read never marks a job closed', async () => {
    feed.fetchJson.mockRejectedValue(new Error('offline'));
    show([job(A, 'a')]);
    await waitFor(() => expect(feed.fetchJson).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
    expect(liveness.get()[dedupKey(A)]?.state).not.toBe('closed');
  });

  it('signed out, before sync settles, or behind the sign-in screen it does nothing', async () => {
    show([job(A, 'a')], { user: null });
    cleanup();
    show([job(A, 'a')], { settled: false });
    cleanup();
    show([job(A, 'a')], { signInOpen: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(feed.fetchJson).not.toHaveBeenCalled();
  });

  it('the Closed badge stays in the badge row (#419)', () => {
    liveness.set({ [dedupKey(A)]: { state: 'closed', checkedAt: '2026-10-15T12:00:00.000Z' } });
    render(<JobBadges job={{ ...job(A, 'Designer'), closedAt: '2026-10-15T12:00:00.000Z' }} />);
    const badges = [...document.querySelectorAll('span')].map((s) => s.textContent);
    expect(badges.indexOf('Saved')).toBeLessThan(badges.indexOf('Closed'));
  });
});
