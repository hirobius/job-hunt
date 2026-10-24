// Tier 1 sources for the sync edge function (Muse Phase 2, 2.5): the public Greenhouse, Lever and
// Ashby board APIs for a watched company, and the designsystems.jobs RSS feed. Ported from the
// handoff; each fetcher returns [] when the answer is not ok. One addition: `onFail` hears the
// status, so the sync can disable a watched company on a 404 instead of reading it as "no jobs".
// Pure apart from the injected fetch; never imported by the app bundle.
import type { NormalizedPosting } from './score.ts';

export type Ats = 'greenhouse' | 'lever' | 'ashby';

export interface WatchedCompany {
  company: string;
  ats: Ats;
  slug: string;
}

type Fetch = (url: string) => Promise<Response>;
type OnFail = (status: number) => void;

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson<T>(f: Fetch, url: string, onFail?: OnFail): Promise<T | null> {
  const r = await f(url);
  if (!r.ok) {
    onFail?.(r.status);
    return null;
  }
  return (await r.json()) as T;
}

interface GreenhouseJob {
  id: number | string;
  title: string;
  location?: { name?: string };
  absolute_url: string;
  content?: string;
  updated_at?: string;
}

export async function fetchGreenhouse(
  c: WatchedCompany,
  f: Fetch = fetch,
  onFail?: OnFail,
): Promise<NormalizedPosting[]> {
  const data = await getJson<{ jobs?: GreenhouseJob[] }>(
    f,
    `https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`,
    onFail,
  );
  if (!data) return [];
  return (data.jobs ?? []).map((j) => ({
    source: 'greenhouse',
    sourceId: String(j.id),
    title: j.title,
    company: c.company,
    location: j.location?.name,
    url: j.absolute_url,
    descriptionText: stripHtml(j.content ?? ''),
    postedAt: j.updated_at,
  }));
}

interface LeverJob {
  id: string;
  text: string;
  categories?: { location?: string };
  workplaceType?: string;
  hostedUrl: string;
  descriptionPlain?: string;
  description?: string;
  createdAt?: number;
}

export async function fetchLever(
  c: WatchedCompany,
  f: Fetch = fetch,
  onFail?: OnFail,
): Promise<NormalizedPosting[]> {
  const data = await getJson<LeverJob[]>(
    f,
    `https://api.lever.co/v0/postings/${c.slug}?mode=json`,
    onFail,
  );
  if (!Array.isArray(data)) return [];
  return data.map((j) => ({
    source: 'lever',
    sourceId: j.id,
    title: j.text,
    company: c.company,
    location: j.categories?.location,
    remote: j.workplaceType === 'remote',
    url: j.hostedUrl,
    descriptionText: j.descriptionPlain ?? stripHtml(j.description ?? ''),
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
  }));
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  jobUrl: string;
  descriptionHtml?: string;
  publishedAt?: string;
}

export async function fetchAshby(
  c: WatchedCompany,
  f: Fetch = fetch,
  onFail?: OnFail,
): Promise<NormalizedPosting[]> {
  const data = await getJson<{ jobs?: AshbyJob[] }>(
    f,
    `https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`,
    onFail,
  );
  if (!data) return [];
  return (data.jobs ?? []).map((j) => ({
    source: 'ashby',
    sourceId: j.id,
    title: j.title,
    company: c.company,
    location: j.location,
    remote: j.isRemote,
    url: j.jobUrl,
    descriptionText: stripHtml(j.descriptionHtml ?? ''),
    postedAt: j.publishedAt,
  }));
}

export const fetchCompany = (c: WatchedCompany, f: Fetch = fetch, onFail?: OnFail) =>
  ({ greenhouse: fetchGreenhouse, lever: fetchLever, ashby: fetchAshby })[c.ats](c, f, onFail);

export const DESIGN_SYSTEMS_JOBS_FEED = 'https://designsystems.jobs/feed';

const tagOf = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return (m?.[1] ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
};

/** designsystems.jobs (Phase 2.5): each <item> is "Role at Company", a link, a guid, a
 *  description "Category · Seniority · Full time · Remote · Country" and a pubDate. */
export async function fetchDesignSystemsJobsFeed(
  f: Fetch = fetch,
  onFail?: OnFail,
): Promise<NormalizedPosting[]> {
  const r = await f(DESIGN_SYSTEMS_JOBS_FEED);
  if (!r.ok) {
    onFail?.(r.status);
    return [];
  }
  const xml = await r.text();
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const full = stripHtml(tagOf(block, 'title'));
    const at = full.lastIndexOf(' at ');
    const description = stripHtml(tagOf(block, 'description'));
    const parts = description
      .split('·')
      .map((s) => s.trim())
      .filter(Boolean);
    const link = tagOf(block, 'link');
    const pub = tagOf(block, 'pubDate');
    const posted = pub ? new Date(pub) : null;
    return {
      source: 'rss' as const,
      sourceId: tagOf(block, 'guid') || link,
      title: at > 0 ? full.slice(0, at).trim() : full,
      company: at > 0 ? full.slice(at + 4).trim() : '',
      location: parts.length ? parts[parts.length - 1] : undefined,
      remote: /\bremote\b/i.test(description),
      url: link,
      descriptionText: description,
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted.toISOString() : undefined,
    };
  });
}
