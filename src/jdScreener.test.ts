import { describe, expect, it } from 'vitest';
import { screenJd } from './jdScreener';

describe('screenJd — blockers', () => {
  const cases: { name: string; jd: string; has: string[]; hasNot?: string[] }[] = [
    { name: 'plain SQL', jd: 'Must write SQL queries daily.', has: ['sql'] },
    { name: 'T-SQL', jd: 'Experience with T-SQL required.', has: ['sql'] },
    { name: 'PostgreSQL is not a SQL flag', jd: 'PostgreSQL/JSONB a plus.', has: [], hasNot: ['sql'] },
    {
      name: 'Sales Engineer title → coding_loop',
      jd: 'Sales Engineer role, client facing.',
      has: ['coding_loop'],
    },
    {
      name: 'coding assessment → coding_loop',
      jd: 'The loop includes a take-home code exercise.',
      has: ['coding_loop'],
    },
    {
      name: 'config/discovery exercises are NOT coding_loop',
      jd: 'A configuration exercise and a mock discovery call, plus an Excel data exercise.',
      has: [],
      hasNot: ['coding_loop'],
    },
    {
      name: '3+ years in implementation → titled_years',
      jd: 'Requires 5+ years of implementation experience.',
      has: ['titled_years'],
    },
    {
      name: 'years OR trades industry → NOT titled_years',
      jd: '3 years in implementation OR equivalent trades industry experience.',
      has: [],
      hasNot: ['titled_years'],
    },
    {
      name: '2 years is below the bar',
      jd: '2 years of onboarding experience preferred.',
      has: [],
      hasNot: ['titled_years'],
    },
    {
      name: 'active clearance → clearance',
      jd: 'An active security clearance is required.',
      has: ['clearance'],
    },
    {
      name: 'degree required → degree',
      jd: "Bachelor's degree required.",
      has: ['degree'],
    },
    {
      name: 'degree or equivalent → NOT degree',
      jd: "Bachelor's degree required, or equivalent experience.",
      has: [],
      hasNot: ['degree'],
    },
    {
      name: 'certification required → cert (soft)',
      jd: 'PMP certification required.',
      has: ['cert'],
    },
    {
      name: 'certification preferred → NOT cert',
      jd: 'PMP certification preferred.',
      has: [],
      hasNot: ['cert'],
    },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const { blockers } = screenJd(c.jd);
      for (const b of c.has) expect(blockers).toContain(b);
      for (const b of c.hasNot ?? []) expect(blockers).not.toContain(b);
    });
  }
});

describe('screenJd — mode & travel', () => {
  it('hybrid wins when present', () => expect(screenJd('Hybrid, 3 days in office.').mode).toBe('hybrid'));
  it('on-site', () => expect(screenJd('This is an on-site role in Chicago.').mode).toBe('onsite'));
  it('fully remote', () => expect(screenJd('Fully remote, US-based.').mode).toBe('remote'));
  it('no mode signal → undefined', () => expect(screenJd('Great team, great mission.').mode).toBeUndefined());
  it('parses travel %', () => expect(screenJd('Up to 25% travel required.').travelPct).toBe(25));
  it('no travel → undefined', () => expect(screenJd('No travel.').travelPct).toBeUndefined());
});

describe('screenJd — verdict follows blockers', () => {
  it('no blockers → match', () => expect(screenJd('Client-facing implementation role, remote.').verdict).toBe('match'));
  it('only soft blocker (cert) → stretch', () =>
    expect(screenJd('PMP certification required. Remote.').verdict).toBe('stretch'));
  it('hard blocker (sql) → reach', () => expect(screenJd('Must write SQL.').verdict).toBe('reach'));
  it('empty input → empty match screen', () => {
    const s = screenJd('');
    expect(s.blockers).toEqual([]);
    expect(s.verdict).toBe('match');
    expect(s.mode).toBeUndefined();
  });
});
