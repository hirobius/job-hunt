// Method 4: recently funded companies, via YC batches only (docs/specs/discovery-methods.md). The
// source is the community mirror of YC's directory (yc-oss.github.io, GitHub Pages, static JSON), which
// is unofficial and UNVERIFIED LIVE from the build sandbox: credit it as "YC directory (community
// mirror)", keep the pasted-list fallback, and say plainly when it is down. A funded company is a
// lead for a board probe, never an opening.
import { arr, obj, str, type FetchJson } from './sources/http';

export const YC_BASE = 'https://yc-oss.github.io/api/';
export const YC_CREDIT = 'YC directory (community mirror)';

export interface YcCompany {
  name: string;
  slug: string;
  website: string;
  oneLiner: string;
  teamSize?: number;
  industries: string[];
  tags: string[];
  batch: string;
  status: string;
  isHiring: boolean;
}

export function parseYcCompany(raw: unknown): YcCompany | null {
  const o = obj(raw);
  const name = str(o.name).trim();
  if (!name) return null;
  const strings = (v: unknown) => arr(v).filter((x): x is string => typeof x === 'string');
  return {
    name,
    slug: str(o.slug),
    website: str(o.website),
    oneLiner: str(o.one_liner),
    teamSize: typeof o.team_size === 'number' ? o.team_size : undefined,
    industries: strings(o.industries),
    tags: strings(o.tags),
    batch: str(o.batch),
    status: str(o.status),
    isHiring: o.isHiring === true,
  };
}

/** YC runs four batches a year; a batch counts once its season has started. */
const SEASONS = [
  { name: 'winter', month: 0 },
  { name: 'spring', month: 3 },
  { name: 'summer', month: 5 },
  { name: 'fall', month: 8 },
] as const;

/** The latest `count` batch slugs (`winter-2026`), newest first. */
export function recentBatches(now: Date, count = 4): string[] {
  let year = now.getUTCFullYear();
  let i = SEASONS.reduce((last, s, idx) => (now.getUTCMonth() >= s.month ? idx : last), -1);
  if (i < 0) {
    i = SEASONS.length - 1;
    year--;
  }
  const out: string[] = [];
  while (out.length < count) {
    out.push(`${SEASONS[i].name}-${year}`);
    if (--i < 0) {
      i = SEASONS.length - 1;
      year--;
    }
  }
  return out;
}

export const batchLabel = (slug: string) =>
  slug.replace(
    /^(\w)(\w*)-(\d+)$/,
    (_m, a: string, b: string, y: string) => `${a.toUpperCase()}${b} ${y}`,
  );
export const batchUrl = (slug: string) => `${YC_BASE}batches/${slug}.json`;

const DOWN = `The ${YC_CREDIT} didn't answer, so this batch can't be loaded. Paste a batch list into the box instead.`;

/** Active companies of one batch (optionally only those currently hiring). Throws a message fit to show. */
export async function fetchBatch(
  slug: string,
  fetchJson: FetchJson,
  { hiringOnly = false }: { hiringOnly?: boolean } = {},
): Promise<YcCompany[]> {
  let body: unknown;
  try {
    body = await fetchJson(batchUrl(slug));
  } catch {
    throw new Error(DOWN);
  }
  if (!Array.isArray(body)) throw new Error(DOWN);
  return body
    .map(parseYcCompany)
    .filter((c): c is YcCompany => !!c && c.status.toLowerCase() === 'active')
    .filter((c) => !hiringOnly || c.isHiring);
}

/** Company names as lines for the board probe, deduped. */
export function ycLines(companies: YcCompany[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of companies) {
    const k = c.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c.name);
  }
  return out;
}
