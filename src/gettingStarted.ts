// "Getting started" (#132): the three things a new account does first, computed from real state so
// a tick is never a claim. Pure; the card (GettingStarted.tsx) lays it out. The dismissal is a
// per-device flag, ignored when absent (a missing key just shows the card).
import { deriveJobState } from './jobState';
import { isSample } from './demo/isSample';
import type { Job } from './types';

const DISMISSED_KEY = 'rjb_ui_getting_started_done';

export interface GettingStartedItem {
  id: 'save' | 'follow-up' | 'sync';
  label: string;
  /** Where to do it, under the label: "Done" once it is. */
  note: string;
  done: boolean;
}

export function gettingStartedItems(jobs: Job[], signedIn: boolean): GettingStartedItem[] {
  const mine = jobs.filter((j) => !isSample(j));
  const worked = mine.some((j) => {
    const s = deriveJobState(j);
    return s.appliedDaysAgo != null || s.followUp.loggedDaysAgo != null;
  });
  return [
    { id: 'save', label: 'Save a job', note: 'From Companies or Add job', done: mine.length > 0 },
    {
      id: 'follow-up',
      label: 'Log a follow-up or mark a job applied',
      note: 'From any row in your Pipeline',
      done: worked,
    },
    {
      id: 'sync',
      label: 'Sign in to sync, or back up',
      note: 'From the account menu',
      done: signedIn,
    },
  ].map((it) => (it.done ? { ...it, note: 'Done' } : it)) as GettingStartedItem[];
}

export function isGettingStartedDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissGettingStarted(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    /* storage blocked: shown again next visit */
  }
}
