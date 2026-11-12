// What a server feed (src/tracks/feeds/*) gets from the sync: a fetch that can POST, the
// function's env (keys live there, never in the app bundle), the clock and a sleep for spacing.
// Pure types plus one helper, so the edge function, the dry-run script and the tests share it.

export type Http = (url: string, init?: RequestInit) => Promise<Response>;

export interface FeedContext {
  fetch: Http;
  /** A Supabase function secret by name ('' and unset read the same). */
  env: (name: string) => string | undefined;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

/** A key a source needs is not set. Its message names the env var, so the sync log says what to
 *  add, and never holds a value. */
export class MissingKeyError extends Error {
  readonly envVar: string;
  constructor(envVar: string) {
    super(
      `${envVar} is not set: add it in Supabase → Edge Functions → sync-postings → Secrets (docs/secrets.md)`,
    );
    this.envVar = envVar;
  }
}

/** The named secrets, or a MissingKeyError for the first one unset. */
export function needKeys<K extends string>(
  ctx: FeedContext,
  names: readonly K[],
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const n of names) {
    const v = ctx.env(n)?.trim();
    if (!v) throw new MissingKeyError(n);
    out[n] = v;
  }
  return out;
}

/** A failed answer as an error that carries the status but never the URL (a key can ride in it). */
export class SourceHttpError extends Error {
  readonly status: number;
  constructor(source: string, status: number) {
    super(`${source}: HTTP ${status}`);
    this.status = status;
  }
}

/** A fetch for a URL that holds a key: a network failure (Deno puts the URL in its message) is
 *  rethrown naming the source only. */
export async function fetchKeyed(
  ctx: FeedContext,
  source: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await ctx.fetch(url, init);
  } catch (e) {
    // A DOMException (the abort signal's) is not always an Error instance: read its name.
    const name = (e as { name?: unknown } | null)?.name;
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    // No `cause`: the cause's message holds the URL, and with it the key.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`${source}: ${timedOut ? 'timed out' : 'network error'}`);
  }
}

/** A server feed's answer that is not its whole list (one of its pages or feeds failed): the
 *  sync stores what came, and closes nothing as missed against it (#576 item 11). */
const PARTIAL = new WeakSet<object>();
export function markPartial<T extends object>(list: T): T {
  PARTIAL.add(list);
  return list;
}
export const isPartial = (list: object) => PARTIAL.has(list);
