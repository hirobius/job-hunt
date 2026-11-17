import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { isPartial, type FeedContext } from './context';
import { fourDayWeekUrl, parseFourDayWeek, readFourDayWeek } from './fourdayweek';

const raw = (f: string) => readFileSync(`src/tracks/feeds/fixtures/${f}`, 'utf8');
const json = (f: string) => JSON.parse(raw(f)) as unknown;
const ctx = (body: string, o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(body)),
  env: () => undefined,
  now: () => new Date('2026-11-17T06:23:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('4dayweek.io', () => {
  it('keeps design-systems roles with a link, credited to 4dayweek.io', () => {
    expect(parseFourDayWeek(json('fourdayweek-jobs.json'))).toEqual([
      {
        source: 'fourdayweek',
        sourceId: 'fourdayweek:design-systems-engineer-acme-4day',
        title: 'Design Systems Engineer',
        company: 'Acme 4Day',
        location: 'Remote (Europe)',
        remote: true,
        url: 'https://4dayweek.io/remote-job/design-systems-engineer-acme-4day',
        descriptionText: 'Own our design system in React.',
        postedAt: '2026-11-12T09:00:00.000Z',
      },
    ]);
  });

  it('stops at has_more false; a later page failing keeps what came, marked partial', async () => {
    const c = ctx(raw('fourdayweek-jobs.json'));
    await readFourDayWeek(c);
    expect(vi.mocked(c.fetch).mock.calls.map((x) => x[0])).toEqual([fourDayWeekUrl(1)]);
    let n = 0;
    const more = JSON.stringify({ ...(json('fourdayweek-jobs.json') as object), has_more: true });
    const c2 = ctx('', {
      fetch: vi.fn(async () => (n++ ? new Response('', { status: 500 }) : new Response(more))),
    });
    const got = await readFourDayWeek(c2);
    expect(got).toHaveLength(1);
    expect(isPartial(got)).toBe(true);
    await expect(
      readFourDayWeek(ctx('', { fetch: vi.fn(async () => new Response('', { status: 503 })) })),
    ).rejects.toThrow('4dayweek.io: HTTP 503');
  });
});
