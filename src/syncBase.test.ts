import { beforeEach, describe, expect, it } from 'vitest';
import { emptyBlob, mergeBlob, type SyncData } from './syncBlob';
import {
  hashEntry,
  hashesOf,
  keysOf,
  readSyncBase,
  readSyncHashes,
  writeSyncBase,
} from './syncBase';
import type { Job } from './types';

const job = (url: string): Job => ({ url, label: url, status: 'Saved' });
const u = (s: string) => `https://${s}.example/1`;
const removed = (s: string) => ({ job: job(u(s)), removedAt: new Date().toISOString() });
const answer = (id: string) => ({ id, q: id, a: '' });
const blob = (over: Partial<SyncData> = {}): SyncData => ({ ...emptyBlob(), ...over });
const urls = (d: SyncData) => d.jobs.map((j) => j.url);

describe('seed merge with a sync base (#219: deletes stay deleted)', () => {
  it('a job removed on another device does not come back from this one, and stays in Recently removed', () => {
    const base = keysOf(blob({ jobs: [job(u('a')), job(u('b'))] }));
    const cloud = blob({ sourceV: 10, jobs: [job(u('b'))], trash: [removed('a')] });
    const local = blob({ jobs: [job(u('a')), job(u('b'))] });
    const out = mergeBlob(cloud, local, true, base);
    expect(urls(out)).toEqual([u('b')]);
    expect(out.trash.map((r) => r.job.url)).toEqual([u('a')]);
  });

  it('a job removed here before the push landed does not come back from the cloud', () => {
    const base = keysOf(blob({ jobs: [job(u('a')), job(u('b'))] }));
    const cloud = blob({ sourceV: 10, jobs: [job(u('a')), job(u('b'))] });
    const local = blob({ jobs: [job(u('b'))], trash: [removed('a')] });
    const out = mergeBlob(cloud, local, true, base);
    expect(urls(out)).toEqual([u('b')]);
    expect(out.trash.map((r) => r.job.url)).toEqual([u('a')]);
  });

  it('a job restored on another device leaves Recently removed here too', () => {
    const base = keysOf(blob({ trash: [removed('a')] }));
    const cloud = blob({ sourceV: 10, jobs: [job(u('a'))] });
    const local = blob({ trash: [removed('a')] });
    const out = mergeBlob(cloud, local, true, base);
    expect(urls(out)).toEqual([u('a')]);
    expect(out.trash).toEqual([]);
  });

  it('new entries on either side are kept', () => {
    const base = keysOf(blob({ jobs: [job(u('a'))] }));
    const cloud = blob({ sourceV: 10, jobs: [job(u('a')), job(u('c'))] });
    const local = blob({ jobs: [job(u('a')), job(u('l'))] });
    expect(urls(mergeBlob(cloud, local, true, base)).sort()).toEqual(
      [u('a'), u('c'), u('l')].sort(),
    );
  });

  it('without a base (first sign-in on this device) it is the plain union', () => {
    const cloud = blob({ sourceV: 10, jobs: [job(u('b'))] });
    const local = blob({ jobs: [job(u('a'))] });
    expect(urls(mergeBlob(cloud, local, true, null)).sort()).toEqual([u('a'), u('b')].sort());
  });

  it('covers the Application kit answers', () => {
    const base = keysOf(blob({ kit: { fields: {}, answers: [answer('q1'), answer('q2')] } }));
    const cloud = blob({ sourceV: 10, kit: { fields: {}, answers: [answer('q2')] } });
    const local = blob({ kit: { fields: {}, answers: [answer('q1'), answer('q2')] } });
    expect(mergeBlob(cloud, local, true, base).kit.answers.map((a) => a.id)).toEqual(['q2']);
  });

  it('covers snippets, set-aside, targets, saved searches, dream companies and Documents', () => {
    const target = (login: string) => ({
      login,
      company: login,
      repoUrl: '',
      stars: 0,
      savedAt: '2026-10-01T00:00:00.000Z',
    });
    const search = (name: string) => ({
      name,
      term: 't',
      where: '',
      mode: 'any' as const,
      exclude: [],
      seniority: 'any' as const,
      salaryOnly: false,
      contractOnly: false,
    });
    const dream = (key: string) => ({ key, company: key, seen: [], starredAt: '2026-10-01' });
    const doc = (id: string) => ({
      id,
      kind: 'note' as const,
      title: id,
      createdAt: '2026-10-01T00:00:00.000Z',
      versions: [{ id: `${id}-v1`, text: id, savedAt: '2026-10-01T00:00:00.000Z' }],
    });
    const snippet = (id: string) => ({ id, label: id, body: '' });
    const both = (keep: string, gone: string): Partial<SyncData> => ({
      copydeck: [snippet(keep), snippet(gone)],
      triage: { dismissed: [keep, gone] },
      targets: { trk: [target(keep), target(gone)] },
      filters: { trk: [search(keep), search(gone)] },
      dreams: { trk: [dream(keep), dream(gone)] },
      documents: [doc(keep), doc(gone)],
    });
    const base = keysOf(blob(both('keep', 'gone')));
    const local = blob(both('keep', 'gone'));
    const cloud = blob({
      sourceV: 10,
      copydeck: [snippet('keep')],
      triage: { dismissed: ['keep'] },
      targets: { trk: [target('keep')] },
      filters: { trk: [search('keep')] },
      dreams: { trk: [dream('keep')] },
      documents: [doc('keep')],
    });
    const out = mergeBlob(cloud, local, true, base);
    expect(out.copydeck.map((s) => s.id)).toEqual(['keep']);
    expect(out.triage.dismissed).toEqual(['keep']);
    expect(out.targets.trk.map((t) => t.login)).toEqual(['keep']);
    expect(out.filters.trk.map((f) => f.name)).toEqual(['keep']);
    expect(out.dreams.trk.map((d) => d.key)).toEqual(['keep']);
    expect(out.documents.map((d) => d.id)).toEqual(['keep']);
  });

  it('a cloud copy older than a field (an old-deploy tab pushed it) never counts as deleting it', () => {
    const dreams = { trk: [{ key: 'x', company: 'x', seen: [], starredAt: '' }] };
    const documents = [
      {
        id: 'd',
        kind: 'note' as const,
        title: 'd',
        createdAt: '2026-10-01T00:00:00.000Z',
        versions: [{ id: 'd-v1', text: 'd', savedAt: '2026-10-01T00:00:00.000Z' }],
      },
    ];
    const kit = { fields: {}, answers: [answer('q1')] };
    const local = blob({ jobs: [job(u('a'))], dreams, documents, kit, trash: [removed('r')] });
    const base = keysOf(local);
    const v5 = blob({ sourceV: 5, jobs: [job(u('a'))] }); // no kit, trash, dreams or documents
    const out = mergeBlob(v5, local, true, base);
    expect(out.dreams).toEqual(dreams);
    expect(out.documents.map((d) => d.id)).toEqual(['d']);
    expect(out.kit.answers.map((a) => a.id)).toEqual(['q1']);
    expect(out.trash.map((r) => r.job.url)).toEqual([u('r')]);
    // …while a field the old copy does carry still loses what it dropped.
    expect(urls(mergeBlob(blob({ sourceV: 9 }), local, true, base))).toEqual([]);
    // A deletion made here still holds against an old copy.
    const deletedHere = blob({ jobs: [job(u('a'))], dreams: {} });
    expect(mergeBlob(blob({ sourceV: 8, dreams }), deletedHere, true, base).dreams).toEqual({});
  });

  it('a track left with nothing drops out of the per-track maps', () => {
    const base = keysOf(
      blob({ dreams: { trk: [{ key: 'x', company: 'x', seen: [], starredAt: '' }] } }),
    );
    const local = blob({ dreams: { trk: [{ key: 'x', company: 'x', seen: [], starredAt: '' }] } });
    expect(mergeBlob(blob({ sourceV: 10 }), local, true, base).dreams).toEqual({});
  });
});

