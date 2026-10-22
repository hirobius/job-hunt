import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  companySourceFor,
  suggestTrackCompanies,
  trackTerms,
  ycMatches,
  YC_HIRING_URL,
  type CompanySource,
  type SuggestReport,
  type SuggestedCompany,
} from './companySource';
import { DESIGN_SYSTEM_SEARCH } from './teamTopics';
import { memoryKv } from './fetchFeed';
import { FetchError, type FetchJson } from './sources/http';
import { boardsForPack, STARTER_PACKS } from '../curation/starterPacks';
import {
  CONSULTING_PACK,
  DESIGN_SYSTEMS_PACK,
  SERVICENOW_PACK,
  TRADES_PACK,
} from '../curation/packContent';

const ON = { github: true, yc: true };

describe('companySourceFor', () => {
  it('keeps the GitHub search where the track names a topic', () => {
    expect(
      companySourceFor({ label: 'Mine', titles: ['Design systems engineer'], atsRoles: [] }, ON),
    ).toEqual({ kind: 'github', search: DESIGN_SYSTEM_SEARCH });
  });

  it('a non-design track never gets GitHub: its starter list and YC, said in one line', () => {
    const s = companySourceFor(
      { label: 'Implementation Consulting', titles: ['Implementation consultant'], atsRoles: [] },
      ON,
    );
    expect(s).toMatchObject({
      kind: 'suggested',
      packLabel: 'Implementation Consulting',
      packBoards: boardsForPack('consulting'),
      yc: true,
      line: 'Suggestions come from the Implementation Consulting starter list and YC companies hiring now. GitHub search only finds design-system and ServiceNow teams.',
    });
  });

  it('a CAD "design engineer" track is not a design-system track (#215 review)', () => {
    for (const title of ['Mechanical design engineer', 'Hardware design engineer'])
      expect(companySourceFor({ label: 'X', titles: [title], atsRoles: [] }, ON).kind).not.toBe(
        'github',
      );
    expect(
      companySourceFor(
        { label: 'Fab shop', titles: ['Sheet metal design engineer'], atsRoles: [] },
        ON,
      ),
    ).toMatchObject({ kind: 'suggested', yc: true });
  });

  it('a physical discipline in the track label rules out the design-system search (#215 review)', () => {
    const cases: [string, string[]][] = [
      ['Mechanical engineering', ['Design engineer', 'Project engineer']],
      ['Mechanical', ['Design engineer']],
      ['Civil', ['Senior design engineer']],
    ];
    for (const [label, titles] of cases)
      expect(companySourceFor({ label, titles, atsRoles: [] }, ON).kind).toBe('suggested');
    expect(
      companySourceFor(
        { label: 'Design Systems / Design Eng', titles: ['Design engineer'], atsRoles: [] },
        ON,
      ),
    ).toEqual({ kind: 'github', search: DESIGN_SYSTEM_SEARCH });
  });

  it('each starter pack, with its own label, titles and roles, gets its source', () => {
    const label = (id: string) => STARTER_PACKS.find((p) => p.id === id)!.label;
    const kindOf = (id: string, c: { titles: readonly string[]; atsRoles: readonly string[] }) => {
      const s = companySourceFor(
        { label: label(id), titles: [...c.titles], atsRoles: [...c.atsRoles] },
        ON,
      );
      return s.kind === 'github' ? s.search.noun : s.kind;
    };
    expect(kindOf('consulting', CONSULTING_PACK)).toBe('suggested');
    expect(kindOf('servicenow', SERVICENOW_PACK)).toBe('ServiceNow');
    expect(kindOf('designsystems', DESIGN_SYSTEMS_PACK)).toBe('design-system');
    expect(kindOf('trades', TRADES_PACK)).toBe('suggested');
  });

  it('a track outside every pack uses YC alone', () => {
    const s = companySourceFor({ label: 'Welding', titles: ['Welder'], atsRoles: [] }, ON);
    expect(s).toMatchObject({ kind: 'suggested', packBoards: [], yc: true });
    expect(s.kind === 'suggested' && s.line).toMatch(
      /^Suggestions come from YC companies hiring now\./,
    );
  });

  it('nothing to suggest from: none', () => {
    expect(
      companySourceFor(
        { label: 'Welding', titles: ['Welder'], atsRoles: [] },
        { github: true, yc: false },
      ),
    ).toEqual({ kind: 'none' });
    expect(
      companySourceFor(
        { label: 'Mine', titles: ['Design engineer'], atsRoles: [] },
        { github: false, yc: true },
      ),
    ).toEqual({ kind: 'none' });
  });
});

