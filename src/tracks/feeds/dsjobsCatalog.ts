// designsystems.jobs, the whole catalog (docs/research/ds-job-sources.md, source 1). Server only:
// the sync edge function reads it on the morning run; the browser keeps its RSS read through
// /api/boards. VERIFIED LIVE 2026-10-29 from the build sandbox: the sitemap listed 115 job pages
// (the RSS feed carries the newest 20), each with one schema.org `JobPosting` JSON-LD block.
//   GET https://designsystems.jobs/sitemap.xml   → every page; job pages are /companies/<co>/<job>
//   GET https://designsystems.jobs/companies/<co>/<job>   → JSON-LD (title, datePosted,
//       hiringOrganization.name + sameAs, jobLocation, employmentType, description, url) and a
//       "Location" line (Remote / Hybrid / On-site) in the page's facts list
// Terms: the site states none (its terms URLs 404); robots.txt is `Allow: /`. Its disclaimer says
// the original listing is authoritative. We keep to the polite reading: every row links to its
// designsystems.jobs page as given and is credited "designsystems.jobs" (SOURCE_LABEL.rss).
// Rate limit: none stated. We read pages one at a time, PAGE_GAP_MS apart, with a User-Agent that
// names the app, and only pages nobody has stored before (a known URL reuses the stored row:
// the sitemap's lastmod moves every day, so it says nothing about the content), at most
// MAX_PAGES_PER_RUN a run. A URL not read yet this run falls back to its RSS item, or waits.
// Source id = the page URL, the same as the RSS guid, so the catalog and the feed name a posting
// the same way and old `rss` rows carry over.
import { htmlToText } from '../../feed/html.ts';
import { inferMode } from '../../feed/mode.ts';
import { BRAND } from '../../brand.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';

export const DSJOBS_SITEMAP = 'https://designsystems.jobs/sitemap.xml';
export const DSJOBS_ORIGIN = 'https://designsystems.jobs';
/** New pages read per run; the rest wait for the next morning (the RSS covers the newest 20). */
export const MAX_PAGES_PER_RUN = 40;
/** Between page reads. */
export const PAGE_GAP_MS = 1000;
export const USER_AGENT = `${BRAND.name} (+https://roleflame.vercel.app)`;
type Http = (url: string, init?: RequestInit) => Promise<Response>;

/** The job pages in a sitemap: `/companies/<company>/<job>` (company pages have 2 segments). */
export function parseSitemapJobs(xml: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = httpUrl(m[1]);
    if (!url) continue;
    const u = new URL(url);
    if (u.origin !== DSJOBS_ORIGIN) continue;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 3 || parts[0] !== 'companies') continue;
    const clean = `${DSJOBS_ORIGIN}/${parts.join('/')}`;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** The page's JobPosting block, or {} (a page may hold several JSON-LD blocks, or a graph). */
function jobPostingOf(html: string): O {
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const graph = obj(data)['@graph'];
    const nodes = Array.isArray(data) ? data : [data, ...(Array.isArray(graph) ? graph : [])];
    const job = nodes.map(obj).find((n) => n['@type'] === 'JobPosting');
    if (job) return job;
  }
  return {};
}

/** The page's "Location" fact (Remote / Hybrid / On-site), as text. */
function locationFact(html: string): string {
  const m = /<dt[^>]*>\s*Location\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i.exec(html);
  return m ? htmlToText(m[1]) : '';
}

/** One job page as a posting; null when it holds no readable JobPosting. */
export function parseJobPage(html: string, pageUrl: string): NormalizedPosting | null {
  const job = jobPostingOf(html);
  const title = htmlToText(str(job.title));
  const url = httpUrl(str(job.url)) ?? httpUrl(pageUrl);
  if (!title || !url) return null;
  const org = obj(job.hiringOrganization);
  const places = (Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation])
    .map((p) => obj(obj(p).address))
    .map((a) =>
      [str(a.addressLocality), str(a.addressRegion), str(a.addressCountry)]
        .filter(Boolean)
        .join(', '),
    )
    .filter(Boolean);
  const fact = locationFact(html);
  const mode = inferMode(fact);
  const telecommute = str(job.jobLocationType).toUpperCase() === 'TELECOMMUTE';
  const posted = Date.parse(str(job.datePosted));
  return {
    source: 'rss',
    sourceId: pageUrl,
    title,
    company: htmlToText(str(org.name)),
    location: [fact, ...places].filter(Boolean).join(', ') || undefined,
    remote: mode === 'remote' || telecommute || undefined,
    url,
    descriptionText: htmlToText(str(job.description)),
    postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
  };
}

export interface CatalogRead {
  postings: NormalizedPosting[];
  /** False when some job pages were neither stored, read nor in the RSS: the read is not the whole
   *  catalog, so nothing may close as missed this run. */
  complete: boolean;
  pagesRead: number;
}

/** The catalog: the sitemap's job pages, each from `known` (stored rows by page URL), else read,
 *  else from `rss` (the feed's items by guid). Throws when the sitemap can't be read, so the
 *  caller falls back to the RSS feed alone. */
export async function readDsJobsCatalog(o: {
  fetch: Http;
  known?: ReadonlyMap<string, NormalizedPosting>;
  rss?: readonly NormalizedPosting[];
  maxPages?: number;
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<CatalogRead> {
  const {
    fetch: f,
    known = new Map(),
    maxPages = MAX_PAGES_PER_RUN,
    gapMs = PAGE_GAP_MS,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = o;
  const headers = { 'user-agent': USER_AGENT };
  const r = await f(DSJOBS_SITEMAP, { headers });
  if (!r.ok) throw new Error(`designsystems.jobs sitemap: HTTP ${r.status}`);
  const pages = parseSitemapJobs(await r.text());
  const rss = new Map((o.rss ?? []).map((p) => [p.sourceId, p]));
  const postings: NormalizedPosting[] = [];
  let complete = true;
  let pagesRead = 0;
  for (const page of pages) {
    const stored = known.get(page);
    if (stored) {
      postings.push({ ...stored, source: 'rss', sourceId: page });
      continue;
    }
    let read: NormalizedPosting | null = null;
    if (pagesRead < maxPages) {
      if (pagesRead > 0) await sleep(gapMs);
      pagesRead++;
      try {
        const res = await f(page, { headers });
        // A page gone since the sitemap was built is simply not listed.
        if (res.status === 404 || res.status === 410) continue;
        if (res.ok) read = parseJobPage(await res.text(), page);
      } catch {
        // Counted as not read below.
      }
    }
    const fallback = read ?? rss.get(page) ?? null;
    if (fallback) postings.push(fallback);
    else complete = false;
  }
  // A feed item the sitemap does not list yet (it lags the feed) is still an opening.
  const listed = new Set(pages);
  for (const p of rss.values()) if (!listed.has(p.sourceId)) postings.push(p);
  return { postings, complete, pagesRead };
}
