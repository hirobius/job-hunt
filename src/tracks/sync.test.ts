import { describe, expect, it, vi } from 'vitest';
import type { NormalizedPosting } from './score';
import { fetchDesignSystemsJobsFeed, stripHtml } from './sources';
import { forWatcher, readAll, scoreBatch } from './sync';
import { designSystemsTrack } from './track-config';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const DS = '<p>Own our design system, component library and design tokens.</p>';
const GH: Record<string, unknown> = {
  stripe: {
    jobs: [
      {
        id: 1,
        title: 'Product Designer, Design Systems',
        absolute_url: 'https://s/1',
        content: DS,
      },
      {
        id: 2,
        title: 'Senior Mechanical and Industrial Design Engineer',
        absolute_url: 'https://s/2',
        content: DS,
      },
    ],
  },
  datadog: {
    jobs: [{ id: 3, title: 'Senior Design Manager - Design Systems', absolute_url: 'https://d/3' }],
  },
};
const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Design Systems Engineer at Acme &amp; Co]]></title><link>https://designsystems.jobs/1</link>
<guid>ds-1</guid><description>Engineering · Senior · Full time · Remote · Germany</description>
<pubDate>Fri, 23 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Design Systems Intern at Beta</title><link>https://designsystems.jobs/2</link>
<guid>ds-2</guid><description>Design · Intern · Full time · On-site · USA</description></item>
</channel></rss>`;

const fakeFetch = vi.fn(async (url: string) => {
  const gh = url.match(/greenhouse\.io\/v1\/boards\/([^/]+)\/jobs/);
  if (gh) return GH[gh[1]] ? json(GH[gh[1]]) : json({}, 404);
  if (url.startsWith('https://api.lever.co/v0/postings/palantir'))
    return json([
      {
        id: 'l1',
        text: 'Design Technologist',
        hostedUrl: 'https://l/1',
        descriptionPlain: 'Grow the design system and Storybook.',
        workplaceType: 'remote',
        createdAt: Date.UTC(2026, 9, 1),
      },
    ]);
  if (url.startsWith('https://api.ashbyhq.com/')) return json({ jobs: [] });
  if (url === 'https://designsystems.jobs/feed') return new Response(RSS);
  return json({}, 404);
});

describe('sources', () => {
  it('strips tags and the two entities', () => {
    expect(stripHtml('<p>A&nbsp;&amp; B</p>\n<b>C</b>')).toBe('A & B C');
  });

  it('normalizes a Greenhouse board and a Lever board with the app parsers', async () => {
    const [gh, lv] = await readAll(
      [
        { company: 'Stripe', ats: 'greenhouse', slug: 'stripe' },
        { company: 'Palantir', ats: 'lever', slug: 'palantir' },
      ],
      { fetch: fakeFetch, rss: false },
    );
    expect(gh.postings[0]).toMatchObject({
      source: 'greenhouse',
      // The Posting's own id: the browser and the server name a posting the same way.
      sourceId: 'greenhouse:stripe:1',
      company: 'Stripe',
      url: 'https://s/1',
    });
    expect(gh.postings[0].descriptionText).toBe(
      'Own our design system, component library and design tokens.',
    );
    expect(lv.postings[0]).toMatchObject({
      title: 'Design Technologist',
      remote: true,
      postedAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('a board that is not ok is a failed read with its status', async () => {
    const [r] = await readAll([{ company: 'Notion', ats: 'greenhouse', slug: 'notion' }], {
      fetch: fakeFetch,
      rss: false,
    });
    expect(r).toMatchObject({ ok: false, status: 404, postings: [] });
  });

  it("decodes Greenhouse's entity-encoded body before the scorer reads it", async () => {
    const f = async () =>
      json({
        jobs: [
          {
            id: 9,
            title: 'Design Technologist',
            absolute_url: 'https://g/9',
            content:
              '&lt;p&gt;Own the &lt;strong&gt;design system&lt;/strong&gt; and Storybook.&lt;/p&gt;',
          },
        ],
      });
    const [r] = await readAll([{ company: 'G', ats: 'greenhouse', slug: 'g' }], {
      fetch: f,
      rss: false,
    });
    expect(r.postings[0].descriptionText).toBe('Own the design system and Storybook.');
  });

  it('reads every board kind the browser reads (Workable, Recruitee, SmartRecruiters, Teamtailor, Personio)', async () => {
    const one = { title: 'Design Systems Lead' };
    const bodies: [RegExp, unknown][] = [
      [
        /workable\.com/,
        { jobs: [{ ...one, shortcode: 'w1', url: 'https://apply.workable.com/w/j/w1' }] },
      ],
      [
        /recruitee\.com/,
        { offers: [{ ...one, id: 1, careers_url: 'https://r.recruitee.com/o/1' }] },
      ],
      [/smartrecruiters\.com/, { content: [{ id: 's1', name: one.title }] }],
      [
        /teamtailor\.com/,
        { data: [{ id: 't1', attributes: { ...one, url: 'https://t.teamtailor.com/jobs/1' } }] },
      ],
      [/personio\.de/, [{ id: 7, name: one.title }]],
    ];
    const f = async (url: string) => json(bodies.find(([re]) => re.test(url))?.[1] ?? {}, 200);
    const reads = await readAll(
      (['workable', 'recruitee', 'smartrecruiters', 'teamtailor', 'personio'] as const).map(
        (ats) => ({ company: `Acme ${ats}`, ats, slug: 'acme' }),
      ),
      { fetch: f, rss: false },
    );
    expect(reads.map((r) => [r.board, r.ok, r.postings.length])).toEqual([
      ['workable:acme', true, 1],
      ['recruitee:acme', true, 1],
      ['smartrecruiters:acme', true, 1],
      ['teamtailor:acme', true, 1],
      ['personio:acme', true, 1],
    ]);
    expect(reads.every((r) => r.postings[0].company === r.company?.company)).toBe(true);
    expect(reads[0].postings[0].source).toBe('workable');
  });

  it('reads the term feeds once per term, each a read of its own', async () => {
    const urls: string[] = [];
    const f = async (url: string) => {
      urls.push(url);
      if (url.includes('remotive.com'))
        return json({
          jobs: [
            {
              id: 1,
              title: 'Design Systems Engineer',
              company_name: 'R',
              url: 'https://remotive.com/1',
              description: 'design system',
            },
          ],
        });
      return json({}, 500);
    };
    const reads = await readAll([], {
      fetch: f,
      rss: false,
      terms: { remotive: ['design systems'], jobicy: ['design systems'] },
    });
    expect(reads.map((r) => [r.board, r.term, r.ok])).toEqual([
      ['remotive', 'design systems', true],
      ['jobicy', 'design systems', false],
    ]);
    expect(reads[0].postings[0]).toMatchObject({ source: 'remotive', company: 'R' });
    expect(reads[1].status).toBe(500);
  });

  it('a feed item with no guid or link still gets a key; non-web links never get stored', async () => {
    const xml = `<rss><item><title>Design Systems Lead at A</title></item>
      <item><title>Design Systems Engineer at B</title><link>javascript:alert(1)</link></item></rss>`;
    const reads = await readAll([], { fetch: async () => new Response(xml), rss: true });
    expect(reads[0].postings).toEqual([]);
    const raw = await fetchDesignSystemsJobsFeed(async () => new Response(xml));
    expect(raw[0].sourceId).toBe('fp:a::design systems');
  });

  it('reads designsystems.jobs: "Role at Company", the guid, the country, remote', async () => {
    const out = await fetchDesignSystemsJobsFeed(fakeFetch);
    expect(out[0]).toMatchObject({
      source: 'rss',
      sourceId: 'ds-1',
      title: 'Design Systems Engineer',
      company: 'Acme & Co',
      location: 'Germany',
      remote: true,
      url: 'https://designsystems.jobs/1',
      postedAt: '2026-10-23T10:00:00.000Z',
    });
    expect(out[1].remote).toBe(false);
  });
});

describe('readAll + scoreBatch (one sync, no database)', () => {
  it('queues the Stripe and Datadog design systems titles, never the mechanical one, interns never', async () => {
    const reads = await readAll(
      [
        { company: 'Stripe', ats: 'greenhouse', slug: 'stripe' },
        { company: 'Datadog', ats: 'greenhouse', slug: 'datadog' },
        { company: 'Palantir', ats: 'lever', slug: 'palantir' },
        { company: 'Notion', ats: 'greenhouse', slug: 'notion' },
      ],
      { fetch: fakeFetch, rss: true },
    );
    expect(reads.find((r) => r.board === 'greenhouse:notion')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(reads.find((r) => r.board === 'rss')?.ok).toBe(true);
    const scored = scoreBatch(reads, designSystemsTrack);
    const queued = scored.filter((s) => s.verdict === 'queue').map((s) => s.posting.title);
    expect(queued).toEqual(
      expect.arrayContaining([
        'Product Designer, Design Systems',
        'Senior Design Manager - Design Systems',
        'Design Systems Engineer',
        'Design Technologist',
      ]),
    );
    expect(queued).not.toContain('Senior Mechanical and Industrial Design Engineer');
    const intern = scored.find((s) => s.posting.title === 'Design Systems Intern');
    expect(intern?.verdict).toBe('reject');
    expect(intern?.reasons[intern.reasons.length - 1]).toBe('rejected: fit: internship');
    for (const s of scored.filter((x) => x.verdict === 'queue'))
      expect(s.reasons.length).toBeGreaterThan(0);
    expect(scored.find((s) => s.posting.title === 'Design Technologist')?.board).toBe(
      'lever:palantir',
    );
  });

  it('reads Ashby boards two at a time (#448)', async () => {
    let inFlight = 0;
    let most = 0;
    const slow = async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json({ jobs: [] });
    };
    await readAll(
      ['a', 'b', 'c'].map((slug) => ({ company: slug, ats: 'ashby' as const, slug })),
      { fetch: slow, rss: false },
    );
    expect(most).toBe(2);
  });

  it('reads Ashby while pooled boards are still in flight (#448)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const done: string[] = [];
    const gated = async (u: string) => {
      if (u.includes('ashbyhq')) {
        done.push('ashby');
        return json({ jobs: [] });
      }
      await gate;
      done.push('pooled');
      return json({ jobs: [] });
    };
    const run = readAll(
      [
        { company: 'G', ats: 'greenhouse' as const, slug: 'g' },
        { company: 'A', ats: 'ashby' as const, slug: 'a' },
      ],
      { fetch: gated, rss: false },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toEqual(['ashby']);
    release();
    const reads = await run;
    expect(reads.map((r) => r.board)).toEqual(['greenhouse:g', 'ashby:a']);
  });

  it('a board that throws is a failed read, never "no jobs"', async () => {
    const reads = await readAll([{ company: 'X', ats: 'lever', slug: 'x' }], {
      fetch: async () => {
        throw new Error('offline');
      },
      rss: false,
    });
    expect(reads[0]).toMatchObject({ ok: false, postings: [] });
  });
});

describe('a board several users watch', () => {
  it("gives each watcher their own company name, never the first watcher's", async () => {
    const gh = async (u: string) => json(GH[u.split('/boards/')[1].split('/')[0]] ?? {}, 200);
    const [r] = await readAll(
      [{ company: 'Stripe: verify at evil.example', ats: 'greenhouse', slug: 'stripe' }],
      {
        fetch: gh,
        rss: false,
      },
    );
    expect(r.postings.length).toBeGreaterThan(0);
    const mine = forWatcher(r, { company: 'Stripe', ats: 'greenhouse', slug: 'stripe' });
    expect(mine.postings.every((p) => p.company === 'Stripe')).toBe(true);
    expect(mine.company?.company).toBe('Stripe');
    // The read itself is left as it was (the next watcher maps it again).
    expect(r.postings[0].company).toBe('Stripe: verify at evil.example');
  });
});

describe('breadth: the server reads what the browser reads', () => {
  it('the same boards give the server every posting the app parser gives the browser', async () => {
    const { fetchBoard } = await import('../feed/sources/ats');
    const boards = [
      { company: 'Stripe', ats: 'greenhouse' as const, slug: 'stripe' },
      { company: 'Datadog', ats: 'greenhouse' as const, slug: 'datadog' },
      { company: 'Palantir', ats: 'lever' as const, slug: 'palantir' },
    ];
    const fetchJson = async (u: string) => (await fakeFetch(u)).json();
    const browser = (
      await Promise.all(boards.map((b) => fetchBoard({ kind: b.ats, slug: b.slug }, fetchJson)))
    ).flat();
    const server = (await readAll(boards, { fetch: fakeFetch, rss: false })).flatMap(
      (r) => r.postings,
    );
    expect(browser.length).toBeGreaterThan(0);
    expect(new Set(server.map((p) => p.sourceId))).toEqual(new Set(browser.map((p) => p.id)));
  });
});

describe('designsystems.jobs catalog and the sync’s own searches', () => {
  const PAGE = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title: 'Design Systems Lead',
    hiringOrganization: { name: 'Acme' },
    description: 'Own the design system.',
  })}</script>`;
  const JOB = 'https://designsystems.jobs/companies/acme/ds-lead';
  const site = (sitemap: number) =>
    vi.fn(async (url: string) => {
      if (url === 'https://designsystems.jobs/feed') return new Response(RSS);
      if (url === 'https://designsystems.jobs/sitemap.xml')
        return sitemap === 200
          ? new Response(`<urlset><url><loc>${JOB}</loc></url></urlset>`)
          : new Response('', { status: sitemap });
      if (url === JOB) return new Response(PAGE);
      return new Response('', { status: 404 });
    });

  it('reads the whole catalog as the rss board, complete', async () => {
    const [r] = await readAll([], { fetch: site(200), rss: true, catalog: true });
    expect(r).toMatchObject({ board: 'rss', ok: true });
    expect(r.partial).toBeUndefined();
    // The two feed items the sitemap doesn't list yet come along.
    expect(r.postings.map((p) => [p.sourceId, p.title])).toEqual([
      [JOB, 'Design Systems Lead'],
      ['ds-1', 'Design Systems Engineer'],
      ['ds-2', 'Design Systems Intern'],
    ]);
  });

  it('a feed failure is kept in the log when the catalog answers', async () => {
    const f = vi.fn(async (url: string) =>
      url === 'https://designsystems.jobs/feed'
        ? new Response('', { status: 502 })
        : site(200)(url),
    );
    const [r] = await readAll([], { fetch: f, rss: true, catalog: true });
    expect(r).toMatchObject({ ok: true, error: 'designsystems.jobs feed: HTTP 502' });
    expect(r.partial).toBeUndefined();
  });

  it('falls back to the RSS when the sitemap fails: answered but partial, the failure kept', async () => {
    const [r] = await readAll([], { fetch: site(500), rss: true, catalog: true });
    expect(r).toMatchObject({ board: 'rss', ok: true, partial: true });
    expect(r.error).toMatch(/sitemap: HTTP 500/);
    expect(r.postings.map((p) => p.sourceId)).toEqual(['ds-1', 'ds-2']);
    // Catalog off: the RSS alone, partial too.
    const [off] = await readAll([], { fetch: site(200), rss: true, catalog: false });
    expect(off).toMatchObject({ ok: true, partial: true });
  });

  it('runs each server feed it is given; a missing key fails that one loud and alone', async () => {
    const ctx = {
      fetch: vi.fn(async () => new Response('{}')),
      env: () => undefined,
      now: () => new Date('2026-10-28T06:00:00Z'),
      sleep: async () => {},
    };
    const reads = await readAll([], {
      fetch: site(200),
      rss: false,
      server: { feeds: ['theirstack', 'jooble'], ctx },
    });
    expect(reads.map((r) => [r.board, r.ok])).toEqual([
      ['theirstack', false],
      ['jooble', false],
    ]);
    expect(reads[0].error).toMatch(/THEIRSTACK_API_KEY is not set/);
    expect(reads[1].error).toMatch(/JOOBLE_API_KEY is not set/);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
});

