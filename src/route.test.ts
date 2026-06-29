import { describe, expect, it } from 'vitest';
import { parseHash, buildHash } from './route';

describe('route — parseHash', () => {
  it('reads an empty hash as no route', () => {
    expect(parseHash('')).toEqual({ tab: '', sub: null, pillar: null });
    expect(parseHash('#')).toEqual({ tab: '', sub: null, pillar: null });
    expect(parseHash('#/')).toEqual({ tab: '', sub: null, pillar: null });
  });

  it('reads a top-level tab', () => {
    expect(parseHash('#/queue')).toEqual({ tab: 'queue', sub: null, pillar: null });
  });

  it('reads a nested sub-tab', () => {
    expect(parseHash('#/discover/titles')).toEqual({
      tab: 'discover',
      sub: 'titles',
      pillar: null,
    });
  });

  it('reads the pillar query param', () => {
    expect(parseHash('#/discover/ats?pillar=abc123')).toEqual({
      tab: 'discover',
      sub: 'ats',
      pillar: 'abc123',
    });
  });

  it('tolerates a missing leading slash', () => {
    expect(parseHash('#queue')).toEqual({ tab: 'queue', sub: null, pillar: null });
  });
});

describe('route — buildHash', () => {
  it('serializes tab only', () => {
    expect(buildHash({ tab: 'queue', sub: null, pillar: null })).toBe('#/queue');
  });

  it('serializes tab + sub', () => {
    expect(buildHash({ tab: 'discover', sub: 'titles', pillar: null })).toBe('#/discover/titles');
  });

  it('serializes the pillar param', () => {
    expect(buildHash({ tab: 'discover', sub: 'ats', pillar: 'abc' })).toBe('#/discover/ats?pillar=abc');
  });

  it('round-trips through parse', () => {
    const r = { tab: 'discover', sub: 'titles', pillar: 'p1' };
    expect(parseHash(buildHash(r))).toEqual(r);
  });
});
