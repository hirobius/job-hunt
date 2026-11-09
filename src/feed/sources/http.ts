// The one network seam every source goes through. Sources take a `FetchJson` so tests inject canned
// payloads and the app injects the cached, error-mapping implementation (src/feed/fetchFeed.ts).
/** `fresh` skips any cache (a liveness check must see the board as it is now). `signal` gives up a
 *  read the caller no longer wants: one still waiting for a slot never starts (#499). */
export type FetchJson = (
  url: string,
  opts?: { fresh?: boolean; signal?: AbortSignal },
) => Promise<unknown>;

/** A fetch failure carrying the HTTP status (0 = never reached the server). */
export class FetchError extends Error {
  // Plain fields, not parameter properties: Node's type stripping (the dry-run script) can't run
  // those.
  readonly status: number;
  readonly url: string;
  readonly isTimeout: boolean;
  constructor(status: number, url: string, isTimeout = false) {
    super(isTimeout ? 'timed out' : status ? `HTTP ${status}` : 'network error');
    this.status = status;
    this.url = url;
    this.isTimeout = isTimeout;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const obj = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** "acme-labs" → "Acme Labs" — boards that only give us a slug, not a company name. */
export const prettySlug = (slug: string) =>
  slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

/** A positive finite number from a number or numeric string; undefined otherwise (0 = "not stated"). */
export const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** A source's closing date as the employer's calendar day (YYYY-MM-DD): the day written in the
 *  timestamp, not the reader's local day, so "Nov 1, 11:45 PM Central" is Nov 1 anywhere (#419).
 *  Undefined for anything that is not a real calendar day. */
export function closingDayOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : undefined;
}

/** When this page load first read each posting, by id: sources re-parse a cached body on every
 *  read, so the first stamp is kept here rather than on the parsed object. */
const firstSeen = new Map<string, string>();

/** Stamp when the feed first read each posting (#419); a later read keeps the first stamp. */
export function stampSeen<T extends { id: string; discoveredAt?: string }>(
  postings: T[],
  at: string = new Date().toISOString(),
): T[] {
  return postings.map((p) => {
    if (p.discoveredAt) return p;
    const seen = firstSeen.get(p.id) ?? at;
    if (!firstSeen.has(p.id)) firstSeen.set(p.id, seen);
    return { ...p, discoveredAt: seen };
  });
}
