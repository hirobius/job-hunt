import { describe, expect, it } from 'vitest';
import { detectSignals, inferMode, matchTerm, rankPostings, snippetAround } from './match';
import type { Posting } from './types';

const NOW = Date.parse('2026-10-12T00:00:00Z');

const post = (over: Partial<Posting>): Posting => ({
  id: 'hn:1',
  source: 'hn',
  title: 'Senior Engineer',
  company: 'Acme',
  url: 'https://example.com/1',
  location: '',
  text: '',
  ...over,
});

describe('matchTerm', () => {
  it.each([
    // [term, title, text, expected]
    ['design systems', 'Design Systems Engineer', '', 'title'],
    ['design systems', 'Engineer', 'You will own our design system.', 'text'],
    ['design system', 'Engineer', 'Build our Design Systems team', 'text'],
    ['design systems', 'Engineer', 'design\nsystem work', 'text'],
    ['design systems', 'Engineer', 'Strong system design skills required', null],
    ['design systems', 'Engineer', 'redesign systematically', null],
    ['UI engineer', 'Senior UI Engineer', '', 'title'],
    ['UI engineer', 'GUI Engineer', '', null],
    ['component library', 'Engineer', 'own the component-library roadmap', 'text'],
    ['component library', 'Engineer', 'Own our component libraries', 'text'],
    ['component libraries', 'Engineer', 'Own the component library', 'text'],
    ['first design systems engineer', 'Engineer', 'our first design system engineer', 'text'],
    ['status page', 'Engineer', 'the statu page', null],
    ['', 'Anything', 'anything', null],
  ] as const)('%s in (%s | %s) → %s', (term, title, text, expected) => {
    expect(matchTerm(post({ title, text }), term)).toBe(expected);
  });
});

describe('detectSignals', () => {
  it.each([
    ['Open to contract or full-time', ['contract']],
    ['1099 CONTRACT, 6 months', ['contract']],
    ['fractional design systems lead', ['contract']],
    ['Freelancers welcome', ['contract']],
    ['part-time, 20h/week', ['contract']],
    ['Founding Design Engineer', ['founding']],
    ['our first design systems hire', ['founding']],
    ['first frontend engineer on the team', ['founding']],
    ['Founding engineer, contract-to-hire', ['contract', 'founding']],
    ['first-ever design systems engineer', ['founding']],
    ['our first design-systems engineer', ['founding']],
    ['be our first design system owner', ['founding']],
    ['build our component library from scratch', ['founding']],
    ['join as a founding member of the team', ['founding']],
    ['W2 only, no contract or C2C', []],
    ['No recruiters, contract or full-time welcome', ['contract']],
    ['This is not a part-time role', []],
    ['Review the employment contract before day one', []],
    ['vendor contract terms', []],
    ['Contract Manager, Legal', []],
    ['since our founding in 2015', []],
    ['Full-time, benefits, 401k', []],
    ['first-class developer experience', []],
    ['the contractor portal team (full-time)', []],
  ] as const)('%s → %j', (text, ids) => {
    expect(detectSignals(text).map((s) => s.id)).toEqual(ids);
  });

  it('keeps the matched words as evidence', () => {
    expect(detectSignals('Happy to do Contract work')[0].evidence).toBe('Contract');
    expect(detectSignals('first   frontend\nengineer')[0].evidence).toBe('first frontend engineer');
  });
});

describe('inferMode', () => {
  it.each([
    ['San Francisco | ONSITE | Full-time', 'onsite'],
    ['NYC (Hybrid)', 'hybrid'],
    ['REMOTE (US)', 'remote'],
    ['Remote, US only', 'remote'],
    ['on-site in Austin', 'onsite'],
    ['Berlin', undefined],
    // Several modes named → can't say; leave it to the user.
    ['ONSITE or REMOTE', undefined],
  ] as const)('%s → %s', (text, mode) => {
    expect(inferMode(text)).toBe(mode);
  });
});

describe('snippetAround', () => {
  it('centres on the first hit and marks truncation', () => {
    const text = 'x'.repeat(300) + ' we need a design system owner ' + 'y'.repeat(300);
    const s = snippetAround(text, 'design systems', 120);
    expect(s).toContain('design system');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(122);
  });
  it('falls back to the head of the text when the term is only in the title', () => {
    expect(snippetAround('Short body.', 'design systems', 120)).toBe('Short body.');
  });
});