describe('the stored sync base', () => {
  beforeEach(() => localStorage.clear());

  it('is per account: another account on this browser starts with none', () => {
    const keys = keysOf(blob({ jobs: [job(u('a'))] }));
    writeSyncBase('u1', keys);
    expect(readSyncBase('u1')).toEqual(keys);
    expect(readSyncBase('u2')).toBeNull();
  });

  it('reads as none when missing or malformed', () => {
    expect(readSyncBase('u1')).toBeNull();
    localStorage.setItem('rjb_sync_base', '{bad');
    expect(readSyncBase('u1')).toBeNull();
  });
});

describe('seed merge with entry hashes (audit 2026-10-23: an unpushed edit is not reverted)', () => {
  const synced = blob({
    sourceV: 10,
    jobs: [job(u('a')), job(u('b'))],
    evidence: 'old evidence',
    modes: { t1: 'remote' },
    kit: { fields: { name: 'Sam', phone: '555' }, answers: [answer('q1')] },
  });
  const merge = (cloud: SyncData, local: SyncData) =>
    mergeBlob(cloud, local, true, keysOf(synced), hashesOf(synced));
  const notes = (d: SyncData, s: string) => d.jobs.find((j) => j.url === u(s))?.notes;

  it("this device's edit wins over a cloud copy that did not change the entry", () => {
    const local = { ...synced, jobs: [{ ...job(u('a')), notes: 'mine' }, job(u('b'))] };
    expect(notes(merge(synced, local), 'a')).toBe('mine');
  });

  it("the cloud's edit wins over an entry this device left alone", () => {
    const cloud = { ...synced, jobs: [job(u('a')), { ...job(u('b')), notes: 'theirs' }] };
    const local = { ...synced, jobs: [{ ...job(u('a')), notes: 'mine' }, job(u('b'))] };
    const out = merge(cloud, local);
    expect(notes(out, 'a')).toBe('mine');
    expect(notes(out, 'b')).toBe('theirs');
  });

  it("both changed the same entry: the store's own rule stands (cloud first)", () => {
    const cloud = { ...synced, jobs: [{ ...job(u('a')), notes: 'theirs' }, job(u('b'))] };
    const local = { ...synced, jobs: [{ ...job(u('a')), notes: 'mine' }, job(u('b'))] };
    expect(notes(merge(cloud, local), 'a')).toBe('theirs');
  });

  it('kit fields, evidence and work modes keep the side that changed them, a cleared one too', () => {
    const local = {
      ...synced,
      evidence: 'new evidence',
      kit: { ...synced.kit, fields: { name: 'Sam Lee' } }, // phone cleared here
    };
    const cloud = { ...synced, modes: { t1: 'onsite' as const } };
    const out = merge(cloud, local);
    expect(out.kit.fields).toEqual({ name: 'Sam Lee' });
    expect(out.evidence).toBe('new evidence'); // not both texts joined
    expect(out.modes).toEqual({ t1: 'onsite' });
  });

  it('deletes still win: an entry removed on either side stays removed', () => {
    const cloud = { ...synced, jobs: [job(u('a'))] };
    const local = { ...synced, jobs: [{ ...job(u('a')), notes: 'mine' }, job(u('b'))] };
    expect(urls(merge(cloud, local))).toEqual([u('a')]);
    const goneHere = { ...synced, jobs: [job(u('b'))] };
    const editedThere = { ...synced, jobs: [{ ...job(u('a')), notes: 'x' }, job(u('b'))] };
    expect(urls(merge(editedThere, goneHere))).toEqual([u('b')]);
  });

  it('a base without hashes (written before them) merges as before', () => {
    const local = { ...synced, jobs: [{ ...job(u('a')), notes: 'mine' }, job(u('b'))] };
    expect(notes(mergeBlob(synced, local, true, keysOf(synced), null), 'a')).toBeUndefined();
  });

  it('hashes ignore key order and keep across a write and read', () => {
    expect(hashEntry({ a: 1, b: 2 })).toBe(hashEntry({ b: 2, a: 1 }));
    expect(hashEntry({ a: 1 })).not.toBe(hashEntry({ a: 2 }));
    expect(hashEntry('')).toBe('');
    writeSyncBase('u1', keysOf(synced), hashesOf(synced));
    expect(readSyncHashes('u1')).toEqual(hashesOf(synced));
    expect(readSyncHashes('u2')).toBeNull();
    writeSyncBase('u1', keysOf(synced));
    expect(readSyncHashes('u1')).toBeNull();
  });
});
