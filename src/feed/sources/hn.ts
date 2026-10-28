// Hacker News "Ask HN: Who is hiring?" — the monthly thread where startups post openings, often
// founder-written and open to contract. Read through the public Algolia HN API (keyless, CORS-open).
// Each top-level comment is one company's post; by convention its first line is
// "Company | Role | Location | REMOTE/ONSITE | …", which we parse best-effort.
// The monthly "Freelancer? Seeking freelancer?" thread is read the same way (contract design-systems
// work is posted there): only the "SEEKING FREELANCER" side is a posting, "SEEKING WORK" is a person
// offering themselves and is skipped, and each kept post is marked as freelance for the contract
// signal. "Ask HN: Who wants to be hired?" (people offering themselves) is never read.
// Each comment is kept only when it says the term as a phrase (match.ts `matchTerm`, on the parsed
// title or the comment text): Algolia's plain query matches the words in any order, so "design
// system" alone would also return every post that says "design" and "system" apart.
import { htmlToText } from '../html';
import { inferMode, matchTerm } from '../match';
import type { Posting } from '../types';
import { arr, obj, str, type FetchJson } from './http';

const API = 'https://hn.algolia.com/api/v1';
/** "Who is hiring?" threads to read — the last three months (openings stay live for weeks; DS
 *  roles are sparse). */
export const HIRING_THREADS = 3;
/** Freelancer threads to read — this month and last. */
export const FREELANCER_THREADS = 2;
/** whoishiring posts three stories a month (hiring, wants to be hired, freelancer): this listing
 *  reaches back past HIRING_THREADS months. */
const LISTING_SIZE = 15;

const FREELANCE_JOB_TYPE = 'Job type: Freelance (HN freelancer thread)';

export interface HnThread {
  id: string;
  title: string;
}

/** The newest "Who is hiring?" threads from a whoishiring story listing (newest first). */
export function pickHiringThreads(listing: unknown, n = HIRING_THREADS): HnThread[] {
  return pickThreads(listing, /^ask hn: who is hiring\?/i, n);
}

/** The newest "Freelancer? Seeking freelancer?" threads. whoishiring stopped posting them (checked
 *  live 2026-10-28: another account posts them now, and a month can have a stray second copy), so
 *  they come from a title search, and a month's busiest copy is the one read. */
export function pickFreelancerThreads(listing: unknown, n = FREELANCER_THREADS): HnThread[] {
  return pickThreads(listing, /^ask hn: freelancer\? seeking freelancer\?/i, n);
}

function pickThreads(listing: unknown, title: RegExp, n: number): HnThread[] {
  const byTitle = new Map<string, Record<string, unknown>>();
  for (const h of arr(obj(listing).hits).map(obj)) {
    const t = str(h.title);
    if (!title.test(t)) continue;
    const had = byTitle.get(t.toLowerCase());
    if (!had || num(h.num_comments) > num(had.num_comments)) byTitle.set(t.toLowerCase(), h);
  }
  return [...byTitle.values()]
    .sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))
    .slice(0, n)
    .map((h) => ({ id: str(h.objectID), title: str(h.title) }));
}

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

const ROLE_RE =
  /\b(engineer|engineering|designer|developer|technologist|architect|lead|manager|head of|director|founding|staff|principal|frontend|front-end|design|ux|ui|cto|consultant|specialist|analyst|implementation|solutions|success|support|onboarding)\b/i;
const PLACE_RE =
  /\b(remote|on-?site|hybrid|usa?|uk|eu|europe|canada|worldwide|global|anywhere|nyc|new york|sf|san francisco|bay area|london|berlin|toronto|seattle|austin|boston)\b|,\s*[A-Z]{2}\b/i;
/** Title used when a pipe-format post names no role (one company, several roles in the body). */
export const HN_NO_ROLE = 'Roles listed in post';

/** A place segment that only names the work mode ("REMOTE"); dropped when a real place is named. */
const MODE_ONLY_RE = /^(remote|onsite|on-site|hybrid)$/i;
/** Short codes that stay upper case when an all-caps segment is sentence-cased. */
const KEEP_CAPS = new Set([
  'US',
  'USA',
  'UK',
  'EU',
  'NYC',
  'SF',
  'LA',
  'DC',
  'EMEA',
  'APAC',
  'UTC',
]);

/** "REMOTE (US)" → "Remote (US)", "SAN FRANCISCO, CA" → "San Francisco, CA": no ALL CAPS on screen.
 *  Two-letter words and known codes keep their capitals; mixed-case text is left as written. */
export function unshout(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]{3}/.test(s)) return s;
  return s.replace(/[A-Z][A-Z'-]*/g, (w) =>
    w.length <= 2 || KEEP_CAPS.has(w) ? w : w[0] + w.slice(1).toLowerCase(),
  );
}

