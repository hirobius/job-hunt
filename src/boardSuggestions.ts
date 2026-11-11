// Board suggestions (#576 item 3): boards the sync found for companies seen in the feeds (HN,
// TheirStack, ...), stored per user in `board_suggestions` (20261111100200 migration). They are
// SUGGESTIONS only: Companies lists them, and nothing is followed until the user taps Follow.
// Signed out, or before the migration is applied, there is nothing to read.
import { hasPersistedSession, loadSupabase } from './supabase';
import type { Board } from './feed/sources/ats';

export interface BoardSuggestion {
  company: string;
  board: Board;
  jobs: number;
}

const KINDS = new Set(['greenhouse', 'lever', 'ashby']);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A stored row as a suggestion, or null (the table's checks, read again on the way in). */
export function suggestionFromRow(raw: unknown): BoardSuggestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kind = typeof r.kind === 'string' ? r.kind : '';
  const slug = typeof r.slug === 'string' ? r.slug : '';
  const company = typeof r.company === 'string' ? r.company.trim().slice(0, 200) : '';
  if (!KINDS.has(kind) || !SLUG.test(slug) || !company) return null;
  return {
    company,
    board: { kind: kind as Board['kind'], slug },
    jobs: typeof r.jobs === 'number' && r.jobs > 0 ? Math.floor(r.jobs) : 0,
  };
}

/** The signed-in user's suggestions, newest first. Empty when signed out or on any error. */
export async function loadSuggestions(): Promise<BoardSuggestion[]> {
  if (!hasPersistedSession()) return [];
  try {
    const db = await loadSupabase();
    const { data, error } = await db
      .from('board_suggestions')
      .select('kind, slug, company, jobs')
      .order('found_at', { ascending: false })
      .limit(100);
    if (error) return [];
    return ((data ?? []) as unknown[])
      .map(suggestionFromRow)
      .filter((s): s is BoardSuggestion => s !== null);
  } catch {
    return [];
  }
}

/** Drop one suggestion (followed or dismissed): it is not shown again. */
export async function dismissSuggestion(b: Board): Promise<void> {
  try {
    const db = await loadSupabase();
    await db.from('board_suggestions').delete().eq('kind', b.kind).eq('slug', b.slug);
  } catch {
    // The row stays; it shows again next time, which is harmless.
  }
}
