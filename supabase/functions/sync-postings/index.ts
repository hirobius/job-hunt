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
// Scan rotation (#src-bulk, body `{ rotate: true }`, pg_cron every minute): see `rotate` below and
// src/tracks/rotation.ts. It reads the bulk board set a slice at a time for design systems users.
// Auth: x-sync-secret must equal SYNC_SECRET (compared as SHA-256 digests, without an early exit).
// Nothing is accepted until SYNC_SECRET is set. Deploy and secrets: README.md beside this file.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import boardsJson from '../../../src/feed/data/boards.json' with { type: 'json' };
import { parseBoardSet } from '../../../src/feed/boardSet.ts';
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
  type ScoredPosting,
  type TermFeed,
} from '../../../src/tracks/sync.ts';
import {
  advance,
  keepForScan,
  pickBatch,
  ROTATION,
  runBatch,
  sanitizeRotation,
  toWatched,
  type DeadBoard,
} from '../../../src/tracks/rotation.ts';
import { designSystemsTrack } from '../../../src/tracks/track-config.ts';
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
/** Each outbound read's cap: one hung board must not spend the slice's whole wall-clock budget. */
const FETCH_TIMEOUT_MS = ROTATION.fetchTimeoutMs;
const timedFetch = (u: string) => fetch(u, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
/** How long the next-slice call waits for its answer before letting go (it keeps running). */
const CHAIN_WAIT_MS = 3000;

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
const writeGroup = (
  db: SupabaseClient,
  userId: string,
  config: TrackConfig,
  answered: ReadOutcome[],
  logs: Log[],
  totals: Totals,
) => writeScored(db, userId, config.slug, scoreBatch(answered, config), logs, totals);

/** Dedupe and upsert one user's scored postings. `extra` columns ride on every row (the scan's
 *  `via_scan`). */
async function writeScored(
  db: SupabaseClient,
  userId: string,
  trackSlug: string,
  scoredIn: ScoredPosting[],
  logs: Log[],
  totals: Totals,
  extra: Record<string, unknown> = {},
) {
  let scored = scoredIn;
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
    ...extra,
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

/** A posting closed now (a gone board, or one no longer followed). */
const closing = () => ({
  verdict: 'reject',
  reasons: ['posting closed'],
  closed_at: new Date().toISOString(),
});

/** Every user's plan, from their blob (v11 blobs with their watched tiles). `tilesError`: the
 *  tiles could not be read, so a v11 user's boards would all look unfollowed. */
async function loadPlans(
  db: SupabaseClient,
  logs: Log[],
): Promise<
  | { plans: Map<string, SyncPlan>; planless: string[]; tilesError: string | null }
  | { error: string }
> {
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
  if (blobs.error) return { error: blobs.error };
  const plans = new Map<string, SyncPlan>();
  // Users with nothing to score against (no titles, no design systems): their rows close.
  const planless: string[] = [];
  for (const b of blobs.rows) {
    const plan = planFromBlob(b.data, tilesOf.get(b.user_id) ?? []);
    if (plan) plans.set(b.user_id, plan);
    else planless.push(b.user_id);
  }
  return { plans, planless, tilesError: tiles.error };
}

/** Start the next slice in its own invocation (its own CPU budget). Waits only until the request
 *  is on its way (CHAIN_WAIT_MS): the callee keeps running after this caller lets go, so a timeout
 *  is the normal case. An answer that is an error, or a call that never left, is tried once more;
 *  returns why the chain broke, or null. req.url is the runtime's internal address: call the
 *  public one. */
async function chainNext(
  supabaseUrl: string,
  secret: string,
  payload: { rss?: boolean; after: string; runStart: string },
): Promise<string | null> {
  let why = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/sync-postings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sync-secret': secret },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(CHAIN_WAIT_MS),
      });
      if (r.ok) return null;
      why = `HTTP ${r.status}`;
      // 403: the secret is wrong; trying again changes nothing.
      if (r.status === 403) return why;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') return null;
      why = String(e);
    }
  }
  return why;
}

// ---- Scan rotation (#src-bulk) ----
// The bulk board set, checked and in key order, parsed once per worker.
const BOARD_SET = parseBoardSet(boardsJson);

