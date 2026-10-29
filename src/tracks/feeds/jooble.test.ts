import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MissingKeyError, type FeedContext } from './context';
import { JOOBLE_PHRASES, joobleUrl, parseJooble, readJooble } from './jooble';

const FIXTURE = JSON.parse(readFileSync('src/tracks/feeds/fixtures/jooble-search.json', 'utf8'));
const ctx = (o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(JSON.stringify(FIXTURE))),
  env: (n) => (n === 'JOOBLE_API_KEY' ? 'jb-key' : undefined),
  now: () => new Date('2026-10-29T06:00:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('Jooble', () => {
  it('maps jobs through their Jooble link and drops ones with no web link', () => {
    const [a, b, ...rest] = parseJooble(FIXTURE);
    expect(rest).toEqual([]);
    expect(a).toEqual({
      source: 'jooble',
      sourceId: 'jooble:-5123456789012345678',
      title: 'Design Systems Designer (Remote)',
      company: 'Acme',
      location: 'Remote',
      remote: true,
      url: 'https://jooble.org/desc/-5123456789012345678?ckey=design+system',
      descriptionText: '...maintain our design system in Figma and code...',
      postedAt: new Date('2026-10-27T00:00:00.0000000').toISOString(),
    });
    expect(b).toMatchObject({ sourceId: 'jooble:77', location: 'Austin, TX' });
    expect(b.remote).toBeUndefined();
    expect(parseJooble(null)).toEqual([]);
    // A rounded 64-bit id with no id in its link is no id.
    expect(
      parseJooble(
        JSON.parse(
          '{"jobs":[{"id":-5123456789012345678,"title":"T","link":"https://jooble.org/x"}]}',
        ),
      ),
    ).toEqual([]);
  });

  it('POSTs each phrase for remote roles, deduped by id', async () => {
    const c = ctx();
    expect(await readJooble(c)).toHaveLength(2);
    const calls = (c.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(JOOBLE_PHRASES.length);
    expect(calls[0][0]).toBe(joobleUrl('jb-key'));
    expect(JSON.parse(calls[0][1].body)).toEqual({
      keywords: '"design system"',
      location: 'Remote',
      page: '1',
      ResultOnPage: '50',
    });
  });

  it('fails loud naming JOOBLE_API_KEY, and never puts the key in an error', async () => {
    const off = ctx({ env: () => undefined });
    await expect(readJooble(off)).rejects.toBeInstanceOf(MissingKeyError);
    await expect(readJooble(off)).rejects.toThrow(/JOOBLE_API_KEY is not set/);
    const refused = ctx({ fetch: vi.fn(async () => new Response('', { status: 403 })) });
    const err = String(await readJooble(refused).catch((e: Error) => e));
    expect(err).toMatch(/Jooble: HTTP 403/);
    expect(err).not.toMatch(/jb-key/);
    const down = ctx({
      fetch: vi.fn(async () => {
        throw new TypeError('error sending request for url (https://jooble.org/api/jb-key)');
      }),
    });
    const net = String(await readJooble(down).catch((e: Error) => e));
    expect(net).toMatch(/Jooble: network error/);
    expect(net).not.toMatch(/jb-key/);
    const slow = ctx({
      fetch: vi.fn(async () => {
        throw new DOMException('signal timed out', 'TimeoutError');
      }),
    });
    expect(String(await readJooble(slow).catch((e: Error) => e))).toMatch(/Jooble: timed out/);
  });
});
