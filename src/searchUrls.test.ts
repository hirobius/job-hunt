// Every generated search URL in Discover, table-tested (audit 2026-10-27): the big boards for each
// work mode, the "All selected" OR clause, awkward characters in titles and places, and Google's
// 32-word cap on the hiring-system queries.
import { describe, expect, it } from 'vitest';
import {
  ATS,
  BOARDS,
  CONTRACT_CLAUSE,
  HIDDEN_BOARDS,
  atsSearchUrl,
  boardsFor,
  modeNote,
  searchAllCount,
  searchAllUrl,
  titleClause,
  type HiddenQuery,
  type WorkMode,
} from './jobsData';

const q = (url: string) => new URL(url).searchParams.get('q') ?? '';
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const board = (name: string) => BOARDS.find((b) => b.name === name)!;

// Twelve ticked titles (the most the title filter allows on at once).
const TWELVE = [
  'Sheet Metal Mechanic',
  'Sheet Metal Worker',
  'Sheet Metal Fabricator',
  'Metal Fabricator',
  'Welder-Fabricator',
  'Fabricator',
  'MIG Welder',
  'TIG Welder',
  'Structural Welder',
  'Press Brake Operator',
  'CNC Machinist',
  'Machine Operator',
];

describe('titleClause (the "All selected" OR clause)', () => {
  it.each([
    [['Welder'], '"Welder"'],
    [['Welder', 'Fabricator'], '("Welder" OR "Fabricator")'],
    [['  Welder  ', 'Fabricator'], '("Welder" OR "Fabricator")'],
    // A stray quote in a typed title would end the phrase early and break the whole query.
    [['Senior "UX" Designer'], '"Senior UX Designer"'],
    // Blank and repeated titles add nothing but words against Google's cap.
    [['Welder', '', '  '], '"Welder"'],
    [['Welder', 'welder', 'Fabricator'], '("Welder" OR "Fabricator")'],
    [[], '""'],
  ])('%j → %s', (titles, expected) => {
    expect(titleClause(titles)).toBe(expected);
  });
});

describe('big job boards for each work mode', () => {
  const term = titleClause(['R&D Technician', 'C++ Developer']);
  const where = 'Spokane, WA #2';
  type Row = [string, WorkMode, string];
  const rows: Row[] = [
    [
      'Indeed',
      'any',
      'https://www.indeed.com/jobs?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)&l=Spokane%2C%20WA%20%232',
    ],
    [
      'Indeed',
      'remote',
      'https://www.indeed.com/jobs?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)&l=Remote',
    ],
    [
      'LinkedIn',
      'hybrid',
      'https://www.linkedin.com/jobs/search/?keywords=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)&location=Spokane%2C%20WA%20%232&f_WT=3',
    ],
    [
      'LinkedIn',
      'onsite',
      'https://www.linkedin.com/jobs/search/?keywords=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)&location=Spokane%2C%20WA%20%232&f_WT=1',
    ],
    [
      'ZipRecruiter',
      'remote',
      'https://www.ziprecruiter.com/jobs-search?search=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)&location=Remote',
    ],
    [
      'Google Jobs',
      'any',
      'https://www.google.com/search?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)%20Spokane%2C%20WA%20%232&ibp=htl;jobs',
    ],
    [
      'Snagajob',
      'onsite',
      'https://www.snagajob.com/search?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)&w=Spokane%2C%20WA%20%232',
    ],
    [
      'Remote Rocketship',
      'remote',
      'https://www.remoterocketship.com/?sort=DateAdded&jobTitle=R%26D%20Technician',
    ],
    // #355: Hybrid reaches every board, not only LinkedIn: a `hybrid` keyword where the board has
    // no hybrid filter of its own. On-site has no keyword (it would hide most on-site roles).
    [
      'Indeed',
      'hybrid',
      'https://www.indeed.com/jobs?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)%20hybrid&l=Spokane%2C%20WA%20%232',
    ],
    [
      'Indeed',
      'onsite',
      'https://www.indeed.com/jobs?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)&l=Spokane%2C%20WA%20%232',
    ],
    [
      'ZipRecruiter',
      'hybrid',
      'https://www.ziprecruiter.com/jobs-search?search=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)%20hybrid&location=Spokane%2C%20WA%20%232',
    ],
    [
      'Google Jobs',
      'hybrid',
      'https://www.google.com/search?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)%20hybrid%20Spokane%2C%20WA%20%232&ibp=htl;jobs',
    ],
    [
      'Google Jobs',
      'remote',
      'https://www.google.com/search?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)%20remote&ibp=htl;jobs',
    ],
    [
      'Snagajob',
      'hybrid',
      'https://www.snagajob.com/search?q=(%22R%26D%20Technician%22%20OR%20%22C%2B%2B%20Developer%22)%20hybrid&w=Spokane%2C%20WA%20%232',
    ],
  ];
  it.each(rows)('%s (%s)', (name, mode, expected) => {
    const url = board(name).build(term, { where, mode });
    expect(url).toBe(expected);
    // Every one parses as a URL, and the place never leaks into another param.
    expect(() => new URL(url)).not.toThrow();
  });

  it('says on the row when a board cannot filter the work mode', () => {
    const note = (name: string, m: WorkMode) => modeNote(board(name), m);
    expect(note('LinkedIn', 'onsite')).toBe('');
    expect(note('LinkedIn', 'hybrid')).toBe('');
    for (const name of ['Indeed', 'ZipRecruiter', 'Google Jobs', 'Snagajob']) {
      expect(note(name, 'any'), name).toBe('');
      expect(note(name, 'remote'), name).toBe('');
      expect(note(name, 'hybrid'), name).toBe('');
      expect(note(name, 'onsite'), name).toBe('On-site not filtered');
    }
  });

  it('shows Remote Rocketship only for Remote and Any', () => {
    const names = (m: WorkMode) => boardsFor(m).map((b) => b.name);
    expect(names('remote')).toContain('Remote Rocketship');
    expect(names('any')).toContain('Remote Rocketship');
    expect(names('hybrid')).not.toContain('Remote Rocketship');
    expect(names('onsite')).not.toContain('Remote Rocketship');
  });
});

