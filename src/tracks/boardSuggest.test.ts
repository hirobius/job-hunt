import { describe, expect, it, vi } from 'vitest';
import {
  confirmedHits,
  MAX_NAMES_PER_RUN,
  namesToProbe,
  probeNames,
  probeOne,
  slugsFor,
} from './boardSuggest';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const now = new Date('2026-11-11T14:23:00Z');

describe('slugsFor', () => {
  it('gives at most two DNS-safe slugs, legal suffixes dropped', () => {
    expect(slugsFor('Acme Corp, Inc.')).toEqual(['acme']);
    expect(slugsFor('Big Blue Labs')).toEqual(['bigbluelabs', 'big-blue-labs']);
    expect(slugsFor('AT&T')).toEqual(['atandt', 'at-and-t']);
  });

  it('never turns a URL or an address into a slug', () => {
    for (const n of ['https://evil.com', 'acme.io', 'a@b', 'x:8080', '169.254.169.254/x', ''])
      expect(slugsFor(n), n).toEqual([]);
  });
});

describe('namesToProbe', () => {
  const rows = [
    { user_id: 'u1', company: 'Acme', source: 'hn' },
    { user_id: 'u2', company: 'acme ', source: 'theirstack' },
    { user_id: 'u1', company: 'Figma', source: 'hn' },
    { user_id: 'u1', company: 'Old Co', source: 'hn' },
    { user_id: 'u1', company: 'Boardco', source: 'greenhouse' },
  ];
  it('takes feed names only, skips followed and recently checked ones, most-seen first', () => {
    const out = namesToProbe(
      rows,
      new Map([['u1', new Set(['figma'])]]),
      new Map([['old co', '2026-11-01T00:00:00Z']]),
      now,
    );
    expect(out).toEqual([{ name: 'Acme', key: 'acme', users: ['u1', 'u2'], websites: [] }]);
  });

  it('skips a name per user: one who follows or ignored it does not count, another still does', () => {
    const out = namesToProbe(
      [
        { user_id: 'u1', company: 'Acme', source: 'hn' },
        { user_id: 'u2', company: 'Acme', source: 'hn' },
        { user_id: 'u1', company: 'Muted Co', source: 'hn' },
      ],
      new Map([['u1', new Set(['acme', 'muted co'])]]),
      new Map(),
      now,
    );
    expect(out.map((n) => [n.key, n.users])).toEqual([['acme', ['u2']]]);
  });

  it('keeps a posting link as evidence only when its domain is the company name', () => {
    const out = namesToProbe(
      [
        { user_id: 'u1', company: 'Figmatic', source: 'hn', url: 'https://figmatic.com/jobs/1' },
        { user_id: 'u1', company: 'Figmatic', source: 'hn', url: 'https://news.ycombinator.com/x' },
      ],
      new Map(),
      new Map(),
      now,
    );
    expect(out[0].websites).toEqual(['figmatic.com']);
  });

  it('asks a name again after RECHECK_DAYS, and caps the run', () => {
    const out = namesToProbe(rows, new Map(), new Map([['old co', '2026-09-01T00:00:00Z']]), now);
    expect(out.map((n) => n.key)).toContain('old co');
    const many = Array.from({ length: 40 }, (_, i) => ({
      user_id: 'u',
      company: `Company ${i}`,
      source: 'hn',
    }));
    expect(namesToProbe(many, new Map(), new Map(), now)).toHaveLength(MAX_NAMES_PER_RUN);
  });
});

