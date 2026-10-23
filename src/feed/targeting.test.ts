import { describe, expect, it } from 'vitest';
import type { RankedPosting } from './types';
import { applyTargeting, NO_TARGETING, titleLevel, type Targeting } from './targeting';

const rp = (o: Partial<RankedPosting> = {}): RankedPosting => ({
  id: 'x:1',
  source: 'ashby',
  title: 'Design Systems Engineer',
  company: 'Acme',
  url: 'https://jobs.ashbyhq.com/acme/1',
  location: '',
  text: 'Build components.',
  score: 10,
  hit: 'title',
  signals: [],
  snippet: '',
  ...o,
});
const t = (o: Partial<Targeting>): Targeting => ({ ...NO_TARGETING, ...o });

describe('titleLevel', () => {
  it.each([
    ['Senior Design Engineer', 'senior'],
    ['Sr. Frontend Engineer', 'senior'],
    ['Staff Design Systems Engineer', 'senior'],
    ['Principal Designer', 'senior'],
    ['Design Systems Lead', 'senior'],
    ['Director of Design', 'senior'],
    ['Head of Design Systems', 'senior'],
    ['Design Intern', 'junior'],
    ['Junior Welder', 'junior'],
    ['Entry Level Fabricator', 'junior'],
    ['Entry-level Welder', 'junior'],
    ['Design Systems Engineer', 'mid'],
    ['Leader Dog Trainer', 'mid'], // whole words only
    ['Internal Tools Engineer', 'mid'],
  ])('%s is %s', (title, level) => {
    expect(titleLevel(title)).toBe(level);
  });
});

describe('applyTargeting', () => {
  it('does nothing by default', () => {
    const list = [rp(), rp({ id: 'x:2', title: 'Senior Engineer' })];
    const r = applyTargeting(list, NO_TARGETING);
    expect(r.postings).toHaveLength(2);
    expect(r.hidden).toEqual({ include: 0, exclude: 0, seniority: 0, salary: 0, titles: 0 });
  });

  describe('exclusions', () => {
    it('drops a title or body match, counts it, tolerates plural and hyphen forms', () => {
      const list = [
        rp({ id: 'a', title: 'Engineering Manager, Design Systems' }),
        rp({ id: 'b', title: 'Design Engineer', text: 'You will report to managers daily.' }),
        rp({ id: 'c', title: 'Design Engineer', text: 'Front-end work.' }),
        rp({ id: 'd', title: 'Design Engineer', text: 'Own the full-stack of tokens.' }),
      ];
      const r = applyTargeting(list, t({ exclude: ['manager', 'front end'] }));
      expect(r.postings.map((p) => p.id)).toEqual(['d']);
      expect(r.hidden.exclude).toBe(3);
    });

    it('matches a phrase, not loose words, and ignores blank terms', () => {
      const list = [rp({ text: 'sales and engineering' })];
      expect(
        applyTargeting(list, t({ exclude: ['', '  ', 'sales engineer'] })).postings,
      ).toHaveLength(1);
    });

    it('reaches the signal-free case: no regex injection', () => {
      expect(() => applyTargeting([rp()], t({ exclude: ['c++ (', '[a'] }))).not.toThrow();
    });
  });

  describe('seniority', () => {
    const list = [
      rp({ id: 'sr', title: 'Senior Design Engineer' }),
      rp({ id: 'mid', title: 'Design Engineer' }),
      rp({ id: 'jr', title: 'Junior Design Engineer' }),
    ];
    it('entry drops senior titles only', () => {
      const r = applyTargeting(list, t({ seniority: 'entry' }));
      expect(r.postings.map((p) => p.id)).toEqual(['mid', 'jr']);
      expect(r.hidden.seniority).toBe(1);
    });
    it('experienced drops junior titles only', () => {
      const r = applyTargeting(list, t({ seniority: 'experienced' }));
      expect(r.postings.map((p) => p.id)).toEqual(['sr', 'mid']);
      expect(r.hidden.seniority).toBe(1);
    });
    it('the body never decides', () => {
      const r = applyTargeting(
        [rp({ text: 'Senior level role for an intern mentor' })],
        t({ seniority: 'entry' }),
      );
      expect(r.postings).toHaveLength(1);
    });
    it('any keeps all', () => {
      expect(applyTargeting(list, t({ seniority: 'any' })).postings).toHaveLength(3);
    });
  });

  describe('salary floor', () => {
    const list = [
      rp({ id: 'low', salaryMax: 90_000, salaryMin: 70_000, currency: 'USD' }),
      rp({ id: 'high', salaryMax: 200_000, salaryMin: 150_000, currency: 'USD' }),
      rp({ id: 'minonly', salaryMin: 130_000 }),
      rp({ id: 'none' }),
    ];
    it('hides postings whose top pay is below the floor, keeps unstated pay', () => {
      const r = applyTargeting(list, t({ salaryFloor: 120_000 }));
      expect(r.postings.map((p) => p.id)).toEqual(['high', 'minonly', 'none']);
      expect(r.hidden.salary).toBe(1);
    });
    it('"only with a salary" also hides the ones that state none', () => {
      const r = applyTargeting(list, t({ salaryFloor: 120_000, salaryOnly: true }));
      expect(r.postings.map((p) => p.id)).toEqual(['high', 'minonly']);
      expect(r.hidden.salary).toBe(2);
    });
    it('only-with-salary works with no floor', () => {
      expect(applyTargeting(list, t({ salaryOnly: true })).postings).toHaveLength(3);
    });
    it('does not compare a non-dollar figure to a dollar floor', () => {
      const r = applyTargeting(
        [rp({ salaryMax: 50_000, currency: 'EUR' })],
        t({ salaryFloor: 120_000 }),
      );
      expect(r.postings).toHaveLength(1);
    });
  });

  it('counts each posting once, under the first rule that hides it', () => {
    const r = applyTargeting(
      [rp({ title: 'Senior Manager', salaryMax: 10 })],
      t({ exclude: ['manager'], seniority: 'entry', salaryFloor: 100 }),
    );
    expect(r.hidden).toEqual({ include: 0, exclude: 1, seniority: 0, salary: 0, titles: 0 });
  });
});