describe('hiring-system queries under Google’s 32-word cap', () => {
  const many: HiddenQuery = {
    role: TWELVE[0],
    roles: TWELVE,
    entry: true,
    where: 'Spokane, WA',
    mode: 'any',
    contract: true,
  };

  it('keeps one system’s query within 32 words, so the place and contract clause still count', () => {
    for (const a of ATS) {
      const query = q(atsSearchUrl(a.site, many));
      expect(words(query), a.name).toBeLessThanOrEqual(32);
      // Google drops words past the 32nd: the place and Contract only come last, so they went first.
      expect(query, a.name).toContain('"Spokane, WA"');
      expect(query, a.name).toContain(CONTRACT_CLAUSE);
      expect(query, a.name).toContain(`"${TWELVE[0]}"`);
    }
  });

  it('keeps every hidden board row within 32 words too', () => {
    for (const b of HIDDEN_BOARDS.filter((r) => !r.href))
      expect(words(q(atsSearchUrl(b.site, many))), b.name).toBeLessThanOrEqual(32);
  });

  it('never builds an empty site group: Search all drops titles until a system fits', () => {
    const query = q(searchAllUrl(ATS, many));
    expect(query).not.toContain('()');
    expect(words(query)).toBeLessThanOrEqual(32);
    expect(searchAllCount(ATS, many)).toBeGreaterThan(0);
    expect(query).toContain('"Spokane, WA"');
  });

  // #355: Hybrid adds `hybrid` after the place, counted against the cap like the rest.
  it('adds hybrid to the hiring-system and hidden-board queries, within the cap', () => {
    const hybrid: HiddenQuery = { ...many, mode: 'hybrid' };
    for (const a of ATS) {
      const query = q(atsSearchUrl(a.site, hybrid));
      expect(words(query), a.name).toBeLessThanOrEqual(32);
      expect(query, a.name).toContain('"Spokane, WA" hybrid');
      expect(query, a.name).toContain(CONTRACT_CLAUSE);
    }
    expect(q(searchAllUrl(HIDDEN_BOARDS, hybrid))).toContain('"Spokane, WA" hybrid');
    expect(
      q(atsSearchUrl('site:jobs.lever.co', { role: 'Welder', where: '', mode: 'hybrid' })),
    ).toBe('site:jobs.lever.co "Welder" hybrid');
    // On-site and Any search the place only.
    expect(q(atsSearchUrl('site:jobs.lever.co', { ...many, mode: 'onsite' }))).not.toContain(
      'hybrid',
    );
  });

  it('leaves a query that already fits alone', () => {
    const o: HiddenQuery = {
      role: 'Welder',
      roles: ['Welder', 'Fabricator'],
      where: '',
      mode: 'remote',
    };
    expect(q(atsSearchUrl('site:jobs.lever.co', o))).toBe(
      'site:jobs.lever.co ("Welder" OR "Fabricator") remote',
    );
  });
});
