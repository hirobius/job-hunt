import { describe, expect, it } from 'vitest';
import {
  MAX_BOARDS_PER_USER,
  MAX_TERMS_PER_USER,
  answeredFeeds,
  compileProfile,
  feedReadsFor,
  planFromBlob,
} from './plan';
import { boardOf, type ReadOutcome } from './sync';
import { sanitizeProfiles } from '../profileModel';
import { sanitizeSources } from '../sourcesModel';
import { scorePosting } from './score';
import { BOARD_KINDS } from '../feed/boardSet';
import { boardApiUrl } from '../feed/sources/ats';
import { designSystemsTrack } from './track-config';

// Fixtures in #411's real v12 shapes: what its sanitizers keep is what the app writes.
const profile = (o: Record<string, unknown> = {}) =>
  sanitizeProfiles([{ id: 'p1', label: 'Search profile', ...o }])[0];
const dsProfile = (o: Record<string, unknown> = {}) =>
  profile({
    titles: ['Design Systems Engineer', 'Design Technologist'],
    include: { terms: ['design systems'] },
    scorer: 'design-systems',
    ...o,
  });
const v12 = (o: { profiles?: unknown[]; sources?: unknown[]; [k: string]: unknown } = {}) => ({
  v: 12,
  jobs: [],
  ...o,
  profiles: sanitizeProfiles(o.profiles ?? [dsProfile()]),
  sources: sanitizeSources(o.sources ?? []),
});

