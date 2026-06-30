import { describe, expect, it } from 'vitest';
import { readBlob, mergeBlob, emptyBlob, type SyncData } from './syncBlob';
import type { Job } from './types';

const job = (url: string, label = url): Job => ({ url, label, status: 'Saved' });

const blob = (over: Partial<SyncData> = {}): SyncData => ({ ...emptyBlob(), ...over });

describe('readBlob', () => {
  it('treats a bare array as the legacy jobs-only blob', () => {
    const r = readBlob([job('a')]);
    expect(r.jobs).toHaveLength(1);
    expect(r.pillars).toEqual([]);
    expect(r.triage).toEqual({ pinned: [], dismissed: [] });
  });

  it('defaults missing / non-array fields to empty', () => {
    const r = readBlob({ jobs: 'nope', triage: { pinned: ['x'] } });
    expect(r.jobs).toEqual([]);
    expect(r.triage).toEqual({ pinned: ['x'], dismissed: [] });
    expect(r.userTiles).toEqual([]);
  });
});

describe('mergeBlob — seed (first sign-in)', () => {
  it('merges each field; cloud wins on shared keys, local order kept', () => {
    const local = blob({ jobs: [job('a', 'local-a'), job('b')] });
    const cloud = blob({ jobs: [job('a', 'cloud-a'), job('c')] });
    const out = mergeBlob(cloud, local, true);
    expect(out.jobs.map((j) => j.url)).toEqual(['a', 'b', 'c']);
    expect(out.jobs.find((j) => j.url === 'a')!.label).toBe('cloud-a'); // cloud wins
  });

  it("applies triage's set-aside-wins rule through the blob", () => {
    const local = blob({ triage: { pinned: ['x'], dismissed: [] } });
    const cloud = blob({ triage: { pinned: [], dismissed: ['x'] } });
    const out = mergeBlob(cloud, local, true);
    expect(out.triage.dismissed).toContain('x');
    expect(out.triage.pinned).not.toContain('x');
  });

  it('handles a null cloud (nothing in the cloud yet)', () => {
    const local = blob({ jobs: [job('a')] });
    expect(mergeBlob(null, local, true).jobs.map((j) => j.url)).toEqual(['a']);
  });
});

describe('mergeBlob — refresh (focus re-pull)', () => {
  it('takes cloud as the source of truth when present', () => {
    const local = blob({ jobs: [job('a')] });
    const cloud = blob({ jobs: [job('z')] });
    expect(mergeBlob(cloud, local, false).jobs.map((j) => j.url)).toEqual(['z']);
  });

  it('keeps local when the cloud is empty', () => {
    const local = blob({ jobs: [job('a')] });
    expect(mergeBlob(null, local, false)).toBe(local);
  });
});
