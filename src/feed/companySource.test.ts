import { describe, expect, it } from 'vitest';
import { ycMatches } from './companySource';

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
    yc('Tokenly', 'Design system tooling for product teams'),
    yc('Kitbot', 'Component kits', { tags: ['Design Systems'] }),
    yc('Paystack', 'Payments for designers'),
    yc('Tokenly', 'duplicate'),
  ];
  it('matches the terms as phrases in the one-liner, tags or industries', () => {
    expect(ycMatches(body, ['design system']).map((c) => c.name)).toEqual(['Tokenly', 'Kitbot']);
    expect(ycMatches(body, ['design tooling']).map((c) => c.name)).toEqual([]);
  });
  it('no terms or a bad body: nothing', () => {
    expect(ycMatches(body, [])).toEqual([]);
    expect(ycMatches({ nope: 1 }, ['design system'])).toEqual([]);
  });
  it('stops at the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => yc(`Co${i}`, 'a design system studio'));
    expect(ycMatches(many, ['design system'], 4)).toHaveLength(4);
  });
});
