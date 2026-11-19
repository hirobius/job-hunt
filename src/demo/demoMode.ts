// The demo (#835, Adrian 2026-11-19): "Try a demo" on the sign-in screen, or a `?demo=1` link
// (route.ts), opens the app with sample data and no account. Review shows fictional design-systems
// postings with a note that it is a demo (demoPostings.ts); Apply gets the sample jobs
// (loadSample.ts). Everything is local: sample records carry `demo: true` (isSample.ts), so they
// are never pushed or counted as this device's data, and the demo never starts in a browser with a
// stored session. The flag lives for this tab only.
import { useSyncExternalStore } from 'react';
import { importFresh } from '../staleBuild';
import { hasPersistedSession as hasCloudSession } from '../supabase';

const KEY = 'rjb_demo';
const listeners = new Set<() => void>();
const loadSampleModule = importFresh(() => import('./loadSample'));

export function demoOn(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1' && !hasCloudSession();
  } catch {
    return false;
  }
}

/** Starts the demo; false when a session is stored (a signed-in tracker syncs). */
export async function startDemo(): Promise<boolean> {
  if (hasCloudSession()) return false;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* a blocked store: the demo still shows in this render */
  }
  listeners.forEach((l) => l());
  // The sample jobs for Apply, on top of nothing the visitor made (seedIfEmpty).
  const { loadSample } = await loadSampleModule();
  if (!hasCloudSession()) loadSample();
  return true;
}

export function useDemo(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    demoOn,
    () => false,
  );
}
