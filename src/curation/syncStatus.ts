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

export function getCurationSyncStatus(): CurationSyncStatus {
  return store.get();
}
export function useCurationSyncStatus(): CurationSyncStatus {
  return store.use();
}

// Boot: a persisted session means the auth listener is about to fire a sign-in pull.
if (hasPersistedSession()) setCurationSyncStatus('syncing');
