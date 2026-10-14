import { describe, expect, it } from 'vitest';
import { parseHash, buildHash } from './route';
import { jobIdOf } from './store';

describe('route — parseHash', () => {
  it('reads an empty hash as no route', () => {
    expect(parseHash('')).toEqual({ tab: '', sub: null, pillar: null, jobId: null });
    expect(parseHash('#')).toEqual({ tab: '', sub: null, pillar: null, jobId: null });
    expect(parseHash('#/')).toEqual({ tab: '', sub: null, pillar: null, jobId: null });
  });

  it('reads a top-level tab', () => {
    expect(parseHash('#/queue')).toEqual({ tab: 'queue', sub: null, pillar: null, jobId: null });
  });

  it('reads a nested sub-tab', () => {
    expect(parseHash('#/discover/titles')).toEqual({
      tab: 'discover',
      sub: 'titles',
      pillar: null,
      jobId: null,
    });
  });

  it('reads the pillar query param', () => {
    expect(parseHash('#/discover/ats?pillar=abc123')).toEqual({
      tab: 'discover',
      sub: 'ats',
      pillar: 'abc123',
      jobId: null,
    });
  });

  it('tolerates a missing leading slash', () => {
    expect(parseHash('#queue')).toEqual({ tab: 'queue', sub: null, pillar: null, jobId: null });
  });
});

describe('route — buildHash', () => {
  it('serializes tab only', () => {
    expect(buildHash({ tab: 'queue', sub: null, pillar: null, jobId: null })).toBe('#/queue');
  });

  it('serializes tab + sub', () => {
    expect(buildHash({ tab: 'discover', sub: 'titles', pillar: null, jobId: null })).toBe(
      '#/discover/titles',
    );
  });

  it('serializes the pillar param', () => {
    expect(buildHash({ tab: 'discover', sub: 'ats', pillar: 'abc', jobId: null })).toBe(
      '#/discover/ats?pillar=abc',
    );
  });

  it('round-trips through parse', () => {
    const r = { tab: 'discover', sub: 'titles', pillar: 'p1', jobId: null };
    expect(parseHash(buildHash(r))).toEqual(r);
  });
});

// #127: a job has its own route, #/queue/<jobId>. The id is derived from the job's URL (Job has no
// id field), so it must be URL-safe and must not collide with Discover's sub-tab slot.
describe('route — job ids (#127)', () => {
  it('reads #/queue/<jobId> as a job, not a sub-tab', () => {
    expect(parseHash('#/queue/k3x9a1')).toEqual({
      tab: 'queue',
      sub: null,
      pillar: null,
      jobId: 'k3x9a1',
    });
  });

  it('keeps Discover sub-tabs as sub-tabs', () => {
    expect(parseHash('#/discover/titles').jobId).toBeNull();
  });

  it('round-trips a job route built from a URL with a query string', () => {
    const id = jobIdOf('https://boards.greenhouse.io/acme/jobs/42?gh_jid=42&utm_source=x');
    const hash = buildHash({ tab: 'queue', sub: null, pillar: null, jobId: id });
    expect(hash).toBe(`#/queue/${id}`);
    expect(parseHash(hash).jobId).toBe(id);
  });
});

describe('route — navigate drops a stale job id (#127)', () => {
  it('a tab change without a job id clears it', async () => {
    const { navigate, getRoute } = await import('./route');
    window.location.hash = '#/queue/abc123';
    navigate({ tab: 'discover' });
    expect(getRoute()).toMatchObject({ tab: 'discover', jobId: null });
  });
});
