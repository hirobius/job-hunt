// The v11 → v12 move (simplify spec #384/#385). Adrian's hard condition: no loss of job breadth.
// A rich v11 account (three tracks, every board kind, dreams, targets, sweep titles, saved jobs)
// goes through the move, and every board, dream, target and title must come out the other side.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurationState } from './curation/types';
import { getCurationState as getAllCuration, replaceCurationState } from './curation/curationStore';
import { boardsFromUrls, canonicalBoardUrl, parseBoardUrl } from './feed/sources/ats';
import { boardUrlsFor } from './feed/watchlist';
import { sweepFor } from './feed/sweepTitles';
import { readBlob, writeBlob, emptyBlob, mergeBlob, type SyncData } from './syncBlob';
import { replaceAll, getAllJobs } from './store';
import { replaceDreams, getAllDreams } from './feed/dreams';
import { replaceTargets, getAllTargets } from './feed/targets';
import { replaceSweeps, getAllSweeps } from './feed/sweepTitles';
import { replaceMustInclude, getAllMustInclude } from './feed/mustInclude';
import { replaceModes } from './trackModes';
import { replaceEvidence, readEvidence } from './radar/evidenceStore';
import { getAllDocuments } from './documents';
import { getProfile, getProfiles, replaceProfiles, updateProfile } from './profile';
import { getSources, muteSource, sourceKey, sourceBoard, starSource, type Source } from './sources';
import { SAMPLE_TRACK_KEY } from './demo/sampleTrack';
import {
  EVIDENCE_NOTE_ID,
  linksText,
  moveV11,
  profileFromV11,
  runV12Move,
  sourcesFromV11,
  type V11State,
} from './v12Migration';
import type { Job } from './types';

const AT = '2026-10-01T00:00:00.000Z';
const cat = (id: string, label: string, o: Partial<CurationState['categories'][0]> = {}) => ({
  id,
  label,
  titles: [] as string[],
  atsRoles: [] as string[],
  seniority: 'any' as const,
  location: '',
  tailorRole: null,
  sortOrder: 0,
  archived: false,
  createdAt: AT,
  updatedAt: AT,
  ...o,
});
const grp = (id: string, categoryId: string, label: string, archived = false) => ({
  id,
  categoryId,
  label,
  sortOrder: 0,
  archived,
  createdAt: AT,
});
let tileN = 0;
const tile = (groupId: string, name: string, url: string, meta = '') => ({
  id: `t${++tileN}`,
  groupId,
  name,
  url,
  meta,
  sortOrder: tileN,
  createdAt: AT,
});

/** Three tracks: a scored Design Systems track, a busier Trades track, an archived one, and the
 *  device-local Sample track. Boards of all eight kinds, plus links that are not boards. */