describe('greenhouse delta reads (#448)', () => {
  const LIGHT = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs';
  const FULL = `${LIGHT}?content=true`;
  const lightJob = (id: number, stamp?: string) => ({
    id,
    title: `Job ${id}`,
    absolute_url: `https://a/${id}`,
    location: { name: 'Remote - US' },
    first_published: '2026-09-01T00:00:00-04:00',
    ...(stamp ? { updated_at: stamp } : {}),
  });
  const fullJob = (id: number, stamp: string, text: string) => ({
    ...lightJob(id, stamp),
    content: `<p>${text}</p>`,
  });
  // A stored row as the loader returns it: the stamp in the database's format (same instant
  // as the board's '-04:00' string, different text), the description already plain text.
  const stored = (id: number, stampIso: string, text: string): NormalizedPosting => ({
    source: 'greenhouse',
    sourceId: `greenhouse:acme:${id}`,
    title: `Job ${id}`,
    company: 'Acme',
    location: 'Remote - US',
    remote: true,
    url: `https://a/${id}`,
    descriptionText: text,
    postedAt: '2026-09-01T00:00:00-04:00',
    sourceUpdatedAt: stampIso,
  });
  const deltaFetch = (o: {
    light?: unknown;
    lightStatus?: number;
    singles?: Record<string, unknown>;
    full?: unknown;
  }) => {
    const calls: string[] = [];
    const f = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === LIGHT) return o.lightStatus ? json({}, o.lightStatus) : json(o.light);
      const single = url.match(/\/jobs\/(\d+)$/);
      if (single) return o.singles?.[single[1]] ? json(o.singles[single[1]]) : json({}, 404);
      if (url === FULL) return json(o.full);
      return json({}, 404);
    });
    return { f, calls };
  };
  const acme = [{ company: 'Acme', ats: 'greenhouse' as const, slug: 'acme' }];

  it('reuses every stored row when no stamp moved: the light list is the only download', async () => {
    const known = new Map([
      ['greenhouse:acme:1', stored(1, '2026-10-01T04:00:00.000Z', 'Stored text one.')],
      ['greenhouse:acme:2', stored(2, '2026-10-02T04:00:00.000Z', 'Stored text two.')],
    ]);
    const { f, calls } = deltaFetch({
      light: {
        jobs: [lightJob(1, '2026-10-01T00:00:00-04:00'), lightJob(2, '2026-10-02T00:00:00-04:00')],
      },
    });
    const [r] = await readAll(acme, { fetch: f, rss: false, knownBoards: known });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([LIGHT]);
    expect(r.postings.map((p) => p.descriptionText)).toEqual([
      'Stored text one.',
      'Stored text two.',
    ]);
    expect(r.postings[0].sourceUpdatedAt).toBe('2026-10-01T04:00:00.000Z');
  });

  it('downloads only the job whose stamp moved, with its fresh text', async () => {
    const known = new Map([
      ['greenhouse:acme:1', stored(1, '2026-10-01T04:00:00.000Z', 'Stored text one.')],
      ['greenhouse:acme:2', stored(2, '2026-10-02T04:00:00.000Z', 'Stored text two.')],
    ]);
    const { f, calls } = deltaFetch({
      light: {
        jobs: [lightJob(1, '2026-10-01T00:00:00-04:00'), lightJob(2, '2026-10-20T00:00:00-04:00')],
      },
      singles: { '2': fullJob(2, '2026-10-20T00:00:00-04:00', 'Fresh text two.') },
    });
    const [r] = await readAll(acme, { fetch: f, rss: false, knownBoards: known });
    expect(calls).toEqual([LIGHT, `${LIGHT}/2`]);
    expect(r.postings.map((p) => p.descriptionText)).toEqual([
      'Stored text one.',
      'Fresh text two.',
    ]);
    expect(r.postings[1].sourceUpdatedAt).toBe('2026-10-20T00:00:00-04:00');
  });

  it('fetches a new job singly and drops a stored job the board no longer lists', async () => {
    const known = new Map([['greenhouse:acme:9', stored(9, '2026-10-01T04:00:00.000Z', 'Gone.')]]);
    const { f, calls } = deltaFetch({
      light: { jobs: [lightJob(3, '2026-10-05T00:00:00-04:00')] },
      singles: { '3': fullJob(3, '2026-10-05T00:00:00-04:00', 'Brand new.') },
    });
    const [r] = await readAll(acme, { fetch: f, rss: false, knownBoards: known });
    expect(calls).toEqual([LIGHT, `${LIGHT}/3`]);
    expect(r.postings.map((p) => p.sourceId)).toEqual(['greenhouse:acme:3']);
    expect(r.postings[0].descriptionText).toBe('Brand new.');
  });

  it('refetches a job the light list gives no stamp for', async () => {
    const known = new Map([
      ['greenhouse:acme:1', stored(1, '2026-10-01T04:00:00.000Z', 'Stored text one.')],
    ]);
    const { f, calls } = deltaFetch({
      light: { jobs: [lightJob(1)] },
      singles: { '1': fullJob(1, '2026-10-01T00:00:00-04:00', 'Fetched text one.') },
    });
    const [r] = await readAll(acme, { fetch: f, rss: false, knownBoards: known });
    expect(calls).toEqual([LIGHT, `${LIGHT}/1`]);
    expect(r.postings[0].descriptionText).toBe('Fetched text one.');
  });

  it('falls back to the full read when the light list fails', async () => {
    const known = new Map([
      ['greenhouse:acme:1', stored(1, '2026-10-01T04:00:00.000Z', 'Stored text one.')],
    ]);
    const { f, calls } = deltaFetch({
      lightStatus: 500,
      full: { jobs: [fullJob(1, '2026-10-01T00:00:00-04:00', 'Full text one.')] },
    });
    const [r] = await readAll(acme, { fetch: f, rss: false, knownBoards: known });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([LIGHT, FULL]);
    expect(r.postings[0].descriptionText).toBe('Full text one.');
  });

  it('takes the full list when a wave changes most of a board at once', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    const known = new Map(
      ids.map((id) => [
        `greenhouse:acme:${id}`,
        stored(id, '2026-10-01T04:00:00.000Z', `Stored text ${id}.`),
      ]),
    );
    const { f, calls } = deltaFetch({
      light: { jobs: ids.map((id) => lightJob(id, '2026-10-20T00:00:00-04:00')) },
      full: { jobs: ids.map((id) => fullJob(id, '2026-10-20T00:00:00-04:00', `Full text ${id}.`)) },
    });
    const [r] = await readAll(acme, { fetch: f, rss: false, knownBoards: known });
    expect(calls).toEqual([LIGHT, FULL]);
    expect(r.postings).toHaveLength(30);
    expect(r.postings[0].descriptionText).toBe('Full text 1.');
  });

  it('falls back rather than drop a job whose single download does not parse', async () => {
    const known = new Map([
      ['greenhouse:acme:1', stored(1, '2026-10-01T04:00:00.000Z', 'Stored text one.')],
    ]);
    const { f, calls } = deltaFetch({
      light: { jobs: [lightJob(1, '2026-10-20T00:00:00-04:00')] },
      singles: { '1': { nope: true } },
      full: { jobs: [fullJob(1, '2026-10-20T00:00:00-04:00', 'Full text one.')] },
    });
    const [r] = await readAll(acme, { fetch: f, rss: false, knownBoards: known });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([LIGHT, `${LIGHT}/1`, FULL]);
    expect(r.postings[0].descriptionText).toBe('Full text one.');
  });

  it('reads in full when the board has no stored rows', async () => {
    const { f, calls } = deltaFetch({
      full: { jobs: [fullJob(1, '2026-10-01T00:00:00-04:00', 'Full text one.')] },
    });
    const [r] = await readAll(acme, { fetch: f, rss: false, knownBoards: new Map() });
    expect(calls).toEqual([FULL]);
    expect(r.postings[0].descriptionText).toBe('Full text one.');
  });
});