describe('planFromBlob: v12 (sources + profile)', () => {
  it('reads every board kind from sources, with the label as the company and Lever EU kept', () => {
    const plan = planFromBlob(
      v12({
        sources: [
          { kind: 'greenhouse', ref: 'figma', label: 'Figma' },
          { kind: 'workable', ref: 'acme', label: 'Acme' },
          { kind: 'lever', ref: 'eurocorp', label: 'Euro', eu: true },
          { kind: 'personio', ref: 'acme', label: 'Acme DE' },
          { kind: 'company', ref: 'nobody inc', label: 'Nobody Inc' },
          { kind: 'github', ref: 'shopify', label: 'Shopify', repo: 'shopify/polaris' },
        ],
      }),
    );
    expect(plan?.from).toBe('v12');
    expect(plan?.boards).toEqual([
      { company: 'Figma', ats: 'greenhouse', slug: 'figma' },
      { company: 'Acme', ats: 'workable', slug: 'acme' },
      { company: 'Euro', ats: 'lever', slug: 'eurocorp', eu: true },
      { company: 'Acme DE', ats: 'personio', slug: 'acme' },
    ]);
    // The EU board is read (and closed) under its own id, never the US host's.
    expect(boardOf(plan!.boards[2])).toBe('lever.eu:eurocorp');
  });

  it('drops a dotted slug for the subdomain kinds (BambooHR, Pinpoint, Breezy), never for a path kind', () => {
    const plan = planFromBlob(
      v12({
        sources: [
          { kind: 'bamboohr', ref: 'acme.inc', label: 'Acme Bamboo dotted' },
          { kind: 'pinpoint', ref: 'acme.co', label: 'Acme Pin dotted' },
          { kind: 'breezy', ref: 'acme.hr', label: 'Acme Breezy dotted' },
          { kind: 'bamboohr', ref: 'acme', label: 'Acme Bamboo' },
          { kind: 'pinpoint', ref: 'acme', label: 'Acme Pin' },
          { kind: 'breezy', ref: 'acme', label: 'Acme Breezy' },
          { kind: 'greenhouse', ref: 'acme.inc', label: 'Acme GH dotted' },
        ],
      }),
    );
    expect(plan?.boards.map((b) => `${b.ats}:${b.slug}`)).toEqual([
      'bamboohr:acme',
      'pinpoint:acme',
      'breezy:acme',
      'greenhouse:acme.inc',
    ]);
  });

  it("skips a muted Source; #411's feed refs mute their feed (designsystems-rss is rss)", () => {
    const plan = planFromBlob(
      v12({
        sources: [
          { kind: 'greenhouse', ref: 'figma', label: 'Figma', muted: true },
          { kind: 'ashby', ref: 'ramp', label: 'Ramp', star: true },
          { kind: 'feed', ref: 'remotive', label: 'Remotive', muted: true },
          { kind: 'feed', ref: 'designsystems-rss', label: 'designsystems.jobs', muted: true },
          { kind: 'feed', ref: 'remoteok', label: 'Remote OK', muted: true },
          { kind: 'feed', ref: 'hn', label: 'Hacker News' },
        ],
      }),
    );
    expect(plan?.boards.map((b) => b.slug)).toEqual(['ramp']);
    // The sync's own searches have no Source to mute (Remote OK's is its feed ref): on for every
    // design-systems plan.
    expect([...(plan?.feeds ?? [])].sort()).toEqual([
      'adzuna',
      'arbeitnow',
      'hn',
      'ids',
      'jobicy',
      'jooble',
      'theirstack',
      'wwr',
    ]);
  });

  it("the sync's own searches are for design-systems plans only", () => {
    const plain = planFromBlob(v12({ profiles: [profile({ titles: ['Welder'] })] }));
    expect([...(plain?.feeds ?? [])].sort()).toEqual(['hn', 'jobicy', 'remotive']);
  });

  it("scorer: 'design-systems' is the switch for the tuned config; leave-out rejects a title", () => {
    const plan = planFromBlob(v12({ profiles: [dsProfile({ leaveOut: ['manager'] })] }));
    expect(plan?.config.slug).toBe('design-systems');
    expect(plan?.config.descriptionSignals).toBe(designSystemsTrack.descriptionSignals);
    expect(plan?.terms).toEqual(['Design Systems Engineer', 'design systems']);
    const p = { source: 'greenhouse' as const, sourceId: '1', company: 'A', url: 'https://a' };
    expect(
      scorePosting({ ...p, title: 'Design Manager', descriptionText: '' }, plan!.config).verdict,
    ).toBe('reject');
    // Leave-out never turns off the config's own patterns.
    expect(designSystemsTrack.titleNegative).not.toContain(expect.stringContaining('manager'));
    // Without the scorer, "design systems" in titles or must include is phrase-scored.
    const plain = planFromBlob(v12({ profiles: [dsProfile({ scorer: undefined })] }));
    expect(plain?.config.slug).toBe('profile');
    expect(plain?.feeds.has('rss')).toBe(false);
  });

  it('related titles switched off leave the design systems config without them', () => {
    const on = planFromBlob(v12())!.config;
    expect(on.titleAdjacent).toContain('design technologist');
    for (const include of [
      { terms: ['design systems'], related: false },
      { terms: ['design systems'], relatedOff: ['Design Technologist'] },
    ]) {
      const off = planFromBlob(v12({ profiles: [dsProfile({ include })] }))!.config;
      expect(off.titleAdjacent).not.toContain('design technologist');
      expect(off.titleAdjacent).toContain('ux engineer');
    }
  });

  it('any other profile is scored on its titles that are on, and must include in the body', () => {
    const plan = planFromBlob(
      v12({
        profiles: [
          profile({
            titles: ['Welder', 'Sheet metal fabricator', 'Accountant'],
            titlesOff: ['Accountant'],
            include: { terms: ['TIG'] },
          }),
        ],
      }),
    );
    expect(plan?.config.slug).toBe('profile');
    expect(plan?.terms).toEqual(['Welder', 'Sheet metal fabricator']);
    expect(plan?.feeds.has('rss')).toBe(false);
    expect(plan?.config.descriptionSignals.map((d) => d.label)).toEqual([
      'welder',
      'sheet metal fabricator',
      'tig',
    ]);
    const p = { source: 'lever' as const, sourceId: '1', company: 'A', url: 'https://a' };
    expect(
      scorePosting({ ...p, title: 'Senior Welder', descriptionText: '' }, plan!.config).verdict,
    ).toBe('queue');
    expect(
      scorePosting({ ...p, title: 'Accountant', descriptionText: '' }, plan!.config).verdict,
    ).toBe('reject');
  });

  it('a profile with no titles on and no scorer is no plan', () => {
    expect(planFromBlob(v12({ profiles: [profile({ titles: [] })] }))).toBeNull();
    expect(
      planFromBlob(v12({ profiles: [profile({ titles: ['Welder'], titlesOff: ['welder'] })] })),
    ).toBeNull();
  });

  it('a v12 blob with no profile yet is read as v11 (never closes every open posting)', () => {
    const plan = planFromBlob(
      v12({
        profiles: [],
        sources: [{ kind: 'greenhouse', ref: 'figma', label: 'Figma' }],
        sweeps: { t: { titles: ['Welder'], off: [] } },
      }),
    );
    expect(plan?.from).toBe('v11');
    expect(plan?.terms).toEqual(['Welder']);
    expect(planFromBlob(v12({ profiles: [] }))).toBeNull();
  });

  it(`caps a user at ${MAX_BOARDS_PER_USER} boards and ${MAX_TERMS_PER_USER} feed terms`, () => {
    const plan = planFromBlob(
      v12({
        profiles: [profile({ titles: ['Design Systems', 'A b', 'C d', 'E f', 'G h'] })],
        sources: Array.from({ length: 2000 }, (_, i) => ({
          kind: 'greenhouse',
          ref: `co${i}`,
          label: `Co ${i}`,
        })),
      }),
    );
    expect(plan?.boards).toHaveLength(MAX_BOARDS_PER_USER);
    expect(plan?.terms).toHaveLength(MAX_TERMS_PER_USER);
  });

  it('reads an unsanitized blob through the same sanitizers: no slug can leave the board host', () => {
    const plan = planFromBlob({
      v: 12,
      profiles: [dsProfile()],
      sources: [
        { kind: 'recruitee', ref: 'evil.example/x', label: 'x' },
        { kind: 'teamtailor', ref: '../admin', label: 'y' },
        { kind: 'greenhouse', ref: 'javascript:alert(1)', label: 'z' },
        { kind: 'board', ref: 'https://jobs.lever.co/acme', label: 'not a kind' },
      ],
    });
    expect(plan?.boards).toEqual([]);
  });
});

