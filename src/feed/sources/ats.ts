// Company job boards on eight applicant-tracking systems — Greenhouse, Lever, Ashby, Workable,
// Recruitee, SmartRecruiters, Teamtailor and Personio (the last five UNVERIFIED LIVE: written from
// their documented or commonly reported response shapes, #216). Each exposes a public,
// keyless, CORS-open JSON API per company. Which companies to watch comes from the track itself: any
// tile whose URL is a board (e.g. https://jobs.ashbyhq.com/ramp) is pulled live. Durable portal in,
// fresh openings out — so the board never holds a stale one-off posting.
import { decodeEntities, htmlToText } from '../html.ts';
import { inferMode } from '../mode.ts';
import type { JobMode } from '../../types.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { Posting } from '../types.ts';
import { arr, obj, prettySlug, str, type FetchJson } from './http.ts';

export type BoardKind =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'recruitee'
  | 'smartrecruiters'
  | 'teamtailor'
  | 'personio';
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
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com')
    return ok(seg[0]) ? { kind: 'smartrecruiters', slug: seg[0] } : null;
  const sub = (suffix: string) => {
    if (!host.endsWith(suffix)) return null;
    const label = host.slice(0, -suffix.length);
    return ok(label) && !label.includes('.') && !['www', 'api', 'app'].includes(label)
      ? label
      : null;
  };
  const tt = sub('.teamtailor.com');
  if (tt) return { kind: 'teamtailor', slug: tt };
  const pe = sub('.jobs.personio.de') ?? sub('.jobs.personio.com');
  if (pe) return { kind: 'personio', slug: pe };
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
    case 'smartrecruiters':
      return `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`;
    case 'teamtailor':
      return `https://${slug}.teamtailor.com/jobs.json`;
    case 'personio':
      return `https://${slug}.jobs.personio.de/search.json`;
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
    case 'smartrecruiters':
      return `https://jobs.smartrecruiters.com/${b.slug}`;
    case 'teamtailor':
      return `https://${b.slug}.teamtailor.com/jobs`;
    case 'personio':
      return `https://${b.slug}.jobs.personio.de`;
  }
}

const joinText = (...parts: string[]) => parts.filter(Boolean).join('\n');

export function parseGreenhouseJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = String(o.id ?? '');
  const url = httpUrl(str(o.absolute_url));
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
  const url = httpUrl(str(o.hostedUrl));
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
  const url = httpUrl(str(o.jobUrl));
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
  const url = httpUrl(str(o.url));
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
  const url = httpUrl(str(o.careers_url));
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

/** SmartRecruiters' Posting API lists postings without bodies; the matcher gets the facets. */
export function parseSmartRecruitersJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = String(o.id ?? '');
  if (!id) return null;
  const loc = obj(o.location);
  const location =
    str(loc.fullLocation) ||
    [str(loc.city), str(loc.region), str(loc.country).toUpperCase()].filter(Boolean).join(', ');
  const employment = str(obj(o.typeOfEmployment).label);
  return {
    id: `smartrecruiters:${slug}:${id}`,
    source: 'smartrecruiters',
    title: str(o.name),
    company: str(obj(o.company).name) || prettySlug(slug),
    url: `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`,
    location,
    mode: loc.remote === true ? 'remote' : loc.hybrid === true ? 'hybrid' : inferMode(location),
    postedAt: str(o.releasedDate) || undefined,
    text: joinText(
      employment && `Employment: ${employment}`,
      str(obj(o.department).label),
      str(obj(o.experienceLevel).label),
    ),
  };
}

/** Teamtailor's `remote-status`. */
const TEAMTAILOR_MODE: Record<string, JobMode> = {
  fully: 'remote',
  hybrid: 'hybrid',
  none: 'onsite',
};

/** A Teamtailor career site's `jobs.json`: a flat job, or a JSON:API resource (`attributes`, `links`). */
export function parseTeamtailorJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const a = { ...o, ...obj(o.attributes) };
  const id = String(o.id ?? '');
  const url = httpUrl(str(a.url)) ?? httpUrl(str(obj(o.links)['careersite-job-url']));
  if (!id || !url) return null;
  const location = str(a.location) || str(obj(arr(a.locations)[0]).name);
  const remote = str(a['remote-status'] ?? a.remote_status).toLowerCase();
  return {
    id: `teamtailor:${slug}:${id}`,
    source: 'teamtailor',
    title: str(a.title),
    company: prettySlug(slug),
    url,
    location,
    mode: TEAMTAILOR_MODE[remote] ?? inferMode(location),
    postedAt: str(a['created-at'] ?? a.created_at ?? a.published_at) || undefined,
    text: htmlToText(str(a.body)),
  };
}

/** A Personio career page's `search.json` position (no body; the facets go to the matcher). */
export function parsePersonioJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = String(o.id ?? '');
  if (!id) return null;
  const location = str(o.office);
  const employment = str(o.employment_type);
  return {
    id: `personio:${slug}:${id}`,
    source: 'personio',
    title: str(o.name),
    company: prettySlug(slug),
    url: `https://${slug}.jobs.personio.de/job/${encodeURIComponent(id)}`,
    location,
    mode: inferMode(location),
    postedAt: str(o.created_at) || undefined,
    text: joinText(
      employment && `Employment: ${employment}`,
      str(o.schedule),
      str(o.department),
      str(o.seniority),
      str(o.keywords),
    ),
  };
}

/** Boards whose API answers 200 with an empty list for a company that has no board at all, so the
 *  probe reads "no jobs" there as none rather than as a live board. */
export const EMPTY_MEANS_NONE: ReadonlySet<BoardKind> = new Set(['smartrecruiters']);

/** Endpoints written from reported, not official, shapes: a body without a list is an error. */
const UNOFFICIAL: ReadonlySet<BoardKind> = new Set([
  'workable',
  'recruitee',
  'smartrecruiters',
  'teamtailor',
  'personio',
]);

/** The raw job list inside a board payload; null when the payload isn't shaped like that board's
 *  (so a caller can tell "no openings" from "not a board response"). */
export function boardJobs(b: Board, body: unknown): unknown[] | null {
  const list =
    b.kind === 'lever' || b.kind === 'personio'
      ? body
      : b.kind === 'recruitee'
        ? obj(body).offers
        : b.kind === 'smartrecruiters'
          ? obj(body).content
          : b.kind === 'teamtailor'
            ? Array.isArray(body)
              ? body
              : (obj(body).jobs ?? obj(body).data)
            : obj(body).jobs;
  return Array.isArray(list) ? list : null;
}

export async function fetchBoard(b: Board, fetchJson: FetchJson): Promise<Posting[]> {
  const body = await fetchJson(boardApiUrl(b));
  const found = boardJobs(b, body);
  // The unofficial endpoints may change shape: say so rather than show an empty board.
  if (!found && UNOFFICIAL.has(b.kind)) throw new Error(`${b.kind} board response had no job list`);
  const jobs = found ?? [];
  const parse = {
    greenhouse: parseGreenhouseJob,
    lever: parseLeverJob,
    ashby: parseAshbyJob,
    workable: parseWorkableJob,
    recruitee: parseRecruiteeJob,
    smartrecruiters: parseSmartRecruitersJob,
    teamtailor: parseTeamtailorJob,
    personio: parsePersonioJob,
  }[b.kind];
  return jobs.map((j) => parse(j, b.slug)).filter((p): p is Posting => !!p);
}