const curation: CurationState = {
  categories: [
    cat('ds', 'Design Systems', {
      titles: ['Design Systems Designer', 'Design Technologist'],
      atsRoles: ['design system', 'design technologist'],
      location: 'Spokane, WA',
      seniority: 'experienced',
      sortOrder: 1,
    }),
    cat('trades', 'Sheet Metal & Fab', {
      titles: ['Sheet metal worker', 'Welder', 'Fabricator'],
      atsRoles: ['welder'],
      sortOrder: 0,
    }),
    cat('old', 'Old track', { titles: ['UX Designer'], archived: true, sortOrder: 2 }),
    cat('sample', 'Sample', { titles: ['Sample title'] }),
  ],
  groups: [
    grp('g-ds-watch', 'ds', 'Watched companies'),
    grp('g-ds-apply', 'ds', 'Apply now'),
    grp('g-ds-archived', 'ds', 'Old section', true),
    grp('g-tr-watch', 'trades', 'Watched companies'),
    grp('g-tr-links', 'trades', 'Union JATCs'),
    grp('g-old', 'old', 'Watched companies'),
    grp('g-sample', 'sample', 'Watched companies'),
  ],
  tiles: [
    tile('g-ds-watch', 'Figma jobs', 'https://boards.greenhouse.io/figma'),
    tile('g-ds-watch', 'Ramp jobs', 'https://jobs.ashbyhq.com/ramp'),
    tile('g-ds-watch', 'Spotify jobs', 'https://jobs.eu.lever.co/spotify'),
    tile('g-ds-watch', 'Netflix jobs', 'https://jobs.lever.co/netflix'),
    tile('g-ds-watch', 'Bolt jobs', 'https://apply.workable.com/bolt'),
    tile('g-ds-watch', 'Mollie jobs', 'https://mollie.recruitee.com'),
    tile('g-ds-watch', 'Visa jobs', 'https://jobs.smartrecruiters.com/Visa'),
    tile('g-ds-watch', 'Klarna jobs', 'https://klarna.teamtailor.com/jobs'),
    tile('g-ds-watch', 'Celonis jobs', 'https://celonis.jobs.personio.de'),
    // The same board twice, once as an Apply now link: one Source.
    tile('g-ds-apply', 'Figma careers', 'https://job-boards.greenhouse.io/figma'),
    tile('g-ds-apply', 'Design systems on LinkedIn', 'https://www.linkedin.com/jobs/search?q=ds'),
    tile('g-ds-archived', 'Gone jobs', 'https://boards.greenhouse.io/gone'),
    tile('g-tr-watch', 'Boeing jobs', 'https://boards.greenhouse.io/boeing'),
    tile('g-tr-watch', 'Figma jobs', 'https://boards.greenhouse.io/Figma'),
    tile('g-tr-links', 'Local 66 JATC', 'https://local66.example.org/apprenticeship', 'Union'),
    tile('g-old', 'Oldco jobs', 'https://jobs.lever.co/oldco'),
    tile('g-sample', 'Sampleco jobs', 'https://boards.greenhouse.io/sampleco'),
  ],
};

const job = (url: string, o: Partial<Job> = {}): Job => ({
  url,
  label: 'A role',
  status: 'Saved',
  ...o,
});

const v11 = (): V11State => ({
  curation,
  sampleTrack: 'sample',
  jobs: [
    job('https://boards.greenhouse.io/stripe/jobs/123', { company: 'Stripe' }),
    job('https://jobs.ashbyhq.com/linear/abc-def', { company: 'Linear', status: 'Applied' }),
    job('https://jobs.lever.co/netflix/xyz'), // already watched: one Source
    job('https://www.indeed.com/viewjob?jk=1'), // not a board
    { ...job('https://boards.greenhouse.io/demoboard/jobs/1'), demo: true } as Job, // sample
  ],
  dreams: {
    ds: [
      {
        key: 'vercel',
        company: 'Vercel',
        board: { kind: 'ashby', slug: 'vercel' },
        website: 'https://vercel.com/',
        seen: ['1'],
        starredAt: AT,
      },
      { key: 'apple', company: 'Apple', website: 'https://apple.com/', seen: [], starredAt: AT },
      // A dream on a board the track already watches: that Source gets the star.
      {
        key: 'ramp',
        company: 'Ramp',
        board: { kind: 'ashby', slug: 'ramp' },
        seen: [],
        starredAt: AT,
      },
    ],
    trades: [{ key: 'nucor', company: 'Nucor', seen: [], starredAt: AT }],
  },
  targets: {
    ds: [
      {
        login: 'Shopify',
        company: 'Shopify',
        repo: 'Shopify/polaris',
        repoUrl: 'https://github.com/Shopify/polaris',
        stars: 5000,
        board: { kind: 'greenhouse', slug: 'shopify' },
        savedAt: AT,
      },
      {
        login: 'adobe',
        company: 'Adobe',
        repo: 'adobe/spectrum-css',
        repoUrl: 'https://github.com/adobe/spectrum-css',
        stars: 1,
        savedAt: AT,
      },
      { login: 'yc:airbnb', company: 'Airbnb', savedAt: AT },
      { login: 'acme-co', company: 'Acme Co', website: 'https://acme.example.org/', savedAt: AT },
    ],
    trades: [
      {
        login: 'lincoln',
        company: 'Lincoln Electric',
        board: { kind: 'workable', slug: 'lincoln' },
        savedAt: AT,
      },
    ],
  },
  sweeps: {
    ds: {
      titles: [
        'Design Systems Designer',
        'Design Technologist',
        'UI Engineer',
        'Staff Product Designer',
      ],
      off: ['UI Engineer'],
    },
    // 14 titles: the two past MAX_SWEEP_ON (12) are stored off by the sweep store.
    trades: {
      titles: Array.from({ length: 14 }, (_, i) => `Trade title ${i + 1}`),
      off: ['Trade title 3'],
    },
  },
  mustInclude: {
    ds: {
      terms: ['design system'],
      atsOff: ['design technologist'],
      relatedOff: ['Design Technologist'],
    },
    trades: { terms: [], atsOff: [] },
  },
  modes: { ds: 'hybrid', trades: 'onsite' },
  evidence: 'Led the Polaris design system migration.',
});

