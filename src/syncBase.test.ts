import { beforeEach, describe, expect, it } from 'vitest';
import { emptyBlob, mergeBlob, type SyncData } from './syncBlob';
import { keysOf, readSyncBase, writeSyncBase } from './syncBase';
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