type RotationRow = {
  cursor_key: string;
  cycle: number;
  cycle_started_at: string;
  host_backoff: unknown;
  carry: unknown;
};
type DeadRow = {
  board_key: string;
  last_status: number;
  fails: number;
  retry_at: string;
  disabled: boolean;
  last_checked: string;
};

/** One rotation step: claim the cursor (one run at a time), read the next batch of the bulk board
 *  set (src/tracks/rotation.ts: in key order, a time box, a per-host limit, 429 backoff, a dead
 *  list), store each design systems user's remote queue/review postings from it, close what they
 *  missed, and move the cursor over the boards processed.
 *  Why a 1-minute cron and no chaining: each invocation reads at most ROTATION.maxBoards boards
 *  (ROTATION.jobsBudget open roles), so its CPU (JSON parsing and scoring; the waits on the network
 *  don't count) stays inside the worker's ~2 s; its wall time is at most the time box plus one
 *  read's timeout (55 s), under the cron gap, so runs never overlap, and the claim's lease makes
 *  sure of it. Chaining would read faster but runs would overlap the next cron call and race on
 *  the cursor; the cron alone covers 5,000 to 10,000 boards inside 12 h (README).
 *  Boards a user follows are skipped for that user (the twice-a-day sync reads them with their own
 *  rules, rejects included); rows the scan writes carry `via_scan`, which `close_unfollowed_postings`
 *  leaves alone (they are not followed, and this rotation closes them). */
