// Company job boards on five applicant-tracking systems — Greenhouse, Lever, Ashby, Workable and
// Recruitee (the last two UNVERIFIED LIVE: written from their documented response shapes). Each exposes a public,
// keyless, CORS-open JSON API per company. Which companies to watch comes from the track itself: any
// tile whose URL is a board (e.g. https://jobs.ashbyhq.com/ramp) is pulled live. Durable portal in,
// fresh openings out — so the board never holds a stale one-off posting.
import { decodeEntities, htmlToText } from '../html';
import { inferMode } from '../match';
import type { JobMode } from '../../types';
import type { Posting } from '../types';
import { arr, obj, prettySlug, str, type FetchJson } from './http';

export type BoardKind = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee';
export interface Board {
  kind: BoardKind;
  slug: string;
  /** Lever's EU data-residency boards live on a separate host. */
  eu?: true;
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Recognize a company board URL; null for anything else (including searches *about* boards). */
export function parseBoardUrl(raw: string): Board | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  const ok = (slug: string | undefined | null): slug is string => !!slug && SLUG.test(slug);

  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const slug = seg[0] === 'embed' ? u.searchParams.get('for') : seg[0];
    return ok(slug) ? { kind: 'greenhouse', slug } : null;
  }
  if (host === 'boards-api.greenhouse.io') {
    const i = seg.indexOf('boards');
    return ok(seg[i + 1]) && i >= 0 ? { kind: 'greenhouse', slug: seg[i + 1] } : null;
  }
  if (host === 'jobs.lever.co') return ok(seg[0]) ? { kind: 'lever', slug: seg[0] } : null;
  if (host === 'jobs.eu.lever.co')
    return ok(seg[0]) ? { kind: 'lever', slug: seg[0], eu: true } : null;
  if (host === 'ashbyhq.com' || host.endsWith('.ashbyhq.com'))
    return ok(seg[0]) ? { kind: 'ashby', slug: seg[0] } : null;
  if (host === 'apply.workable.com')
    return ok(seg[0]) && seg[0] !== 'api' ? { kind: 'workable', slug: seg[0] } : null;
  if (host.endsWith('.recruitee.com')) {
    // One label only: `acme.recruitee.com`, not `www.`, `api.` or a deeper host.
    const sub = host.slice(0, -'.recruitee.com'.length);
    return ok(sub) && !sub.includes('.') && !['www', 'api', 'app'].includes(sub)
      ? { kind: 'recruitee', slug: sub }
      : null;
  }
  return null;
}

/** Every distinct board among `urls`, first-seen order, at most `max` (politeness cap). */
export function boardsFromUrls(urls: string[], max: number): Board[] {
  const seen = new Set<string>();
  const out: Board[] = [];
  for (const url of urls) {
    const b = parseBoardUrl(url);
    if (!b) continue;
    const key = `${b.kind}:${b.slug.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
    if (out.length >= max) break;
  }
  return out;
}

export function boardApiUrl(b: Board): string {
  const slug = encodeURIComponent(b.slug);
  switch (b.kind) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
    case 'lever':
      return `https://api${b.eu ? '.eu' : ''}.lever.co/v0/postings/${slug}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
    case 'workable':
      return `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`;
    case 'recruitee':
      return `https://${slug}.recruitee.com/api/offers/`;
  }
}

export const boardLabel = (b: Board) => prettySlug(b.slug);

/** The board's human-facing page — what a watched-company tile links to. */
export function canonicalBoardUrl(b: Board): string {
  switch (b.kind) {
    case 'greenhouse':
      return `https://boards.greenhouse.io/${b.slug}`;
    case 'lever':
      return `https://jobs${b.eu ? '.eu' : ''}.lever.co/${b.slug}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${b.slug}`;
    case 'workable':
      return `https://apply.workable.com/${b.slug}`;
    case 'recruitee':
      return `https://${b.slug}.recruitee.com`;
  }
}

const joinText = (...parts: string[]) => parts.filter(Boolean).join('\n');

export function parseGreenhouseJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = String(o.id ?? '');
  const url = str(o.absolute_url);
  if (!id || !url) return null;
  const location = str(obj(o.location).name);
  return {
    id: `greenhouse:${slug}:${id}`,
    source: 'greenhouse',
    title: str(o.title),
    company: str(o.company_name) || prettySlug(slug),
    url,
    location,
    mode: inferMode(location),
    postedAt: str(o.first_published) || str(o.updated_at) || undefined,
    // Greenhouse escapes its HTML once more than everyone else.
    text: htmlToText(decodeEntities(str(o.content))),
  };
}