/** The place segments as shown: un-shouted, deduped, a bare mode word only when no place is named. */
function placeOf(where: string[]): string {
  const segs = [...new Set(where.map(unshout))];
  const places = segs.filter((s) => !MODE_ONLY_RE.test(s));
  return (places.length ? places : segs.slice(0, 1)).slice(0, 2).join(' · ');
}

const NOISE_RE = /^(full[- ]?time|part[- ]?time|contract|visa|\$|€|£|https?:|www\.|\S+@\S+)/i;
const KV_RE = /^\s*(company|role|roles|position|positions|title|location|locations)\s*:\s*(\S.*)$/i;
const PROSE_RE = /^([A-Z0-9][\w.&' -]{1,58}?)\s+(?:is|are)\s+hiring\b/;

/** Parse one top-level comment into a Posting; null for replies and empty/deleted comments. */
export function parseHnComment(hit: unknown): Posting | null {
  return parseComment(hit, false);
}

const SEEKING_FREELANCER_RE = /^\s*seeking\s+freelancers?\b[\s|:\-–—]*/i;

/** A comment from the freelancer thread: kept only when it is a SEEKING FREELANCER post. */
export function parseFreelancerComment(hit: unknown): Posting | null {
  return parseComment(hit, true);
}

function parseComment(hit: unknown, freelance: boolean): Posting | null {
  const h = obj(hit);
  const id = str(h.objectID);
  const html = str(h.comment_text);
  if (!id || !html) return null;
  if (h.parent_id != null && h.story_id != null && String(h.parent_id) !== String(h.story_id))
    return null;

  let text = htmlToText(html);
  if (freelance) {
    if (!SEEKING_FREELANCER_RE.test(text)) return null;
    text = text.replace(SEEKING_FREELANCER_RE, '');
    if (!text) return null;
  }
  const lines = text.split('\n');
  const firstLine = lines[0];

  let company = '';
  let title = '';
  const where: string[] = [];

  // 1. "Company | Role | Location | REMOTE | …" on the first line.
  const segs = firstLine
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length >= 2) {
    company = segs[0].replace(/\s*\(\s*https?:[^)]*\)\s*/g, ' ').trim();
    for (const s of segs.slice(1)) {
      if (NOISE_RE.test(s)) continue;
      if (!title && ROLE_RE.test(s) && !PLACE_RE.test(s)) title = s;
      else if (PLACE_RE.test(s)) where.push(s);
    }
  }

  // 2. "Company: …" / "Role: …" / "Location: …" lines near the top fill whatever is still missing.
  for (const line of lines.slice(0, 10)) {
    const m = KV_RE.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'company' && !company) company = val;
    else if (key === 'location' || key === 'locations') {
      if (!where.length) where.push(val);
    } else if (!title && key !== 'company') title = val;
  }

  // 3. Prose opener ("Acme is hiring engineers to …") — only a named subject counts as a company.
  if (!company && segs.length < 2) company = PROSE_RE.exec(firstLine)?.[1]?.trim() ?? '';
  if (!title) title = segs.length >= 2 ? HN_NO_ROLE : firstLine;
  const location = placeOf(where);

  return {
    id: `hn:${id}`,
    source: 'hn',
    company: company.slice(0, 80),
    title: title.slice(0, 120),
    url: `https://news.ycombinator.com/item?id=${id}`,
    location,
    mode: inferMode(firstLine) ?? inferMode(location),
    postedAt: str(h.created_at) || undefined,
    text: freelance ? `${FREELANCE_JOB_TYPE}\n${text}` : text,
  };
}

export async function fetchHn(term: string, fetchJson: FetchJson): Promise<Posting[]> {
  const [listing, freelancerListing] = await Promise.all([
    fetchJson(`${API}/search_by_date?tags=story,author_whoishiring&hitsPerPage=${LISTING_SIZE}`),
    fetchJson(
      `${API}/search_by_date?tags=story&query=${encodeURIComponent('Freelancer? Seeking freelancer?')}&restrictSearchableAttributes=title&hitsPerPage=${LISTING_SIZE}`,
    ),
  ]);
  // Algolia's plain query is a superset of the phrase (all words, any order); match.ts then keeps
  // only real phrase hits. A quoted query would be exact but drops plurals ("design systems").
  const q = encodeURIComponent(term);
  const read = async (threads: HnThread[], parse: (hit: unknown) => Posting | null) => {
    const pages = await Promise.all(
      threads.map((t) =>
        fetchJson(`${API}/search?tags=comment,story_${t.id}&hitsPerPage=500&query=${q}`),
      ),
    );
    return pages
      .flatMap((p) => arr(obj(p).hits).map(parse))
      .filter((p): p is Posting => !!p && !!matchTerm(p, term));
  };
  const [hiring, freelance] = await Promise.all([
    read(pickHiringThreads(listing), parseHnComment),
    read(pickFreelancerThreads(freelancerListing), parseFreelancerComment),
  ]);
  return [...hiring, ...freelance];
}
