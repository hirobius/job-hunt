import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryKv } from './fetchFeed';
import {
  MAX_IN_FLIGHT,
  MAX_PER_HOST,
  PROBE_KEY,
  PROBE_KINDS,
  createLimiter,
  hostKey,
  parseCompanyLine,
  probeBoard,
  probeCompanies,
  slugCandidates,
  type CompanyProbe,
} from './probe';
import { boardApiUrl, type BoardKind } from './sources/ats';
import { FetchError, type FetchJson } from './sources/http';

const board = (kind: BoardKind, slug: string) => ({ kind, slug }) as const;

describe('slugCandidates', () => {
  it.each([
    ['Acme Labs', ['acme-labs', 'acmelabs', 'acme']],
    ['Acme Labs, Inc.', ['acme-labs', 'acmelabs', 'acme']],
    ['Stripe', ['stripe']],
    ['Stripe Inc', ['stripe']],
    ['Open AI LLC', ['open-ai', 'openai']],
    ['Foo HQ', ['foo-hq', 'foohq', 'foo']],
    ['', []],
    ['Inc', ['inc']],
    // #216: more variants.
    [
      'The Browser Company',
      ['the-browser-company', 'thebrowsercompany', 'browser-company', 'browsercompany'],
    ],
    ['Acme Software', ['acme-software', 'acmesoftware', 'acme']],
    ['Acme Technologies GmbH', ['acme-technologies', 'acmetechnologies', 'acme']],
    ['Acme Data Labs', ['acme-data-labs', 'acmedatalabs', 'acme-data', 'acmedata']],
    ['Société Générale', ['societe-generale', 'societegenerale']],
    ['Ben & Jerry’s', ['ben-and-jerrys', 'benandjerrys']],
    ['Personio SE AB', ['personio-se', 'personiose']],
    ['Acme Corporation', ['acme']],
    ['The', ['the']],
    ['linear.app', ['linear-app', 'linearapp']],
  ])('%s', (name, want) => {
    expect(slugCandidates(name)).toEqual(want);
  });

  it('never returns more than 4', () => {
    expect(slugCandidates('The One Two Three Four Labs').length).toBeLessThanOrEqual(4);
  });
});

describe('parseCompanyLine', () => {
  it('reads a board URL as that one board, no derivation', () => {
    expect(parseCompanyLine('https://jobs.lever.co/plaid')).toEqual({
      name: 'Plaid',
      boards: [{ kind: 'lever', slug: 'plaid' }],
      candidates: [],
    });
  });
  it('treats a single slug-like token as the slug', () => {
    expect(parseCompanyLine('Acme-Labs')).toMatchObject({
      name: 'Acme-Labs',
      candidates: ['acme-labs'],
    });
  });
  it('derives candidates from a name', () => {
    expect(parseCompanyLine('Acme Labs')).toMatchObject({
      candidates: ['acme-labs', 'acmelabs', 'acme'],
    });
  });
  it('drops blanks and junk', () => {
    expect(parseCompanyLine('   ')).toBeNull();
    expect(parseCompanyLine('!!!')).toBeNull();
  });
});

describe('hostKey', () => {
  it('groups an ATS by its registrable domain', () => {
    expect(hostKey('https://acme.recruitee.com/api/offers/')).toBe('recruitee.com');
    expect(hostKey('https://api.eu.lever.co/v0/postings/x')).toBe('lever.co');
  });
});

