import { describe, expect, it } from 'vitest';
import {
  MAX_BOARDS_PER_USER,
  MAX_TERMS_PER_USER,
  answeredFeeds,
  compileProfile,
  feedReadsFor,
  planFromBlob,
} from './plan';
import type { ReadOutcome } from './sync';
import { scorePosting } from './score';
import { designSystemsTrack } from './track-config';

const v12 = (extra: Record<string, unknown> = {}) => ({
  v: 12,
  jobs: [],
  profiles: [{ titles: ['Design Systems Engineer'], mustInclude: ['design systems'] }],
  sources: [],
  ...extra,
});

describe('planFromBlob: v12 (sources + profile)', () => {
  it('reads every board kind from sources, by link or by slug, with the label as the company', () => {
    const plan = planFromBlob(
      v12({
        sources: [
          { kind: 'greenhouse', ref: 'https://boards.greenhouse.io/figma', label: 'Figma' },
          { kind: 'workable', ref: 'acme', label: 'Acme' },
          { kind: 'board', ref: 'https://jobs.eu.lever.co/eurocorp', label: 'Euro' },
          { kind: 'personio', ref: 'https://acme.jobs.personio.de', label: 'Acme DE' },
          { kind: 'company', ref: 'Nobody Inc', label: 'Nobody Inc' },
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
  });

  it('skips a muted Source; a muted feed turns that feed off; the rest stay on', () => {
    const plan = planFromBlob(
      v12({
        sources: [
          { kind: 'greenhouse', ref: 'figma', label: 'Figma', muted: true },
          { kind: 'ashby', ref: 'ramp', label: 'Ramp', star: true },
          { kind: 'feed', ref: 'remotive', label: 'Remotive', muted: true },
        ],
      }),
    );
    expect(plan?.boards.map((b) => b.slug)).toEqual(['ramp']);
    expect([...(plan?.feeds ?? [])].sort()).toEqual(['hn', 'jobicy', 'rss']);
  });

  it('a profile that asks for design systems gets the tuned config; leave-out rejects a title', () => {
    const plan = planFromBlob(
      v12({
        profiles: [
          {
            titles: ['Design Systems Engineer'],
            mustInclude: ['design system'],
            leaveOut: ['manager'],
          },
        ],
      }),
    );
    expect(plan?.config.slug).toBe('design-systems');
    expect(plan?.config.descriptionSignals).toBe(designSystemsTrack.descriptionSignals);
    const p = { source: 'greenhouse' as const, sourceId: '1', company: 'A', url: 'https://a' };
    expect(
      scorePosting({ ...p, title: 'Design Manager', descriptionText: '' }, plan!.config).verdict,
    ).toBe('reject');
    // Leave-out never turns off the config's own patterns.
    expect(designSystemsTrack.titleNegative).not.toContain(expect.stringContaining('manager'));
  });

  it('any other profile is scored on its own titles, and reads no design systems feed', () => {
    const plan = planFromBlob(
      v12({ profiles: [{ titles: ['Welder', 'Sheet metal fabricator'], related: ['Fitter'] }] }),
    );
    expect(plan?.config.slug).toBe('profile');
    expect(plan?.feeds.has('rss')).toBe(false);
    const p = { source: 'lever' as const, sourceId: '1', company: 'A', url: 'https://a' };
    expect(
      scorePosting({ ...p, title: 'Senior Welder', descriptionText: '' }, plan!.config).verdict,
    ).toBe('queue');
    expect(
      scorePosting(
        { ...p, title: 'Fitter', descriptionText: 'welder, sheet metal fabricator' },
        plan!.config,
      ).verdict,
    ).toBe('queue');
    expect(
      scorePosting({ ...p, title: 'Accountant', descriptionText: '' }, plan!.config).verdict,
    ).toBe('reject');
  });

  it('nothing to score against (no titles, no design systems) is no plan', () => {
    expect(planFromBlob(v12({ profiles: [{ titles: [] }] }))).toBeNull();
    expect(planFromBlob(v12({ profiles: [] }))).toBeNull();
  });

  it(`caps a user at ${MAX_BOARDS_PER_USER} boards and ${MAX_TERMS_PER_USER} feed terms`, () => {
    const plan = planFromBlob(
      v12({
        profiles: [{ titles: ['Design Systems', 'A b', 'C d', 'E f', 'G h'] }],
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

  it('never takes a slug that could leave the board host', () => {
    const plan = planFromBlob(
      v12({
        sources: [
          { kind: 'recruitee', ref: 'evil.example/x', label: 'x' },
          { kind: 'teamtailor', ref: '../admin', label: 'y' },
          { kind: 'greenhouse', ref: 'javascript:alert(1)', label: 'z' },
        ],
      }),
    );
    expect(plan?.boards).toEqual([]);
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
  const plan = planFromBlob({
    v: 12,
    profiles: [{ titles: ['Design Systems Engineer', 'Design Technologist'] }],
    sources: [{ kind: 'feed', ref: 'jobicy', muted: true }],
  })!;
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
    ];
    expect(feedReadsFor(plan, reads).map((r) => `${r.board}:${r.term ?? ''}`)).toEqual([
      'hn:Design Systems Engineer',
      'rss:',
    ]);
  });

  it('a feed whose run left out one of my titles, or failed on one, is not answered', () => {
    const both = [read('hn', 'design systems engineer'), read('hn', 'Design Technologist')];
    expect(answeredFeeds(plan, both)).toEqual(['hn']);
    // The per-run cap kept only one of the two titles.
    expect(answeredFeeds(plan, both.slice(0, 1))).toEqual([]);
    expect(answeredFeeds(plan, [both[0], read('hn', 'Design Technologist', false)])).toEqual([]);
    expect(answeredFeeds(plan, [read('rss', undefined)])).toEqual(['rss']);
    expect(answeredFeeds(plan, [read('rss', undefined, false)])).toEqual([]);
  });
});
