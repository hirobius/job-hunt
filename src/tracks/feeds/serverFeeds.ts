// The sync's own searches (docs/research/ds-job-sources.md): sources only the server reads, shared
// by every design-systems user. Each adapter's header has its terms, attribution and rate limit.
// SERVER_FEED_GATES says when each runs: the keyless ones always; a keyed one as soon as any of its
// Supabase function secrets is set (with one missing, its read fails loud naming it, and the run
// goes on); Into Design Systems only on its operator's yes. They are windowed reads, never a
// whole catalog, so a posting missing from one read is never closed as gone (plan.ts
// `answeredFeeds`): it ages out instead.
import type { NormalizedPosting } from '../score.ts';
import { ADZUNA_ENV, readAdzuna } from './adzuna.ts';
import { readArbeitnow } from './arbeitnow.ts';
import type { FeedContext } from './context.ts';
import { readIntoDesignSystems } from './intoDesignSystems.ts';
import { JOOBLE_ENV, readJooble } from './jooble.ts';
import { readRemoteOk } from './remoteok.ts';
import { readTheirStack, THEIRSTACK_ENV } from './theirstack.ts';
import { readWwr } from './wwr.ts';

export type ServerFeed =
  'arbeitnow' | 'remoteok' | 'wwr' | 'theirstack' | 'adzuna' | 'jooble' | 'ids';
export const SERVER_FEEDS: readonly ServerFeed[] = [
  'ids',
  'arbeitnow',
  'remoteok',
  'wwr',
  'theirstack',
  'adzuna',
  'jooble',
];

export const SERVER_FEED_READERS: Record<
  ServerFeed,
  (ctx: FeedContext) => Promise<NormalizedPosting[]>
> = {
  arbeitnow: readArbeitnow,
  remoteok: readRemoteOk,
  wwr: readWwr,
  theirstack: readTheirStack,
  adzuna: readAdzuna,
  jooble: readJooble,
  ids: readIntoDesignSystems,
};

type Gate = { keyless: true } | { env: readonly string[] } | { waitsOn: string };

/** When each feed runs. Into Design Systems waits on its operator (no key to set). */
export const SERVER_FEED_GATES: Record<ServerFeed, Gate> = {
  arbeitnow: { keyless: true },
  remoteok: { keyless: true },
  wwr: { keyless: true },
  theirstack: { env: THEIRSTACK_ENV },
  adzuna: { env: ADZUNA_ENV },
  jooble: { env: JOOBLE_ENV },
  ids: { waitsOn: "its operator's yes" },
};

type Env = (name: string) => string | undefined;
const isSet = (env: Env, name: string) => !!env(name)?.trim();

/** The feed runs on this deploy: keyless, or any of its secrets is set. */
export function serverFeedOn(feed: ServerFeed, env: Env): boolean {
  const g = SERVER_FEED_GATES[feed];
  if ('keyless' in g) return true;
  if ('env' in g) return g.env.some((n) => isSet(env, n));
  return false;
}

/** True for a feed that spends a paid or capped key (TheirStack, Adzuna, Jooble). */
export const isKeyed = (feed: ServerFeed) => 'env' in SERVER_FEED_GATES[feed];

/** The server feeds one feeds run reads (#576 item 3). The 14:23 run sends `keyed: false`: it reads
 *  the keyless feeds again but not the keyed ones, so each key's daily budget (theirstack.ts,
 *  adzuna.ts, jooble.ts) is spent once a day, as before. */
export const serverFeedsForRun = (env: Env, keyed: boolean): ServerFeed[] =>
  SERVER_FEEDS.filter((f) => serverFeedOn(f, env) && (keyed || !isKeyed(f)));

/** The feeds not running, each with what turns it on (env var names, never values). */
export function serverFeedsOff(env: Env): Partial<Record<ServerFeed, string>> {
  const out: Partial<Record<ServerFeed, string>> = {};
  for (const f of SERVER_FEEDS) {
    if (serverFeedOn(f, env)) continue;
    const g = SERVER_FEED_GATES[f];
    out[f] = 'env' in g ? g.env.join(', ') : 'waitsOn' in g ? g.waitsOn : '';
  }
  return out;
}