describe('probeBoard', () => {
  const ok =
    (body: unknown): FetchJson =>
    async () =>
      body;
  const fail =
    (status: number, timeout = false): FetchJson =>
    async (url) => {
      throw new FetchError(status, url, timeout);
    };

  it('200 with a job list is live and counts openings; zero jobs is still live', async () => {
    expect(await probeBoard(board('greenhouse', 'a'), ok({ jobs: [{}, {}] }))).toMatchObject({
      result: 'live',
      jobs: 2,
    });
    expect(await probeBoard(board('lever', 'a'), ok([]))).toMatchObject({
      result: 'live',
      jobs: 0,
    });
  });
  it('404 is none', async () => {
    expect((await probeBoard(board('ashby', 'a'), fail(404))).result).toBe('none');
  });
  // #216: SmartRecruiters answers an empty list for any name, so empty is no board there.
  it('an empty SmartRecruiters list is none; a non-empty one is live', async () => {
    const sr = board('smartrecruiters', 'Acme');
    expect((await probeBoard(sr, ok({ totalFound: 0, content: [] }))).result).toBe('none');
    expect(await probeBoard(sr, ok({ content: [{ id: '1' }] }))).toMatchObject({
      result: 'live',
      jobs: 1,
    });
    expect((await probeBoard(sr, ok({ error: 'x' }))).result).toBe('unknown');
  });
  it.each([
    ['429', fail(429)],
    ['500', fail(500)],
    ['timeout', fail(0, true)],
    ['network or CORS', fail(0)],
    ['a body that is not a job list', ok({ error: 'nope' })],
    ['non-JSON', async () => JSON.parse('<html>')],
  ])('%s is unknown, never none', async (_n, f) => {
    expect((await probeBoard(board('workable', 'a'), f as FetchJson)).result).toBe('unknown');
  });
  it('asks for the light payload, not job bodies', async () => {
    const f = vi.fn(async (_url: string) => ({ jobs: [] }));
    await probeBoard(board('greenhouse', 'a'), f);
    expect(f.mock.calls[0][0]).toBe('https://boards-api.greenhouse.io/v1/boards/a/jobs');
    await probeBoard(board('workable', 'a'), f);
    expect(String(f.mock.calls[1][0])).not.toContain('details=true');
  });
});

