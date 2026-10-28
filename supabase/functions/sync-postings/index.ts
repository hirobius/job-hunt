// The postings sync (Muse Phase 2 + 2.5; Simplify 6/9, #387): a Supabase edge function run twice a
// day by pg_cron (supabase/migrations/20261024100200_sync_postings_cron.sql). It reads what each
// user follows straight from their synced `tracker` blob (src/tracks/plan.ts: v12 sources and the
// Search profile, else the v11 fields and their watched tiles), so the blob is the one source of
// truth. Every board is read once however many users follow it (Ashby one board at a time), the
// term feeds (HN, Remotive, Jobicy) and designsystems.jobs on the morning run. Each posting is
// scored with the user's profile config (src/tracks), deduped by fingerprint and upserted on
// (user, source, source_id). A failed read is logged and closes nothing, except a 404 (the board is
// gone): its postings close. A posting missing from 2 answered reads in a row is rejected as
// "posting closed". The sync never writes the blob: the user removes a dead board from Sources.
// One invocation reads SLICE boards (the worker's CPU budget is ~2 s, and the first full run ran
// out), then calls itself for the next slice. The feeds and closing unfollowed boards run on the
// last slice; each slice closes postings missed on the boards it read.
// Auth: x-sync-secret must equal SYNC_SECRET (compared as SHA-256 digests, without an early exit).
// Nothing is accepted until SYNC_SECRET is set. Deploy and secrets: README.md beside this file.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  answeredFeeds,
  feedReadsFor,
  planFromBlob,
  type SyncPlan,
  type WatchedTile,
} from '../../../src/tracks/plan.ts';
import {
  boardOf,
  forWatcher,
  readAll,
  scoreBatch,
  TERM_FEEDS,
  type ReadOutcome,
  type TermFeed,
} from '../../../src/tracks/sync.ts';
import type { WatchedCompany } from '../../../src/tracks/sources.ts';
import type { TrackConfig } from '../../../src/tracks/track-config.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

/** score.ts `dedupe`'s source order: an ATS original beats a copy. */
const RANK: Record<string, number> = {
  greenhouse: 0,
  lever: 0,
  ashby: 0,
  workable: 0,
  recruitee: 0,
  smartrecruiters: 0,
  teamtailor: 0,
  personio: 0,
  rss: 1,
  manual: 1,
  adzuna: 2,
  jsearch: 2,
  remotive: 3,
  jobicy: 3,
  hn: 3,
};
const CHUNK = 500;
/** Fingerprints per lookup: they ride in the query string. */
const LOOKUP = 50;
const MAX_TEXT = 20_000;
/** Boards read and written per pass. */
const BOARD_BATCH = 4;
/** Boards per invocation. */
const SLICE = 8;
/** Blobs per select (each holds a user's whole job list). */
const BLOB_PAGE = 100;
/** Rows per select of the tile list: PostgREST answers at most 1000 to one request. */
const TILE_PAGE = 1000;
/** Distinct titles searched per feed and run, across every user. */
const TERMS_PER_RUN: Record<TermFeed, number> = {
  hn: 20,
  jobicy: 20,
  // Remotive asks for at most ~4 requests a day; the feeds run once a day.
  remotive: 2,
};
/** The boards that are not company boards: never closed as "unfollowed". */
const FEED_BOARDS = [...TERM_FEEDS, 'rss'];

interface Follower extends WatchedCompany {
  user_id: string;
}

type Log = {
  user_id: string | null;
  kind: 'disabled' | 'failed' | 'run';
  board: string | null;
  status: number | null;
  message: string;
};

type Totals = { queue: number; review: number; reject: number; failed: number };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const iso = (s?: string) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** Env vars this function needs; set by Supabase (URL, service role) — see docs/secrets.md. */
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

/** Names (never values) of required env vars that are unset or empty. */
const missingEnv = () => REQUIRED_ENV.filter((name) => !Deno.env.get(name));

