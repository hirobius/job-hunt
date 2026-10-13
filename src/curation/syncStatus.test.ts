import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCurationSyncStatus, getCurationSyncStatus, SYNC_TIMEOUT_MS } from './syncStatus';
import { hasPersistedSession } from '../supabase';

afterEach(() => {
  vi.useRealTimers();
  setCurationSyncStatus('idle');
});

describe('curation sync status', () => {
  it('a stuck "syncing" settles to "error" after the timeout', () => {
    vi.useFakeTimers();
    setCurationSyncStatus('syncing');
    vi.advanceTimersByTime(SYNC_TIMEOUT_MS - 1);
    expect(getCurationSyncStatus()).toBe('syncing');
    vi.advanceTimersByTime(1);
    expect(getCurationSyncStatus()).toBe('error');
  });

  it('settling before the timeout cancels it', () => {
    vi.useFakeTimers();
    setCurationSyncStatus('syncing');
    setCurationSyncStatus('done');
    vi.advanceTimersByTime(SYNC_TIMEOUT_MS * 2);
    expect(getCurationSyncStatus()).toBe('done');
  });
});

describe('hasPersistedSession', () => {
  const storage = (keys: string[]) => ({
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
  });
  it.each([
    [[], false],
    [['rjb_shortlist'], false],
    [['sb-abc-auth-token'], true],
    [['rjb_x', 'sb-nelr-auth-token'], true],
  ])('%j → %s', (keys, out) => expect(hasPersistedSession(storage(keys))).toBe(out));
});
