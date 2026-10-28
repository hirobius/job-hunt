// Five more company job boards with a public, keyless JSON list (#src-ats): BambooHR, Rippling ATS,
// Gem, Pinpoint and Breezy HR. ALL UNVERIFIED LIVE: their hosts could not be reached from the build
// container, so each parser is written from the shape the board's own careers page reads and
// tolerates the field names reported for it; a body without a job list is an error, never "no jobs"
// (`UNOFFICIAL` in ats.ts). CORS is unverified too: `probe.ts` reads a connection failure on them as
// "none" once another system answered, so a blocked host never turns a company into "couldn't check".
//
// Terms and politeness. Each list is the same public JSON the board's own careers page loads in the
// visitor's browser, one request per board, through the probe's limiter (2 per host, 150 ms apart)
// and the feed's 1 h cache. No key, no login, no scraping of HTML pages.
//   BambooHR   https://<co>.bamboohr.com/careers/list           (the careers page's own list)
//   Rippling   https://api.rippling.com/platform/api/ats/v1/board/<co>/jobs  (public board API)
//   Gem        https://api.gem.com/job_board/v0/<co>/job_posts/  (Gem's documented Job Board API,
//              "to embed live job posts on a web page"; help.gem.com, "the job board api")
//   Pinpoint   https://<co>.pinpointhq.com/postings.json        (the careers site's own list)
//   Breezy HR  https://<co>.breezy.hr/json                      (the careers site's public feed)
// Every posting links to the board's own page, and the row names its source.
//
// Not built, and why:
//   JazzHR     no public JSON: careers pages on applytojob.com are HTML, the feed is XML and the API
//              needs the employer's key.
//   Comeet     the careers API needs the company's uid and its per-company token, so a name cannot be
//              probed; a pasted Comeet page carries neither in its URL.
//   Freshteam  public listings need the employer's API key (and Freshworks is retiring Freshteam).
//   Workday    the CXS list is a POST to <tenant>.wd<N>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs,
//              not CORS-open, and the tenant, data centre and site can't be derived from a name. Big
//              company ATSs stay Google links only (CLAUDE.md: never fetch them).
import { htmlToText } from '../html';
import { inferMode } from '../match';
import type { JobMode } from '../../types';
import { httpUrl } from '../../httpUrl';
import type { Posting } from '../types';
import { arr, obj, prettySlug, str } from './http';

const joinText = (...parts: string[]) => parts.filter(Boolean).join('\n');
const idOf = (v: unknown) => (typeof v === 'number' || typeof v === 'string' ? String(v) : '');
const first = (...vals: unknown[]) => {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return '';
};
/** "1" / true / "remote" → remote, "hybrid" → hybrid, "onsite"/"in_office" → onsite. */
function modeOf(...vals: unknown[]): JobMode | undefined {
  for (const v of vals) {
    if (v === true) return 'remote';
    const s = typeof v === 'string' ? v.toLowerCase().replace(/[\s_-]/g, '') : '';
    if (s === 'remote' || s === 'fullyremote') return 'remote';
    if (s === 'hybrid') return 'hybrid';
    if (s === 'onsite' || s === 'inoffice' || s === 'office') return 'onsite';
  }
  return undefined;
}
const place = (...parts: unknown[]) =>
  parts
    .map((p) => (typeof p === 'string' ? p : str(obj(p).name)))
    .filter(Boolean)
    .join(', ');

/** BambooHR's `careers/list`: `{ result: [...] }` with `jobOpeningName` and a location object. */
export function parseBambooJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = idOf(o.id);
  if (!id) return null;
  const loc = { ...obj(o.atsLocation), ...obj(o.location) };
  const location = place(loc.city, loc.state ?? loc.province, loc.country);
  const employment = first(o.employmentStatusLabel);
  return {
    id: `bamboohr:${slug}:${id}`,
    source: 'bamboohr',
    title: first(o.jobOpeningName, o.title),
    company: prettySlug(slug),
    url: `https://${slug}.bamboohr.com/careers/${encodeURIComponent(id)}`,
    location,
    mode: modeOf(o.isRemote) ?? inferMode(location),
    postedAt: first(o.datePosted) || undefined,
    text: joinText(employment && `Employment: ${employment}`, first(o.departmentLabel)),
  };
}

