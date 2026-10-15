// Where the sign-in curation pull stands — read by Onboarding so a returning user waits for their
// tracks instead of re-onboarding over a pending pull (and writing duplicate rows). It ALWAYS
// settles: 'syncing' turns into 'error' after SYNC_TIMEOUT_MS (paused project, stale token).
import { createStore } from '../createStore';
import { hasPersistedSession } from '../supabase';

export type CurationSyncStatus = 'idle' | 'syncing' | 'done' | 'error';

export const SYNC_TIMEOUT_MS = 8000;

const store = createStore<CurationSyncStatus>('idle');
let timer: ReturnType<typeof setTimeout> | undefined;

export function setCurationSyncStatus(next: CurationSyncStatus) {
  clearTimeout(timer);
  if (next === 'syncing')
    timer = setTimeout(() => {
      if (store.get() === 'syncing') store.set('error');
    }, SYNC_TIMEOUT_MS);
  if (store.get() !== next) store.set(next);
}

/** A per-change cloud write (curationStore's mirror) that the cloud refused. It stays journalled
 *  in pending.ts; this tells whoever listens (CloudSyncProvider toasts it), so it's never silent.
 *  It leaves the pull status alone: tracks and jobs keep separate sync state. */
const writeFailureListeners = new Set<() => void>();
export function reportCurationWriteFailed() {
  writeFailureListeners.forEach((l) => l());
}
export function onCurationWriteFailed(listener: () => void): () => void {
  writeFailureListeners.add(listener);
  return () => writeFailureListeners.delete(listener);
}

export function getCurationSyncStatus(): CurationSyncStatus {
  return store.get();
}
export function useCurationSyncStatus(): CurationSyncStatus {
  return store.use();
}

// When this device last completed a curation sync (ISO). Per device and wiped with the rest of the
// rjb_* data on sign-out — the reconcile uses it to tell "new here" from "deleted elsewhere".
const SYNCED_KEY = 'rjb_curation_synced_at';
export function getCurationSyncedAt(): string | null {
  try {
    return localStorage.getItem(SYNCED_KEY);
  } catch {
    return null;
  }
}
export function setCurationSyncedAt(iso: string | null) {
  try {
    if (iso) localStorage.setItem(SYNCED_KEY, iso);
    else localStorage.removeItem(SYNCED_KEY);
  } catch {
    /* ignore */
  }
}

// Boot: a persisted session means the auth listener is about to fire a sign-in pull.
if (hasPersistedSession()) setCurationSyncStatus('syncing');
