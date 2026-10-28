import { describe, expect, it, vi } from 'vitest';
import { NO_KEY_MESSAGE } from './sam';
import { DAILY_UPSTREAM_CAP, RATE_LIMIT, SAM_SEARCH_URL, createSamHandler } from './samHandler';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const KEY = 'secret-key-123';

const record = (over: Record<string, unknown> = {}) => ({
  noticeId: 'abc123',
  title: 'Sheet metal ductwork fabrication',
  fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.W6QK ACC',
  solicitationNumber: 'W912-26-Q-0001',
  postedDate: '2026-10-20',
  responseDeadLine: '2026-11-05T14:00:00-05:00',
  naicsCode: '332322',
  type: 'Solicitation',
  typeOfSetAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)',
  uiLink: 'https://sam.gov/opp/abc123/view',
  placeOfPerformance: { city: { name: 'Spokane' }, state: { code: 'WA' } },
  ...over,
});

const ok = (rows: unknown[]) =>
  new Response(JSON.stringify({ totalRecords: rows.length, opportunitiesData: rows }), {
    status: 200,
  });

function setup(opts: { key?: string; rows?: unknown[]; status?: number } = {}) {
  const fetchImpl = vi.fn(async (_url: string) =>
    opts.status ? new Response('nope', { status: opts.status }) : ok(opts.rows ?? [record()]),
  );
  const handler = createSamHandler({
    getKey: () => ('key' in opts ? opts.key : KEY),
    fetchImpl,
    now: () => NOW,
  });
  const get = (query: string, ip = '1.2.3.4', method = 'GET') =>
    handler(
      new Request(`https://app.test/api/sam${query}`, { method, headers: { 'x-real-ip': ip } }),
    );
  return { fetchImpl, get, handler };
}

const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe('/api/sam', () => {
  it('without the key, answers 503 naming the variable and where to set it, calling nothing', async () => {
    const { get, fetchImpl } = setup({ key: undefined });
    const r = await get('?naics=332322');
    expect(r.status).toBe(503);
    expect(await body(r)).toEqual({ error: NO_KEY_MESSAGE });
    expect(NO_KEY_MESSAGE).toBe(
      'SAM_GOV_API_KEY is not set: add it in Vercel → Settings → Environment Variables',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a blank key counts as not set', async () => {
    const r = await setup({ key: '   ' }).get('?naics=332322');
    expect(r.status).toBe(503);
  });

  it('reads one SAM.gov search per NAICS code, with the state and a 30-day window', async () => {
    const { get, fetchImpl } = setup();
    const r = await get('?naics=332322,541511&state=wa');
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const u = new URL(fetchImpl.mock.calls[0][0]);
    expect(`${u.origin}${u.pathname}`).toBe(SAM_SEARCH_URL);
    expect(u.searchParams.get('ncode')).toBe('332322');
    expect(u.searchParams.get('state')).toBe('WA');
    expect(u.searchParams.get('postedFrom')).toBe('09/27/2026');
    expect(u.searchParams.get('postedTo')).toBe('10/27/2026');
    expect(u.searchParams.get('api_key')).toBe(KEY);
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('ncode')).toBe('541511');
  });

  it('answers only the open solicitations, deduped, with the fields the app uses', async () => {
    const { get } = setup({
      rows: [
        record(),
        record(), // the same notice under two codes
        record({ noticeId: 'award1', type: 'Award Notice' }),
        record({ noticeId: 'old1', responseDeadLine: '2026-10-01T10:00:00-05:00' }),
        record({ noticeId: 'bad id!' }),
        record({ noticeId: 'x2', uiLink: 'javascript:alert(1)', active: 'Yes' }),
      ],
    });
    const r = await body(await get('?naics=332322'));
    expect(r.opportunities).toEqual([
      {
        id: 'abc123',
        title: 'Sheet metal ductwork fabrication',
        agency: 'DEPT OF DEFENSE',
        url: 'https://sam.gov/opp/abc123/view',
        postedDate: '2026-10-20',
        responseDeadline: '2026-11-05',
        naics: '332322',
        type: 'Solicitation',
        setAside: 'Total Small Business Set-Aside (FAR 19.5)',
        solicitationNumber: 'W912-26-Q-0001',
        city: 'Spokane',
        state: 'WA',
      },
      expect.objectContaining({ id: 'x2', url: 'https://sam.gov/opp/x2/view' }),
    ]);
  });

  it('never returns the key, also when SAM.gov refuses it', async () => {
    const { get } = setup({ status: 403 });
    const r = await get('?naics=332322');
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(text).not.toContain(KEY);
    expect(JSON.parse(text).error).toMatch(/refused the API key: check SAM_GOV_API_KEY/);
  });

  it('names SAM.gov’s own rate limit', async () => {
    const r = await body(await setup({ status: 429 }).get('?naics=332322'));
    expect(r.error).toMatch(/request limit/);
  });

  it('rejects bad input before spending a SAM.gov request', async () => {
    const { get, fetchImpl } = setup();
    for (const q of [
      '',
      '?naics=',
      '?naics=abc',
      '?naics=1234567',
      '?naics=1',
      `?naics=${Array.from({ length: 11 }, (_, i) => 330000 + i).join(',')}`,
      '?naics=332322&state=XX',
      '?naics=332322&state=Washington',
      `?naics=332322&x=${'a'.repeat(300)}`,
    ]) {
      const r = await get(q);
      expect(r.status, q).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('only answers GET', async () => {
    const r = await setup().get('?naics=332322', '1.2.3.4', 'POST');
    expect(r.status).toBe(405);
    expect(r.headers.get('Allow')).toBe('GET');
  });

  it('reuses an answer for the same search (codes in any order)', async () => {
    const { get, fetchImpl } = setup();
    await get('?naics=332322,541511');
    await get('?naics=541511,332322');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reuses each code’s answer across different sets of codes', async () => {
    const { get, fetchImpl } = setup();
    await get('?naics=332322,541511');
    await get('?naics=332322,541512');
    // 332322 was read already: only 541512 is new.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('caps SAM.gov calls per instance per day, whatever the callers', async () => {
    const { get, fetchImpl } = setup();
    let last: Response | undefined;
    for (let i = 0; i < DAILY_UPSTREAM_CAP + 5; i++)
      last = await get(`?naics=${100 + i}`, `9.9.${i}.1`);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(DAILY_UPSTREAM_CAP);
    expect(last!.status).toBe(429);
  });

  it('never takes the caller from a header the client sets (x-forwarded-for)', async () => {
    const { handler } = setup({ key: undefined });
    const send = (xff: string) =>
      handler(
        new Request('https://app.test/api/sam?naics=332322', {
          headers: { 'x-forwarded-for': xff },
        }),
      );
    for (let i = 0; i < RATE_LIMIT; i++) expect((await send(`7.7.7.${i}`)).status).toBe(503);
    expect((await send('8.8.8.8')).status).toBe(429);
  });

  it('rate-limits each caller', async () => {
    const { get } = setup({ key: undefined });
    for (let i = 0; i < RATE_LIMIT; i++) expect((await get('?naics=332322')).status).toBe(503);
    const r = await get('?naics=332322');
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Another caller is not held back.
    expect((await get('?naics=332322', '5.6.7.8')).status).toBe(503);
  });

  it('answers JSON that is never cached by the browser', async () => {
    const r = await setup().get('?naics=332322');
    expect(r.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
});
