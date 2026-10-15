// The user's evidence profile (docs/specs/role-radar.md, `evidence-profile`): one free-text box in
// `rjb_radar_evidence`. It syncs with the account in the blob (ADR 0008), so sign-out's wipe of this
// browser no longer loses it.
import { useSyncExternalStore } from 'react';
import type { Verdict } from '../types';
import type { Tier } from './fitGap';

export const EVIDENCE_KEY = 'rjb_radar_evidence';

const listeners = new Set<() => void>();
// Only used after a failed write (blocked or full storage), so the text still lasts the page view.
let memory: string | null = null;

export function readEvidence(): string {
  try {
    const v = localStorage.getItem(EVIDENCE_KEY);
    if (v !== null) return v;
  } catch {
    /* blocked storage: fall through to memory */
  }
  return memory ?? '';
}

export function writeEvidence(text: string) {
  try {
    localStorage.setItem(EVIDENCE_KEY, text);
    memory = null;
  } catch {
    memory = text;
  }
  listeners.forEach((l) => l());
}

/** Replace from a pull or restore (same as a write; named for the sync seam). */
export const replaceEvidence = writeEvidence;

/** Merge two evidence texts: `cloud` wins when it has any text, otherwise keep `local`. */
export const mergeEvidence = (cloud: string, local: string): string =>
  cloud.trim() ? cloud : local;

const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener('storage', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', l);
  };
};

/** The evidence text, live. */
export const useEvidence = (): string =>
  useSyncExternalStore(subscribe, readEvidence, readEvidence);

/** How a tier reads on a posting, and the fit it becomes on a saved job. */
export const TIER_INFO: Record<Tier, { label: string; verdict: Verdict }> = {
  strong: { label: 'Strong fit', verdict: 'match' },
  stretch: { label: 'Stretch', verdict: 'stretch' },
  reach: { label: 'Reach', verdict: 'reach' },
};
