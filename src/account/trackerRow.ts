// The tracker row adapter (#814): the one cloud row per user (`tracker`, RLS) that holds the synced
// blob. A write goes only over the version this tab last read (optimistic concurrency): a
// conditional update on its stamp, or an insert when there was no row. Postgres re-checks the
// condition under the row lock, so two devices sending at once can't both win. CloudSyncProvider
// owns when to read and write; this module owns how. The client is passed in, so supabase-js is
// never imported here (it loads lazily, supabase.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import { readBlob, type SyncData } from '../syncBlob';

/** The cloud row as this tab last read or wrote it: whether there is one, and its stamp. */
export type RowStamp = { row: boolean; at: string | null };

/** A stamp after `at`, even when this device's clock is behind the one that wrote it. */
export function nextStamp(at: string | null, now: number = Date.now()): string {
  const last = at ? Date.parse(at) : NaN;
  return new Date(Number.isNaN(last) ? now : Math.max(now, last + 1)).toISOString();
}

/** The row's blob (null when there is no row) and its stamp. Throws when the read fails. */
export async function readTrackerRow(
  supa: SupabaseClient,
  uid: string,
): Promise<{ blob: SyncData | null; stamp: RowStamp }> {
  const r = await supa.from('tracker').select('data, updated_at').eq('user_id', uid).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  if (!r.data) return { blob: null, stamp: { row: false, at: null } };
  return {
    blob: readBlob(r.data.data),
    stamp: { row: true, at: (r.data.updated_at as string | null) ?? null },
  };
}

export type WriteResult = {
  /** 'conflict': another device wrote first. 'fail': no read yet, or the write was refused. */
  result: 'ok' | 'conflict' | 'fail';
  /** The row's new stamp on 'ok'; null otherwise (the caller keeps the one it had). */
  stamp: RowStamp | null;
};

/** Write `data` over the version `was` (the stamp of this tab's last read or write). */
export async function writeTrackerRow(
  supa: SupabaseClient,
  uid: string,
  data: unknown,
  was: RowStamp | null,
): Promise<WriteResult> {
  if (!was) return { result: 'fail', stamp: null };
  const updated_at = nextStamp(was.at);
  let rows: { updated_at?: string | null }[] | null;
  if (!was.row) {
    const r = await supa
      .from('tracker')
      .insert({ user_id: uid, data, updated_at })
      .select('updated_at');
    if (r.error) return { result: r.error.code === '23505' ? 'conflict' : 'fail', stamp: null };
    rows = r.data;
  } else {
    const q = supa.from('tracker').update({ data, updated_at }).eq('user_id', uid);
    const r = await (
      was.at === null ? q.is('updated_at', null) : q.eq('updated_at', was.at)
    ).select('updated_at');
    if (r.error) return { result: 'fail', stamp: null };
    if (!r.data?.length) return { result: 'conflict', stamp: null };
    rows = r.data;
  }
  return { result: 'ok', stamp: { row: true, at: rows?.[0]?.updated_at ?? updated_at } };
}