const keys = (list: readonly Source[]) => new Set(list.map(sourceKey));
const boardKey = (url: string) => {
  const b = parseBoardUrl(url)!;
  return sourceKey({ kind: b.kind, ref: b.slug });
};

describe('sourcesFromV11: every board, dream and target, across all tracks', () => {
  const sources = sourcesFromV11(v11());
  const have = keys(sources);
  const by = new Map(sources.map((s) => [sourceKey(s), s]));

  it('keeps every watched board tile of every real track, archived ones muted', () => {
    for (const t of curation.tiles) {
      if (!parseBoardUrl(t.url) || t.groupId === 'g-sample') continue;
      expect(have.has(boardKey(t.url)), t.url).toBe(true);
    }
    expect(by.get('greenhouse:gone')?.muted).toBe(true); // archived section
    expect(by.get('lever:oldco')?.muted).toBe(true); // archived track
    expect(by.get('greenhouse:figma')?.muted).toBeUndefined();
    expect(by.get('lever:spotify')?.eu).toBe(true);
  });

  it('reads more boards than any one track did (the union, never less)', () => {
    const live = sources.filter((s) => sourceBoard(s) && !s.muted).map(sourceKey);
    for (const track of ['ds', 'trades']) {
      const read = boardsFromUrls(boardUrlsFor(track, curation), Infinity).map((b) =>
        sourceKey({ kind: b.kind, ref: b.slug }),
      );
      for (const k of read) expect(live, k).toContain(k);
    }
  });

  it('stars every dream company, with or without a board', () => {
    expect(by.get('ashby:vercel')).toMatchObject({
      star: true,
      label: 'Vercel',
      website: 'https://vercel.com/',
    });
    expect(by.get('company:apple')).toMatchObject({ star: true, website: 'https://apple.com/' });
    expect(by.get('company:nucor')?.star).toBe(true);
    expect(by.get('ashby:ramp')?.star).toBe(true); // was a watched board too: one Source
    expect(sources.filter((s) => sourceKey(s) === 'ashby:ramp')).toHaveLength(1);
  });

  it('keeps every target: its board, GitHub org, YC company or website', () => {
    expect(by.get('greenhouse:shopify')).toMatchObject({
      label: 'Shopify',
      repo: 'Shopify/polaris',
    });
    expect(by.get('github:adobe')).toMatchObject({ repo: 'adobe/spectrum-css', label: 'Adobe' });
    expect(by.get('yc:airbnb')?.label).toBe('Airbnb');
    expect(by.get('company:acme co')?.website).toBe('https://acme.example.org/');
    expect(have.has('workable:lincoln')).toBe(true);
  });

  it("follows the board of every saved job, never the sample's", () => {
    expect(by.get('greenhouse:stripe')?.label).toBe('Stripe');
    expect(by.get('ashby:linear')?.label).toBe('Linear');
    expect(have.has('greenhouse:demoboard')).toBe(false);
    expect(sources.filter((s) => sourceKey(s) === 'lever:netflix')).toHaveLength(1);
  });

  it('leaves the device-local Sample track out', () => {
    expect(have.has('greenhouse:sampleco')).toBe(false);
  });

  it('adds the keyless feeds the browser reads today, and the RSS feed for a scored track', () => {
    for (const ref of ['hn', 'remotive', 'jobicy', 'designsystems-rss'])
      expect(have.has(`feed:${ref}`), ref).toBe(true);
    expect(have.has('feed:remoteok')).toBe(false); // off in SOURCE_ENABLED
  });

  it('counts: nothing dropped, nothing doubled', () => {
    expect(sources.length).toBe(have.size);
    // 9 DS boards + gone + boeing + oldco · dreams vercel/apple/nucor · targets shopify/adobe/
    // airbnb/acme/lincoln · jobs stripe/linear · 4 feeds.
    expect(sources.length).toBe(12 + 3 + 5 + 2 + 4);
  });
});

