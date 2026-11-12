import { describe, expect, it } from 'vitest';
import { dedupeRoles, normCompany, normTitle, roleKey } from './roleKey.ts';
import { dedupe, fingerprint, type NormalizedPosting } from './score.ts';

describe('roleKey (#576 item 9)', () => {
  it('normalises company suffixes, "the", punctuation and case', () => {
    for (const c of ['Acme, Inc.', 'ACME LLC', 'The Acme Company', 'acme ltd', 'Acme GmbH', 'Acme'])
      expect(normCompany(c)).toBe('acme');
    expect(normCompany('Procter & Gamble Co.')).toBe('procter and gamble');
  });

  it('strips a legal suffix only at the end of the name (#670)', () => {
    for (const [name, want] of [
      ['Co Design', 'co design'],
      ['AB Tasty', 'ab tasty'],
      ['Acme AS', 'acme'],
      ['Foo GmbH', 'foo'],
      ['The Co', 'co'],
      ['SA Power Networks', 'sa power networks'],
      ['Acme Holdings Ltd.', 'acme'],
    ])
      expect(normCompany(name), name).toBe(want);
  });
  it('spells out abbreviations and keeps seniority', () => {
    expect(normTitle('Sr. Design Systems Eng')).toBe('senior design systems engineer');
    expect(normTitle('Senior  Design-Systems Engineer')).toBe('senior design systems engineer');
    expect(normTitle('Staff Design System Engineer')).toBe('staff design systems engineer');
    expect(roleKey({ company: 'Acme', title: 'Senior Design Systems Engineer' })).not.toBe(
      roleKey({ company: 'Acme', title: 'Staff Design Systems Engineer' }),
    );
    expect(roleKey({ company: '', title: 'Designer' })).toBe('');
  });
});

describe('dedupeRoles', () => {
  const p = (source: string, company: string, title: string, location = 'Remote') => ({
    source,
    company,
    title,
    location,
  });
  it('keeps the company board copy over HN, Remotive, WWR, designsystems.jobs and aggregators', () => {
    const out = dedupeRoles(
      [
        p('hn', 'Acme Inc', 'Sr Design Systems Engineer', 'Remote (US)'),
        p('remotive', 'acme', 'Senior Design Systems Engineer', 'USA'),
        p('wwr', 'The Acme Company', 'Senior Design Systems Engineer'),
        p('rss', 'Acme', 'Senior Design Systems Engineer'),
        p('adzuna', 'ACME LLC', 'Senior Design-Systems Engineer'),
        p('greenhouse', 'Acme', 'Senior Design Systems Engineer', 'Remote - US'),
      ],
      (x) => x.source,
    );
    expect(out.map((x) => x.source)).toEqual(['greenhouse']);
  });
  it('never merges distinct roles or companies', () => {
    const out = dedupeRoles(
      [
        p('greenhouse', 'Acme', 'Senior Design Systems Engineer'),
        p('greenhouse', 'Acme', 'Staff Design Systems Engineer'),
        p('lever', 'Globex', 'Senior Design Systems Engineer'),
        p('hn', '', 'Senior Design Systems Engineer'),
        p('hn', '', 'Senior Design Systems Engineer'),
      ],
      (x) => x.source,
    );
    expect(out).toHaveLength(5);
  });
  it('keeps one board’s reqs in two places, merges a re-post in the same place', () => {
    const out = dedupeRoles(
      [
        p('greenhouse', 'Acme', 'Design Engineer', 'New York'),
        p('greenhouse', 'Acme', 'Design Engineer', 'London'),
        p('hn', 'Acme', 'Design Engineer', 'NYC'),
        p('hn', 'Globex', 'Design Engineer', 'Remote'),
        p('hn', 'Globex', 'Design Engineer', 'Remote'),
      ],
      (x) => x.source,
    );
    expect(out.map((x) => `${x.source}:${x.company}:${x.location}`)).toEqual([
      'greenhouse:Acme:New York',
      'greenhouse:Acme:London',
      'hn:Globex:Remote',
    ]);
  });
});

describe('the Skip fingerprint is unchanged (decided is stored by it)', () => {
  it('reads as before, so saved Skips still match', () => {
    expect(fingerprint({ company: 'Acme', title: 'Senior Design Systems Engineer' })).toBe(
      'acme::design systems engineer',
    );
  });
  it('the server dedupe now keeps Senior and Staff apart', () => {
    const base = { url: 'https://x', descriptionText: '' } as unknown as NormalizedPosting;
    const out = dedupe([
      {
        ...base,
        source: 'greenhouse',
        sourceId: '1',
        company: 'Acme',
        title: 'Senior Design Systems Engineer',
      },
      {
        ...base,
        source: 'greenhouse',
        sourceId: '2',
        company: 'Acme',
        title: 'Staff Design Systems Engineer',
      },
      {
        ...base,
        source: 'hn',
        sourceId: '3',
        company: 'Acme Inc',
        title: 'Sr. Design Systems Engineer',
      },
    ] as NormalizedPosting[]);
    expect(out.map((x) => x.sourceId)).toEqual(['1', '2']);
  });
});
