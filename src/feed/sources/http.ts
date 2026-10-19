// The one network seam every source goes through. Sources take a `FetchJson` so tests inject canned
// payloads and the app injects the cached, error-mapping implementation (src/feed/fetchFeed.ts).
export type FetchJson = (url: string) => Promise<unknown>;

/** A fetch failure carrying the HTTP status (0 = never reached the server). */
export class FetchError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly isTimeout: boolean = false,
  ) {
    super(isTimeout ? 'timed out' : status ? `HTTP ${status}` : 'network error');
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