/** Lever's and Ashby's `workplaceType`, lower-cased (Ashby says "OnSite"). */
const WORKPLACE_MODE: Record<string, JobMode> = {
  remote: 'remote',
  hybrid: 'hybrid',
  onsite: 'onsite',
};

export function parseLeverJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = str(o.id);
  const url = str(o.hostedUrl);
  if (!id || !url) return null;
  const cat = obj(o.categories);
  const location = str(cat.location);
  const commitment = str(cat.commitment);
  const created = typeof o.createdAt === 'number' ? new Date(o.createdAt).toISOString() : undefined;
  const lists = arr(o.lists)
    .map(obj)
    .map((l) => joinText(str(l.text), htmlToText(str(l.content))));
  return {
    id: `lever:${slug}:${id}`,
    source: 'lever',
    title: str(o.text),
    company: prettySlug(slug),
    url,
    location,
    mode: WORKPLACE_MODE[str(o.workplaceType).toLowerCase()] ?? inferMode(location),
    postedAt: created,
    text: joinText(
      commitment && `Commitment: ${commitment}`,
      str(o.descriptionPlain),
      ...lists,
      str(o.additionalPlain),
    ),
  };
}

export function parseAshbyJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = str(o.id);
  const url = str(o.jobUrl);
  if (!id || !url || o.isListed === false) return null;
  const location = str(o.location);
  const employment = str(o.employmentType);
  const mode =
    WORKPLACE_MODE[str(o.workplaceType).toLowerCase()] ??
    (o.isRemote === true ? 'remote' : inferMode(location));
  return {
    id: `ashby:${slug}:${id}`,
    source: 'ashby',
    title: str(o.title),
    company: prettySlug(slug),
    url,
    location,
    mode,
    postedAt: str(o.publishedAt) || undefined,
    text: joinText(
      // "FullTime" says nothing a signal needs; Contract / PartTime do.
      /contract|part/i.test(employment)
        ? `Employment: ${employment.replace(/([a-z])([A-Z])/g, '$1 $2')}`
        : '',
      str(o.descriptionPlain),
    ),
  };
}

export function parseWorkableJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const code = str(o.shortcode);
  const url = str(o.url);
  if (!code || !url) return null;
  const location = [str(o.city), str(o.state), str(o.country)].filter(Boolean).join(', ');
  const employment = str(o.employment_type);
  return {
    id: `workable:${slug}:${code}`,
    source: 'workable',
    title: str(o.title),
    company: prettySlug(slug),
    url,
    location,
    mode: o.telecommuting === true ? 'remote' : undefined,
    postedAt: str(o.published_on) || str(o.created_at) || undefined,
    text: joinText(employment && `Employment: ${employment}`, htmlToText(str(o.description))),
  };
}

export function parseRecruiteeJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = String(o.id ?? '');
  const url = str(o.careers_url);
  if (!id || !url) return null;
  const location = str(o.location);
  const employment = str(o.employment_type_code);
  return {
    id: `recruitee:${slug}:${id}`,
    source: 'recruitee',
    title: str(o.title),
    company: str(o.company_name) || prettySlug(slug),
    url,
    location,
    mode: o.remote === true ? 'remote' : inferMode(location),
    postedAt: str(o.created_at) || undefined,
    text: joinText(employment && `Employment: ${employment}`, htmlToText(str(o.description))),
  };
}

/** The raw job list inside a board payload; null when the payload isn't shaped like that board's
 *  (so a caller can tell "no openings" from "not a board response"). */
export function boardJobs(b: Board, body: unknown): unknown[] | null {
  const list =
    b.kind === 'lever' ? body : b.kind === 'recruitee' ? obj(body).offers : obj(body).jobs;
  return Array.isArray(list) ? list : null;
}

export async function fetchBoard(b: Board, fetchJson: FetchJson): Promise<Posting[]> {
  const body = await fetchJson(boardApiUrl(b));
  const found = boardJobs(b, body);
  // The two unofficial endpoints may change shape: say so rather than show an empty board.
  if (!found && (b.kind === 'workable' || b.kind === 'recruitee'))
    throw new Error(`${b.kind} board response had no job list`);
  const jobs = found ?? [];
  const parse = {
    greenhouse: parseGreenhouseJob,
    lever: parseLeverJob,
    ashby: parseAshbyJob,
    workable: parseWorkableJob,
    recruitee: parseRecruiteeJob,
  }[b.kind];
  return jobs.map((j) => parse(j, b.slug)).filter((p): p is Posting => !!p);
}
