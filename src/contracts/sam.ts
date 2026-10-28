// Contracts track (#275): the SAM.gov Opportunities API, shared by the browser and the serverless
// function in api/sam.ts. Pure: no browser or Node APIs, so both sides import it as is.
//
// The key never reaches the browser: the browser calls same-origin /api/sam with NAICS codes and
// a state, the function adds SAM_GOV_API_KEY and calls api.sam.gov (UNVERIFIED LIVE: written from
// the documented v2 search shape; this build environment cannot reach sam.gov), and answers with
// only the fields below.

/** The one env var the function reads. */
export const SAM_KEY_ENV = 'SAM_GOV_API_KEY';

/** What the function answers with no key, word for word (the source row shows it). */
export const NO_KEY_MESSAGE = `${SAM_KEY_ENV} is not set: add it in Vercel → Settings → Environment Variables`;

/** Sheet metal / fab, then software / design (Adrian 2026-10-20, #275). The user edits the list. */
export const DEFAULT_NAICS: readonly string[] = ['332322', '332312', '541511', '541512', '541430'];

/** The most codes one search sends (each is one SAM.gov request). */
export const MAX_NAICS = 10;

/** Solicitations posted in this many days are listed (SAM.gov's own limit is a year). */
export const POSTED_WITHIN_DAYS = 30;

/** A NAICS code: 2 to 6 digits (a sector to a national industry). */
export const isNaics = (s: string) => /^\d{2,6}$/.test(s);

/** Trimmed, valid, deduped, capped: what a stored or typed list becomes. */
export function cleanNaics(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const x of list) {
    const code = typeof x === 'string' ? x.trim() : '';
    if (isNaics(code) && !out.includes(code)) out.push(code);
    if (out.length === MAX_NAICS) break;
  }
  return out;
}

const STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  PR: 'Puerto Rico',
  GU: 'Guam',
  VI: 'Virgin Islands',
  AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
};
const BY_NAME = new Map(Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code]));

/** A US state or territory code. */
export const isStateCode = (s: string) => Object.prototype.hasOwnProperty.call(STATES, s);

/** The state the track's location names ("Spokane, WA", "Spokane, Washington", "Texas"), for
 *  SAM.gov's place-of-performance filter; undefined when it names none (all states). */
export function stateCodeFor(where: string): string | undefined {
  const parts = where
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts.reverse()) {
    const up = part.toUpperCase();
    if (up.length === 2 && isStateCode(up)) return up;
    const byName = BY_NAME.get(part.toLowerCase());
    if (byName) return byName;
  }
  return undefined;
}

export const stateName = (code: string) => STATES[code] ?? code;

/** One open solicitation, as the function returns it (everything else SAM.gov sends is dropped). */
export interface SamOpportunity {
  id: string;
  title: string;
  agency: string;
  /** https://sam.gov/… only. */
  url: string;
  /** YYYY-MM-DD. */
  postedDate?: string;
  /** YYYY-MM-DD, the agency's own date. */
  responseDeadline?: string;
  naics?: string;
  type?: string;
  setAside?: string;
  solicitationNumber?: string;
  city?: string;
  state?: string;
}

const str = (v: unknown, max = 300): string =>
  typeof v === 'string'
    ? v
        // eslint-disable-next-line no-control-regex -- control characters are what it strips
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
/** The date part of "2026-11-05", "2026-11-05T14:00:00-05:00" or "2026-11-05 14:00:00". */
const dateOf = (v: unknown): string | undefined => {
  const m = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(str(v));
  return m ? m[1] : undefined;
};

/** Notice types that are not open for bids. */
const CLOSED_TYPES = new Set(['award notice', 'justification', 'sale of surplus property']);

/** "DEPT OF DEFENSE.DEPT OF THE ARMY.W6QK ACC" → "DEPT OF DEFENSE" (the agency, not the office). */
const agencyOf = (path: string) => path.split('.')[0]?.trim() ?? '';

/** One SAM.gov `opportunitiesData` record → an open solicitation, or null (junk, an award, closed,
 *  or a deadline already past on `today`, YYYY-MM-DD). */
export function parseSamRecord(raw: unknown, today: string): SamOpportunity | null {
  const o = obj(raw);
  const id = str(o.noticeId, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const title = str(o.title);
  if (!title) return null;
  if (str(o.active).toLowerCase() === 'no') return null;
  const type = str(o.type, 80);
  if (CLOSED_TYPES.has(type.toLowerCase())) return null;
  const responseDeadline = dateOf(o.responseDeadLine);
  if (responseDeadline && responseDeadline < today) return null;
  const link = str(o.uiLink, 500);
  const url = /^https:\/\/sam\.gov\//.test(link)
    ? link
    : `https://sam.gov/opp/${encodeURIComponent(id)}/view`;
  const place = obj(o.placeOfPerformance);
  const out: SamOpportunity = {
    id,
    title,
    agency: agencyOf(str(o.fullParentPathName) || str(o.department)),
    url,
  };
  const postedDate = dateOf(o.postedDate);
  if (postedDate) out.postedDate = postedDate;
  if (responseDeadline) out.responseDeadline = responseDeadline;
  const naics = str(o.naicsCode, 6);
  if (isNaics(naics)) out.naics = naics;
  if (type) out.type = type;
  const setAside = str(o.typeOfSetAsideDescription, 120);
  if (setAside && setAside.toLowerCase() !== 'none') out.setAside = setAside;
  const sol = str(o.solicitationNumber, 80);
  if (sol) out.solicitationNumber = sol;
  const city = str(obj(place.city).name, 80);
  if (city) out.city = city;
  const state = str(obj(place.state).code, 2).toUpperCase();
  if (isStateCode(state)) out.state = state;
  return out;
}
