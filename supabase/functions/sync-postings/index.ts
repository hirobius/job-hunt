// The postings sync (Muse Phase 2 + 2.5, 2026-10-24): a Supabase edge function run twice a day by
// pg_cron (supabase/migrations/20261024100200_sync_postings_cron.sql). It reads every enabled
// watched company once (Ashby one board at a time), and the designsystems.jobs feed on the morning
// run, scores each posting with its track's config (src/tracks), dedupes by fingerprint and
// upserts on (user, source, source_id). A 404 disables that company and logs it; it never throws
// the batch away. A posting missing from 2 answered reads in a row is rejected as "posting closed".
// Deploy and secrets: README.md beside this file.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { boardOf, readAll, scoreBatch, type ReadOutcome } from '../../../src/tracks/sync.ts';
import type { WatchedCompany } from '../../../src/tracks/sources.ts';
import { designSystemsTrack, type TrackConfig } from '../../../src/tracks/track-config.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

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
const MAX_TEXT = 20_000;

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const iso = (s?: string) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

Deno.serve(async (req) => {
  const secret = Deno.env.get('SYNC_SECRET');
  if (!secret || req.headers.get('x-sync-secret') !== secret)
    return json({ error: 'forbidden' }, 403);
  const body = (await req.json().catch(() => ({}))) as { rss?: boolean };
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const runStart = new Date().toISOString();

  const { data, error } = await db
    .from('watched_companies')
    .select('id, user_id, track_slug, company, ats, slug')
    .eq('enabled', true);
  if (error) return json({ error: error.message }, 500);
  const watched = ((data ?? []) as WatchedRow[]).filter((w) => TRACKS[w.track_slug]);

  // Each board once, however many users watch it.
  const distinct = new Map<string, WatchedRow>();
  for (const w of watched) if (!distinct.has(boardOf(w))) distinct.set(boardOf(w), w);
  const reads = await readAll([...distinct.values()], {
    fetch: (u) => fetch(u),
    rss: body.rss === true,
  });
  const byBoard = new Map<string, ReadOutcome>(reads.map((r) => [r.board, r]));

  // Board health, per watched row: a 404 disables it and says so in the log.
  const logs: Log[] = [];
  const now = new Date().toISOString();
  for (const w of watched) {
    const r = byBoard.get(boardOf(w))!;
    if (r.status === 404) {
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
      await db
        .from('watched_companies')
        .update({ last_status: r.status ?? null })
        .eq('id', w.id);
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
    }
  }
  const rssRead = byBoard.get('rss');
  if (rssRead && !rssRead.ok)
    logs.push({
      user_id: null,
      kind: 'failed',
      board: 'rss',
      status: rssRead.status ?? null,
      message: `designsystems.jobs: ${rssRead.error ?? `HTTP ${rssRead.status}`}`.slice(0, 2000),
    });

  // Then each user's track: their boards (and the feed), scored, deduped, upserted, closed.
  const groups = new Map<string, WatchedRow[]>();
  for (const w of watched) {
    const k = `${w.user_id}|${w.track_slug}`;
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }
  const summary: Record<string, unknown>[] = [];
  for (const [k, rows] of groups) {
    const [userId, trackSlug] = k.split('|');
    const track = TRACKS[trackSlug];
    const mine = [...new Set(rows.map(boardOf))].map((b) => byBoard.get(b)!);
    if (rssRead && RSS_TRACKS.has(trackSlug)) mine.push(rssRead);
    const answered = mine.filter((r) => r.ok);
    let scored = scoreBatch(answered, track);

    // Fingerprint dedupe across runs: an open row with the same fingerprint from a source that
    // ranks the same or better keeps its place, and the copy is not stored.
    const prints = [...new Set(scored.map((s) => s.fingerprint))];
    const existing = new Map<string, { source: string; source_id: string }[]>();
    for (let i = 0; i < prints.length; i += 200) {
      const { data: old } = await db
        .from('postings')
        .select('source, source_id, fingerprint')
        .eq('user_id', userId)
        .eq('track_slug', trackSlug)
        .is('closed_at', null)
        .in('fingerprint', prints.slice(i, i + 200));
      for (const o of (old ?? []) as { source: string; source_id: string; fingerprint: string }[])
        existing.set(o.fingerprint, [...(existing.get(o.fingerprint) ?? []), o]);
    }
    scored = scored.filter(
      (s) =>
        !(existing.get(s.fingerprint) ?? []).some(
          (o) =>
            !(o.source === s.posting.source && o.source_id === s.posting.sourceId) &&
            RANK[o.source] <= RANK[s.posting.source],
        ),
    );

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
    let failed = 0;
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const { error: e } = await db
        .from('postings')
        .upsert(upserts.slice(i, i + CHUNK), { onConflict: 'user_id,source,source_id' });
      if (e) {
        failed += Math.min(CHUNK, upserts.length - i);
        logs.push({
          user_id: userId,
          kind: 'failed',
          board: null,
          status: null,
          message: `upsert: ${e.message}`.slice(0, 2000),
        });
      }
    }
    // Closing counts only against boards that answered this run, and not after a failed write
    // (a posting that did not land would read as missing).
    let closed = 0;
    if (!failed) {
      const { data: n } = await db.rpc('mark_missed_postings', {
        p_user: userId,
        p_track: trackSlug,
        p_boards: answered.map((r) => r.board),
        p_run: runStart,
      });
      closed = typeof n === 'number' ? n : 0;
    }
    const split = { queue: 0, review: 0, reject: 0 };
    for (const s of scored) split[s.verdict]++;
    const line = {
      user_id: userId,
      track: trackSlug,
      boards: mine.length,
      answered: answered.length,
      ...split,
      closed,
      failed,
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
  if (logs.length) await db.from('sync_log').insert(logs);
  return json({ ranAt: runStart, boards: distinct.size, rss: !!rssRead, summary });
});
