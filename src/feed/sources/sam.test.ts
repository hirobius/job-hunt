import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_KEY_MESSAGE } from '../../contracts/sam';
import { describeError, fetchFeed } from '../fetchFeed';
import { jobFieldsFor } from '../toJob';
import { FetchError } from './http';
import { clearSamCache, fetchSam, postingOf, samUrl, SourceMessageError } from './sam';

const OPP = {
  id: 'abc123',
  title: 'Sheet metal ductwork',
  agency: 'DEPT OF DEFENSE',
  url: 'https://sam.gov/opp/abc123/view',
  postedDate: '2026-10-20',
  responseDeadline: '2026-11-05',
  naics: '332322',
  type: 'Solicitation',
  setAside: 'Total Small Business',
  solicitationNumber: 'W912-1',
  city: 'Spokane',
  state: 'WA',
};
const res = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

beforeEach(() => clearSamCache());

describe('fetchSam', () => {
  it('asks same-origin /api/sam with the codes and state', () => {
    expect(samUrl({ naics: ['332322', '541511'], state: 'WA' })).toBe(
      '/api/sam?naics=332322%2C541511&state=WA',
    );
    expect(samUrl({ naics: ['332322'] })).toBe('/api/sam?naics=332322');
  });

  it('turns each solicitation into a posting carrying its deadline', async () => {
    const f = vi.fn(async () => res(200, { opportunities: [OPP] }));
    const [p] = await fetchSam({ naics: ['332322'] }, f);
    expect(p).toEqual({
      id: 'sam:abc123',
      source: 'sam',
      title: 'Sheet metal ductwork',
      company: 'DEPT OF DEFENSE',
      url: OPP.url,
      location: 'Spokane, WA',
      postedAt: '2026-10-20',
      deadline: '2026-11-05',
      discoveredAt: expect.any(String), // when the feed first read it (#419)
      text: 'Response due 2026-11-05\nNotice type: Solicitation\nNAICS 332322\nSet-aside: Total Small Business\nSolicitation W912-1',
    });
  });

  it('keeps an answer for an hour', async () => {
    const f = vi.fn(async () => res(200, { opportunities: [OPP] }));
    await fetchSam({ naics: ['332322'] }, f);
    await fetchSam({ naics: ['332322'] }, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('drops a row whose link is not sam.gov', async () => {
    const f = vi.fn(async () =>
      res(200, { opportunities: [{ ...OPP, url: 'javascript:alert(1)' }, OPP] }),
    );
    expect(await fetchSam({ naics: ['332322'] }, f)).toHaveLength(1);
  });

  it('a failure carries the function’s own words', async () => {
    const f = vi.fn(async () => res(503, { error: NO_KEY_MESSAGE }));
    await expect(fetchSam({ naics: ['332322'] }, f)).rejects.toEqual(
      new SourceMessageError(NO_KEY_MESSAGE),
    );
    // Not cached: the next search asks again (the key may have been added).
    await expect(fetchSam({ naics: ['332322'] }, f)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('says when the function is not there (a local server)', async () => {
    const f = vi.fn(async () => res(404, '<!doctype html>'));
    await expect(fetchSam({ naics: ['332322'] }, f)).rejects.toThrow(/isn’t running here/);
  });

  it('a network failure is a plain connect error', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('offline');
    });
    await expect(fetchSam({ naics: ['332322'] }, f)).rejects.toBeInstanceOf(FetchError);
  });

  it('reads nothing without codes', async () => {
    const f = vi.fn();
    expect(await fetchSam({ naics: [] }, f)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('fetchFeed on a Contracts track', () => {
  it('reads SAM.gov once instead of every term source', async () => {
    const readSam = vi.fn(async () => [postingOf(OPP)]);
    const fetchJson = vi.fn();
    const r = await fetchFeed(
      { contracts: { naics: ['332322'], state: 'WA' }, boardUrls: [] },
      fetchJson,
      { readSam },
    );
    expect(readSam).toHaveBeenCalledWith({ naics: ['332322'], state: 'WA' });
    expect(fetchJson).not.toHaveBeenCalled();
    expect(r.sources).toEqual([{ key: 'sam', label: 'SAM.gov', fetched: 1 }]);
    expect(r.postings.map((p) => p.id)).toEqual(['sam:abc123']);
  });

  it('names a missing key on the source, word for word', async () => {
    const readSam = vi.fn(async () => {
      throw new SourceMessageError(NO_KEY_MESSAGE);
    });
    const r = await fetchFeed({ contracts: { naics: ['332322'] }, boardUrls: [] }, vi.fn(), {
      readSam,
    });
    expect(r.sources[0].error).toBe(`SAM.gov: ${NO_KEY_MESSAGE}`);
    expect(describeError(new SourceMessageError('x'), 'SAM.gov', false)).toBe('SAM.gov: x');
  });

  it('no codes, nothing read', async () => {
    const readSam = vi.fn();
    const r = await fetchFeed({ contracts: { naics: [] }, boardUrls: [] }, vi.fn(), { readSam });
    expect(r).toEqual({ postings: [], sources: [] });
    expect(readSam).not.toHaveBeenCalled();
  });
});

describe('saving a solicitation', () => {
  it('carries the response deadline and says it in the note', () => {
    const p = { ...postingOf(OPP), score: 0, hit: 'title' as const, signals: [], snippet: '' };
    expect(jobFieldsFor(p, '')).toMatchObject({
      label: 'Sheet metal ductwork',
      company: 'DEPT OF DEFENSE',
      deadline: '2026-11-05',
      note: 'Found in Live postings · SAM.gov · Response due 2026-11-05',
    });
  });
});
