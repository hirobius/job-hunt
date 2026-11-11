import { describe, expect, it, vi } from 'vitest';
import { MAX_NAMES_PER_RUN, namesToProbe, probeNames, probeOne, slugsFor } from './boardSuggest';

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
      new Set(['figma']),
      new Map([['old co', '2026-11-01T00:00:00Z']]),
      now,
    );
    expect(out).toEqual([{ name: 'Acme', key: 'acme', users: ['u1', 'u2'] }]);
  });

  it('asks a name again after RECHECK_DAYS, and caps the run', () => {
    const out = namesToProbe(rows, new Set(), new Map([['old co', '2026-09-01T00:00:00Z']]), now);
    expect(out.map((n) => n.key)).toContain('old co');
    const many = Array.from({ length: 40 }, (_, i) => ({
      user_id: 'u',
      company: `Company ${i}`,
      source: 'hn',
    }));
    expect(namesToProbe(many, new Set(), new Map(), now)).toHaveLength(MAX_NAMES_PER_RUN);
  });
});

describe('probeOne', () => {
  it('asks the fixed host with redirect: error; 200 with jobs is live, 404 none', async () => {
    const f = vi.fn(async () => json({ jobs: [{ id: 1 }, { id: 2 }] }));
    expect(await probeOne('greenhouse', 'acme', f)).toEqual({ state: 'live', jobs: 2 });
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
    const f = vi.fn();
    expect((await probeOne('lever', '../x', f)).state).toBe('unknown');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('probeNames', () => {
  it('suggests live boards, caches answered names, waits between reads on a host', async () => {
    const sleep = vi.fn(async () => {});
    const f = async (url: string) =>
      url.includes('greenhouse.io/v1/boards/acme/') ? json({ jobs: [{ id: 1 }] }) : json({}, 404);
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
    expect(run.reads).toBe(6);
    // 2 reads per host: one wait each.
    expect(sleep).toHaveBeenCalledTimes(3);
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