describe('trackTerms', () => {
  it('titles then ATS roles, deduped ignoring case', () => {
    expect(trackTerms({ titles: ['Welder', ' Fabricator'], atsRoles: ['welder', ''] })).toEqual([
      'Welder',
      'Fabricator',
    ]);
  });
});

const yc = (name: string, oneLiner: string, extra: Record<string, unknown> = {}) => ({
  name,
  slug: name.toLowerCase(),
  website: `https://${name.toLowerCase()}.example`,
  one_liner: oneLiner,
  tags: [],
  industries: [],
  status: 'Active',
  ...extra,
});

describe('ycMatches', () => {
  const body = [
    yc('Onboardly', 'Implementation consultants for B2B software'),
    yc('Weldbot', 'Robots that weld', { tags: ['Welding'] }),
    yc('Paystack', 'Payments for consultants'),
    yc('Onboardly', 'duplicate'),
  ];
  it('matches the track terms as phrases in the one-liner, tags or industries', () => {
    expect(ycMatches(body, ['Implementation consultant']).map((c) => c.name)).toEqual([
      'Onboardly',
    ]);
    expect(ycMatches(body, ['welding']).map((c) => c.name)).toEqual(['Weldbot']);
  });
  it('no terms or a bad body: nothing', () => {
    expect(ycMatches(body, [])).toEqual([]);
    expect(ycMatches({ nope: 1 }, ['welding'])).toEqual([]);
  });
  it('stops at the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => yc(`Co${i}`, 'welding shop'));
    expect(ycMatches(many, ['welding'], 4)).toHaveLength(4);
  });
});

describe('suggestTrackCompanies', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const source = (over: Partial<Extract<CompanySource, { kind: 'suggested' }>> = {}) =>
    ({
      kind: 'suggested',
      packBoards: ['https://jobs.lever.co/acme', 'https://boards.greenhouse.io/watched'],
      yc: true,
      line: '',
      ...over,
    }) as Extract<CompanySource, { kind: 'suggested' }>;

  const run = async (fetchJson: FetchJson, s = source()) => {
    const report: SuggestReport = { ycMatched: 0 };
    const out: SuggestedCompany[] = [];
    const p = (async () => {
      for await (const c of suggestTrackCompanies(s, {
        fetchJson,
        watched: [{ kind: 'greenhouse', slug: 'watched' }],
        terms: ['implementation consultant'],
        kv: memoryKv(),
        report,
      }))
        out.push(c);
    })();
    await vi.advanceTimersByTimeAsync(600_000);
    await p;
    return { out, report };
  };

  const world: FetchJson = async (url) => {
    if (url === YC_HIRING_URL)
      return [
        yc('Onboardly', 'Implementation consultants on demand'),
        yc('Nobody', 'Implementation consultant marketplace'),
        yc('Flaky', 'Implementation consultant tools'),
        yc('Other', 'Sells shoes'),
      ];
    if (url === 'https://api.lever.co/v0/postings/onboardly?mode=json') return [{}];
    if (url.includes('flaky')) throw new FetchError(503, url);
    throw new FetchError(404, url);
  };

  it('pack boards not yet watched, then matching YC companies with what the probe found', async () => {
    const { out, report } = await run(world);
    expect(out.map((c) => [c.company, c.from, c.board?.slug, c.boardCheck])).toEqual([
      ['Acme', 'pack', 'acme', undefined],
      ['Onboardly', 'yc', 'onboardly', undefined],
      ['Nobody', 'yc', undefined, undefined],
      ['Flaky', 'yc', undefined, 'unknown'],
    ]);
    expect(out[1].website).toBe('https://onboardly.example');
    expect(report).toEqual({ ycMatched: 3 });
  });

  it.each(['javascript:alert(1)', 'data:text/html,x'])(
    'a YC website %j is never a link',
    async (bad) => {
      const evil: FetchJson = async (url) =>
        url === YC_HIRING_URL
          ? [yc('Nobody', 'Implementation consultant marketplace', { website: bad })]
          : world(url);
      const { out } = await run(evil);
      const row = out.find((c) => c.company === 'Nobody')!;
      expect(row.website).toBeUndefined();
    },
  );

  it('a YC list that does not answer keeps the pack rows and says so', async () => {
    const down: FetchJson = async (url) => {
      throw new FetchError(url === YC_HIRING_URL ? 0 : 404, url);
    };
    const { out, report } = await run(down);
    expect(out.map((c) => c.company)).toEqual(['Acme']);
    expect(report.ycDown).toBe(true);
  });

  it('YC off: pack rows only, and the YC list is never read', async () => {
    const fetchJson = vi.fn(world);
    const { out } = await run(fetchJson, source({ yc: false }));
    expect(out.map((c) => c.company)).toEqual(['Acme']);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
