// The user's evidence profile (docs/specs/role-radar.md, `evidence-profile`): one free-text box in
// `rjb_radar_evidence`. It syncs with the account in the blob (ADR 0008), so sign-out's wipe of this
// browser no longer loses it.
import { useSyncExternalStore } from 'react';
import type { Verdict } from '../types';
import type { Tier } from './fitGap';

export const EVIDENCE_KEY = 'rjb_radar_evidence';

/** The longest evidence text kept (and synced); longer input is trimmed. */
export const EVIDENCE_MAX = 20_000;
export const capEvidence = (t: string): string => t.slice(0, EVIDENCE_MAX);

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

export function writeEvidence(raw: string) {
  const text = capEvidence(raw);
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

export const EVIDENCE_SEPARATOR = '--- From this device ---';

/** True when merging these two texts would keep both and pass EVIDENCE_MAX, so the merge cuts
 *  the end off. Callers tell the user instead of trimming silently (#189 follow-up). */
export function evidenceMergeOverflows(cloud: string, local: string): boolean {
  const c = cloud.trim();
  const l = local.trim();
  if (!c || !l || c.includes(l) || l.includes(c)) return false;
  return `${c}\n\n${EVIDENCE_SEPARATOR}\n\n${l}`.length > EVIDENCE_MAX;
}

export const EVIDENCE_TRIMMED = {
  title: 'Evidence was trimmed',
  description: `Your evidence from two places was combined and passed the ${EVIDENCE_MAX.toLocaleString('en-US')} character limit, so the end was cut. Check Your evidence in Live postings.`,
};

/** Merge two evidence texts. One side empty, or one containing the other: keep the fuller one.
 *  Both different: keep both, the cloud's first, a separator line, then this device's. */
export function mergeEvidence(cloud: string, local: string): string {
  const c = cloud.trim();
  const l = local.trim();
  if (!c) return local;
  if (!l || c === l || c.includes(l)) return cloud;
  if (l.includes(c)) return local;
  return capEvidence(`${c}\n\n${EVIDENCE_SEPARATOR}\n\n${l}`);
}

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
