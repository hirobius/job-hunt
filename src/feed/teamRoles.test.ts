import { describe, expect, it } from 'vitest';
import { createLimiter } from './probe';
import { FetchError, type FetchJson } from './sources/http';
import {
  matchRoles,
  newSince,
  foldRolesState,
  orderTeams,
  readRoles,
  teamStatus,
  type Role,
  type RolesState,
  type TeamStatus,
} from './teamRoles';
import type { Posting } from './types';

const post = (id: string, title: string, text = ''): Posting => ({
  id,
  source: 'lever',
  title,
  company: 'Acme',
  url: `https://jobs.lever.co/acme/${id}`,
  location: '',
  text,
});
const NOW = Date.parse('2026-10-17T00:00:00Z');

describe('matchRoles', () => {
  const postings = [
    post('a', 'Design Systems Engineer'),
    post('b', 'Backend Engineer', 'You will build our design system tokens.'),
    post('c', 'System Design Interviewer'),
    post('d', 'Product Designer'),
  ];
  it.each([
    ['one term, phrase only, title beats body', ['design system'], ['a', 'b']],
    ['several terms, one row per opening', ['design system', 'designer'], ['a', 'd', 'b']],
    ['no terms match nothing', [], []],
    ['blank terms are skipped', ['  '], []],
  ])('%s', (_n, terms, want) => {
    expect(matchRoles(postings, terms, NOW).map((r) => r.id)).toEqual(want);
  });
  it('a design-systems track ranks design-systems roles first, then product design, engineering last', () => {
    // Ashby's board, as Adrian saw it: "Design Engineer" led the list on score.
    const ashby = [
      post('de', 'Design Engineer - Americas/Canada/EU'),
      post('fe', 'Frontend Engineer, Design Systems'),
      post('pd', 'Product Designer', 'Help shape our design engineer tooling.'),
      post('ds', 'Product Designer – Design Systems'),
    ];
    const terms = ['design systems', 'design engineer', 'product designer'];
    expect(matchRoles(ashby, terms, NOW).map((r) => r.id)).toEqual(['ds', 'pd', 'de', 'fe']);
  });
  it('another track keeps score order', () => {
    // On a design-systems track the designer would lead; here the title hit does.
    const roles = [
      post('d', 'Product Designer', 'Works with a welder.'),
      post('e', 'Welder Engineer'),
    ];
    expect(matchRoles(roles, ['welder'], NOW).map((r) => r.id)).toEqual(['e', 'd']);
  });
  it('keeps the term each role matched', () => {
    const [r] = matchRoles([post('a', 'Designer')], ['engineer', 'designer'], NOW);
    expect(r.term).toBe('designer');
  });
});

describe('readRoles', () => {
  const board = { kind: 'lever' as const, slug: 'acme' };
  const leverJob = (id: string, text: string) => ({
    id,
    text,
    hostedUrl: `https://jobs.lever.co/acme/${id}`,
    categories: {},
  });
  it.each<[string, FetchJson, RolesState['state'], number?]>([
    [
      'a live board',
      async () => [leverJob('1', 'Design Engineer'), leverJob('2', 'Sales')],
      'ok',
      1,
    ],
    ['a 404 board', async (u) => Promise.reject(new FetchError(404, u)), 'unknown'],
    ['offline', async (u) => Promise.reject(new FetchError(0, u)), 'unknown'],
    ['a shape we cannot read', async () => ({ nope: true }), 'ok', 0],
  ])('%s', async (_n, fetchJson, want, roles) => {
    const r = await readRoles(board, ['design engineer'], { fetchJson, now: NOW });
    expect(r.state).toBe(want);
    if (r.state === 'ok') expect(r.roles).toHaveLength(roles!);
  });
  it('asks for a fresh copy when told to', async () => {
    const asked: unknown[] = [];
    await readRoles(board, ['x'], {
      fetchJson: async (_u, o) => (asked.push(o), []),
      fresh: true,
    });
    expect(asked).toEqual([{ fresh: true }]);
  });
  it('a 429 counts against the host on the shared limiter', async () => {
    const limiter = createLimiter({ gapMs: 0 });
    const fetchJson: FetchJson = async (u) => Promise.reject(new FetchError(429, u));
    for (let i = 0; i < 3; i++) await readRoles(board, ['x'], { fetchJson, limiter });
    expect(limiter.isStopped('lever.co')).toBe(true);
  });
});

