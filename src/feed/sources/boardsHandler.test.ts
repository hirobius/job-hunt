import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BOARD_ADAPTERS,
  CACHE_TTL_MS,
  createBoardsHandler,
  RATE_LIMIT,
  TEXT_MAX,
} from './boardsHandler';
import { DSJOBS_FEED } from './designsystemsjobs';
import { PROXIED_SEARCH, PROXIED_SOURCES } from './proxied';
import { WWR_FEEDS } from './weworkremotely';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const DSJOBS = readFileSync('src/feed/sources/fixtures/designsystems-jobs.xml', 'utf8');
const wwrItem = (slug: string) =>
  `<item><title>Acme: ${slug}</title><link>https://weworkremotely.com/remote-jobs/${slug}</link></item>`;

function setup(answer: (url: string) => Response | Promise<Response> = () => new Response(DSJOBS)) {
  let t = NOW;
  const fetchImpl = vi.fn(async (url: string) => answer(url));
  const handler = createBoardsHandler({ fetchImpl, now: () => t });
  const get = (query: string, { method = 'GET', ip = '1.1.1.1' } = {}) =>
    handler(
      new Request(`https://app.test/api/boards${query}`, { method, headers: { 'x-real-ip': ip } }),
    );
  return { fetchImpl, get, advance: (ms: number) => (t += ms) };
}

describe('/api/boards', () => {
  it('has an adapter for every proxied source', () => {
    expect(Object.keys(BOARD_ADAPTERS).sort()).toEqual([...PROXIED_SOURCES].sort());
    for (const [id, a] of Object.entries(BOARD_ADAPTERS)) {
      expect(a.id).toBe(id);
      expect(!!a.search).toBe(PROXIED_SEARCH.has(a.id));
    }
  });

  it('reads the fixed feed and answers parsed postings with shared cache', async () => {
    const { fetchImpl, get } = setup();
    const res = await get('?src=dsjobs');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=3600/);
    const body = (await res.json()) as { postings: { id: string; company: string }[] };
    expect(body.postings).toHaveLength(5);
    expect(body.postings[1].company).toBe('WHOOP');
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([DSJOBS_FEED]);
  });

  it('never fetches a URL the caller names', async () => {
    const { fetchImpl, get } = setup();
    expect((await get('?src=https://evil.example')).status).toBe(400);
    expect((await get('?url=https://evil.example')).status).toBe(400);
    expect((await get('?src=dsjobs&url=https://evil.example')).status).toBe(200);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([DSJOBS_FEED]);
  });

  it('keeps an answer an hour, then reads again', async () => {
    const { fetchImpl, get, advance } = setup();
    await get('?src=dsjobs');
    await get('?src=dsjobs', { ip: '2.2.2.2' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    advance(CACHE_TTL_MS);
    await get('?src=dsjobs');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('merges a board’s feeds, once per job, and cuts long text', async () => {
    const long = `<item><title>Acme: Long</title><link>https://weworkremotely.com/remote-jobs/long</link><description>${'x'.repeat(TEXT_MAX + 50)}</description></item>`;
    const { get } = setup(
      (url) =>
        new Response(
          url === WWR_FEEDS[0]
            ? `${wwrItem('a')}${wwrItem('b')}${long}`
            : `${wwrItem('b')}${wwrItem('c')}`,
        ),
    );
    const body = (await (await get('?src=wwr')).json()) as {
      postings: { title: string; text: string }[];
    };
    expect(body.postings.map((p) => p.title)).toEqual(['a', 'b', 'Long', 'c']);
    expect(body.postings[2].text).toHaveLength(TEXT_MAX);
  });

  it('answers what came back when one feed fails, without caching it', async () => {
    const { fetchImpl, get } = setup((url) =>
      url === WWR_FEEDS[0] ? new Response('down', { status: 503 }) : new Response(wwrItem('c')),
    );
    const res = await get('?src=wwr');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(((await res.json()) as { postings: unknown[] }).postings).toHaveLength(1);
    await get('?src=wwr');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('names the board when nothing answers', async () => {
    const { get } = setup(() => {
      throw new TypeError('network');
    });
    const res = await get('?src=dsjobs');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'designsystems.jobs didn’t answer: try again later.',
    });
  });

  it('sends a search source’s term upstream, one cache entry per term', async () => {
    const { fetchImpl, get } = setup(() => new Response(JSON.stringify({ jobs: [] })));
    expect((await get('?src=himalayas')).status).toBe(400);
    expect((await get(`?src=himalayas&q=${'x'.repeat(61)}`)).status).toBe(400);
    await get('?src=himalayas&q=Design%20Systems');
    await get('?src=himalayas&q=design%20systems');
    await get('?src=himalayas&q=ui%20engineer');
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      'https://himalayas.app/jobs/api/search?q=design%20systems',
      'https://himalayas.app/jobs/api/search?q=ui%20engineer',
    ]);
  });

  it('refuses other methods and rate-limits each caller', async () => {
    const { get } = setup();
    expect((await get('?src=dsjobs', { method: 'POST' })).status).toBe(405);
    for (let i = 0; i < RATE_LIMIT; i++) await get('?src=dsjobs', { ip: '9.9.9.9' });
    const res = await get('?src=dsjobs', { ip: '9.9.9.9' });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await get('?src=dsjobs', { ip: '8.8.8.8' })).status).toBe(200);
  });
});