describe('probeOne', () => {
  it('asks the fixed host with redirect: error; 200 with jobs is live, 404 none', async () => {
    const f = vi.fn(async () => json({ jobs: [{ id: 1 }, { id: 2 }] }));
    expect(await probeOne('greenhouse', 'acme', f)).toMatchObject({ state: 'live', jobs: 2 });
    expect(f).toHaveBeenCalledWith('https://boards-api.greenhouse.io/v1/boards/acme/jobs', {
      redirect: 'error',
    });
    expect(await probeOne('lever', 'acme', async () => json({}, 404))).toEqual({ state: 'none' });
    expect(await probeOne('ashby', 'acme', async () => json({ jobs: [] }))).toEqual({
      state: 'none',
    });
  });

  it('is unknown on a redirect, an error, a 429, a huge body or a bad slug', async () => {
    const moved = json([]);
    Object.defineProperty(moved, 'url', { value: 'https://evil.com/' });
    expect((await probeOne('lever', 'acme', async () => moved)).state).toBe('unknown');
    expect((await probeOne('lever', 'acme', async () => json({}, 429))).state).toBe('unknown');
    expect(
      (await probeOne('lever', 'acme', async () => Promise.reject(new TypeError('x')))).state,
    ).toBe('unknown');
    const big = new Response('[]', { headers: { 'content-length': String(10 * 1024 * 1024) } });
    expect((await probeOne('lever', 'acme', async () => big)).state).toBe('unknown');
    // No header, or a false one: the stream itself is counted in bytes (boardFetch readCapped).
    const lying = new Response(JSON.stringify([{ id: 'x', text: 'é'.repeat(40) }]), {
      headers: { 'content-length': '2' },
    });
    expect((await probeOne('lever', 'acme', async () => lying, 50)).state).toBe('unknown');
    const f = vi.fn();
    expect((await probeOne('lever', '../x', f)).state).toBe('unknown');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('probeNames', () => {
  it('suggests live boards, caches answered names, waits between reads on a host', async () => {
    const sleep = vi.fn(async () => {});
    const f = async (url: string) =>
      url.includes('greenhouse.io/v1/boards/acme/')
        ? json({ jobs: [{ id: 1 }] })
        : url.endsWith('greenhouse.io/v1/boards/acme')
          ? json({ name: 'Acme' })
          : json({}, 404);
    const run = await probeNames(
      [
        { name: 'Acme', key: 'acme', users: ['u1'] },
        { name: 'Nobody', key: 'nobody', users: ['u2'] },
      ],
      { fetch: f, sleep },
    );
    expect(run.suggestions).toEqual([
      {
        key: 'acme',
        company: 'Acme',
        board: { kind: 'greenhouse', slug: 'acme' },
        jobs: 1,
        users: ['u1'],
      },
    ]);
    expect(run.checked).toEqual([
      { key: 'acme', found: true },
      { key: 'nobody', found: false },
    ]);
    // 6 list reads, plus Greenhouse's board name for the live one.
    expect(run.reads).toBe(7);
    // 2 reads per host (3 on Greenhouse): one wait before each after the first.
    expect(sleep).toHaveBeenCalledTimes(4);
  });

  it('does not cache a name whose reads were not all answered, and stops at the deadline', async () => {
    const run = await probeNames([{ name: 'Acme', key: 'acme', users: ['u1'] }], {
      fetch: async () => json({}, 503),
      sleep: async () => {},
    });
    expect(run.checked).toEqual([]);
    const late = await probeNames([{ name: 'Acme', key: 'acme', users: ['u1'] }], {
      fetch: async () => json({}, 404),
      sleep: async () => {},
      now: () => 2,
      deadline: 1,
    });
    expect(late.reads).toBe(0);
  });
});

describe("identity: a board found from a name must show it is that company's", () => {
  const lever = (jobs: unknown[]) => (url: string) =>
    url.startsWith('https://api.lever.co/v0/postings/') ? json(jobs) : json({}, 404);
  const one = (name: string, extra: { websites?: string[] } = {}) => [
    { name, key: name.toLowerCase(), users: ['u1'], ...extra },
  ];
  const opts = (fetch: (url: string) => Promise<Response> | Response) => ({
    fetch: async (url: string) => fetch(url),
    sleep: async () => {},
  });

  it('never suggests a common or short name whose board says nothing ("Close", "Toast")', async () => {
    for (const name of ['Close', 'Toast', 'Forward', 'Promise']) {
      const run = await probeNames(one(name), opts(lever([{ id: '1', text: 'Designer' }])));
      expect(run.suggestions, name).toEqual([]);
      expect(run.checked, name).toEqual([{ key: name.toLowerCase(), found: false }]);
    }
  });

  it('suggests a distinct name whose one live board says nothing either way', async () => {
    const run = await probeNames(one('Figmatic'), opts(lever([{ id: '1', text: 'Designer' }])));
    expect(run.suggestions.map((s) => s.board)).toEqual([{ kind: 'lever', slug: 'figmatic' }]);
  });

  it('suggests nothing when a distinct name is live on two kinds and neither says whose', async () => {
    const both = (url: string) =>
      url.includes('lever.co') || url.includes('ashbyhq.com')
        ? json(url.includes('ashby') ? { jobs: [{ id: 'a' }] } : [{ id: 'l' }])
        : json({}, 404);
    const run = await probeNames(one('Figmatic'), opts(both));
    expect(run.suggestions).toEqual([]);
  });

  it('confirms by the posting link domain on the board, even for a common name', async () => {
    const jobs = [{ id: '1', applyUrl: 'https://close.com/careers/1', text: 'Designer' }];
    const run = await probeNames(one('Close', { websites: ['close.com'] }), opts(lever(jobs)));
    expect(run.suggestions.map((s) => s.board)).toEqual([{ kind: 'lever', slug: 'close' }]);
  });

  it("confirms a Greenhouse board by the name it states, and refuses another company's", async () => {
    const gh = (stated: string) => (url: string) =>
      url.endsWith('/v1/boards/toast/jobs')
        ? json({ jobs: [{ id: 1, absolute_url: 'https://boards.greenhouse.io/toast/jobs/1' }] })
        : url.endsWith('/v1/boards/toast')
          ? json({ name: stated })
          : json({}, 404);
    const mine = await probeNames(one('Toast'), opts(gh('Toast, Inc.')));
    expect(mine.suggestions.map((s) => s.board)).toEqual([{ kind: 'greenhouse', slug: 'toast' }]);
    const theirs = await probeNames(one('Toast'), opts(gh('Toast Bakery Supplies')));
    expect(theirs.suggestions).toEqual([]);
  });

  it('refuses a lone distinct board while another read is unknown (it may not be the only one)', () => {
    const hit = { verdict: { identity: 'unknown' as const } };
    expect(confirmedHits('Figmatic', [hit], true)).toEqual([hit]);
    expect(confirmedHits('Figmatic', [hit], false)).toEqual([]);
  });

  it('caches a name only when every read answered, boards found or not', async () => {
    const f = (url: string) =>
      url.includes('lever.co')
        ? json([{ id: '1' }])
        : url.includes('ashby')
          ? json({}, 503)
          : json({}, 404);
    const run = await probeNames(one('Figmatic'), opts(f));
    expect(run.checked).toEqual([]);
    expect(run.suggestions).toEqual([]);
  });
});
