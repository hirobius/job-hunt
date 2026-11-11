// Is the board the probe found really this company's? A name only gives slugs, and a short or common
// name ("Forward") is a slug on several boards that belong to different companies. So a board found
// from a name has to show who it belongs to before it is watched:
//
//   1. Website domain: when the company's website is known (the YC list, a GitHub organisation), its
//      domain must show up on the board: an apply link on the company's own site, the board's own
//      website field, or a link or email in a job's text. Apply links on another company's site
//      say it is someone else's board, unless the website is weak (a design system's site or a
//      GitHub organisation's blog): then it only ever confirms, and a miss goes on to the name.
//   2. Failing that, name similarity: the company name the board states (Greenhouse, Recruitee,
//      SmartRecruiters, Breezy and Workable state one) against the name asked for.
//   3. Neither: the board shows nothing either way (Lever, Ashby, Personio, BambooHR, Rippling).
//
// The probe keeps a board only when it matches, or when it is the one board the name found and
// nothing speaks against it; every other board is "unconfirmed" and is listed, never watched.
// Pure: no network, table-tested in boardIdentity.test.ts.
// `.ts` specifiers: the server's board suggestions (tracks/boardSuggest.ts) load this in Deno.
import { BOARD_DOMAINS, logoDomain } from '../companyLogo.ts';
import { obj } from './sources/http.ts';

/** What a board payload says about who it belongs to. Small enough to cache with the probe answer. */
export interface BoardEvidence {
  /** The company name the board states. */
  name?: string;
  /** Registrable domains of the board's own links (apply URLs, website): never an ATS host. */
  domains: string[];
  /** Registrable domains named in job text (links, emails). Only ever evidence for a match. */
  textDomains: string[];
}

export type Identity = 'match' | 'mismatch' | 'unknown';
export interface IdentityVerdict {
  identity: Identity;
  /** One plain sentence, for an unconfirmed row. */
  why?: string;
}

const MAX_JOBS = 25;
const MAX_DOMAINS = 6;

/** ATS and job-board hosts that never say whose board it is. */
const ATS_HOSTS: readonly string[] = [...BOARD_DOMAINS, 'comeet.com', 'comeet.co', 'freshteam.com'];

/** Hosts a design system or docs site lives on: their registrable domain is the host's, not the
 *  company's, so a website there is no evidence. */
const SHARED_HOSTS: readonly string[] = [
  'github.io',
  'github.com',
  'gitlab.io',
  'netlify.app',
  'netlify.com',
  'vercel.app',
  'herokuapp.com',
  'pages.dev',
  'web.app',
  'firebaseapp.com',
  'notion.site',
  'webflow.io',
  'framer.website',
  'wixsite.com',
  'squarespace.com',
  'gitbook.io',
  'medium.com',
  'zeroheight.com',
  'supernova-docs.io',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'google.com',
  'gmail.com',
];

const under = (host: string, list: readonly string[]) =>
  list.some((d) => host === d || host.endsWith(`.${d}`));

const hostOf = (raw: string): string | null => {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`).hostname
      .toLowerCase()
      .replace(/\.$/, '');
  } catch {
    return null;
  }
};

/** A link's registrable domain when it can say whose board it is: companyLogo's one domain rule
 *  (no board or ATS host, no reserved or local name, `careers.acme.co.uk` → `acme.co.uk`), and
 *  never a host shared by many companies. */
function evidenceDomain(raw: string): string | null {
  const host = hostOf(raw);
  if (!host || under(host, ATS_HOSTS) || under(host, SHARED_HOSTS)) return null;
  return logoDomain(raw);
}

/** The company's own domain from its website; null when the site sits on a shared host. */
export const websiteDomain = (website: string | undefined): string | null =>
  website?.trim() ? evidenceDomain(website.trim()) : null;

const URL_KEY = /(url|link|website|homepage)$/i;
const NOT_A_PAGE = /(logo|image|avatar|photo|icon|picture|video|thumbnail)/i;
const TEXT_KEY = /(description|content|plain|body|text|additional|lists)/i;
const URLS_IN_TEXT = /\bhttps?:\/\/[^\s"'<>)]+/gi;
const EMAILS_IN_TEXT = /\b[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;

/** Every string under `v`, depth-first, with the key it sits under. */
function* strings(v: unknown, key = '', depth = 0): Generator<[string, string]> {
  if (typeof v === 'string') yield [key, v];
  else if (depth > 3 || v === null || typeof v !== 'object') return;
  else if (Array.isArray(v)) for (const x of v) yield* strings(x, key, depth + 1);
  else for (const [k, x] of Object.entries(v)) yield* strings(x, k, depth + 1);
}

/** The company name a board's payload states, if any (shapes per kind, see sources/ats.ts). */
function statedName(body: unknown, jobs: unknown[]): string | undefined {
  const top = obj(body);
  // Workable's widget names the account at the top.
  const fromTop = typeof top.name === 'string' && Array.isArray(top.jobs) ? top.name : '';
  if (fromTop.trim()) return fromTop.trim();
  for (const j of jobs.slice(0, MAX_JOBS)) {
    const o = obj(j);
    const n = o.company_name ?? obj(o.company).name ?? obj(o.attributes)['company-name'];
    if (typeof n === 'string' && n.trim()) return n.trim();
  }
  return undefined;
}

/** What a live board's payload says about its owner. `jobs` is the list `boardJobs` found. */
export function boardEvidence(body: unknown, jobs: unknown[]): BoardEvidence {
  const domains = new Set<string>();
  const textDomains = new Set<string>();
  const roots: unknown[] = jobs.slice(0, MAX_JOBS);
  // Board-level fields (a stated website), not the job list again. A list payload has none.
  if (body && typeof body === 'object' && !Array.isArray(body))
    roots.push(Object.fromEntries(Object.entries(body).filter(([, v]) => !Array.isArray(v))));
  for (const root of roots) {
    for (const [key, s] of strings(root)) {
      if (URL_KEY.test(key) && !NOT_A_PAGE.test(key) && /^https?:\/\//i.test(s)) {
        const d = evidenceDomain(s);
        if (d) domains.add(d);
      } else if (TEXT_KEY.test(key)) {
        for (const m of s.matchAll(URLS_IN_TEXT)) {
          const d = evidenceDomain(m[0]);
          if (d) textDomains.add(d);
        }
        for (const m of s.matchAll(EMAILS_IN_TEXT)) {
          const d = evidenceDomain(`https://${m[1]}`);
          if (d) textDomains.add(d);
        }
      }
    }
  }
  const name = statedName(body, jobs);
  return {
    ...(name && { name }),
    domains: [...domains].slice(0, MAX_DOMAINS),
    textDomains: [...textDomains].slice(0, MAX_DOMAINS),
  };
}