describe('profileFromV11', () => {
  it('takes the scored track over a busier one, with its settings', () => {
    const p = profileFromV11(v11(), AT)!;
    expect(p).toMatchObject({
      id: 'main',
      label: 'Design Systems',
      fromTrack: 'ds',
      scorer: 'design-systems',
      location: 'Spokane, WA',
      mode: 'hybrid',
      level: 'experienced',
      include: { terms: ['design system'], relatedOff: ['Design Technologist'] },
    });
  });

  it('keeps every sweep and track title of every real track, with its on/off', () => {
    const s = v11();
    const p = profileFromV11(s, AT)!;
    const titles = new Set(p.titles.map((t) => t.toLowerCase()));
    const off = new Set(p.titlesOff.map((t) => t.toLowerCase()));
    for (const id of ['ds', 'trades', 'old']) {
      const c = curation.categories.find((x) => x.id === id)!;
      const sw = sweepFor(s.sweeps, id, c.titles.length ? c.titles : c.atsRoles);
      for (const t of [...sw.titles, ...c.titles])
        expect(titles.has(t.toLowerCase()), t).toBe(true);
      for (const t of sw.off) expect(off.has(t.toLowerCase()), `${t} off`).toBe(true);
    }
    expect(titles.has('sample title')).toBe(false);
    // The scored track's own titles lead, in their order.
    expect(p.titles.slice(0, 4)).toEqual(s.sweeps.ds.titles);
    expect(off.has('ui engineer')).toBe(true);
    expect(off.has('design technologist')).toBe(false);
  });

  it('comes in off what v11 did not search: past 12 on, or taken off a stored sweep', () => {
    const s = v11();
    s.sweeps.ds = {
      titles: Array.from({ length: 15 }, (_, i) => `DS title ${i + 1}`), // stored all on
      off: [],
    };
    const p = profileFromV11(s, AT)!;
    const off = new Set(p.titlesOff);
    expect(off.has('DS title 12')).toBe(false);
    expect(['DS title 13', 'DS title 14', 'DS title 15'].every((t) => off.has(t))).toBe(true);
    // The track's own titles are no longer on its stored sweep: kept, off.
    expect(p.titles).toContain('Design Systems Designer');
    expect(off.has('Design Systems Designer')).toBe(true);
  });

  it('keeps every ATS role and the ones switched off', () => {
    const p = profileFromV11(v11(), AT)!;
    expect(p.atsRoles).toEqual(['design system', 'design technologist', 'welder']);
    expect(p.atsOff).toEqual(['design technologist']);
  });

  it('with no scored track takes the busiest one (boards + dreams + targets + titles)', () => {
    const s = v11();
    s.mustInclude = {};
    expect(profileFromV11(s, AT)?.fromTrack).toBe('ds'); // 10 boards, 3 dreams, 4 targets, 4 titles
    s.dreams = { trades: s.dreams.trades };
    s.targets = { trades: s.targets.trades };
    expect(profileFromV11(s, AT)?.fromTrack).toBe('trades'); // 14 titles, 2 boards, 1, 1
  });

  it('is null with no real track', () => {
    const s = v11();
    s.curation = { ...curation, categories: curation.categories.filter((c) => c.id === 'sample') };
    expect(profileFromV11(s, AT)).toBeNull();
  });
});

