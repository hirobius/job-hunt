// The sync engine (#814 step 2) with in-memory ports: no React, no supabase-js. Each test drives one
// path of the push / merge loop.
import { describe, expect, it, vi } from 'vitest';
import { emptyBlob, writeBlob, BLOB_VERSION, type SyncData } from '../syncBlob';
import type { RowStamp, WriteResult } from './trackerRow';
import { createSyncEngine, PUSH_TRIES, type SyncPorts } from './syncEngine';

type U = { id: string };
const ME: U = { id: 'u1' };

/** A cloud row and a device, wired as ports. `local` is what this device's stores hold. */
function rig(opts: { cloud?: SyncData | null; local?: SyncData } = {}) {
  let cloud: SyncData | null = opts.cloud ?? null;
  let stamp: RowStamp = cloud ? { row: true, at: 't1' } : { row: false, at: null };
  let n = 1;
  let local: SyncData = opts.local ?? emptyBlob();
  const state = { owns: true, frozen: false, deleting: false, session: true };
  const writes: { data: unknown; was: RowStamp }[] = [];
  let nextWrite: WriteResult['result'] | null = null;
  const ports: SyncPorts<U> = {
    readRow: vi.fn(async () => ({ blob: cloud, stamp })),
    writeRow: vi.fn(async (_uid: string, data: unknown, was: RowStamp): Promise<WriteResult> => {
      writes.push({ data, was });
      const forced = nextWrite;
      nextWrite = null;
      if (forced === 'fail') return { result: 'fail', stamp: null };
      if (forced === 'conflict' || was.at !== stamp.at || was.row !== stamp.row)
        return { result: 'conflict', stamp: null };
      stamp = { row: true, at: `t${++n}` };
      cloud = structuredClone(data) as SyncData;
      return { result: 'ok', stamp };
    }),
    readLocal: () => local,
    localJson: () => JSON.stringify(writeBlob(local)),
    applyLocal: (next) => {
      local = next;
    },
    readBase: () => ({ keys: null, hashes: null }),
    rememberBase: vi.fn(),
    sessionIsStill: async () => state.session,
    owns: () => state.owns,
    frozen: () => state.frozen,
    deleting: () => state.deleting,
    freezeNewerVersion: vi.fn(),
    mergedBoth: vi.fn(),
  };
  const engine = createSyncEngine(ports);
  return {
    engine,
    ports,
    state,
    writes,
    setLocal: (d: SyncData) => (local = d),
    getLocal: () => local,
    setCloud: (d: SyncData) => {
      cloud = d;
      stamp = { row: true, at: `t${++n}` };
    },
    failNextWrite: () => (nextWrite = 'fail'),
  };
}

const withEvidence = (text: string): SyncData => ({ ...emptyBlob(), evidence: text });

describe('createSyncEngine', () => {
  it('never pushes before a pull has merged the cloud in (#161)', async () => {
    const r = rig();
    expect(await r.engine.push(ME)).toBe('stopped');
    expect(r.writes).toHaveLength(0);
  });

  it('a first pull of an empty account, then a push, inserts the row', async () => {
    const r = rig({ local: withEvidence('ten years of welding') });
    expect(await r.engine.mergeIn(ME, true)).not.toBeNull();
    r.engine.markPulled();
    expect(r.engine.dirty()).toBe(false); // what was adopted is not pushed back
    r.setLocal(withEvidence('eleven years of welding'));
    expect(r.engine.dirty()).toBe(true);
    expect(await r.engine.push(ME)).toBe('ok');
    expect(r.writes[0].was).toEqual({ row: false, at: null });
    expect(r.engine.dirty()).toBe(false);
  });

  it('on a conflict merges the newer cloud copy in and sends again', async () => {
    const r = rig({ cloud: withEvidence('a') });
    await r.engine.mergeIn(ME, true);
    r.engine.markPulled();
    r.setCloud(withEvidence('a, from another device')); // another device saved since
    r.setLocal(withEvidence('a, edited here'));
    expect(await r.engine.push(ME)).toBe('ok');
    expect(r.writes).toHaveLength(2); // the conflict, then the send over the new stamp
    expect(r.ports.readRow).toHaveBeenCalledTimes(2);
    expect(r.ports.mergedBoth).toHaveBeenCalled();
  });

  it('says failed, and stays dirty, when the write is refused', async () => {
    const r = rig();
    await r.engine.mergeIn(ME, true);
    r.engine.markPulled();
    r.setLocal(withEvidence('unsent'));
    r.failNextWrite();
    expect(await r.engine.push(ME)).toBe('failed');
    expect(r.engine.dirty()).toBe(true);
  });

  it('gives up after PUSH_TRIES conflicts in a row', async () => {
    const r = rig({ cloud: withEvidence('a') });
    await r.engine.mergeIn(ME, true);
    r.engine.markPulled();
    r.setLocal(withEvidence('b'));
    r.ports.writeRow = vi.fn(async () => ({ result: 'conflict' as const, stamp: null }));
    expect(await r.engine.push(ME)).toBe('failed');
    expect(r.ports.writeRow).toHaveBeenCalledTimes(PUSH_TRIES);
  });

  it('stops, sending nothing, when the session moved to another account (#288)', async () => {
    const r = rig();
    await r.engine.mergeIn(ME, true);
    r.engine.markPulled();
    r.setLocal(withEvidence('x'));
    r.state.session = false;
    expect(await r.engine.push(ME)).toBe('stopped');
    expect(r.writes).toHaveLength(0);
  });

  it('stops while Delete my data runs (#393) or in a frozen tab', async () => {
    const r = rig();
    await r.engine.mergeIn(ME, true);
    r.engine.markPulled();
    r.setLocal(withEvidence('x'));
    r.state.owns = false;
    expect(await r.engine.push(ME)).toBe('stopped');
    r.state.owns = true;
    r.state.frozen = true;
    expect(await r.engine.push(ME)).toBe('stopped');
    expect(r.writes).toHaveLength(0);
  });

  it('freezes, and adopts nothing, when a newer app version wrote the row (#382)', async () => {
    const r = rig({ cloud: { ...withEvidence('new'), sourceV: BLOB_VERSION + 1 } });
    const before = r.getLocal();
    expect(await r.engine.mergeIn(ME, true)).toBeNull();
    expect(r.ports.freezeNewerVersion).toHaveBeenCalledOnce();
    expect(r.getLocal()).toBe(before);
  });

  it('a pull that lands after the account changed adopts nothing', async () => {
    const r = rig({ cloud: withEvidence('theirs') });
    r.ports.readRow = vi.fn(async () => {
      r.state.owns = false; // signed out while the read was out
      return { blob: withEvidence('theirs'), stamp: { row: true, at: 't1' } };
    });
    expect(await r.engine.mergeIn(ME, true)).toBeNull();
    expect(r.getLocal().evidence).toBe('');
  });

  it('reset: after a sign-out the next push waits for a new pull', async () => {
    const r = rig();
    await r.engine.mergeIn(ME, true);
    r.engine.markPulled();
    r.engine.reset();
    expect(r.engine.pulled).toBe(false);
    r.setLocal(withEvidence('x'));
    expect(await r.engine.push(ME)).toBe('stopped');
  });
});
