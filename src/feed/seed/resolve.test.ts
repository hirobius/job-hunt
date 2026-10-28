import { describe, expect, it } from 'vitest';
import { createLimiter } from '../probe';
import { FetchError, type FetchJson } from '../sources/http';
import type { Candidate } from './parse';
import { boardTitles, confirmBoard, distinctName, resolveCandidate } from './resolve';

const cand = (over: Partial<Candidate>): Candidate => ({
  name: 'Acme',
  website: '',
  slugs: ['acme'],
  linked: [],
  titles: [],
  evidence: [{ source: 'adele', url: 'https://design.acme.com' }],
  ...over,
});

/** Canned answers by URL; anything else is a 404. */
const fake =
  (answers: Record<string, unknown>): FetchJson =>
  async (url) => {
    if (url in answers) return answers[url];
    throw new FetchError(404, url);
  };

const noGap = () => createLimiter({ gapMs: 0 });

describe('confirmBoard', () => {
  const gh = { kind: 'greenhouse' as const, slug: 'stripe' };

  it('a board the source linked', () => {
    expect(
      confirmBoard(
        cand({ linked: [{ kind: 'ashby', slug: 'Acme' }] }),
        { kind: 'ashby', slug: 'acme' },
        {},
      ),
    ).toBe('linked');
  });

  it("the company's domain in the payload (Greenhouse job links)", () => {
    const body = {
      jobs: [{ title: 'Engineer', absolute_url: 'https://stripe.com/jobs/search?gh_jid=1' }],
    };
    expect(confirmBoard(cand({ name: 'Stripe', website: 'https://stripe.com' }), gh, body)).toBe(
      'domain',
    );
    // Not a domain that merely ends the same way.
    const other = { jobs: [{ absolute_url: 'https://notstripe.com/x' }] };
    expect(
      confirmBoard(cand({ name: 'Stripe', website: 'https://stripe.com' }), gh, other),
    ).toBeNull();
  });

  it('a job designsystems.jobs saw, by title', () => {
    const body = { jobs: [{ title: 'Design System Designer' }] };
    const c = cand({ name: 'Pennylane', titles: ['design system designer'] });
    expect(confirmBoard(c, { kind: 'ashby', slug: 'pennylane' }, body)).toBe('title');
  });

  it("the board's own name, or a description introducing the company", () => {
    const c = cand({ name: 'Stripe', website: 'https://stripe.com' });
    expect(confirmBoard(c, gh, { jobs: [] }, 'Stripe')).toBe('name');
    expect(confirmBoard(c, gh, { jobs: [] }, 'Stripe Bakery Ltd')).toBeNull();
    const hn = {
      evidence: [{ source: 'hn' as const, url: 'https://news.ycombinator.com/item?id=1' }],
    };
    const intro = [{ text: 'Engineer', descriptionPlain: 'At Higharc, we build homes' }];
    expect(
      confirmBoard(cand({ name: 'Higharc', ...hn }), { kind: 'lever', slug: 'higharc' }, intro),
    ).toBe('name');
    // A design system's own name ("Cedar") is someone else's board unless the company was seen
    // hiring or its website says the same name.
    const cedar = { kind: 'greenhouse' as const, slug: 'cedar' };
    expect(confirmBoard(cand({ name: 'Cedar' }), cedar, { jobs: [] }, 'Cedar')).toBeNull();
    expect(confirmBoard(cand({ name: 'Cedar', ...hn }), cedar, { jobs: [] }, 'Cedar')).toBe('name');
    expect(
      confirmBoard(cand({ name: 'Higharc' }), { kind: 'lever', slug: 'higharc' }, intro),
    ).toBeNull();
    // Only for a company known by name alone: with a website, the payload must name it.
    expect(
      confirmBoard(
        cand({ name: 'Higharc', website: 'https://higharc.com', ...hn }),
        { kind: 'lever', slug: 'higharc' },
        intro,
      ),
    ).toBeNull();
  });

  it('a description confirms only a distinctive name', () => {
    const hn = {
      evidence: [{ source: 'hn' as const, url: 'https://news.ycombinator.com/item?id=1' }],
    };
    const table: [string, boolean][] = [
      ['Higharc', true],
      ['Wealthsimple', true],
      ['Back Market', true],
      ['Close', false],
      ['Arrive', false],
      ['Super', false],
      ['Ledger', false],
      ['Promise', false],
      ['Imprint', false],
      ['Instrument', false],
      ['Kindred', false],
      ['Persona', false],
    ];
    for (const [name, ok] of table) {
      expect(distinctName(name), name).toBe(ok);
      const intro = [{ text: 'Engineer', descriptionPlain: `At ${name}, we build things` }];
      expect(
        confirmBoard(cand({ name, ...hn }), { kind: 'ashby', slug: name.toLowerCase() }, intro),
        name,
      ).toBe(ok ? 'name' : null);
    }
  });

  it('reads job titles whatever the ATS calls the field', () => {
    expect(boardTitles({ kind: 'lever', slug: 'x' }, [{ text: 'A' }])).toEqual(['A']);
    expect(boardTitles({ kind: 'recruitee', slug: 'x' }, { offers: [{ title: 'B' }] })).toEqual([
      'B',
    ]);
  });
});