describe('planFromBlob: all 13 board kinds (#576)', () => {
  const FIXED_HOST: Record<string, string> = {
    greenhouse: 'boards-api.greenhouse.io',
    lever: 'api.lever.co',
    ashby: 'api.ashbyhq.com',
    workable: 'apply.workable.com',
    recruitee: '.recruitee.com',
    smartrecruiters: 'api.smartrecruiters.com',
    teamtailor: '.teamtailor.com',
    personio: '.jobs.personio.de',
    bamboohr: '.bamboohr.com',
    rippling: 'api.rippling.com',
    gem: 'api.gem.com',
    pinpoint: '.pinpointhq.com',
    breezy: '.breezy.hr',
  };

  it('plans a board of every kind the app reads, from v12 Sources', () => {
    expect(BOARD_KINDS).toHaveLength(13);
    const plan = planFromBlob(
      v12({ sources: BOARD_KINDS.map((kind) => ({ kind, ref: 'acme', label: `Acme ${kind}` })) }),
    );
    expect(plan!.boards.map((b) => b.ats)).toEqual([...BOARD_KINDS]);
  });

  it('plans the five newer kinds from v11 tiles, dreams and saved jobs too', () => {
    const plan = planFromBlob(
      {
        v: 11,
        jobs: [{ url: 'https://acme.breezy.hr/p/0a1b2c-designer', company: 'Acme' }],
        dreams: { t1: [{ company: 'Gem Co', board: { kind: 'gem', slug: 'gemco' } }] },
        mustInclude: { t1: { terms: ['design system'], atsOff: [] } },
      },
      [
        { url: 'https://acme.bamboohr.com/careers', name: 'Acme' },
        { url: 'https://acme.pinpointhq.com/', name: 'Acme' },
      ],
    );
    const keys = plan!.boards.map((b) => `${b.ats}:${b.slug}`);
    expect(keys).toEqual(
      expect.arrayContaining(['bamboohr:acme', 'pinpoint:acme', 'gem:gemco', 'breezy:acme']),
    );
  });

  it('every read goes to its kind’s fixed host: only a SLUG varies (no SSRF)', () => {
    for (const kind of BOARD_KINDS)
      for (const slug of ['acme', 'evil.com', 'a.b-c_d', 'x.attacker.example']) {
        const host = new URL(boardApiUrl({ kind, slug })).hostname;
        const fixed = FIXED_HOST[kind];
        expect(fixed.startsWith('.') ? host.endsWith(fixed) : host === fixed).toBe(true);
      }
  });

  it('drops a stored board whose slug fails the SLUG rule or whose kind is unknown', () => {
    const plan = planFromBlob({
      v: 11,
      jobs: [],
      dreams: {
        t1: [
          { company: 'Bad', board: { kind: 'bamboohr', slug: 'evil.com/x?' } },
          { company: 'Bad', board: { kind: 'bamboohr', slug: '@evil.com' } },
          { company: 'Bad', board: { kind: 'bamboohr', slug: '-acme' } },
          { company: 'Bad', board: { kind: 'workday', slug: 'acme' } },
          { company: 'Good', board: { kind: 'rippling', slug: 'acme' } },
        ],
      },
      mustInclude: { t1: { terms: ['design system'], atsOff: [] } },
    });
    const ours = plan!.boards.filter((b) => b.company === 'Bad' || b.company === 'Good');
    expect(ours).toEqual([{ company: 'Good', ats: 'rippling', slug: 'acme' }]);
  });
});

