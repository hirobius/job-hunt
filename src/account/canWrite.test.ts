// Writes wait for the cloud copy and never run in a stopped tab (#517 review).
import { describe, expect, it } from 'vitest';
import { canWrite, type CloudSyncApi } from './accountContext';

const api = (o: Partial<CloudSyncApi>) => ({ settled: true, ...o }) as CloudSyncApi;

describe('canWrite', () => {
  it('needs settled and the cloud read', () => {
    expect(canWrite(api({ cloudRead: true }))).toBe(true);
    expect(canWrite(api({ settled: false, cloudRead: true }))).toBe(false);
    expect(canWrite(api({ cloudRead: false }))).toBe(false);
    // A stopped tab is settled for the UI and never read (the provider): never for writes.
    expect(canWrite(api({ settled: true, cloudRead: false }))).toBe(false);
  });
  it('a test double without cloudRead counts as read', () => {
    expect(canWrite(api({}))).toBe(true);
  });
});