describe('rankPostings', () => {
  const opts = { term: 'design systems', where: '', mode: 'any' as const, now: NOW };

  it('drops postings that never mention the term', () => {
    const out = rankPostings([post({ id: 'a', text: 'backend only' })], opts);
    expect(out).toEqual([]);
  });

  it('ranks a title hit above a body mention', () => {
    const out = rankPostings(
      [
        post({ id: 'body', url: 'https://x/1', text: 'touches the design system' }),
        post({ id: 'title', url: 'https://x/2', title: 'Design Systems Engineer' }),
      ],
      opts,
    );
    expect(out.map((p) => p.id)).toEqual(['title', 'body']);
    expect(out[0].hit).toBe('title');
  });

  it('boosts contract-friendly and founding roles', () => {
    const out = rankPostings(
      [
        post({ id: 'plain', url: 'https://x/1', text: 'design system work' }),
        post({ id: 'contract', url: 'https://x/2', text: 'design system work, contract ok' }),
      ],
      opts,
    );
    expect(out[0].id).toBe('contract');
    expect(out[0].signals.map((s) => s.id)).toEqual(['contract']);
  });

  it('weighs first-hire and contract-friendly the same — both are the lead signals', () => {
    const out = rankPostings(
      [
        post({ id: 'c', url: 'https://x/c', company: 'C', text: 'design system, contract ok' }),
        post({
          id: 'f',
          url: 'https://x/f',
          company: 'F',
          text: 'design system, our first frontend engineer',
        }),
      ],
      opts,
    );
    expect(out[0].score).toBe(out[1].score);
  });

  it('prefers recent postings when otherwise equal', () => {
    const out = rankPostings(
      [
        post({
          id: 'old',
          url: 'https://x/1',
          company: 'Old Co',
          text: 'design system',
          postedAt: '2026-06-01T00:00:00Z',
        }),
        post({
          id: 'new',
          url: 'https://x/2',
          text: 'design system',
          postedAt: '2026-10-10T00:00:00Z',
        }),
      ],
      opts,
    );
    expect(out.map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('dedupes the same opening listed by two sources (by URL)', () => {
    const out = rankPostings(
      [
        post({ id: 'a', url: 'https://jobs.example.com/1?utm_source=hn', text: 'design system' }),
        post({ id: 'b', url: 'https://jobs.example.com/1', text: 'design system' }),
      ],
      opts,
    );
    expect(out).toHaveLength(1);
  });

  it('collapses one company re-posting the same role (e.g. two monthly HN threads)', () => {
    const out = rankPostings(
      [
        post({
          id: 'sep',
          url: 'https://x/sep',
          company: 'Neon',
          title: 'Frontend Engineer',
          location: 'HYBRID',
          text: 'design system',
          postedAt: '2026-09-02T00:00:00Z',
        }),
        post({
          id: 'oct',
          url: 'https://x/oct',
          company: 'neon',
          title: 'Frontend  Engineer',
          location: 'Hybrid',
          text: 'design system',
          postedAt: '2026-10-02T00:00:00Z',
        }),
        post({
          id: 'sf',
          url: 'https://x/sf',
          company: 'Neon',
          title: 'Frontend Engineer',
          location: 'San Francisco',
          text: 'design system',
          postedAt: '2026-10-02T00:00:00Z',
        }),
      ],
      opts,
    );
    expect(out.map((p) => p.id).sort()).toEqual(['oct', 'sf']);
  });

  it('never collapses postings whose company is unknown', () => {
    const out = rankPostings(
      [
        post({
          id: 'a',
          url: 'https://x/a',
          company: '',
          title: 'Roles listed in post',
          text: 'design system',
        }),
        post({
          id: 'b',
          url: 'https://x/b',
          company: '',
          title: 'Roles listed in post',
          text: 'design system',
        }),
      ],
      opts,
    );
    expect(out).toHaveLength(2);
  });

  it('remote mode keeps remote + unknown, drops definite onsite', () => {
    const out = rankPostings(
      [
        post({ id: 'r', url: 'https://x/1', company: 'R', text: 'design system', mode: 'remote' }),
        post({ id: 'o', url: 'https://x/2', text: 'design system', mode: 'onsite' }),
        post({ id: 'u', url: 'https://x/3', company: 'U', text: 'design system' }),
      ],
      { ...opts, mode: 'remote' },
    );
    expect(out.map((p) => p.id).sort()).toEqual(['r', 'u']);
  });

  it('remote mode ignores a location typed before switching (the input is disabled then)', () => {
    const out = rankPostings(
      [post({ id: 'u', url: 'https://x/1', text: 'design system', location: 'New York, NY' })],
      { ...opts, mode: 'remote', where: 'Seattle' },
    );
    expect(out.map((p) => p.id)).toEqual(['u']);
  });

  it('matches a "City, ST" location on the city, so "Austin, TX" finds "Austin, Texas"', () => {
    const out = rankPostings(
      [
        post({
          id: 'a',
          url: 'https://x/1',
          text: 'design system',
          location: 'Austin, Texas, United States',
        }),
      ],
      { ...opts, where: 'Austin, TX' },
    );
    expect(out.map((p) => p.id)).toEqual(['a']);
  });

  it('a location filter keeps matching, unknown, and remote postings', () => {
    const out = rankPostings(
      [
        post({ id: 'sea', url: 'https://x/1', text: 'design system', location: 'Seattle, WA' }),
        post({ id: 'nyc', url: 'https://x/2', text: 'design system', location: 'New York, NY' }),
        post({
          id: 'rem',
          url: 'https://x/3',
          text: 'design system',
          location: 'NYC',
          mode: 'remote',
        }),
        post({ id: 'unk', url: 'https://x/4', text: 'design system' }),
      ],
      { ...opts, where: 'seattle' },
    );
    expect(out.map((p) => p.id).sort()).toEqual(['rem', 'sea', 'unk']);
  });
});