describe('moveV11', () => {
  it('offers the links that are not boards, and only those', () => {
    const { links } = moveV11(v11(), AT);
    expect(links.map((l) => l.url)).toEqual([
      'https://www.linkedin.com/jobs/search?q=ds',
      'https://local66.example.org/apprenticeship',
    ]);
    const text = linksText(links);
    expect(text).toContain('Design Systems');
    expect(text).toContain('Local 66 JATC\nhttps://local66.example.org/apprenticeship');
  });
});

describe('blob v12 round trip', () => {
  it('carries the new fields and still reads every v11 field', () => {
    const s = v11();
    const { profile, sources } = moveV11(s, AT);
    // Read once, so the fixture is in its stored shape (the sweep store caps titles on at 12).
    const before: SyncData = readBlob(
      writeBlob({
        ...emptyBlob(),
        jobs: s.jobs.filter((j) => !(j as Job & { demo?: boolean }).demo),
        dreams: s.dreams,
        targets: s.targets,
        sweeps: s.sweeps,
        mustInclude: s.mustInclude,
        modes: s.modes,
        evidence: s.evidence,
      }),
    );
    const v11Json = JSON.parse(JSON.stringify({ ...writeBlob(before), v: 11 }));
    delete v11Json.profiles;
    delete v11Json.sources;
    delete v11Json.decided;
    const read11 = readBlob(v11Json);
    expect(read11.sourceV).toBe(11);
    for (const f of [
      'jobs',
      'dreams',
      'targets',
      'sweeps',
      'mustInclude',
      'modes',
      'evidence',
    ] as const)
      expect(read11[f], f).toEqual(before[f]);
    expect(read11.sources).toEqual([]);

    const after = { ...read11, profiles: [profile!], sources };
    const back = readBlob(JSON.parse(JSON.stringify(writeBlob(after))));
    expect(back.profiles).toEqual([profile]);
    expect(back.sources).toEqual(sources);
    for (const f of ['jobs', 'dreams', 'targets', 'sweeps', 'mustInclude'] as const)
      expect(back[f], f).toEqual(before[f]);
  });

  it('a v11 cloud copy on a refresh does not wipe this device’s v12 fields', () => {
    const { profile, sources } = moveV11(v11(), AT);
    const local: SyncData = { ...emptyBlob(), profiles: [profile!], sources, sourceV: 12 };
    const cloud = readBlob({ v: 11, jobs: [] });
    const next = mergeBlob(cloud, local, false);
    expect(next.profiles).toEqual([profile]);
    expect(next.sources).toEqual(sources);
  });
});