describe('planFromBlob: v11 fallback', () => {
  const v11 = {
    v: 11,
    jobs: [{ url: 'https://jobs.ashbyhq.com/linear/abc', company: 'Linear' }],
    dreams: { t1: [{ company: 'Vercel', board: { kind: 'greenhouse', slug: 'vercel' } }] },
    targets: {
      t2: [
        {
          login: 'shopify',
          company: 'Shopify',
          board: { kind: 'smartrecruiters', slug: 'shopify' },
        },
      ],
    },
    mustInclude: { t1: { terms: ['design system'], atsOff: [] } },
    sweeps: { t1: { titles: ['Design Systems Engineer', 'UX Engineer'], off: ['UX Engineer'] } },
  };

  it('reads watched tiles, dreams, targets and saved jobs across every track, plus the verified boards', () => {
    const plan = planFromBlob(v11, [
      { url: 'https://boards.greenhouse.io/figma', name: 'Figma' },
      { url: 'https://example.com/careers', name: 'Not a board' },
    ]);
    expect(plan?.from).toBe('v11');
    expect(plan?.config).toBe(designSystemsTrack);
    const keys = plan!.boards.map((b) => `${b.ats}:${b.slug}`);
    expect(keys.slice(0, 4)).toEqual([
      'greenhouse:figma',
      'greenhouse:vercel',
      'smartrecruiters:shopify',
      'ashby:linear',
    ]);
    expect(keys).toEqual(expect.arrayContaining(['greenhouse:stripe', 'ashby:openai']));
    // The tile's name wins over the verified list's for the same board.
    expect(plan!.boards.filter((b) => b.slug === 'figma')).toEqual([
      { company: 'Figma', ats: 'greenhouse', slug: 'figma' },
    ]);
    expect(plan?.terms).toEqual(['Design Systems Engineer', 'design systems']);
    expect(plan?.feeds.has('rss')).toBe(true);
  });

  it('a blob with no scored track is scored on its ticked sweep titles; none at all is no plan', () => {
    const plan = planFromBlob({ v: 11, sweeps: { t: { titles: ['Welder'], off: [] } } });
    expect(plan?.config.slug).toBe('profile');
    expect(plan?.terms).toEqual(['Welder']);
    expect(planFromBlob({ v: 11, jobs: [] })).toBeNull();
    expect(planFromBlob(null)).toBeNull();
    expect(planFromBlob('not a blob')).toBeNull();
  });
});

describe('compileProfile', () => {
  it('reads a title phrase as whole words, hyphen or space', () => {
    const c = compileProfile({ titles: ['front-end developer'] })!;
    const p = {
      source: 'manual' as const,
      sourceId: '1',
      company: 'A',
      url: 'https://a',
      descriptionText: '',
    };
    expect(scorePosting({ ...p, title: 'Senior Front End Developer' }, c).verdict).toBe('queue');
    expect(scorePosting({ ...p, title: 'Backfront-end developers' }, c).verdict).toBe('reject');
  });
});

describe('feeds: what counts as answered (a missed posting closes after 2 answered reads)', () => {
  const plan = planFromBlob(
    v12({
      profiles: [dsProfile({ titles: ['Design Systems Engineer', 'Design System Lead'] })],
      sources: [{ kind: 'feed', ref: 'jobicy', label: 'Jobicy', muted: true }],
    }),
  )!;
  const read = (board: string, term: string | undefined, ok = true): ReadOutcome => ({
    company: null,
    board,
    term,
    ok,
    postings: [],
  });

  it('only my titles on my feeds; RSS is everyone’s', () => {
    const reads = [
      read('hn', 'Design Systems Engineer'),
      read('hn', 'Welder'),
      read('jobicy', 'Design Systems Engineer'),
      read('rss', undefined),
      read('theirstack', undefined),
    ];
    expect(feedReadsFor(plan, reads).map((r) => `${r.board}:${r.term ?? ''}`)).toEqual([
      'hn:Design Systems Engineer',
      'rss:',
      'theirstack:',
    ]);
  });

  it('a feed whose run left out one of my titles, or failed on one, is not answered', () => {
    const both = [
      read('hn', 'design systems engineer'),
      read('hn', 'Design System Lead'),
      read('hn', 'design systems'),
    ];
    expect(answeredFeeds(plan, both)).toEqual(['hn']);
    // The per-run cap kept only one of the two titles.
    expect(answeredFeeds(plan, both.slice(0, 1))).toEqual([]);
    expect(answeredFeeds(plan, [...both, read('hn', 'Design System Lead', false)])).toEqual([]);
    expect(answeredFeeds(plan, [read('rss', undefined)])).toEqual(['rss']);
    expect(answeredFeeds(plan, [read('rss', undefined, false)])).toEqual([]);
    // Part of the catalog, or the RSS alone, never closes what it didn't list.
    expect(answeredFeeds(plan, [{ ...read('rss', undefined), partial: true }])).toEqual([]);
    // A windowed search never counts as the whole list.
    expect(answeredFeeds(plan, [read('theirstack', undefined), read('ids', undefined)])).toEqual(
      [],
    );
  });
});