/** Rippling's board API: a list of `{ uuid, name, url, department, workLocation(s) }`. */
export function parseRipplingJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = idOf(o.uuid ?? o.id);
  if (!id) return null;
  const location =
    first(obj(o.workLocation).label, obj(o.workLocation).name) ||
    arr(o.workLocations ?? o.locations)
      .map((l) => first(obj(l).label, obj(l).name, l))
      .filter(Boolean)
      .join('; ');
  return {
    id: `rippling:${slug}:${id}`,
    source: 'rippling',
    title: first(o.name, o.title),
    company: prettySlug(slug),
    url:
      httpUrl(str(o.url)) ??
      `https://ats.rippling.com/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(id)}`,
    location,
    mode: modeOf(o.locationType, o.workplaceType) ?? inferMode(location),
    postedAt: first(o.createdAt, o.created_at) || undefined,
    text: joinText(first(obj(o.department).label, obj(o.department).name, o.department)),
  };
}

/** Gem's Job Board API: Greenhouse-like posts with `absolute_url`, `content` and `location_type`. */
export function parseGemJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = idOf(o.id);
  const url = httpUrl(str(o.absolute_url)) ?? httpUrl(str(o.url));
  if (!id || !url) return null;
  const location = first(obj(o.location).name, o.location);
  const employment = first(o.employment_type);
  return {
    id: `gem:${slug}:${id}`,
    source: 'gem',
    title: first(o.title),
    company: prettySlug(slug),
    url,
    location,
    mode: modeOf(o.location_type) ?? inferMode(location),
    postedAt: first(o.first_published_at, o.created_at, o.updated_at) || undefined,
    text: joinText(
      /contract|part/i.test(employment) ? `Employment: ${employment.replace(/_/g, ' ')}` : '',
      first(o.content_plain) || htmlToText(str(o.content)),
    ),
  };
}

/** Pinpoint's `postings.json`: `{ data: [...] }`, each with `url`, `workplace_type` and HTML text. */
export function parsePinpointJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const a = { ...o, ...obj(o.attributes) };
  const id = idOf(o.id);
  if (!id) return null;
  const loc = obj(a.location);
  const location = first(loc.name) || place(loc.city, loc.province, loc.country);
  const employment = first(a.employment_type_text, a.employment_type);
  return {
    id: `pinpoint:${slug}:${id}`,
    source: 'pinpoint',
    title: first(a.title),
    company: prettySlug(slug),
    url: httpUrl(str(a.url)) ?? `https://${slug}.pinpointhq.com/postings/${encodeURIComponent(id)}`,
    location,
    mode: modeOf(a.workplace_type) ?? inferMode(location),
    postedAt: first(a.published_at, a.created_at) || undefined,
    text: joinText(
      employment && `Employment: ${employment}`,
      htmlToText(first(a.description)),
      htmlToText(first(a.key_responsibilities)),
      htmlToText(first(a.skills_knowledge_expertise)),
    ),
  };
}

/** Breezy's public `json`: a list with `name`, `url`, `published_date`, `type`, a location object
 *  and the company's name. */
export function parseBreezyJob(j: unknown, slug: string): Posting | null {
  const o = obj(j);
  const id = idOf(o.id ?? o.friendly_id);
  if (!id) return null;
  const loc = obj(o.location);
  const location = first(loc.name) || place(loc.city, loc.state, loc.country);
  const employment = first(obj(o.type).name, o.type);
  return {
    id: `breezy:${slug}:${id}`,
    source: 'breezy',
    title: first(o.name, o.title),
    company: first(obj(o.company).name) || prettySlug(slug),
    url:
      httpUrl(str(o.url)) ??
      `https://${slug}.breezy.hr/p/${encodeURIComponent(idOf(o.friendly_id) || id)}`,
    location,
    mode: modeOf(loc.is_remote, o.is_remote) ?? inferMode(location),
    postedAt: first(o.published_date) || undefined,
    text: joinText(
      employment && `Employment: ${employment}`,
      first(obj(o.department).name, o.department),
      htmlToText(first(o.description)),
    ),
  };
}

/** Each board's job list inside its payload; null when the payload is not shaped like one. */
export const EXTRA_LISTS = {
  bamboohr: (b: unknown) => obj(b).result,
  rippling: (b: unknown) => (Array.isArray(b) ? b : (obj(b).items ?? obj(b).jobs)),
  gem: (b: unknown) => (Array.isArray(b) ? b : (obj(b).job_posts ?? obj(b).jobs)),
  pinpoint: (b: unknown) => obj(b).data,
  breezy: (b: unknown) => b,
} as const;

export const EXTRA_PARSERS = {
  bamboohr: parseBambooJob,
  rippling: parseRipplingJob,
  gem: parseGemJob,
  pinpoint: parsePinpointJob,
  breezy: parseBreezyJob,
} as const;