/** Equal-length hex digests compared without an early exit. */
const sameDigest = (a: string, b: string) => {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** The caller's secret against SYNC_SECRET, compared as digests. There is no committed fallback:
 *  until the secret is set, nothing is accepted. */
async function authorized(given: string | null): Promise<boolean> {
  const secret = Deno.env.get('SYNC_SECRET');
  if (!secret) {
    console.error('sync-postings: SYNC_SECRET is not set (see docs/secrets.md)');
    return false;
  }
  if (!given) return false;
  return sameDigest(await sha256(given), await sha256(secret));
}

type Page<R> = (
  from: number,
  to: number,
) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>;

/** Every row, page by page (`page` must order the rows). */
async function readPaged<R>(page: Page<R>, size: number) {
  const rows: R[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { rows: [] as R[], error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < size) return { rows, error: null };
  }
}

/** Score, dedupe and upsert one user's postings from this pass's answered reads. */
async function writeGroup(
  db: SupabaseClient,
  userId: string,
  config: TrackConfig,
  answered: ReadOutcome[],
  logs: Log[],
  totals: Totals,
) {
  const trackSlug = config.slug;
  let scored = scoreBatch(answered, config);
  // One row per key in a batch (an upsert can't touch a row twice).
  const keys = new Set<string>();
  scored = scored.filter((s) => {
    const key = `${s.posting.source}|${s.posting.sourceId}`;
    return !keys.has(key) && !!keys.add(key);
  });
  // Fingerprint dedupe across runs: an open row with the same fingerprint from a better source
  // (an ATS original over the RSS copy) keeps its place, and the copy is not stored.
  const prints = [...new Set(scored.map((s) => s.fingerprint))];
  const existing = new Map<string, { source: string; source_id: string }[]>();
  let lookupFailed = false;
  for (let i = 0; i < prints.length; i += LOOKUP) {
    const { data: old, error } = await db
      .from('postings')
      .select('source, source_id, fingerprint')
      .eq('user_id', userId)
      .eq('track_slug', trackSlug)
      .is('closed_at', null)
      .in('fingerprint', prints.slice(i, i + LOOKUP));
    if (error) lookupFailed = true;
    for (const o of (old ?? []) as { source: string; source_id: string; fingerprint: string }[])
      existing.set(o.fingerprint, [...(existing.get(o.fingerprint) ?? []), o]);
  }
  scored = scored.filter(
    (s) =>
      !(existing.get(s.fingerprint) ?? []).some(
        (o) =>
          !(o.source === s.posting.source && o.source_id === s.posting.sourceId) &&
          RANK[o.source] < RANK[s.posting.source],
      ),
  );
  if (lookupFailed)
    logs.push({
      user_id: userId,
      kind: 'failed',
      board: null,
      status: null,
      message: 'fingerprint lookup failed: copies across runs may be stored twice',
    });

  const seen = new Date().toISOString();
  const upserts = scored.map((s) => ({
    user_id: userId,
    track_slug: trackSlug,
    source: s.posting.source,
    source_id: s.posting.sourceId,
    board: s.board,
    company: (s.posting.company ?? '').slice(0, 200),
    title: s.posting.title,
    location: s.posting.location ?? null,
    remote: s.posting.remote ?? null,
    url: s.posting.url,
    // A rejected posting keeps no description: it is kept for the counts and the closing rule.
    description_text:
      s.verdict === 'reject' ? '' : (s.posting.descriptionText ?? '').slice(0, MAX_TEXT),
    posted_at: iso(s.posting.postedAt),
    score: s.score,
    verdict: s.verdict,
    reasons: s.reasons,
    matched_signals: s.matchedSignals,
    fingerprint: s.fingerprint,
    missed_syncs: 0,
    last_seen_at: seen,
    closed_at: null,
  }));
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const { error } = await db
      .from('postings')
      .upsert(upserts.slice(i, i + CHUNK), { onConflict: 'user_id,source,source_id' });
    if (error) {
      totals.failed += Math.min(CHUNK, upserts.length - i);
      logs.push({
        user_id: userId,
        kind: 'failed',
        board: null,
        status: null,
        message: `upsert: ${error.message}`.slice(0, 2000),
      });
    }
  }
  for (const s of scored) totals[s.verdict]++;
}

