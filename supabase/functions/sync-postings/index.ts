// The postings sync (Muse Phase 2 + 2.5, 2026-10-24): a Supabase edge function run twice a day by
// pg_cron (supabase/migrations/20261024100200_sync_postings_cron.sql). It reads every enabled
// watched company once (Ashby one board at a time), and the designsystems.jobs feed on the morning
// run, scores each posting with its track's config (src/tracks), dedupes by fingerprint and
// upserts on (user, source, source_id). A 404 disables that company and logs it; it never throws
// the batch away. A posting missing from 2 answered reads in a row is rejected as "posting closed".
// One invocation reads SLICE boards (the worker's CPU budget is ~2 s, and the first full run ran
// out), then calls itself for the next slice. Closing unwatched boards and the RSS feed run on the
// last slice; each slice closes postings missed on the boards it read.
// Auth: x-sync-secret must equal SYNC_SECRET, or hash to SYNC_SECRET_SHA256 (the value the cron's
// Vault secret holds), so the function works before the dashboard secret is set.
// Deploy and secrets: README.md beside this file.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { boardOf, readAll, scoreBatch, type ReadOutcome } from '../../../src/tracks/sync.ts';
import type { WatchedCompany } from '../../../src/tracks/sources.ts';
import { designSystemsTrack, type TrackConfig } from '../../../src/tracks/track-config.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SYNC_SECRET_SHA256 = 'e724f1f43ed29028c4e8e5ae4f54c283a50f8020587a16ee004eabd993d0b72d';
const TRACKS: Record<string, TrackConfig> = { [designSystemsTrack.slug]: designSystemsTrack };
/** The feed is about design systems: only that track reads it. */
const RSS_TRACKS = new Set([designSystemsTrack.slug]);
/** score.ts `dedupe`'s source order: an ATS original beats a copy. */
const RANK: Record<string, number> = {
  greenhouse: 0,
  lever: 0,
  ashby: 0,
  rss: 1,
  manual: 1,
  adzuna: 2,
  jsearch: 2,
  remotive: 3,
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

interface WatchedRow extends WatchedCompany {
  id: number;
  user_id: string;
  track_slug: string;
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

async function authorized(given: string | null): Promise<boolean> {
  if (!given) return false;
  const secret = Deno.env.get('SYNC_SECRET');
  if (secret && given === secret) return true;
  return (await sha256(given)) === SYNC_SECRET_SHA256;
}

/** Score, dedupe and upsert one user's track from this pass's answered reads. */
async function writeGroup(
  db: SupabaseClient,
  userId: string,
  trackSlug: string,
  answered: ReadOutcome[],
  logs: Log[],
  totals: Totals,
) {
  let scored = scoreBatch(answered, TRACKS[trackSlug]);
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
    company: s.posting.company ?? '',
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
  const body = (await req.json().catch(() => ({}))) as { rss?: boolean; after?: string; runStart?: string };
  // A cursor, not an offset: a slice that disables a 404 board shrinks the list the next one reads.
  const after = body.after ?? '';
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const runStart = body.runStart ?? new Date().toISOString();

  const { data, error } = await db
    .from('watched_companies')
    .select('id, user_id, track_slug, company, ats, slug')
    .eq('enabled', true);
  if (error) return json({ error: error.message }, 500);
  const watched = ((data ?? []) as WatchedRow[]).filter((w) => TRACKS[w.track_slug]);

  // Each board once, however many users watch it; who watches each board.
  const distinct = new Map<string, WatchedRow>();
  const watchers = new Map<string, WatchedRow[]>();
  for (const w of watched) {
    const b = boardOf(w);
    if (!distinct.has(b)) distinct.set(b, w);
    watchers.set(b, [...(watchers.get(b) ?? []), w]);
  }
  const groups = new Map<string, WatchedRow[]>();
  for (const w of watched) {
    const k = `${w.user_id}|${w.track_slug}`;
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }

  const logs: Log[] = [];
  const answeredBy = new Map<string, string[]>(); // group key → boards that answered
  const status404 = new Set<string>();
  const totals = new Map<string, Totals>();
  const totalsOf = (k: string) => {
    if (!totals.has(k)) totals.set(k, { queue: 0, review: 0, reject: 0, failed: 0 });
    return totals.get(k)!;
  };

  // Board passes: read BOARD_BATCH boards, record health, write each watching group's postings.
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
    const now = new Date().toISOString();
    const perGroup = new Map<string, ReadOutcome[]>();
    for (const r of reads) {
      for (const w of watchers.get(r.board) ?? []) {
        const k = `${w.user_id}|${w.track_slug}`;
        if (r.status === 404) {
          status404.add(r.board);
          await db
            .from('watched_companies')
            .update({ enabled: false, disabled_reason: `404 on ${now.slice(0, 10)}`, last_status: 404 })
            .eq('id', w.id);
          logs.push({
            user_id: w.user_id,
            kind: 'disabled',
            board: r.board,
            status: 404,
            message: `${w.company}: board not found (404), disabled`,
          });
        } else if (!r.ok) {
          await db.from('watched_companies').update({ last_status: r.status ?? null }).eq('id', w.id);
          logs.push({
            user_id: w.user_id,
            kind: 'failed',
            board: r.board,
            status: r.status ?? null,
            message: `${w.company}: ${r.error ?? `HTTP ${r.status}`}`.slice(0, 2000),
          });
        } else {
          await db
            .from('watched_companies')
            .update({ last_status: 200, last_synced_at: now })
            .eq('id', w.id);
          answeredBy.set(k, [...(answeredBy.get(k) ?? []), r.board]);
          perGroup.set(k, [...(perGroup.get(k) ?? []), r]);
        }
      }
    }
    for (const [k, answered] of perGroup) {
      const [userId, trackSlug] = k.split('|');
      await writeGroup(db, userId, trackSlug, answered, logs, totalsOf(k));
    }
  }

  // The feed, once, for the tracks that read it.
  let rssOk = false;
  if (body.rss === true && last) {
    const [rssRead] = await readAll([], { fetch: (u) => fetch(u), rss: true });
    rssOk = rssRead.ok;
    if (!rssRead.ok)
      logs.push({
        user_id: null,
        kind: 'failed',
        board: 'rss',
        status: rssRead.status ?? null,
        message: `designsystems.jobs: ${rssRead.error ?? `HTTP ${rssRead.status}`}`.slice(0, 2000),
      });
    else
      for (const k of groups.keys()) {
        const [userId, trackSlug] = k.split('|');
        if (!RSS_TRACKS.has(trackSlug)) continue;
        answeredBy.set(k, [...(answeredBy.get(k) ?? []), 'rss']);
        await writeGroup(db, userId, trackSlug, [rssRead], logs, totalsOf(k));
      }
  }

  // Closing, per group, once every board has been read.
  const summary: Record<string, unknown>[] = [];
  for (const [k, rows] of groups) {
    const [userId, trackSlug] = k.split('|');
    const t = totalsOf(k);
    const answered = answeredBy.get(k) ?? [];
    let closed = 0;
    // Not after a failed write (a posting that did not land would read as missing).
    if (!t.failed) {
      const { data: n } = await db.rpc('mark_missed_postings', {
        p_user: userId,
        p_track: trackSlug,
        p_boards: answered,
        p_run: runStart,
      });
      closed = typeof n === 'number' ? n : 0;
    }
    // A board no longer read (a 404 disabled it, or the user stopped watching it) never answers
    // again, so its open postings are closed now instead of waiting for misses that never come.
    // Last slice only: the boards a 404 disabled are no longer in `watched` by then.
    const live = rows.map(boardOf).filter((b) => !status404.has(b));
    const seen = new Date().toISOString();
    const { data: gone, error: goneError } = !last ? { data: [], error: null } : await db
      .from('postings')
      .update({ verdict: 'reject', reasons: ['posting closed'], closed_at: seen })
      .eq('user_id', userId)
      .eq('track_slug', trackSlug)
      .is('closed_at', null)
      .neq('board', 'rss')
      .not('board', 'in', `(${(live.length ? live : ['']).map((b) => `"${b}"`).join(',')})`)
      .select('id');
    if (goneError)
      logs.push({
        user_id: userId,
        kind: 'failed',
        board: null,
        status: null,
        message: `closing unwatched boards: ${goneError.message}`.slice(0, 2000),
      });
    else closed += gone?.length ?? 0;
    if (!answered.length && !t.failed && !last) continue;
    const line = {
      user_id: userId,
      track: trackSlug,
      slice: `${boards.length} boards after '${after}' (${rest.length} left of ${all.length})`,
      answered: answered.length,
      queue: t.queue,
      review: t.review,
      reject: t.reject,
      closed,
      failed: t.failed,
    };
    summary.push(line);
    logs.push({ user_id: userId, kind: 'run', board: null, status: null, message: JSON.stringify(line) });
  }
  if (logs.length) await db.from('sync_log').insert(logs);
  if (next) {
    // The next slice runs in its own invocation (its own CPU budget). Wait only until the request
    // is on its way; the callee keeps running after this caller lets go.
    // req.url is the runtime's internal address; call the public one.
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-postings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-secret': req.headers.get('x-sync-secret')! },
      body: JSON.stringify({ rss: body.rss, after: next, runStart }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  }
  return json({ ranAt: runStart, boards: all.length, after, next, read: boards.length, left: rest.length, last, rss: rssOk, summary });
});
