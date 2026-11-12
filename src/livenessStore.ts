// The liveness cache as an app store (see feed/liveness.ts for the rules). Local only: it is read
// from `rjb_liveness`, written back on every change and never synced.
import { createStore } from './createStore';
import { liveFetchJson } from './feed/fetchFeed';
import { checkLive, dueJobs, readLiveness, writeLiveness, type LiveCheck } from './feed/liveness';
import type { FetchJson } from './feed/sources/http';
import { dedupKey, recordBoardChecks } from './store';
import type { Job } from './types';

export const liveness = createStore<Record<string, LiveCheck>>(readLiveness(), {
  onSet: writeLiveness,
});
export const useLiveness = liveness.use;

/** The cached check for a job URL, if there is one. */
export const checkFor = (all: Record<string, LiveCheck>, url: string): LiveCheck | undefined =>
  all[dedupKey(url)];

export interface CheckOptions {
  fetchJson?: FetchJson;
  now?: number;
  /** Ignore the 6 hour rule (tests). */
  force?: boolean;
}

/** Check the due jobs and store what came back. An unknown answer never replaces an earlier open
 *  or closed one: a flaky read must not erase what we knew. */
export async function runLivenessCheck(
  jobs: Job[],
  { fetchJson = liveFetchJson, now = Date.now(), force = false }: CheckOptions = {},
): Promise<{ checked: number; couldNot: number }> {
  const due = dueJobs(jobs, liveness.get(), now, force);
  if (due.length === 0) return { checked: 0, couldNot: 0 };
  const results = await checkLive(due, fetchJson, now);
  const next = { ...liveness.get() };
  let checked = 0;
  let couldNot = 0;
  for (const [url, check] of results) {
    const key = dedupKey(url);
    if (check.state === 'unknown') {
      couldNot++;
      if (!next[key] || next[key].state === 'unknown') next[key] = check;
    } else {
      checked++;
      next[key] = check;
    }
  }
  liveness.set(next);
  // The answer rides on the job too (#419): `closedAt` syncs, so Closed filters on every device.
  recordBoardChecks(results);
  return { checked, couldNot };
}

let autoRan = false;
/** The once-per-page-load check on open (LivenessViews.tsx LivenessOnOpen, #602). */
export async function autoLivenessCheck(jobs: Job[], opts: CheckOptions = {}): Promise<void> {
  if (autoRan) return;
  autoRan = true;
  await runLivenessCheck(jobs, opts);
}
/** Tests: forget that this session already checked. */
export function resetLivenessSession() {
  autoRan = false;
}