describe('resolveCandidate', () => {
  it('confirms a board by its domain and stops there', async () => {
    const calls: string[] = [];
    const answers = {
      'https://boards-api.greenhouse.io/v1/boards/stripe/jobs': {
        jobs: [{ title: 'Design Systems Engineer', absolute_url: 'https://stripe.com/jobs/1' }],
      },
    };
    const fetchJson: FetchJson = async (u, o) => {
      calls.push(u);
      return fake(answers)(u, o);
    };
    const r = await resolveCandidate(
      cand({ name: 'Stripe', website: 'https://stripe.com', slugs: ['stripe', 'stripe-inc'] }),
      {
        fetchJson,
        limiter: noGap(),
        kinds: ['greenhouse', 'lever'],
      },
    );
    expect(r).toEqual({
      state: 'found',
      board: {
        kind: 'greenhouse',
        slug: 'stripe',
        url: 'https://boards.greenhouse.io/stripe',
        jobs: 1,
        confirmed: 'domain',
      },
    });
    expect(calls.some((u) => u.includes('stripe-inc'))).toBe(false);
  });

  it("keeps a stranger's board unconfirmed, and looks on for a confirmed one", async () => {
    const answers = {
      'https://api.lever.co/v0/postings/acme?mode=json': [{ text: 'Baker' }],
      'https://api.ashbyhq.com/posting-api/job-board/acmehq': {
        jobs: [{ title: 'X', descriptionPlain: 'mail jobs@acme.com' }],
      },
    };
    const r = await resolveCandidate(
      cand({ website: 'https://acme.com', slugs: ['acme', 'acmehq'] }),
      {
        fetchJson: fake(answers),
        limiter: noGap(),
        kinds: ['lever', 'ashby'],
      },
    );
    expect(r.board).toMatchObject({ kind: 'ashby', slug: 'acmehq', confirmed: 'domain' });

    const only = await resolveCandidate(cand({ website: 'https://acme.com', slugs: ['acme'] }), {
      fetchJson: fake(answers),
      limiter: noGap(),
      kinds: ['lever', 'ashby'],
    });
    expect(only).toEqual({
      state: 'found',
      board: {
        kind: 'lever',
        slug: 'acme',
        url: 'https://jobs.lever.co/acme',
        jobs: 1,
        confirmed: null,
      },
    });
  });

  it('a linked board is taken first; a closed one falls back to the slugs', async () => {
    const answers = { 'https://api.ashbyhq.com/posting-api/job-board/higharc': { jobs: [] } };
    const r = await resolveCandidate(
      cand({ linked: [{ kind: 'ashby', slug: 'higharc' }], slugs: [] }),
      {
        fetchJson: fake(answers),
        limiter: noGap(),
      },
    );
    expect(r.board?.confirmed).toBe('linked');
  });

  it('missed when every board says none; unknown when one never answered', async () => {
    const opts = { limiter: noGap(), kinds: ['greenhouse' as const, 'lever' as const] };
    expect(await resolveCandidate(cand({}), { ...opts, fetchJson: fake({}) })).toEqual({
      state: 'missed',
      board: null,
    });
    const flaky: FetchJson = async (u) => {
      throw new FetchError(u.includes('lever') ? 503 : 404, u);
    };
    expect((await resolveCandidate(cand({}), { ...opts, fetchJson: flaky })).state).toBe('unknown');
  });
});
