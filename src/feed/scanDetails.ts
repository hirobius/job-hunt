// What Review new last read, for the Account menu's Scan details (Adrian 2026-11-08): Find shows no
// status text above Browse / Deck, so the source health and the "not shown" counts live there.
// Review new writes it as its view changes; the dialog reads it. In memory, per page load.
// Only the store lives here (CloudSyncProvider, in the entry, clears it); its wording is
// scanDetailsText.ts, so the strings stay out of the entry.
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
