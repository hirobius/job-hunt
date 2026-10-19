// The user's evidence profile (docs/specs/role-radar.md, `evidence-profile`), kept on this device
// only for now: syncing it is a sync-code change and Adrian's call. An `rjb_` key, so sign-out
// clears it with the rest of this device's data.
import type { Verdict } from '../types';
import type { Tier } from './fitGap';

const EVIDENCE_KEY = 'rjb_radar_evidence';

export function readEvidence(): string {
  try {
    return localStorage.getItem(EVIDENCE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeEvidence(text: string) {
  try {
    localStorage.setItem(EVIDENCE_KEY, text);
  } catch {
    /* blocked storage: the evidence then lasts this page view */
  }
}

/** How a tier reads on a posting, and the fit it becomes on a saved job. */
export const TIER_INFO: Record<Tier, { label: string; verdict: Verdict }> = {
  strong: { label: 'Strong fit', verdict: 'match' },
  stretch: { label: 'Stretch', verdict: 'stretch' },
  reach: { label: 'Reach', verdict: 'reach' },
};
