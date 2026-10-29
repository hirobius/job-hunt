import { describe, expect, it } from 'vitest';
import { parseBoardSet } from '../boardSet';
import { createLimiter } from '../probe';
import { FetchError } from '../sources/http';
import { buildBoardSet, toSetBoard, validateCandidates, type CachedProbe } from './discover';
import type { Candidate } from './harvest';

const now = () => new Date('2026-10-29T12:00:00Z');
const cand = (
  slug: string,
  company = '',
  kind: Candidate['board']['kind'] = 'lever',
): Candidate => ({
  board: { kind, slug },
  company,
  sources: ['hn'],
});
const limiter = () => createLimiter({ gapMs: 0 });

describe('validateCandidates', () => {
  it('keeps live boards, drops 404s, counts unknowns per host, retries unknowns once', async () => {
    const asked: string[] = [];
    let flaky = 0;
    const fetchJson = async (url: string) => {
      asked.push(url);
      if (url.includes('/live')) return [{ text: 'Designer', categories: {} }];
      if (url.includes('/empty')) return [];
      if (url.includes('/flaky') && flaky++ === 0) throw new FetchError(503, url);
      if (url.includes('/flaky')) return [{ text: 'x' }];
      if (url.includes('/down')) throw new FetchError(500, url);
      throw new FetchError(404, url);
    };
    const v = await validateCandidates(
      [cand('live', 'Live Co'), cand('empty'), cand('gone'), cand('flaky'), cand('down')],
      { fetchJson, limiter: limiter(), now },
    );
    expect(v.boards.map((b) => b.slug)).toEqual(['live', 'empty', 'flaky']);
    expect(v.counts).toMatchObject({
      candidates: 5,
      live: 3,
      none: 1,
      unknown: 1,
      hiring: 2,
      lever: 3,
    });
    expect(v.unknownByHost).toEqual({ 'lever.co': 1 });
    expect(asked.filter((u) => u.includes('/down'))).toHaveLength(2);
    expect(asked.filter((u) => u.includes('/gone'))).toHaveLength(1);
  });

  it('uses a fresh cached answer and asks a stale one again', async () => {
    const cache = new Map<string, CachedProbe>([
      ['lever:a', { r: 'live', at: '2026-10-28', n: 2 }],
      ['lever:b', { r: 'none', at: '2026-10-28' }],
      ['lever:c', { r: 'none', at: '2026-09-01' }],
    ]);
    const asked: string[] = [];
    const v = await validateCandidates([cand('a'), cand('b'), cand('c')], {
      fetchJson: async (u) => {
        asked.push(u);
        return [{ text: 'x' }];
      },
      limiter: limiter(),
      now,
      cache,
    });
    expect(asked).toEqual(['https://api.lever.co/v0/postings/c?mode=json']);
    expect(v.boards.map((b) => [b.slug, b.lastChecked])).toEqual([
      ['a', '2026-10-28'],
      ['c', '2026-10-29'],
    ]);
    expect(cache.get('lever:c')).toMatchObject({ r: 'live', at: '2026-10-29' });
  });
  it('cached only: asks nothing, an uncached board is unknown', async () => {
    const v = await validateCandidates([cand('a'), cand('b')], {
      fetchJson: async () => {
        throw new Error('asked');
      },
      limiter: limiter(),
      now,
      cache: new Map([['lever:a', { r: 'live', at: '2026-10-29', n: 1 }]]),
      cachedOnly: true,
    });
    expect(v.boards.map((b) => b.slug)).toEqual(['a']);
    expect(v.counts.unknown).toBe(1);
  });
});

describe('toSetBoard', () => {
  const live = (name?: string, domains: string[] = []) => ({
    result: 'live' as const,
    jobs: 3,
    evidence: { ...(name && { name }), domains, textDomains: [] },
  });

  it('keeps a name the board agrees with', () => {
    expect(toSetBoard(cand('acme', 'Acme'), live('Acme'), '2026-10-29')).toMatchObject({
      company: 'Acme',
      evidence: 'url+identity:hn',
      jobs: 3,
    });
  });

  it("takes the board's own name when the source's is contradicted", () => {
    expect(toSetBoard(cand('acme', 'Recruiter Inc'), live('Acme Corp'), '2026-10-29').company).toBe(
      'Acme Corp',
    );
  });

  it('falls back to the stated name, then the slug, and the first domain as website', () => {
    expect(toSetBoard(cand('acme-labs'), live(undefined, ['acme.dev']), 'd')).toMatchObject({
      company: 'Acme Labs',
      website: 'acme.dev',
      evidence: 'url:hn',
    });
  });
});

describe('buildBoardSet', () => {
  it('is what boardSet reads back with nothing dropped', async () => {
    const v = await validateCandidates([cand('b'), cand('a', 'A', 'greenhouse')], {
      fetchJson: async (u) => (u.includes('greenhouse') ? { jobs: [] } : [{ text: 'x' }]),
      limiter: limiter(),
      now,
    });
    const set = buildBoardSet(v, [], now());
    const back = parseBoardSet(JSON.parse(JSON.stringify(set)));
    expect(back.boards).toEqual(set.boards);
    expect(set.counts.confirmed).toBe(2);
    expect(set.boards.map((b) => b.kind)).toEqual(['greenhouse', 'lever']);
  });
});
