import { describe, expect, it } from 'vitest';
import { parseHnPay } from './hnPay';
import { parseHnComment } from './hn';

const pay = (salaryMin: number, salaryMax: number, currency = 'USD') => ({
  salaryMin,
  salaryMax,
  currency,
});

describe('parseHnPay', () => {
  it.each([
    ['Acme | Staff Engineer | Remote | $180k–220k', pay(180_000, 220_000)],
    ['Salary: 180-220K USD + equity', pay(180_000, 220_000)],
    ['€90k', pay(90_000, 90_000, 'EUR')],
    ['£70,000 - £85,000 + options', pay(70_000, 85_000, 'GBP')],
    ['$200k OTE', pay(200_000, 200_000)],
    ['US$150k to $175k', pay(150_000, 175_000)],
    ['CAD 120k-140k', pay(120_000, 140_000, 'CAD')],
    ['$120 - 150k base', pay(120_000, 150_000)],
    ['EUR 85.000 – 95.000', pay(85_000, 95_000, 'EUR')],
  ])('%s', (text, want) => expect(parseHnPay(text)).toEqual(want));

  it.each([
    'We match your 401k and offer 10k users a day',
    'Founded 2019, 150-200 people',
    'Raised $20M Series A; $5M ARR',
    'Contract at $90/hr',
    '$120 per hour, 6 months',
    '$800 a day',
    'No salary stated',
  ])('no pay in: %s', (text) => expect(parseHnPay(text)).toBeNull());

  it('skips a funding figure and takes the salary after it', () => {
    expect(parseHnPay('We raised $40M. Pay: $160k-$190k')).toEqual(pay(160_000, 190_000));
  });
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