Deno.serve(async (req) => {
  if (!(await authorized(req.headers.get('x-sync-secret'))))
    return json({ error: 'forbidden' }, 403);
  const body = (await req.json().catch(() => ({}))) as {
    rss?: boolean;
    after?: string;
    runStart?: string;
  };
  // A cursor, not an offset: a user who drops a board shrinks the list the next slice reads.
  const after = typeof body.after === 'string' ? body.after : '';
  // Fail loud: name what is missing instead of a vague client error deep in the run.
  const missing = missingEnv();
  if (missing.length) {
    console.error(`sync-postings: missing env ${missing.join(', ')} (see docs/secrets.md)`);
    return json({ error: `missing env: ${missing.join(', ')}` }, 500);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const runStart = body.runStart ?? new Date().toISOString();
  const logs: Log[] = [];

  // v11 blobs keep their watched boards in the curation tables (service role only).
  const tiles = await readPaged<WatchedTile & { user_id: string }>(
    async (from, to) =>
      (await db.rpc('watched_tile_urls').range(from, to)) as {
        data: (WatchedTile & { user_id: string })[] | null;
        error: { message: string } | null;
      },
    TILE_PAGE,
  );
  if (tiles.error)
    logs.push({
      user_id: null,
      kind: 'failed',
      board: null,
      status: null,
      message: `watched tiles (v11 fallback): ${tiles.error}`.slice(0, 2000),
    });
  const tilesOf = new Map<string, WatchedTile[]>();
  for (const t of tiles.rows) tilesOf.set(t.user_id, [...(tilesOf.get(t.user_id) ?? []), t]);

  // Every user's plan, from their blob.
  const blobs = await readPaged<{ user_id: string; data: unknown }>(
    async (from, to) =>
      (await db.from('tracker').select('user_id, data').order('user_id').range(from, to)) as {
        data: { user_id: string; data: unknown }[] | null;
        error: { message: string } | null;
      },
    BLOB_PAGE,
  );
  if (blobs.error) return json({ error: blobs.error }, 500);
  const plans = new Map<string, SyncPlan>();
  // Users with nothing to score against (no titles, no design systems): their rows close.
  const planless: string[] = [];
  for (const b of blobs.rows) {
    const plan = planFromBlob(b.data, tilesOf.get(b.user_id) ?? []);
    if (plan) plans.set(b.user_id, plan);
    else planless.push(b.user_id);
  }
  const closing = () => ({
    verdict: 'reject',
    reasons: ['posting closed'],
    closed_at: new Date().toISOString(),
  });

  // Each board once, however many users follow it; who follows each board.
  const distinct = new Map<string, Follower>();
  const followers = new Map<string, Follower[]>();
  for (const [userId, plan] of plans)
    for (const c of plan.boards) {
      const f = { ...c, user_id: userId };
      const b = boardOf(f);
      if (!distinct.has(b)) distinct.set(b, f);
      followers.set(b, [...(followers.get(b) ?? []), f]);
    }

  const answeredBy = new Map<string, string[]>(); // user → boards that answered
  const failedBoards = new Set<string>();
  const totals = new Map<string, Totals>();
  const totalsOf = (k: string) => {
    if (!totals.has(k)) totals.set(k, { queue: 0, review: 0, reject: 0, failed: 0 });
    return totals.get(k)!;
  };

  // Board passes: read BOARD_BATCH boards, log failures, write each follower's postings.
  const all = [...distinct.values()].sort((a, b) => boardOf(a).localeCompare(boardOf(b)));
  const rest = all.filter((w) => boardOf(w) > after);
  const boards = rest.slice(0, SLICE);
  const last = rest.length <= SLICE;
  const next = last ? null : boardOf(boards[boards.length - 1]);
  for (let i = 0; i < boards.length; i += BOARD_BATCH) {
    const reads = await readAll(boards.slice(i, i + BOARD_BATCH), {
      fetch: (u) => fetch(u),
      rss: false,
    });
    const perUser = new Map<string, ReadOutcome[]>();
    for (const r of reads) {
      if (!r.ok) failedBoards.add(r.board);
      for (const w of followers.get(r.board) ?? []) {
        if (!r.ok) {
          logs.push({
            user_id: w.user_id,
            kind: 'failed',
            board: r.board,
            status: r.status ?? null,
            message: (r.status === 404
              ? `${w.company}: board not found (404), its postings closed. Remove it from Sources if it is gone.`
              : `${w.company}: ${r.error ?? `HTTP ${r.status}`}`
            ).slice(0, 2000),
          });
          // A 404 is an answer (the board is gone or the slug is wrong): nothing on it is open.
          // Any other failure closes nothing.
          if (r.status === 404)
            await db
              .from('postings')
              .update(closing())
              .eq('user_id', w.user_id)
              .eq('board', r.board)
              .is('closed_at', null);
        } else {
          answeredBy.set(w.user_id, [...(answeredBy.get(w.user_id) ?? []), r.board]);
          perUser.set(w.user_id, [...(perUser.get(w.user_id) ?? []), forWatcher(r, w)]);
        }
      }
    }
    for (const [userId, answered] of perUser)
      await writeGroup(db, userId, plans.get(userId)!.config, answered, logs, totalsOf(userId));
  }

  // The feeds, once a day (the morning run), on the last slice: each title once across users.
  let feedsRead = 0;
  if (body.rss === true && last) {
    const terms: Partial<Record<TermFeed, string[]>> = {};
    for (const feed of TERM_FEEDS) {
      const seen = new Map<string, string>();
      for (const plan of plans.values())
        if (plan.feeds.has(feed))
          for (const t of plan.terms) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
      terms[feed] = [...seen.values()].slice(0, TERMS_PER_RUN[feed]);
    }
    const wantsRss = [...plans.values()].some((p) => p.feeds.has('rss'));
    const reads = await readAll([], { fetch: (u) => fetch(u), rss: wantsRss, terms });
    feedsRead = reads.length;
    for (const r of reads.filter((x) => !x.ok))
      logs.push({
        user_id: null,
        kind: 'failed',
        board: r.board,
        status: r.status ?? null,
        message:
          `${r.board}${r.term ? ` "${r.term}"` : ''}: ${r.error ?? `HTTP ${r.status}`}`.slice(
            0,
            2000,
          ),
      });
    for (const [userId, plan] of plans) {
      const mine = feedReadsFor(plan, reads);
      for (const feed of answeredFeeds(plan, mine))
        answeredBy.set(userId, [...(answeredBy.get(userId) ?? []), feed]);
      const ok = mine.filter((r) => r.ok);
      if (ok.length) await writeGroup(db, userId, plan.config, ok, logs, totalsOf(userId));
    }
  }

  // Closing, per user.
  const summary: Record<string, unknown>[] = [];
  for (const [userId, plan] of plans) {
    const trackSlug = plan.config.slug;
    const t = totalsOf(userId);
    const answered = answeredBy.get(userId) ?? [];
    let closed = 0;
    // Not after a failed write (a posting that did not land would read as missing).
    if (!t.failed && answered.length) {
      const { data: n } = await db.rpc('mark_missed_postings', {
        p_user: userId,
        p_track: trackSlug,
        p_boards: answered,
        p_run: runStart,
      });
      closed = typeof n === 'number' ? n : 0;
    }
    // A board no longer followed never answers again, so its open postings are closed now
    // instead of waiting for misses that never come; so are rows scored under an old profile. Not
    // when a v11 user's watched tiles could not be read: their boards would all look unfollowed.
    if (last && !(plan.from === 'v11' && tiles.error)) {
      const { data: n, error } = await db.rpc('close_unfollowed_postings', {
        p_user: userId,
        p_track: trackSlug,
        p_keep: [...plan.boards.map(boardOf), ...FEED_BOARDS],
      });
      if (error)
        logs.push({
          user_id: userId,
          kind: 'failed',
          board: null,
          status: null,
          message: `closing unfollowed boards: ${error.message}`.slice(0, 2000),
        });
      else closed += typeof n === 'number' ? n : 0;
    }
    if (!answered.length && !t.failed && !last) continue;
    const line = {
      user_id: userId,
      profile: trackSlug,
      blob: plan.from,
      slice: `${boards.length} boards after '${after}' (${rest.length} left of ${all.length})`,
      answered: answered.length,
      queue: t.queue,
      review: t.review,
      reject: t.reject,
      closed,
      failed: t.failed,
    };
    summary.push(line);
    logs.push({
      user_id: userId,
      kind: 'run',
      board: null,
      status: null,
      message: JSON.stringify(line),
    });
  }
  if (last)
    for (const userId of planless) {
      const { error } = await db.rpc('close_unfollowed_postings', {
        p_user: userId,
        p_track: null,
        p_keep: [],
      });
      if (error)
        logs.push({
          user_id: userId,
          kind: 'failed',
          board: null,
          status: null,
          message: `closing (no search profile): ${error.message}`.slice(0, 2000),
        });
    }
  if (logs.length) await db.from('sync_log').insert(logs);
  if (next) {
    // The next slice runs in its own invocation (its own CPU budget). Wait only until the request
    // is on its way; the callee keeps running after this caller lets go.
    // req.url is the runtime's internal address; call the public one.
    await fetch(`${supabaseUrl}/functions/v1/sync-postings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sync-secret': req.headers.get('x-sync-secret')!,
      },
      body: JSON.stringify({ rss: body.rss, after: next, runStart }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  }
  return json({
    ranAt: runStart,
    users: plans.size,
    boards: all.length,
    after,
    next,
    read: boards.length,
    left: rest.length,
    last,
    feeds: feedsRead,
    failedBoards: failedBoards.size,
    summary,
  });
});
