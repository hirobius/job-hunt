import { describe, expect, it } from 'vitest';
import { confirmBoard, domainStem } from './identity';
import type { BoardHit } from './probe';

const hit = (kind: BoardHit['board']['kind'], slug: string, jobs = 3): BoardHit => ({
  board: { kind, slug },
  jobs,
});

describe('domainStem', () => {
  it.each([
    ['https://acme.com', 'acme'],
    ['https://careers.acme.com/jobs', 'acme'],
    ['www.acme.io', 'acme'],
    ['https://acme.co.uk', 'acme'],
    ['https://polaris.shopify.com', 'shopify'],
    ['https://go-forward.com', 'goforward'],
    ['', ''],
    [undefined, ''],
    ['not a url', ''],
  ])('%s → %s', (site, stem) => expect(domainStem(site)).toBe(stem));
});

describe('confirmBoard (#417)', () => {
  it('the Forward case: three live boards and no matching domain are unconfirmed', () => {
    const r = confirmBoard({
      name: 'Forward',
      website: 'https://goforward.com',
      hits: [
        hit('greenhouse', 'forward'),
        hit('smartrecruiters', 'forward'),
        hit('personio', 'forward'),
      ],
    });
    expect(r?.confirmed).toBe(false);
  });

  it('more than one ATS answering is unconfirmed even when the domain matches', () => {
    const r = confirmBoard({
      name: 'Forward',
      website: 'https://forward.com',
      hits: [hit('greenhouse', 'forward'), hit('lever', 'forward')],
    });
    expect(r?.confirmed).toBe(false);
  });

  it('one hit whose slug the website confirms is confirmed', () => {
    const r = confirmBoard({
      name: 'Acme Labs',
      website: 'https://acme.com',
      hits: [hit('ashby', 'acme')],
    });
    expect(r).toEqual({ board: { kind: 'ashby', slug: 'acme' }, jobs: 3, confirmed: true });
  });

  it('the name run together also confirms (acme-labs on acmelabs.com)', () => {
    const r = confirmBoard({
      name: 'Acme Labs',
      website: 'https://acmelabs.com',
      hits: [hit('greenhouse', 'acme-labs')],
    });
    expect(r?.confirmed).toBe(true);
  });

  it('a hit with no website to confirm it is unconfirmed', () => {
    expect(confirmBoard({ name: 'Acme', hits: [hit('lever', 'acme')] })?.confirmed).toBe(false);
  });

  it('a board given outright is the company’s', () => {
    expect(
      confirmBoard({ name: 'Acme', given: true, hits: [hit('lever', 'acme')] })?.confirmed,
    ).toBe(true);
  });

  it('no hits: null', () => {
    expect(confirmBoard({ name: 'Acme', website: 'acme.com', hits: [] })).toBeNull();
  });
});
