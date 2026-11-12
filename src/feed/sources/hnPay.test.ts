import { describe, expect, it } from 'vitest';
import { applyTargeting, NO_TARGETING, type Targeting } from '../targeting';
import type { RankedPosting } from '../types';
import { parseHnPay } from './hnPay';
import { parseHnComment } from './hn';

const pay = (salaryMin: number, salaryMax: number, currency = 'USD') => ({
  salaryMin,
  salaryMax,
  currency,
});

describe('parseHnPay (#576 item 2)', () => {
  it.each([
    // Formats that read (the PR's table and the review's "what checks out").
    ['Acme | Staff Engineer | Remote | $180k–220k', pay(180_000, 220_000)],
    ['Salary: 180-220K USD + equity', pay(180_000, 220_000)],
    ['€90k', pay(90_000, 90_000, 'EUR')],
    // The issue's own formats (#547).
    ['Acme | Design Systems Lead | Remote (US) | $150k–$185k', pay(150_000, 185_000)],
    ['Beta | Senior Design Systems Designer | Berlin | €95k–€120k', pay(95_000, 120_000, 'EUR')],
    ['£70,000 - £85,000 + options', pay(70_000, 85_000, 'GBP')],
    ['$200k OTE', pay(200_000, 200_000)],
    ['US$150k to $175k', pay(150_000, 175_000)],
    ['CAD 120k-140k', pay(120_000, 140_000, 'CAD')],
    ['$120 - 150k base', pay(120_000, 150_000)],
    ['$120-150k', pay(120_000, 150_000)],
    ['EUR 85.000 – 95.000', pay(85_000, 95_000, 'EUR')],
    ['$150,000 - $175,000', pay(150_000, 175_000)],
    ['85000 GBP', pay(85_000, 85_000, 'GBP')],
    ['$170k - $210k + equity', pay(170_000, 210_000)],
    ['$160k plus stock options', pay(160_000, 160_000)],
    ['$150k base + $30k bonus', pay(150_000, 150_000)],
    ['$150k-$180k + $20k signing bonus', pay(150_000, 180_000)],
    ['We raised $40M. Pay: $160k-$190k', pay(160_000, 190_000)],
    // Each dollar keeps its own currency (review blocking 1).
    ['CA$150k', pay(150_000, 150_000, 'CAD')],
    ['C$130k-150k', pay(130_000, 150_000, 'CAD')],
    ['$120k-150k CAD', pay(120_000, 150_000, 'CAD')],
    ['AU$140k-160k', pay(140_000, 160_000, 'AUD')],
    ['A$140k', pay(140_000, 140_000, 'AUD')],
    ['AUD 140,000 - 160,000', pay(140_000, 160_000, 'AUD')],
    ['NZ$120k', pay(120_000, 120_000, 'NZD')],
    ['S$150k-180k', pay(150_000, 180_000, 'SGD')],
    ['SGD 150k', pay(150_000, 150_000, 'SGD')],
    ['HK$900k', pay(900_000, 900_000, 'HKD')],
    // Several figures for different levels: their span, not the first (review blocking 2).
    ['Up to $90k for juniors, $180k for seniors', pay(90_000, 180_000)],
    // A figure beside a salary word wins over one that isn't.
    ['We spend $60k a year on tooling. Salary: $150k-$180k', pay(150_000, 180_000)],
    ['Office in SF, $70k a year in perks budget. Comp $200k', pay(200_000, 200_000)],
  ])('%s', (text, want) => expect(parseHnPay(text)).toEqual(want));

  it.each([
    // No currency, a count, a year, a funding figure out of range.
    'We match your 401k and offer 10k users a day',
    'Founded 2019, 150-200 people',
    'Raised $20M Series A; $5M ARR',
    'A $1.2M seed round',
    '401(k), dental, 150k+ users, 10k MAU',
    'Salary competitive',
    'No salary stated',
    // Rates.
    'Contract at $90/hr',
    '$120 per hour, 6 months',
    '$100 an hour',
    '$800 a day',
    '$800/day',
    '$12k/month',
    '$12k a month',
    // Not base pay (review blocking 2): a wrong low figure would hide the post under the floor.
    '$50k sign-on bonus, salary competitive',
    '$50k signing bonus',
    '$25k relocation',
    'Salary 150k; $40k equity',
    '$40k in stock',
    '$60k in RSUs',
    '$30k of options',
    'Equity: $40k',
    'Bonus up to $50k',
    '$25k stipend for your home office',
    'Hardware budget of $25k',
    '$300k MRR',
    '$900k ARR',
    '$500k revenue last year',
    'raised $750k pre-seed',
    'We raised $900k',
    '$800k in funding',
    'Series A, $900k seed',
    '$950k valuation',
    '$50k research grant',
    '$25k in perks',
    '$23k 401k match',
    // Two currencies, nothing to choose between.
    '$150k (€130k)',
    // Fine to miss: no pay rather than wrong pay.
    '90k€',
    '€ 90k',
    '$ 150k',
    '140k-160k €',
    "CHF 120'000",
  ])('no pay in: %s', (text) => expect(parseHnPay(text)).toBeNull());
});

describe('parseHnComment: pay', () => {
  it('sets salaryMin, salaryMax and currency from the post text', () => {
    const p = parseHnComment({
      objectID: '1',
      comment_text: 'Acme | Design Systems Engineer | Remote (US) | $170k - $210k + equity',
    });
    expect(p).toMatchObject({ salaryMin: 170_000, salaryMax: 210_000, currency: 'USD' });
  });

  it('leaves them out when the post states no pay', () => {
    const p = parseHnComment({ objectID: '2', comment_text: 'Acme | Engineer | Remote' });
    expect(p).not.toHaveProperty('salaryMin');
  });
});

describe('HN pay against the dollar pay floor', () => {
  const posting = (text: string): RankedPosting => ({
    id: `hn:${text}`,
    source: 'hn',
    title: 'Design Systems Engineer',
    company: 'Acme',
    url: 'https://news.ycombinator.com/item?id=1',
    location: 'Remote',
    text,
    score: 10,
    hit: 'title',
    signals: [],
    snippet: '',
    ...parseHnPay(text),
  });
  const floor: Targeting = { ...NO_TARGETING, phrases: true, salaryFloor: 120_000 };
  const kept = (text: string) => applyTargeting([posting(text)], floor).postings.length === 1;

  it('compares only USD; a CAD or AUD figure is kept, as EUR and GBP are', () => {
    expect(kept('CA$100k')).toBe(true);
    expect(kept('AU$100k')).toBe(true);
    expect(kept('€90k')).toBe(true);
    expect(kept('$100k')).toBe(false);
    expect(kept('$150k')).toBe(true);
  });

  it('a bonus, equity or the junior figure no longer hides the post', () => {
    expect(kept('$50k sign-on bonus, salary competitive')).toBe(true);
    expect(kept('Salary 150k; $40k equity')).toBe(true);
    expect(kept('$25k relocation')).toBe(true);
    expect(kept('Up to $90k for juniors, $180k for seniors')).toBe(true);
  });
});