async function rotate(db: SupabaseClient): Promise<Response> {
  const startedAt = Date.now();
  const runStart = new Date(startedAt).toISOString();
  const logs: Log[] = [];
  const fail = (message: string, board: string | null = null, status: number | null = null) =>
    logs.push({ user_id: null, kind: 'failed', board, status, message: message.slice(0, 2000) });

  // The lease: the database's clock, one row. Nothing back: another run holds it.
  const { data: claimed, error: claimError } = await db.rpc('claim_scan_rotation', {
    p_lease_ms: ROTATION.leaseMs,
  });
  if (claimError) return json({ error: `claim: ${claimError.message}` }, 500);
  const row = (Array.isArray(claimed) ? claimed[0] : claimed) as RotationRow | null | undefined;
  if (!row) return json({ rotate: 'busy' });
  const release = (patch: Record<string, unknown> = {}) =>
    db
      .from('scan_rotation')
      .update({ ...patch, lease_until: null, updated_at: new Date().toISOString() })
      .eq('id', 1);

  const state = sanitizeRotation(
    {
      cursor: row.cursor_key,
      cycle: row.cycle,
      cycleStartedAt: row.cycle_started_at,
      backoff: row.host_backoff,
      carry: row.carry,
    },
    startedAt,
  );
  try {
    const deadRows = await readPaged<DeadRow>(
      async (from, to) =>
        (await db
          .from('scan_dead_boards')
          .select('board_key, last_status, fails, retry_at, disabled, last_checked')
          .order('board_key')
          .range(from, to)) as { data: DeadRow[] | null; error: { message: string } | null },
      TILE_PAGE,
    );
    // Without the dead list every dead board would be read again: wait for the next run.
    if (deadRows.error) {
      await release();
      return json({ error: `dead boards: ${deadRows.error}` }, 500);
    }
    const dead = new Map<string, DeadBoard>(
      deadRows.rows.map((d) => [
        d.board_key,
        {
          key: d.board_key,
          lastStatus: d.last_status,
          fails: d.fails,
          retryAt: d.retry_at,
          disabled: d.disabled,
          lastChecked: d.last_checked,
        },
      ]),
    );

    // Who the scan is for: design systems profiles. A v11 user whose watched tiles could not be
    // read is left out this run (their followed boards are unknown).
    const loaded = await loadPlans(db, logs);
    if ('error' in loaded) {
      await release();
      return json({ error: loaded.error }, 500);
    }
    const scanners = [...loaded.plans]
      .filter(([, p]) => p.config.slug === designSystemsTrack.slug)
      .filter(([, p]) => !(p.from === 'v11' && loaded.tilesError))
      .map(([userId, plan]) => ({ userId, plan, follows: new Set(plan.boards.map(boardOf)) }));
    if (!scanners.length) {
      await release();
      return json({
        rotate: 'idle',
        reason: 'no design systems profile',
        boards: BOARD_SET.boards.length,
      });
    }

    const pick = pickBatch(BOARD_SET.boards, state, dead, startedAt);
    const steps = new Map(pick.steps.filter((s) => s.action === 'read').map((s) => [s.key, s]));
    const results = await runBatch(
      [...steps.values()].map((s) => ({ key: s.key, host: s.host })),
      async ({ key }) =>
        (await readAll([toWatched(steps.get(key)!.board)], { fetch: timedFetch, rss: false }))[0],
      { ...ROTATION, now: Date.now, startedAt },
    );
    const moved = advance(BOARD_SET.boards, state, pick, results, dead, Date.now());

    const answered: ReadOutcome[] = [];
    let closed = 0;
    for (const r of results) {
      if (r.result === 'ok' && r.value) answered.push(r.value);
      else if (r.result === 'gone') {
        // Gone: every user's scan rows on it close (a followed board's rows are the sync's).
        const { data, error } = await db
          .from('postings')
          .update(closing())
          .eq('board', r.key)
          .eq('via_scan', true)
          .is('closed_at', null)
          .select('id');
        if (error) fail(`closing ${r.key} (404): ${error.message}`, r.key, 404);
        closed += data?.length ?? 0;
      } else if (r.result === 'failed' || r.result === 'throttled')
        fail(`${r.key}: ${r.value?.error ?? `HTTP ${r.status ?? '?'}`}`, r.key, r.status ?? null);
    }
    for (const d of moved.deadUpsert)
      if (d.disabled && !dead.get(d.key)?.disabled)
        logs.push({
          user_id: null,
          kind: 'disabled',
          board: d.key,
          status: 404,
          message: `${d.key}: ${d.fails} 404s in a row, no longer read (delete its scan_dead_boards row to try again)`,
        });

    // Score once per distinct config (most design systems users share one), then each user's own.
    const byConfig = new Map<string, typeof scanners>();
    for (const s of scanners) {
      const k = JSON.stringify(s.plan.config);
      byConfig.set(k, [...(byConfig.get(k) ?? []), s]);
    }
    let stored = 0;
    for (const group of byConfig.values()) {
      const scored = answered.length ? scoreBatch(answered, group[0].plan.config) : [];
      for (const { userId, follows } of group) {
        const boards = answered.map((r) => r.board).filter((b) => !follows.has(b));
        if (!boards.length) continue;
        const mine = scored.filter((s) => !follows.has(s.board) && keepForScan(s));
        const t: Totals = { queue: 0, review: 0, reject: 0, failed: 0 };
        if (mine.length)
          await writeScored(db, userId, designSystemsTrack.slug, mine, logs, t, { via_scan: true });
        stored += t.queue + t.review;
        // A posting gone from a board that answered (or no longer remote or included) is missed;
        // 2 misses close it (mark_missed_postings). Not after a failed write.
        if (!t.failed) {
          const { data: n, error } = await db.rpc('mark_missed_postings', {
            p_user: userId,
            p_track: designSystemsTrack.slug,
            p_boards: boards,
            p_run: runStart,
          });
          if (error) fail(`marking missed (scan): ${error.message}`);
          closed += typeof n === 'number' ? n : 0;
        }
      }
    }

    const { state: next } = moved;
    const saved = await release({
      cursor_key: next.cursor,
      cycle: next.cycle,
      cycle_started_at: next.cycleStartedAt,
      host_backoff: next.backoff,
      carry: next.carry,
    });
    if (saved.error) fail(`saving the cursor: ${saved.error.message}`);
    if (moved.deadUpsert.length) {
      const { error } = await db.from('scan_dead_boards').upsert(
        moved.deadUpsert.map((d) => ({
          board_key: d.key,
          last_status: d.lastStatus,
          fails: d.fails,
          retry_at: d.retryAt,
          disabled: d.disabled,
          last_checked: d.lastChecked,
        })),
        { onConflict: 'board_key' },
      );
      if (error) fail(`dead boards: ${error.message}`);
    }
    if (moved.deadRemove.length) {
      const { error } = await db
        .from('scan_dead_boards')
        .delete()
        .in('board_key', moved.deadRemove);
      if (error) fail(`dead boards back: ${error.message}`);
    }

    const count = (k: string) => results.filter((r) => r.result === k).length;
    const summary = {
      rotate: true,
      cycle: next.cycle,
      cursor: next.cursor,
      boards: BOARD_SET.boards.length,
      read: results.length - count('unstarted') - count('deferred'),
      ok: count('ok'),
      gone: count('gone'),
      failed: count('failed'),
      throttled: count('throttled'),
      deferred: count('deferred'),
      unstarted: count('unstarted'),
      passed: moved.passed,
      carry: next.carry.length,
      backoff: Object.keys(next.backoff),
      users: scanners.length,
      stored,
      closed,
      cycleDone: moved.cycleDone,
      cycleHours: moved.cycleDone
        ? +((Date.now() - Date.parse(next.cycleStartedAt)) / 3600e3).toFixed(2)
        : null,
      ms: Date.now() - startedAt,
    };
    // One run row a cycle (and on a run that stored or closed something), not one a minute.
    if (moved.cycleDone || stored || closed)
      logs.push({
        user_id: null,
        kind: 'run',
        board: null,
        status: null,
        message: JSON.stringify(summary).slice(0, 2000),
      });
    if (logs.length) await db.from('sync_log').insert(logs);
    return json(summary);
  } catch (e) {
    // Nothing advanced: the same boards are read on the next run.
    fail(`rotation after '${state.cursor}' stopped: ${String(e)}`);
    await release();
    await db.from('sync_log').insert(logs);
    return json({ error: String(e) }, 500);
  }
}

