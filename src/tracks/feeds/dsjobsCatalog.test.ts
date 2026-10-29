import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { NormalizedPosting } from '../score';
import {
  DSJOBS_SITEMAP,
  parseJobPage,
  parseSitemapJobs,
  readDsJobsCatalog,
  USER_AGENT,
} from './dsjobsCatalog';

const fixture = (name: string) => readFileSync(`src/tracks/feeds/fixtures/${name}`, 'utf8');
const SITEMAP = fixture('dsjobs-sitemap.xml');
const PAGE = fixture('dsjobs-job.html');
const DESIGNER = 'https://designsystems.jobs/companies/pennylane/design-system-designer';
const MANAGER = 'https://designsystems.jobs/companies/pennylane/design-system-manager';
const WHOOP = 'https://designsystems.jobs/companies/whoop/product-designer-ii-design-systems';

const posting = (sourceId: string, title: string, descriptionText = ''): NormalizedPosting => ({
  source: 'rss',
  sourceId,
  title,
  company: 'X',
  url: sourceId,
  descriptionText,
});
const FULL = 'Own the design system.';

describe('designsystems.jobs sitemap', () => {
  it('keeps only job pages (three path segments under /companies)', () => {
    expect(parseSitemapJobs(SITEMAP)).toEqual([DESIGNER, MANAGER, WHOOP]);
  });

  it('drops other hosts, non-http links and repeats', () => {
    const xml = `<urlset><url><loc>https://evil.example/companies/a/b</loc></url>
      <url><loc>javascript:alert(1)</loc></url>
      <url><loc>${DESIGNER}</loc></url><url><loc>${DESIGNER}/</loc></url></urlset>`;
    expect(parseSitemapJobs(xml)).toEqual([DESIGNER]);
  });
});

describe('designsystems.jobs job page', () => {
  it('reads the JobPosting JSON-LD and the Location fact', () => {
    const p = parseJobPage(PAGE, DESIGNER)!;
    expect(p).toMatchObject({
      source: 'rss',
      sourceId: DESIGNER,
      title: 'Design system designer',
      company: 'Pennylane',
      location: 'Hybrid, France',
      url: DESIGNER,
      postedAt: '2026-08-04T00:00:00.000Z',
    });
    expect(p.remote).toBeUndefined();
    expect(p.descriptionText).toMatch(/^This role sits within Pennylane's design team/);
    expect(p.descriptionText).not.toMatch(/<|&#039;/);
  });

  it('marks a remote page remote (the fact, or TELECOMMUTE)', () => {
    const remote = PAGE.replace(/(Location<\/dt>[\s\S]*?<span>)Hybrid/, '$1Remote');
    expect(parseJobPage(remote, DESIGNER)!.remote).toBe(true);
    const ld = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'DS Engineer',
      jobLocationType: 'TELECOMMUTE',
    })}</script>`;
    expect(parseJobPage(ld, DESIGNER)).toMatchObject({ remote: true, url: DESIGNER });
  });

  it('is null without a JobPosting', () => {
    expect(parseJobPage('<html></html>', DESIGNER)).toBeNull();
    expect(parseJobPage('<script type="application/ld+json">{oops</script>', DESIGNER)).toBeNull();
  });
});

describe('readDsJobsCatalog', () => {
  const sleep = vi.fn(async () => {});
  const http = (pages: Record<string, Response | (() => Response)>) =>
    vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === DSJOBS_SITEMAP) return new Response(SITEMAP);
      const r = pages[url];
      return r ? (typeof r === 'function' ? r() : r) : new Response('', { status: 404 });
    });

  it('reads each new page once, names the app, and is complete', async () => {
    const f = http({
      [DESIGNER]: () => new Response(PAGE),
      [MANAGER]: () => new Response(PAGE),
      [WHOOP]: () => new Response(PAGE),
    });
    const r = await readDsJobsCatalog({ fetch: f, sleep });
    expect(r.complete).toBe(true);
    expect(r.pagesRead).toBe(3);
    expect(r.postings.map((p) => p.sourceId)).toEqual([DESIGNER, MANAGER, WHOOP]);
    expect(f.mock.calls[0][1]).toEqual({ headers: { 'user-agent': USER_AGENT } });
    // Sequential and spaced: a gap before every page after the first.
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('reuses stored rows instead of reading their pages', async () => {
    const f = http({ [WHOOP]: () => new Response(PAGE) });
    const known = new Map([
      [DESIGNER, posting(DESIGNER, 'Stored designer', FULL)],
      [MANAGER, posting(MANAGER, 'Stored manager', FULL)],
    ]);
    const r = await readDsJobsCatalog({ fetch: f, known, sleep });
    expect(r.pagesRead).toBe(1);
    expect(r.postings.map((p) => p.title)).toEqual([
      'Stored designer',
      'Stored manager',
      'Design system designer',
    ]);
    expect(f).toHaveBeenCalledTimes(2); // the sitemap + WHOOP
  });

  it('keeps a feed item the sitemap does not list yet', async () => {
    const f = http({
      [DESIGNER]: () => new Response(PAGE),
      [MANAGER]: () => new Response(PAGE),
      [WHOOP]: () => new Response(PAGE),
    });
    const NEW = 'https://designsystems.jobs/companies/new/ds-lead';
    const r = await readDsJobsCatalog({ fetch: f, rss: [posting(NEW, 'Brand new')], sleep });
    expect(r.complete).toBe(true);
    expect(r.postings.map((p) => p.sourceId)).toEqual([DESIGNER, MANAGER, WHOOP, NEW]);
  });

  it('past the page cap, falls back to the RSS item, else is incomplete', async () => {
    const f = http({ [DESIGNER]: () => new Response(PAGE) });
    const r = await readDsJobsCatalog({
      fetch: f,
      maxPages: 1,
      rss: [posting(MANAGER, 'From RSS')],
      sleep,
    });
    expect(r.postings.map((p) => p.title)).toEqual(['Design system designer', 'From RSS']);
    expect(r.complete).toBe(false); // WHOOP: not read, not in the RSS
  });

  it('a page that 404s is gone; one that fails leaves the read incomplete', async () => {
    const f = http({
      [DESIGNER]: () => new Response(PAGE),
      [MANAGER]: () => new Response('', { status: 503 }),
    });
    const r = await readDsJobsCatalog({ fetch: f, sleep });
    expect(r.postings.map((p) => p.sourceId)).toEqual([DESIGNER]);
    expect(r.complete).toBe(false);
  });

  it('throws when the sitemap does not answer', async () => {
    const f = vi.fn(async () => new Response('', { status: 500 }));
    await expect(readDsJobsCatalog({ fetch: f, sleep })).rejects.toThrow(/sitemap: HTTP 500/);
  });
});
