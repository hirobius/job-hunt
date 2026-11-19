// A delete stays deleted (#836): two devices on one cloud row, each with its own stores and merge
// base, through the real blob merge (syncBlob) and base (syncBase). Device 1 deletes a job and
// pushes; device 2, which still holds that job, adds another and pushes over a stale stamp. The
// conflict merges the cloud in three-way, so the delete wins there too, and a pull on device 1
// never brings the job back.
import { describe, expect, it } from 'vitest';
import { emptyBlob, mergeBlob, readBlob, writeBlob, type SyncData } from '../syncBlob';
import { hashesOf, keysOf, type SyncHashes, type SyncKeys } from '../syncBase';
import type { Job } from '../types';
import type { RowStamp, WriteResult } from './trackerRow';
import { createSyncEngine } from './syncEngine';

type U = { id: string };
const ME: U = { id: 'u1' };
const job = (url: string): Job => ({ url, label: url, status: 'Saved' });
const withJobs = (urls: string[]): SyncData => ({ ...emptyBlob(), jobs: urls.map(job) });
const urls = (d: SyncData | null) => (d?.jobs ?? []).map((j) => j.url).sort();

/** One cloud row, shared by every device made from it. */
function cloudRow(start: SyncData) {
  let data: SyncData = start;
  let stamp: RowStamp = { row: true, at: 't1' };
  let n = 1;
  return {
    get: () => data,
    read: async () => ({ blob: readBlob(writeBlob(data)), stamp }),
    write: async (_uid: string, d: unknown, was: RowStamp): Promise<WriteResult> => {
      if (was.at !== stamp.at) return { result: 'conflict', stamp: null };
      stamp = { row: true, at: `t${++n}` };
      data = readBlob(d);
      return { result: 'ok', stamp };
    },
  };
}

/** A device: its own stores and its own merge base (what the cloud held at its last sync). */
function device(cloud: ReturnType<typeof cloudRow>) {
  let local: SyncData = emptyBlob();
  let base: { keys: SyncKeys | null; hashes: SyncHashes | null } = { keys: null, hashes: null };
  const engine = createSyncEngine<U>({
    readRow: cloud.read,
    writeRow: cloud.write,
    readLocal: () => local,
    localJson: () => JSON.stringify(writeBlob(local)),
    applyLocal: (next) => {
      local = next;
    },
    readBase: () => base,
    rememberBase: (_uid, d) => {
      base = { keys: keysOf(d), hashes: hashesOf(d) };
    },
    sessionIsStill: async () => true,
    owns: () => true,
    frozen: () => false,
    deleting: () => false,
    freezeNewerVersion: () => {},
    mergedBoth: () => {},
  });
  return {
    engine,
    local: () => local,
    set: (d: SyncData) => {
      local = d;
    },
    /** Sign in: the seed merge, then pushes are allowed. */
    async signIn() {
      await engine.mergeIn(ME, true);
      engine.markPulled();
    },
  };
}

describe('syncEngine: a delete stays deleted (#836)', () => {
  it('survives a stale device pushing over it, and a later pull', async () => {
    const cloud = cloudRow(withJobs(['https://a.example/1', 'https://b.example/2']));
    const one = device(cloud);
    const two = device(cloud);
    await one.signIn();
    await two.signIn();
    expect(urls(one.local())).toEqual(['https://a.example/1', 'https://b.example/2']);
    expect(urls(two.local())).toEqual(['https://a.example/1', 'https://b.example/2']);

    // Device 1 deletes b and syncs.
    one.set(withJobs(['https://a.example/1']));
    expect(await one.engine.push(ME)).toBe('ok');
    expect(urls(cloud.get())).toEqual(['https://a.example/1']);

    // Device 2 never saw that: it still holds b, adds c, and pushes over its old stamp. The
    // conflict merges the cloud in against device 2's base, where b was: deleted elsewhere.
    two.set(withJobs(['https://a.example/1', 'https://b.example/2', 'https://c.example/3']));
    expect(await two.engine.push(ME)).toBe('ok');
    expect(urls(cloud.get())).toEqual(['https://a.example/1', 'https://c.example/3']);
    expect(urls(two.local())).toEqual(['https://a.example/1', 'https://c.example/3']);

    // Device 1 pulls: c arrives, b stays gone.
    await one.engine.mergeIn(ME, false);
    expect(urls(one.local())).toEqual(['https://a.example/1', 'https://c.example/3']);
  });

  it('the merge itself: an entry in the base and the cloud but gone here stays gone', () => {
    const base = withJobs(['https://a.example/1', 'https://b.example/2']);
    const cloud = withJobs(['https://a.example/1', 'https://b.example/2']);
    const local = withJobs(['https://a.example/1']);
    const next = mergeBlob(cloud, local, true, keysOf(base), hashesOf(base));
    expect(urls(next)).toEqual(['https://a.example/1']);
  });
});