Deno.serve(async (req) => {
  if (!(await authorized(req.headers.get('x-sync-secret'))))
    return json({ error: 'forbidden' }, 403);
  const body = (await req.json().catch(() => ({}))) as {
    rotate?: boolean;
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
  if (body.rotate === true) return rotate(db);
  const runStart = body.runStart ?? new Date().toISOString();
  const logs: Log[] = [];

  const loaded = await loadPlans(db, logs);
  if ('error' in loaded) return json({ error: loaded.error }, 500);
  const { plans, planless, tilesError } = loaded;

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
  let feedsRead = 0;
  const summary: Record<string, unknown>[] = [];
  // Whatever breaks in this slice, the next one still starts (below): one bad board or write must
  // not stop every board after it until the next cron run.
  try {
    for (let i = 0; i < boards.length; i += BOARD_BATCH) {
      const reads = await readAll(boards.slice(i, i + BOARD_BATCH), {
        fetch: timedFetch,
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
    if (body.rss === true && last) {
      const terms: Partial<Record<TermFeed, string[]>> = {};
      for (const feed of TERM_FEEDS) {
        const seen = new Map<string, string>();
        for (const plan of plans.values())
          if (plan.feeds.has(feed))
            for (const t of plan.terms)
              if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
        terms[feed] = [...seen.values()].slice(0, TERMS_PER_RUN[feed]);
      }
      const wantsRss = [...plans.values()].some((p) => p.feeds.has('rss'));
      const reads = await readAll([], { fetch: timedFetch, rss: wantsRss, terms });
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
      // instead of waiting for misses that never come; so are rows scored under an old profile, and
      // a feed the user muted (only the feeds they have on are kept). Not when a v11 user's watched
      // tiles could not be read: their boards would all look unfollowed.
      if (last && !(plan.from === 'v11' && tilesError)) {
        const { data: n, error } = await db.rpc('close_unfollowed_postings', {
          p_user: userId,
          p_track: trackSlug,
          p_keep: [...plan.boards.map(boardOf), ...plan.feeds],
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
  } catch (e) {
    logs.push({
      user_id: null,
      kind: 'failed',
      board: null,
      status: null,
      message: `slice after '${after}' stopped: ${String(e)}`.slice(0, 2000),
    });
  }
  if (logs.length) await db.from('sync_log').insert(logs);
  if (next) {
    const broke = await chainNext(supabaseUrl, req.headers.get('x-sync-secret')!, {
      rss: body.rss,
      after: next,
      runStart,
    });
    // Logged, so a run that stopped part way says where (the cron's next run starts over).
    if (broke)
      await db.from('sync_log').insert({
        user_id: null,
        kind: 'failed',
        board: null,
        status: null,
        message: `next slice (after '${next}') not started: ${broke}`.slice(0, 2000),
      });
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