// The title filter (#223): the track's ticked titles lead, an unticked one hides a posting whose
// title names it and no ticked one.
describe('applyTargeting: titles', () => {
  const titles = { on: ['product designer', 'design system'], off: ['design engineer'] };
  const posts = [
    rp({ id: 'a', title: 'Design Engineer' }),
    rp({ id: 'b', title: 'Senior Product Designer' }),
    rp({ id: 'c', title: 'Design Engineer, Design Systems' }),
    rp({ id: 'd', title: 'Frontend Engineer', text: 'You will work with our design engineer.' }),
  ];

  it('hides a posting titled only by an unticked title, and counts it', () => {
    const { postings, hidden } = applyTargeting(posts, t({ titles }));
    expect(postings.map((p) => p.id)).not.toContain('a');
    expect(hidden.titles).toBe(1);
  });

  it('keeps a posting whose title also names a ticked title, and one that names it only in the body', () => {
    const ids = applyTargeting(posts, t({ titles })).postings.map((p) => p.id);
    expect(ids).toContain('c');
    expect(ids).toContain('d');
  });

  it('ranks postings titled by a ticked title first, in their order', () => {
    const ids = applyTargeting(posts, t({ titles })).postings.map((p) => p.id);
    expect(ids).toEqual(['b', 'c', 'd']);
  });

  it('with the title turned back on nothing is hidden by titles', () => {
    const on = { on: [...titles.on, 'design engineer'], off: [] };
    const { postings, hidden } = applyTargeting(posts, t({ titles: on }));
    expect(postings).toHaveLength(4);
    expect(hidden.titles).toBe(0);
  });
});

describe('must include (systems only, 2026-10-23)', () => {
  const sys = ['systems'];
  it.each([
    ['Design Systems Designer', 'Own the library.', true],
    ['Senior Product Designer', 'You will grow our design system.', true],
    ['Systems Designer', '', true],
    ['UI Systems Engineer', '', true],
    ['DESIGN SYSTEM LEAD', '', true],
    ['Design-systems engineer', '', true],
    ['Design Engineer', 'Help design the system-level UI.', true],
    ['Product Designer', 'Join our ecosystem of partners.', false],
    ['Ecosystem Designer', 'Subsystems and ecosystems.', false],
    ['Senior Product Designer', 'Build delightful flows.', false],
  ])('%s / %s → shown %s', (title, text, shown) => {
    const r = applyTargeting([rp({ title, text })], t({ include: sys }));
    expect(r.postings.length === 1).toBe(shown);
    expect(r.hidden.include).toBe(shown ? 0 : 1);
  });

  it('counts each hidden posting once, under must include first', () => {
    const list = [
      rp({ id: 'a', title: 'Senior Product Designer', text: 'Flows.' }),
      rp({ id: 'b', title: 'Design Systems Engineer' }),
    ];
    const r = applyTargeting(list, t({ include: sys, exclude: ['product'] }));
    expect(r.postings.map((p) => p.id)).toEqual(['b']);
    expect(r.hidden).toMatchObject({ include: 1, exclude: 0 });
  });

  it('no terms (or blank ones) is no rule', () => {
    const list = [rp({ title: 'Product Designer', text: 'Flows.' })];
    expect(applyTargeting(list, t({ include: [] })).postings).toHaveLength(1);
    expect(applyTargeting(list, t({ include: [' '] })).postings).toHaveLength(1);
  });

  it('any one of several terms is enough', () => {
    const list = [rp({ title: 'Token Architect', text: '' })];
    expect(applyTargeting(list, t({ include: ['systems', 'tokens'] })).postings).toHaveLength(1);
  });
});