const HARD_SUFFIX = new Set([
  'inc',
  'incorporated',
  'llc',
  'co',
  'corp',
  'corporation',
  'ltd',
  'limited',
  'plc',
  'gmbh',
  'ag',
  'sa',
  'bv',
  'oy',
  'ab',
  'se',
  'hq',
]);

const SOFT_SUFFIX = new Set([
  'labs',
  'technologies',
  'technology',
  'software',
  'studio',
  'studios',
  'app',
  'ai',
  'io',
  'group',
  'company',
]);

/** "The Acme Co., Inc." → "acme": folded, no legal suffix, no leading "the", no spaces. */
export function nameKey(name: string): string {
  return nameWords(name).join('');
}

/** The key, and the key without a trailing "Labs"/"Software"-like word ("Acme Labs" is "Acme"). */
function nameKeys(name: string): string[] {
  const w = nameWords(name);
  const out = [w.join('')];
  if (w.length > 1 && SOFT_SUFFIX.has(w[w.length - 1])) out.push(w.slice(0, -1).join(''));
  return out;
}

function nameWords(name: string): string[] {
  let words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  while (words.length > 1 && HARD_SUFFIX.has(words[words.length - 1])) words = words.slice(0, -1);
  if (words.length > 1 && words[0] === 'the') words = words.slice(1);
  return words;
}

const bigrams = (s: string) => {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
};

/** Dice coefficient of the two names' keys, 0 to 1 (the best over each name with and without a
 *  trailing "Labs"-like word). */
export function nameSimilarity(a: string, b: string): number {
  let best = 0;
  for (const x of nameKeys(a)) for (const y of nameKeys(b)) best = Math.max(best, dice(x, y));
  return best;
}

function dice(x: string, y: string): number {
  if (!x || !y) return 0;
  if (x === y) return 1;
  const gx = bigrams(x);
  const gy = bigrams(y);
  let shared = 0;
  for (const [g, n] of gx) shared += Math.min(n, gy.get(g) ?? 0);
  const total = x.length - 1 + (y.length - 1);
  return total > 0 ? (2 * shared) / total : 0;
}

/** Spelling variants only ("Acme Labs" ~ "AcmeLabs"); "Forward" vs "Forward Financing" is not. */
export const SAME_NAME = 0.9;

/** Does this board belong to the company asked for? */
export function identify(
  company: { name: string; website?: string; weakWebsite?: boolean },
  ev: BoardEvidence | undefined,
): IdentityVerdict {
  if (!ev) return { identity: 'unknown' };
  const site = websiteDomain(company.website);
  if (site) {
    if (ev.domains.includes(site) || ev.textDomains.includes(site)) return { identity: 'match' };
    // A weak website (a design system's site, a GitHub organisation's blog) is often not where the
    // company's jobs link: it can confirm a board, never rule one out. Fall through to the name.
    if (ev.domains.length && !company.weakWebsite)
      return {
        identity: 'mismatch',
        why: `Its jobs link to ${ev.domains[0]}, not ${site}.`,
      };
  }
  if (ev.name) {
    return nameSimilarity(ev.name, company.name) >= SAME_NAME
      ? { identity: 'match' }
      : { identity: 'mismatch', why: `The board is ${ev.name}'s.` };
  }
  return { identity: 'unknown' };
}

/** Which of a company's live boards to keep. A board that matches is kept; with no match, the one
 *  board a name found is kept when nothing speaks against it. The rest are unconfirmed. */
export function confirmHits<T extends { verdict: IdentityVerdict }>(
  hits: T[],
): { confirmed: T[]; unconfirmed: T[] } {
  const matched = hits.filter((h) => h.verdict.identity === 'match');
  if (matched.length)
    return { confirmed: matched, unconfirmed: hits.filter((h) => !matched.includes(h)) };
  if (hits.length === 1 && hits[0].verdict.identity === 'unknown')
    return { confirmed: hits, unconfirmed: [] };
  return { confirmed: [], unconfirmed: hits };
}

/** The line an unconfirmed board shows. */
export function unconfirmedWhy(v: IdentityVerdict, others: number): string {
  if (v.why) return v.why;
  return others > 0
    ? 'The name matched boards on several systems; nothing on this one shows it is this company.'
    : 'Nothing on the board shows it is this company.';
}
