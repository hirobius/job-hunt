// What Review new last read, for the Account menu's Scan details (Adrian 2026-11-08): Find shows no
// status text above Browse / Deck, so the source health and the "not shown" counts live there.
// Review new writes it as its view changes; the dialog reads it. In memory, per page load.
import { useSyncExternalStore } from 'react';

export interface ScanDetails {
  /** Sources that didn't answer, with why. */
  failed: { label: string; error?: string }[];
  /** What the Feed left out, as plain phrases ("3 skipped", "12 not design-system roles"). */
  hidden: string[];
  newToday: number;
  sourcesRead: number;
}

let current: ScanDetails | null = null;
const listeners = new Set<() => void>();

export function setScanDetails(d: ScanDetails | null): void {
  current = d;
  listeners.forEach((l) => l());
}

export const getScanDetails = (): ScanDetails | null => current;

export function useScanDetails(): ScanDetails | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** What the Feed left out, as phrases. */
export function hiddenParts(h: {
  saved: number;
  decided: number;
  muted: number;
  include: number;
  exclude: number;
  seniority: number;
  salary: number;
}): string[] {
  return [
    h.saved > 0 && `${h.saved} saved`,
    h.decided > 0 && `${h.decided} skipped`,
    h.muted > 0 && `${h.muted} from muted companies`,
    h.include > 0 && `${h.include} not design-system roles`,
    h.seniority > 0 && `${h.seniority} by level`,
    h.exclude > 0 && `${h.exclude} by words left out`,
    h.salary > 0 && `${h.salary} by pay`,
  ].filter((x): x is string => !!x);
}

/** Why one source didn't answer, in plain words. Remotive's spent daily budget says when it comes back. */
export function unavailableWhy(s: { label: string; error?: string }): string {
  return s.error?.includes('daily limit reached')
    ? `${s.label.split(' · ')[0]}: today's free searches are used up, more tomorrow.`
    : (s.error?.replace(/ — /g, ': ') ?? `${s.label} didn’t answer.`);
}