describe('createLimiter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const slow = (ms: number) => () => new Promise<string>((r) => setTimeout(() => r('x'), ms));

  it('never has more than 6 in flight, nor more than 2 per host', async () => {
    const lim = createLimiter();
    let now = 0;
    let max = 0;
    const perHost: Record<string, number> = {};
    let maxHost = 0;
    const hosts = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'];
    const tasks = Array.from({ length: 40 }, (_, i) => {
      const h = hosts[i % 5];
      return lim.run(h, async () => {
        now++;
        max = Math.max(max, now);
        perHost[h] = (perHost[h] ?? 0) + 1;
        maxHost = Math.max(maxHost, perHost[h]);
        // Longer than the 150 ms host gap, so the caps (not the gap) are what bind.
        await slow(1000)();
        now--;
        perHost[h]--;
      });
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all(tasks);
    // Exact, so raising either default turns this red (#180 review).
    expect(max).toBe(6);
    expect(maxHost).toBe(2);
  });

  it('pins the politeness defaults', () => {
    expect(MAX_IN_FLIGHT).toBe(6);
    expect(MAX_PER_HOST).toBe(2);
  });

  it('leaves 150 ms between starts on one host', async () => {
    const lim = createLimiter();
    const starts: number[] = [];
    const t0 = Date.now();
    const tasks = Array.from({ length: 4 }, () =>
      lim.run('a.com', async () => void starts.push(Date.now() - t0)),
    );
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all(tasks);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(150);
  });

  it('stops a host for the session after 3 consecutive 429s', async () => {
    const lim = createLimiter();
    lim.strike('a.com');
    lim.strike('a.com');
    lim.ok('a.com'); // a success resets the run
    lim.strike('a.com');
    lim.strike('a.com');
    const ran = vi.fn(async () => 1);
    expect((await Promise.all([lim.run('a.com', ran)]))[0].ran).toBe(true);
    lim.strike('a.com');
    const r = lim.run('a.com', ran);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await r).ran).toBe(false);
    expect(lim.isStopped('a.com')).toBe(true);
    expect(lim.isStopped('b.com')).toBe(false);
  });

  it('skips queued work once aborted', async () => {
    const lim = createLimiter();
    const ac = new AbortController();
    const fn = vi.fn(async () => 1);
    const first = lim.run('a.com', slow(100));
    const queued = lim.run('a.com', fn, ac.signal);
    ac.abort();
    await vi.advanceTimersByTimeAsync(1000);
    await first;
    expect((await queued).ran).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('probeCompanies', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A fake ATS: `live` maps api URL to a body; anything else is 404. */
  const world = (live: Record<string, unknown>, extra?: (url: string) => void): FetchJson =>
    vi.fn(async (url: string) => {
      extra?.(url);
      if (url in live) return live[url];
      throw new FetchError(404, url);
    });

  const collect = async (gen: AsyncGenerator<CompanyProbe>) => {
    const out: CompanyProbe[] = [];
    const p = (async () => {
      for await (const r of gen) out.push(r);
    })();
    await vi.advanceTimersByTimeAsync(600_000);
    await p;
    return out;
  };

  it('tries every kind for the first candidate and stops there on a hit', async () => {
    const urls: string[] = [];
    const f = world({ [boardApiUrl(board('lever', 'acme-labs'))]: [{}] }, (u) => urls.push(u));
    const [r] = await collect(probeCompanies(['Acme Labs'], { fetchJson: f, kv: memoryKv() }));
    expect(r).toMatchObject({
      state: 'found',
      hits: [{ board: { kind: 'lever', slug: 'acme-labs' }, jobs: 1 }],
    });
    expect(urls).toHaveLength(PROBE_KINDS.length);
    expect(urls.every((u) => u.includes('acme-labs'))).toBe(true);
  });

  it('moves to later candidates only when nothing hit, every kind for each of 3 candidates', async () => {
    const urls: string[] = [];
    const out = await collect(
      probeCompanies(['Acme Labs'], { fetchJson: world({}, (u) => urls.push(u)), kv: memoryKv() }),
    );
    expect(urls).toHaveLength(3 * PROBE_KINDS.length);
    expect(out[0]).toMatchObject({ state: 'missed', hits: [] });
  });

  it('a later candidate can hit', async () => {
    const f = world({ [boardApiUrl(board('ashby', 'acme'))]: { jobs: [] } });
    const [r] = await collect(probeCompanies(['Acme Labs'], { fetchJson: f, kv: memoryKv() }));
    expect(r.state).toBe('found');
    expect(r.hits[0]).toMatchObject({ jobs: 0 });
  });

  it('reports unknown, not missed, when any probe could not be answered', async () => {
    const f: FetchJson = async (url) => {
      throw new FetchError(url.includes('ashby') ? 500 : 404, url);
    };
    const [r] = await collect(probeCompanies(['Stripe'], { fetchJson: f, kv: memoryKv() }));
    expect(r.state).toBe('unknown');
    expect(r.unknown.map((b) => b.kind)).toEqual(['ashby']);
  });

  // #180 review: a company with no Recruitee subdomain fails DNS (status 0), which read as
  // "Couldn't check". When the other ATSs answered, the network is up, so that is a miss.
  it('counts a Recruitee connection failure as none when the other ATSs answered', async () => {
    const f: FetchJson = async (url) => {
      throw new FetchError(url.includes('recruitee') ? 0 : 404, url);
    };
    const [r] = await collect(probeCompanies(['Acme Labs'], { fetchJson: f, kv: memoryKv() }));
    expect(r.state).toBe('missed');
    expect(r.unknown).toEqual([]);
  });

  it.each(['teamtailor', 'personio'])(
    'counts a %s connection failure as none when the other ATSs answered',
    async (host) => {
      const f: FetchJson = async (url) => {
        throw new FetchError(url.includes(host) || url.includes('recruitee') ? 0 : 404, url);
      };
      const [r] = await collect(probeCompanies(['Acme Labs'], { fetchJson: f, kv: memoryKv() }));
      expect(r.state).toBe('missed');
    },
  );

  it('finds a SmartRecruiters board with openings', async () => {
    const f = world({
      [boardApiUrl(board('smartrecruiters', 'acme-labs'))]: { content: [{ id: '1' }, { id: '2' }] },
    });
    const [r] = await collect(probeCompanies(['Acme Labs'], { fetchJson: f, kv: memoryKv() }));
    expect(r.hits).toEqual([{ board: { kind: 'smartrecruiters', slug: 'acme-labs' }, jobs: 2 }]);
  });

  it('still reports unknown when nothing could be reached (offline)', async () => {
    const f: FetchJson = async (url) => {
      throw new FetchError(0, url);
    };
    const [r] = await collect(probeCompanies(['Acme Labs'], { fetchJson: f, kv: memoryKv() }));
    expect(r.state).toBe('unknown');
  });

  it('keeps at most 6 requests in flight across 200 companies', async () => {
    let now = 0;
    let max = 0;
    const f: FetchJson = async (url) => {
      now++;
      max = Math.max(max, now);
      await new Promise((r) => setTimeout(r, 50));
      now--;
      throw new FetchError(404, url);
    };
    const names = Array.from({ length: 200 }, (_, i) => `company${i}`);
    const out = await collect(probeCompanies(names, { fetchJson: f, kv: memoryKv() }));
    expect(out).toHaveLength(200);
    expect(max).toBeLessThanOrEqual(6);
    expect(max).toBeGreaterThan(1);
  });

  it('skips the network on a cache hit and honours the TTLs', async () => {
    const kv = memoryKv();
    let t = Date.parse('2026-10-15T00:00:00Z');
    const now = () => t;
    const f = world({ ['https://boards-api.greenhouse.io/v1/boards/acme/jobs']: { jobs: [{}] } });
    await collect(probeCompanies(['acme'], { fetchJson: f, kv, now }));
    const first = (f as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(first).toBe(PROBE_KINDS.length);
    const [again] = await collect(probeCompanies(['acme'], { fetchJson: f, kv, now }));
    expect((f as ReturnType<typeof vi.fn>).mock.calls.length).toBe(first);
    expect(again).toMatchObject({ state: 'found', hits: [{ jobs: 1 }] });
    t += 15 * 86400e3; // none (14 d) expired, live (30 d) kept
    await collect(probeCompanies(['acme'], { fetchJson: f, kv, now }));
    expect((f as ReturnType<typeof vi.fn>).mock.calls.length).toBe(first + PROBE_KINDS.length - 1);
    t += 20 * 86400e3; // live expired too
    await collect(probeCompanies(['acme'], { fetchJson: f, kv, now }));
    expect((f as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      first + 2 * PROBE_KINDS.length - 1,
    );
  });

  it('never caches unknown', async () => {
    const kv = memoryKv();
    const f: FetchJson = async (url) => {
      throw new FetchError(500, url);
    };
    await collect(probeCompanies(['acme'], { fetchJson: f, kv }));
    expect(JSON.parse(kv.get(PROBE_KEY) ?? '{}')).toEqual({});
  });

  it('caps the cache at 5000 entries, evicting the oldest', async () => {
    const kv = memoryKv();
    const old: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++) old[`lever:old${i}`] = { r: 'none', at: 1000 + i };
    kv.set(PROBE_KEY, JSON.stringify(old));
    await collect(probeCompanies(['fresh'], { fetchJson: world({}), kv, now: () => 1e12 }));
    const saved = JSON.parse(kv.get(PROBE_KEY)!) as Record<string, { at: number }>;
    expect(Object.keys(saved)).toHaveLength(5000);
    expect(saved['lever:old0']).toBeUndefined();
    expect(saved['greenhouse:fresh']).toBeDefined();
  });

  it('backs off a host after three 429s: its probes come back unknown, others carry on', async () => {
    const urls: string[] = [];
    const f: FetchJson = async (url) => {
      urls.push(url);
      throw new FetchError(url.includes('lever.co') ? 429 : 404, url);
    };
    const names = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const out = await collect(probeCompanies(names, { fetchJson: f, kv: memoryKv() }));
    expect(urls.filter((u) => u.includes('lever.co')).length).toBeLessThan(30 * 3);
    expect(urls.filter((u) => u.includes('greenhouse')).length).toBeGreaterThanOrEqual(30);
    expect(out.every((r) => r.state === 'unknown')).toBe(true);
  });

  it('stops asking once aborted', async () => {
    const ac = new AbortController();
    const f = world({});
    const gen = probeCompanies(
      Array.from({ length: 100 }, (_, i) => `c${i}`),
      { fetchJson: f, kv: memoryKv(), signal: ac.signal },
    );
    const got: CompanyProbe[] = [];
    const p = (async () => {
      for await (const r of gen) {
        got.push(r);
        if (got.length === 3) ac.abort();
      }
    })();
    await vi.advanceTimersByTimeAsync(600_000);
    await p;
    expect((f as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(100 * 15);
    expect(got.length).toBeLessThan(100);
    const calls = (f as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect((f as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it('yields progressively, as each company answers', async () => {
    const f = world({});
    const gen = probeCompanies(['a1', 'b2'], { fetchJson: f, kv: memoryKv() });
    const first = gen.next();
    await vi.advanceTimersByTimeAsync(5000);
    expect((await first).done).toBe(false);
    await gen.return(undefined);
  });

  /** The probe reads the light payload (no job bodies). */
  const lightUrl = (b: ReturnType<typeof board>) =>
    boardApiUrl(b).replace(/\?(content|details)=true$/, '');

  // The YC company "Forward" matched three boards that belong to other companies.
  describe('identity check', () => {
    const forwardWorld = () =>
      world({
        [lightUrl(board('greenhouse', 'forward'))]: {
          jobs: [
            {
              id: 1,
              absolute_url: 'https://getfwd.com/careers?gh_jid=1',
              company_name: 'Forward',
            },
          ],
        },
        [lightUrl(board('smartrecruiters', 'forward'))]: {
          content: [{ id: '9', company: { name: 'Forward Networks' } }],
        },
        [lightUrl(board('personio', 'forward'))]: [{ id: 3, name: 'Werkstudent' }],
      });
    const websites = new Map([['forward', 'https://goforward.com']]);

    it('marks every board unconfirmed when none shows it is the company: none is a hit', async () => {
      const [r] = await collect(
        probeCompanies(['Forward'], { fetchJson: forwardWorld(), kv: memoryKv(), websites }),
      );
      expect(r.state).toBe('unconfirmed');
      expect(r.hits).toEqual([]);
      expect(r.unconfirmed.map((h) => [h.board.kind, h.why])).toEqual([
        ['greenhouse', 'Its jobs link to getfwd.com, not goforward.com.'],
        ['smartrecruiters', "The board is Forward Networks's."],
        [
          'personio',
          'The name matched boards on several systems; nothing on this one shows it is this company.',
        ],
      ]);
    });

    it('keeps the one board whose links are on the company’s site', async () => {
      const f = world({
        [lightUrl(board('greenhouse', 'forward'))]: {
          jobs: [{ id: 1, absolute_url: 'https://goforward.com/careers?gh_jid=1' }],
        },
        [lightUrl(board('personio', 'forward'))]: [{ id: 3 }],
      });
      const [r] = await collect(
        probeCompanies(['Forward'], { fetchJson: f, kv: memoryKv(), websites }),
      );
      expect(r.state).toBe('found');
      expect(r.hits).toEqual([{ board: { kind: 'greenhouse', slug: 'forward' }, jobs: 1 }]);
      expect(r.unconfirmed.map((h) => h.board.kind)).toEqual(['personio']);
    });

    it('without a website, the board’s stated name decides', async () => {
      const [r] = await collect(
        probeCompanies(['Forward'], { fetchJson: forwardWorld(), kv: memoryKv() }),
      );
      // Greenhouse says "Forward": that one is kept; SmartRecruiters' Forward Networks is not.
      expect(r.hits.map((h) => h.board.kind)).toEqual(['greenhouse']);
      expect(r.unconfirmed.map((h) => h.board.kind)).toEqual(['smartrecruiters', 'personio']);
    });

    it('keeps a lone board that says nothing either way (the slug is all there is)', async () => {
      const f = world({ [lightUrl(board('lever', 'acme'))]: [{ id: 'x' }] });
      const [r] = await collect(probeCompanies(['acme'], { fetchJson: f, kv: memoryKv() }));
      expect(r.state).toBe('found');
      expect(r.unconfirmed).toEqual([]);
    });

    it('a pasted board URL is the user’s word: kept with no check', async () => {
      const f = world({
        [lightUrl(board('greenhouse', 'forward'))]: {
          jobs: [{ id: 1, absolute_url: 'https://getfwd.com/c', company_name: 'Forward' }],
        },
      });
      const [r] = await collect(
        probeCompanies(['https://boards.greenhouse.io/forward'], { fetchJson: f, kv: memoryKv() }),
      );
      expect(r.state).toBe('found');
    });

    it('goes on to the next slug when the first only found unconfirmed boards', async () => {
      const urls: string[] = [];
      const f = world(
        {
          [lightUrl(board('smartrecruiters', 'acme-labs'))]: {
            content: [{ id: '1', company: { name: 'Acme Labs Holdings' } }],
          },
          [lightUrl(board('ashby', 'acme'))]: { jobs: [] },
        },
        (u) => urls.push(u),
      );
      const [r] = await collect(probeCompanies(['Acme Labs'], { fetchJson: f, kv: memoryKv() }));
      expect(urls).toHaveLength(3 * PROBE_KINDS.length);
      expect(r.state).toBe('found');
      expect(r.hits).toEqual([{ board: { kind: 'ashby', slug: 'acme' }, jobs: 0 }]);
      expect(r.unconfirmed.map((h) => h.board.slug)).toEqual(['acme-labs']);
    });

    it('caches the evidence, so a cached answer is checked the same way', async () => {
      const kv = memoryKv();
      const f = forwardWorld();
      await collect(probeCompanies(['Forward'], { fetchJson: f, kv, websites }));
      const calls = (f as ReturnType<typeof vi.fn>).mock.calls.length;
      const [again] = await collect(probeCompanies(['Forward'], { fetchJson: f, kv, websites }));
      expect((f as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
      expect(again.state).toBe('unconfirmed');
      expect(JSON.parse(kv.get(PROBE_KEY)!)['greenhouse:forward'].e.domains).toEqual([
        'getfwd.com',
      ]);
    });
  });

  it('asks again for a live answer cached before the identity check (no evidence)', async () => {
    const kv = memoryKv();
    const now = () => Date.parse('2026-10-15T00:00:00Z');
    kv.set(PROBE_KEY, JSON.stringify({ 'greenhouse:acme': { r: 'live', at: now(), n: 1 } }));
    const urls: string[] = [];
    const f = world({ [lightUrl(board('greenhouse', 'acme'))]: { jobs: [{}] } }, (u) =>
      urls.push(u),
    );
    const [r] = await collect(probeCompanies(['acme'], { fetchJson: f, kv, now }));
    expect(urls).toContain(lightUrl(board('greenhouse', 'acme')));
    expect(r.state).toBe('found');
    expect(JSON.parse(kv.get(PROBE_KEY)!)['greenhouse:acme'].e).toEqual({});
  });

  it('a Rippling or Gem timeout is unknown, never none', async () => {
    const f: FetchJson = async (url) => {
      throw url.includes('rippling') ? new FetchError(0, url, true) : new FetchError(404, url);
    };
    const [r] = await collect(probeCompanies(['acme'], { fetchJson: f, kv: memoryKv() }));
    expect(r.state).toBe('unknown');
    expect(r.unknown.map((b) => b.kind)).toEqual(['rippling']);
  });

  it.each(['bamboohr', 'rippling', 'gem', 'pinpoint', 'breezy'] as const)(
    'probes %s and reads a connection failure there as none once others answered',
    async (kind) => {
      const urls: string[] = [];
      const f: FetchJson = async (url) => {
        urls.push(url);
        throw new FetchError(url === lightUrl(board(kind, 'acme')) ? 0 : 404, url);
      };
      const [r] = await collect(probeCompanies(['acme'], { fetchJson: f, kv: memoryKv() }));
      expect(urls).toContain(lightUrl(board(kind, 'acme')));
      expect(r.state).toBe('missed');
    },
  );
});
