import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FeedContext } from './context';
import { ARBEITNOW_PAGES, arbeitnowUrl, parseArbeitnow, readArbeitnow } from './arbeitnow';
import { isDsRole } from './dsRole';
import { parseRemoteOk, readRemoteOk, REMOTEOK_URL, remoteOkTermsOk } from './remoteok';

const fixture = (name: string) => readFileSync(`src/tracks/feeds/fixtures/${name}`, 'utf8');
const ctx = (fetch: FeedContext['fetch']): FeedContext => ({
  fetch,
  env: () => undefined,
  now: () => new Date('2026-10-29T06:00:00Z'),
  sleep: vi.fn(async () => {}),
});

describe('isDsRole', () => {
  it('keeps design-system titles and descriptions, never "ecosystem" or "system design"', () => {
    expect(isDsRole('Design Systems Engineer')).toBe(true);
    expect(isDsRole('Design-System Lead')).toBe(true);
    expect(isDsRole('Design Technologist')).toBe(true);
    expect(isDsRole('Product Designer', 'Contribute to our design system')).toBe(true);
    expect(isDsRole('Backend Engineer', 'our ecosystem of services')).toBe(false);
    expect(isDsRole('Engineer', 'distributed system design')).toBe(false);
  });
});

describe('Arbeitnow', () => {
  const page = JSON.parse(fixture('arbeitnow-page1.json'));

  it('keeps remote design-system roles, linked to their Arbeitnow page', () => {
    const [a, b, ...rest] = parseArbeitnow(page);
    expect(rest).toEqual([]);
    expect(a).toEqual({
      source: 'arbeitnow',
      sourceId: 'arbeitnow:design-systems-engineer-acme-berlin-123',
      title: 'Design Systems Engineer (m/w/d)',
      company: 'Acme GmbH',
      location: 'Berlin',
      remote: true,
      url: 'https://www.arbeitnow.com/jobs/companies/acme/design-systems-engineer-acme-berlin-123',
      descriptionText: 'Build and own our design system in React.',
      postedAt: new Date(1761696000 * 1000).toISOString(),
    });
    // In through its description; the on-site one, the "ecosystem" one and the bad link are out.
    expect(b.sourceId).toBe('arbeitnow:product-designer-beta-456');
    expect(parseArbeitnow(null)).toEqual([]);
  });

  it('reads its first pages a second apart, stopping where the list ends', async () => {
    const last = { data: [], links: { next: null } };
    const fetch = vi.fn(
      async (u: string) => new Response(JSON.stringify(u.endsWith('page=1') ? page : last)),
    );
    const c = ctx(fetch);
    expect(await readArbeitnow(c)).toHaveLength(2);
    expect(fetch.mock.calls.map((x) => x[0])).toEqual([arbeitnowUrl(1), arbeitnowUrl(2)]);
    expect(c.sleep).toHaveBeenCalledTimes(1);
    expect(ARBEITNOW_PAGES).toBeGreaterThanOrEqual(2);
  });

  it('fails loud on a refused first page', async () => {
    const c = ctx(vi.fn(async () => new Response('', { status: 503 })));
    await expect(readArbeitnow(c)).rejects.toThrow(/Arbeitnow: HTTP 503/);
  });
});

describe('Remote OK', () => {
  const body = JSON.parse(fixture('remoteok-api.json'));

  it('reads only while its legal notice still asks for a link back and credit', () => {
    expect(remoteOkTermsOk(body)).toBe(true);
    expect(remoteOkTermsOk([{ legal: 'API access is for paying partners only.' }])).toBe(false);
    expect(remoteOkTermsOk([])).toBe(false);
  });

  it('keeps design-system roles, linked to their own Remote OK page', () => {
    expect(parseRemoteOk(body)).toEqual([
      {
        source: 'remoteok',
        sourceId: 'remoteok:1100001',
        title: 'Senior Design Systems Engineer',
        company: 'Acme',
        location: 'Worldwide',
        remote: true,
        url: 'https://remoteok.com/remote-jobs/remote-senior-design-systems-engineer-acme-1100001',
        descriptionText: 'Lead our design system.',
        postedAt: '2026-10-29T00:00:00.000Z',
      },
    ]);
  });

  it('sends a User-Agent, and stops with a named error when the terms changed', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(body)));
    expect(await readRemoteOk(ctx(fetch))).toHaveLength(1);
    expect(fetch.mock.calls[0][0]).toBe(REMOTEOK_URL);
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('user-agent')).toMatch(/\+https:/);
    const changed = ctx(vi.fn(async () => new Response(JSON.stringify([{ legal: 'No.' }]))));
    await expect(readRemoteOk(changed)).rejects.toThrow(/Remote OK: its API terms changed/);
  });
});