describe('teamStatus', () => {
  const board = { kind: 'ashby' as const, slug: 'a' };
  const ok = (n: number): RolesState => ({
    state: 'ok',
    roles: Array.from({ length: n }, () => ({}) as Role),
    total: 5,
  });
  it.each<[string, Parameters<typeof teamStatus>[0], TeamStatus]>([
    ['no board, checked', {}, 'none'],
    ['no board, check got no answer', { boardCheck: 'unknown' }, 'unknown'],
    ['not looked up yet', { boardCheck: 'unchecked' }, 'unchecked'],
    ['board, not read yet', { board }, 'loading'],
    ['board, reading', { board, roles: { state: 'loading' } }, 'loading'],
    ['board, read failed', { board, roles: { state: 'unknown' } }, 'unknown'],
    ['board, no matching role', { board, roles: ok(0) }, 'quiet'],
    ['board, matching roles', { board, roles: ok(2) }, 'hiring'],
  ])('%s', (_n, t, want) => expect(teamStatus(t)).toBe(want));
});

describe('orderTeams', () => {
  const teams: [string, TeamStatus, number][] = [
    ['quiet', 'quiet', 0],
    ['few', 'hiring', 1],
    ['none', 'none', 0],
    ['unknown', 'unknown', 0],
    ['many', 'hiring', 4],
    ['later', 'unchecked', 0],
    ['loading', 'loading', 0],
  ];
  const info = (t: (typeof teams)[number]) => ({ status: t[1], count: t[2] });
  it.each([
    [
      'all, open roles first',
      false,
      ['many', 'few', 'loading', 'unknown', 'quiet', 'none', 'later'],
    ],
    ['hiring now: unknown and loading stay', true, ['many', 'few', 'loading', 'unknown']],
  ])('%s', (_n, hiringOnly, want) => {
    expect(orderTeams(teams, info, hiringOnly).map((t) => t[0])).toEqual(want);
  });
});

describe('newSince', () => {
  const r = (id: string) => ({ id }) as Role;
  it.each([
    ['first check: all new', [], ['a', 'b']],
    ['nothing new', ['a', 'b'], []],
    ['one new', ['a', 'gone'], ['b']],
  ])('%s', (_n, seen, want) => {
    expect(newSince([r('a'), r('b')], seen).map((x) => x.id)).toEqual(want);
  });
});

describe('foldRolesState', () => {
  const roles = matchRoles(
    [post('de', 'Design Engineer'), post('ds', 'Design Systems Designer')],
    ['design engineer', 'design systems'],
    NOW,
  );
  const ok: RolesState = { state: 'ok', roles, total: 9 };
  it('folds the engineering-heavy roles out of the count, keeping them for the disclosure', () => {
    const { roles: rs, folded } = foldRolesState(ok, true);
    expect(rs?.state === 'ok' && rs.roles.map((r) => r.id)).toEqual(['ds']);
    expect(folded.map((r) => r.id)).toEqual(['de']);
    expect(teamStatus({ board: { kind: 'lever', slug: 'a' }, roles: rs })).toBe('hiring');
  });
  it('only engineering-heavy roles reads as no matching role', () => {
    const only = { ...ok, roles: roles.filter((r) => r.id === 'de') };
    const { roles: rs } = foldRolesState(only, true);
    expect(teamStatus({ board: { kind: 'lever', slug: 'a' }, roles: rs })).toBe('quiet');
  });
  it('folds nothing when off, and passes other states through', () => {
    expect(foldRolesState(ok, false)).toEqual({ roles: ok, folded: [] });
    expect(foldRolesState({ state: 'unknown' }, true)).toEqual({
      roles: { state: 'unknown' },
      folded: [],
    });
  });
});