describe('runV12Move (the stores)', () => {
  const seed = () => {
    const s = v11();
    localStorage.setItem(SAMPLE_TRACK_KEY, JSON.stringify('sample'));
    replaceCurationState(s.curation);
    replaceAll(s.jobs);
    replaceDreams(s.dreams);
    replaceTargets(s.targets);
    replaceSweeps(s.sweeps);
    replaceMustInclude(s.mustInclude);
    replaceModes(s.modes);
    replaceEvidence(s.evidence);
  };
  beforeEach(() => {
    localStorage.clear();
    replaceProfiles([]);
    seed();
  });

  it('writes the profile, the Sources and the evidence note, and leaves v11 stores alone', () => {
    const v11Before = {
      jobs: getAllJobs(),
      dreams: getAllDreams(),
      targets: getAllTargets(),
      sweeps: getAllSweeps(),
      mustInclude: getAllMustInclude(),
      evidence: readEvidence(),
    };
    const out = runV12Move(new Date(AT));
    expect(out.moved).toBe(true);
    expect(out.links).toHaveLength(2);
    expect(getProfile()?.fromTrack).toBe('ds');
    expect(keys(getSources())).toEqual(keys(sourcesFromV11(v11())));
    const notes = getAllDocuments().filter((d) => d.kind === 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0].versions[0].text).toBe(v11().evidence);
    expect({
      jobs: getAllJobs(),
      dreams: getAllDreams(),
      targets: getAllTargets(),
      sweeps: getAllSweeps(),
      mustInclude: getAllMustInclude(),
      evidence: readEvidence(),
    }).toEqual(v11Before);
  });

  it('runs once: a second run moves nothing, keeps edits, adds no second note', () => {
    runV12Move(new Date(AT));
    starSource('greenhouse:boeing', true);
    updateProfile({ location: 'Remote' });
    const out = runV12Move(new Date(AT));
    expect(out.moved).toBe(false);
    expect(getProfile()?.location).toBe('Remote');
    expect(getSources().find((s) => sourceKey(s) === 'greenhouse:boeing')?.star).toBe(true);
    expect(getAllDocuments().filter((d) => d.kind === 'note')).toHaveLength(1);
    expect(getProfiles()).toHaveLength(1);
  });

  it('tops up the Sources an older client adds after the move; titles are no longer topped up', () => {
    runV12Move(new Date(AT));
    replaceDreams({
      ...getAllDreams(),
      ds: [
        ...getAllDreams().ds,
        {
          key: 'notion',
          company: 'Notion',
          board: { kind: 'ashby', slug: 'notion' },
          seen: [],
          starredAt: AT,
        },
      ],
    });
    replaceSweeps({
      ...getAllSweeps(),
      ds: { titles: [...getAllSweeps().ds.titles, 'Design Ops Lead'], off: [] },
    });
    const out = runV12Move(new Date(AT));
    expect(out.moved).toBe(false);
    expect(getSources().find((s) => sourceKey(s) === 'ashby:notion')?.star).toBe(true);
    // #389: no screen adds v11 titles now, and a title removed in the Search profile stays removed.
    expect(getProfile()?.titles).not.toContain('Design Ops Lead');
  });

  it('never switches back a star or mute the person changed', () => {
    runV12Move(new Date(AT));
    starSource('ashby:vercel', false); // was a dream
    muteSource('greenhouse:gone', false); // was on an archived section
    runV12Move(new Date(AT));
    const by = new Map(getSources().map((x) => [sourceKey(x), x]));
    expect(by.get('ashby:vercel')?.star).toBeUndefined();
    expect(by.get('greenhouse:gone')?.muted).toBeUndefined();
  });

  it('lifts a mute the move set once the board is live again; a mute the person set stays', () => {
    runV12Move(new Date(AT));
    const get = (k: string) => getSources().find((x) => sourceKey(x) === k);
    expect(get('greenhouse:gone')).toMatchObject({ muted: true, movedMute: true });
    expect(get('lever:oldco')?.muted).toBe(true);
    muteSource('lever:oldco', false);
    muteSource('lever:oldco', true); // the person's own mute now
    // The section and the old track come back.
    const c = getAllCuration();
    replaceCurationState({
      ...c,
      categories: c.categories.map((x) => (x.id === 'old' ? { ...x, archived: false } : x)),
      groups: c.groups.map((g) => (g.id === 'g-ds-archived' ? { ...g, archived: false } : g)),
    });
    runV12Move(new Date(AT));
    expect(get('greenhouse:gone')?.muted).toBeUndefined();
    expect(get('greenhouse:gone')?.movedMute).toBeUndefined();
    expect(get('lever:oldco')?.muted).toBe(true);
  });

  it('lifts a move mute when the board is watched on a live track', () => {
    runV12Move(new Date(AT));
    const c = getAllCuration();
    replaceCurationState({
      ...c,
      tiles: [...c.tiles, tile('g-tr-watch', 'Gone jobs', 'https://boards.greenhouse.io/gone')],
    });
    runV12Move(new Date(AT));
    expect(getSources().find((x) => sourceKey(x) === 'greenhouse:gone')?.muted).toBeUndefined();
  });

  it('a title removed in the Search profile stays removed', () => {
    runV12Move(new Date(AT));
    const title = getProfile()!.titles[0];
    updateProfile({ titles: getProfile()!.titles.slice(1) });
    runV12Move(new Date(AT));
    expect(getProfile()?.titles).not.toContain(title);
  });

  it('a profile moved from a track with no mode gets remote only, once; a later choice stays', () => {
    replaceModes({});
    runV12Move(new Date(AT));
    expect(getProfile()?.mode).toBe('remote');
    // A profile moved before remote only was the default (read as 'any').
    replaceProfiles([{ ...getProfile()!, mode: 'any', fromTrack: 'ds' }]);
    runV12Move(new Date(AT));
    expect(getProfile()).toMatchObject({ mode: 'remote' });
    expect(getProfile()?.fromTrack).toBeUndefined();
    // The person turns Remote only off (the form drops fromTrack): it stays off.
    updateProfile({ mode: 'any' });
    runV12Move(new Date(AT));
    expect(getProfile()?.mode).toBe('any');
  });

  it('keeps "any" when the track set it on purpose', () => {
    runV12Move(new Date(AT));
    replaceProfiles([{ ...getProfile()!, mode: 'any', fromTrack: 'ds' }]);
    replaceModes({ ds: 'any' });
    runV12Move(new Date(AT));
    expect(getProfile()?.mode).toBe('any');
  });

  it('stars a dream starred after the move on a board already watched, once', () => {
    runV12Move(new Date(AT));
    const get = () => getSources().find((x) => sourceKey(x) === 'greenhouse:boeing');
    expect(get()?.star).toBeUndefined();
    replaceDreams({
      ...getAllDreams(),
      trades: [
        ...getAllDreams().trades,
        {
          key: 'boeing',
          company: 'Boeing',
          board: { kind: 'greenhouse', slug: 'boeing' },
          seen: [],
          starredAt: '2026-10-02T00:00:00.000Z',
        },
      ],
    });
    runV12Move(new Date(AT));
    expect(get()?.star).toBe(true);
    starSource('greenhouse:boeing', false);
    runV12Move(new Date(AT));
    expect(get()?.star).toBeUndefined();
  });

  it('gives the evidence note a fixed id, so two devices keep one', () => {
    runV12Move(new Date(AT));
    expect(getAllDocuments().find((d) => d.kind === 'note')?.id).toBe(EVIDENCE_NOTE_ID);
  });

  it('writes nothing when there is nothing new', () => {
    runV12Move(new Date(AT));
    const raw = localStorage.getItem('rjb_sources');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    runV12Move(new Date(AT));
    expect(set.mock.calls.filter(([k]) => k === 'rjb_sources')).toHaveLength(0);
    expect(localStorage.getItem('rjb_sources')).toBe(raw);
    set.mockRestore();
  });

  it('does nothing with no real track (a first run before onboarding)', () => {
    localStorage.clear();
    replaceCurationState({ categories: [], groups: [], tiles: [] });
    const out = runV12Move(new Date(AT));
    expect(out.moved).toBe(false);
    expect(getProfile()).toBeNull();
    expect(getSources()).toEqual([]);
  });

  it('the board URL of each Source reads back as the same board', () => {
    runV12Move(new Date(AT));
    for (const s of getSources()) {
      const b = sourceBoard(s);
      if (!b) continue;
      const again = parseBoardUrl(canonicalBoardUrl(b))!;
      expect(sourceKey({ kind: again.kind, ref: again.slug })).toBe(sourceKey(s));
      expect(!!again.eu).toBe(!!s.eu);
    }
  });
});
