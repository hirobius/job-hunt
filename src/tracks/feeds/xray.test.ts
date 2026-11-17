import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BOARD_KINDS, setBoardKey, type SetBoard } from '../../feed/boardSet';
import type { FeedContext } from './context';
import {
  boardsFromHits,
  braveUrl,
  companyFromHit,
  googleUrl,
  parseBrave,
  parseGoogle,
  runXray,
  slotsForRun,
  withFoundBoards,
  XRAY_CALLS_PER_RUN,
  XRAY_PAGES,
  XRAY_SITES,
  xraySlots,
} from './xray';

const fixture = (f: string) =>
  JSON.parse(readFileSync(`src/tracks/feeds/fixtures/${f}`, 'utf8')) as unknown;
const BRAVE = fixture('brave-xray.json');
const GOOGLE = fixture('google-cse-xray.json');

const ctx = (env: Record<string, string>, o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(
    async (url: string) =>
      new Response(JSON.stringify(url.includes('googleapis') ? GOOGLE : BRAVE)),
  ),
  env: (n) => env[n],
  now: () => new Date('2026-11-17T06:23:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('x-ray queries', () => {
  it('searches every board kind the sync reads, and no forbidden ATS host', () => {
    expect(XRAY_SITES.map((s) => s.kind).sort()).toEqual([...BOARD_KINDS].sort());
    const all = XRAY_SITES.map((s) => s.site).join(' ');
    for (const banned of ['workday', 'successfactors', 'taleo', 'oraclecloud', 'google.com'])
      expect(all).not.toContain(banned);
  });

  it('rotates a window of slots by day and covers every slot within a few days', () => {
    expect(xraySlots()).toHaveLength(XRAY_SITES.length * XRAY_PAGES);
    const seen = new Set<string>();
    const days = Math.ceil(xraySlots().length / XRAY_CALLS_PER_RUN);
    for (let d = 0; d < days; d++) {
      const run = slotsForRun(new Date(Date.UTC(2026, 10, 17 + d)));
      expect(run).toHaveLength(XRAY_CALLS_PER_RUN);
      for (const s of run) seen.add(`${s.query}#${s.page}`);
    }
    expect(seen.size).toBe(xraySlots().length);
  });

  it('builds each provider URL with paging and a month window', () => {
    const s = { kind: 'lever' as const, query: 'site:jobs.lever.co "design system"', page: 2 };
    const b = new URL(braveUrl(s));
    expect(b.host).toBe('api.search.brave.com');
    expect(Object.fromEntries(b.searchParams)).toEqual({
      q: s.query,
      count: '20',
      offset: '2',
      freshness: 'pm',
    });
    const g = new URL(googleUrl('k', 'cx1', s));
    expect(g.host).toBe('www.googleapis.com');
    expect(g.searchParams.get('start')).toBe('21');
    expect(g.searchParams.get('dateRestrict')).toBe('m1');
  });
});

describe('x-ray answers', () => {
  it('reads result links from both providers and drops rows with no link', () => {
    expect(parseBrave(BRAVE)).toHaveLength(6);
    expect(parseGoogle(GOOGLE).map((h) => h.url)[0]).toBe(
      'https://apply.workable.com/epsilon-co/j/AB12CD34EF/',
    );
    expect(parseBrave(null)).toEqual([]);
    expect(parseGoogle({ items: 'x' })).toEqual([]);
  });

  it('keeps only readable company boards, once each, never a Workday tenant', () => {
    const boards = boardsFromHits(parseBrave(BRAVE), '2026-11-17');
    expect(boards.map(setBoardKey)).toEqual([
      'greenhouse:acmerobotics',
      'lever:betalabs',
      'ashby:gamma-ai',
    ]);
    expect(boards[0]).toEqual({
      kind: 'greenhouse',
      slug: 'acmerobotics',
      company: 'Acme Robotics',
      lastChecked: '2026-11-17',
      evidence: 'x-ray search: https://job-boards.greenhouse.io/acmerobotics/jobs/4012345007',
    });
  });

  it('guesses the company from the result title, else the slug', () => {
    expect(companyFromHit('Beta Labs - Design Technologist', 'betalabs')).toBe('Beta Labs');
    expect(companyFromHit('Design System Lead - Gamma', 'gamma-ai')).toBe('Gamma Ai');
  });
});

describe('runXray', () => {
  it('is off with no secret: no call', async () => {
    const c = ctx({});
    expect(await runXray(c)).toEqual({ boards: [], calls: 0, errors: [] });
    expect(c.fetch).not.toHaveBeenCalled();
  });

  it('runs Brave with its key in a header, never the URL', async () => {
    const c = ctx({ BRAVE_SEARCH_API_KEY: 'brv-secret' });
    const run = await runXray(c, 2);
    expect(run.calls).toBe(2);
    const [url, init] = vi.mocked(c.fetch).mock.calls[0]!;
    expect(url).not.toContain('brv-secret');
    expect((init?.headers as Record<string, string>)['x-subscription-token']).toBe('brv-secret');
    expect(run.boards.map(setBoardKey)).toContain('lever:betalabs');
  });

  it('merges both providers, one board per key', async () => {
    const run = await runXray(
      ctx({ BRAVE_SEARCH_API_KEY: 'b', GOOGLE_CSE_API_KEY: 'g', GOOGLE_CSE_ID: 'cx' }),
      1,
    );
    expect(run.calls).toBe(2);
    expect(run.boards.map(setBoardKey).sort()).toEqual([
      'ashby:gamma-ai',
      'greenhouse:acmerobotics',
      'lever:betalabs',
      'teamtailor:zeta',
      'workable:epsilon-co',
    ]);
  });

  it('names a half-set Google provider and stops a provider on 429, without the URL', async () => {
    const c = ctx(
      { BRAVE_SEARCH_API_KEY: 'brv-secret', GOOGLE_CSE_API_KEY: 'g' },
      { fetch: vi.fn(async () => new Response('', { status: 429 })) },
    );
    const run = await runXray(c, 5);
    expect(run.calls).toBe(1);
    expect(run.errors).toEqual([
      'Google Programmable Search: GOOGLE_CSE_ID is not set',
      'Brave Search: HTTP 429',
    ]);
    expect(run.errors.join(' ')).not.toContain('secret');
  });

  it('logs a network failure by provider name only and goes on', async () => {
    let n = 0;
    const c = ctx(
      { BRAVE_SEARCH_API_KEY: 'b' },
      {
        fetch: vi.fn(async () => {
          if (n++ === 0) throw new TypeError('connect failed https://api.search.brave.com/?q=x');
          return new Response(JSON.stringify(BRAVE));
        }),
      },
    );
    const run = await runXray(c, 2);
    expect(run.errors).toEqual(['Brave Search: network error']);
    expect(run.boards).toHaveLength(3);
  });
});

describe('withFoundBoards', () => {
  const b = (kind: SetBoard['kind'], slug: string, company = slug): SetBoard => ({
    kind,
    slug,
    company,
    lastChecked: '2026-11-01',
    evidence: 'x',
  });
  it('adds new boards in key order and keeps the snapshot entry on a clash', () => {
    const set = [b('ashby', 'a', 'Snapshot'), b('lever', 'z')];
    const out = withFoundBoards(set, [b('ashby', 'A', 'Found'), b('greenhouse', 'm')]);
    expect(out.map(setBoardKey)).toEqual(['ashby:a', 'greenhouse:m', 'lever:z']);
    expect(out[0]!.company).toBe('Snapshot');
    expect(withFoundBoards(set, [])).toEqual(set);
  });
});
