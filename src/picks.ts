// Daily picks (2026-11-05): the roles the scheduled Claude run hand-picks each morning, with a
// one-line fit and a drafted note to the hiring manager. They used to be a separate page (the
// "Daily Job List" artifact); now the run writes them to the user's own `daily_picks` rows through
// one token-guarded insert (supabase/migrations/20261105100000_daily_picks.sql) and Today lists
// them. This is the read model: a stored row as a pick (only http(s) links), which picks show (not
// saved, not skipped; newest day first) and what Save writes on the Job (the draft note and the fit
// line in its Notes). Signed out there is nothing to read.
// The same key a Skip is kept under (src/decided.ts postingFingerprint). Imported from score
// itself: through decided.ts the build splits score into its own first-paint chunk (+0.8 kB).
import { fingerprint as postingFingerprint } from './tracks/score';
import { dedupKey } from './store';
import { httpUrl } from './httpUrl';
import { loadSupabase } from './supabase';

export type Employment = 'employee' | 'contract' | 'unknown';

export interface DailyPick {
  id: number;
  /** The run's day, YYYY-MM-DD. */
  pickedOn: string;
  company: string;
  title: string;
  employment: Employment;
  /** As the posting states it ("$75–$90/hr"); empty when not found. */
  pay: string;
  /** YYYY-MM-DD, when the run found it. */
  postedOn?: string;
  url: string;
  /** The one-line why-it-fits. */
  why: string;
  /** The drafted note to the hiring manager. Never sent by the app. */
  note: string;
}

/** How many days of picks Today reads back. */
export const PICKS_DAYS = 14;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const day = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
};

/** A stored row as a pick, or null when it has no title or no http(s) link. */
export function pickFromRow(raw: unknown): DailyPick | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = httpUrl(str(r.url, 2000));
  const title = str(r.title, 300);
  const pickedOn = day(r.picked_on);
  if (!url || !title || !pickedOn) return null;
  const employment: Employment =
    r.employment === 'employee' || r.employment === 'contract' ? r.employment : 'unknown';
  const postedOn = day(r.posted_on);
  return {
    id: typeof r.id === 'number' ? r.id : 0,
    pickedOn,
    company: str(r.company, 200),
    title,
    employment,
    pay: str(r.pay, 120),
    ...(postedOn && { postedOn }),
    url,
    why: str(r.why, 500),
    note: str(r.note, 2000),
  };
}

/** The pick's posting fingerprint, the key a Skip is kept under (src/decided.ts). */
export const pickFingerprint = (p: Pick<DailyPick, 'company' | 'title'>) => postingFingerprint(p);

/** The picks still to look at: not saved (by link) and not skipped (by fingerprint), newest day
 *  first, the run's own order within a day. */
export function openPicks(
  picks: readonly DailyPick[],
  savedUrls: readonly string[],
  decided: { has(fp: string): boolean },
): (DailyPick & { fingerprint: string })[] {
  const saved = new Set(savedUrls.map(dedupKey));
  return picks
    .map((p, i) => ({ ...p, fingerprint: pickFingerprint(p), i }))
    .filter((p) => !saved.has(dedupKey(p.url)) && !decided.has(p.fingerprint))
    .sort((a, b) => b.pickedOn.localeCompare(a.pickedOn) || a.i - b.i)
    .map(({ i: _i, ...p }) => p);
}

const EMPLOYMENT_LABEL: Record<Employment, string> = {
  employee: 'Employee',
  contract: 'Contract',
  unknown: 'Employment not stated',
};

/** "Nov 3" for a YYYY-MM-DD day. */
export function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The pick's facts, in order: employee or contract, pay, posted day. */
export function pickFacts(p: DailyPick): string[] {
  return [
    EMPLOYMENT_LABEL[p.employment],
    p.pay || 'Pay not found',
    p.postedOn ? `Posted ${shortDay(p.postedOn)}` : 'Posted date not found',
  ];
}

/** What a Save writes in the Job's Notes: the draft note, then the fit line. */
export function pickNotes(p: DailyPick): string {
  return [
    p.note && `Draft note to the hiring manager:\n${p.note}`,
    p.why && `Why it fits: ${p.why}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The Job fields a Save writes (store.addJobDetailed). */
export function pickJobFields(p: DailyPick) {
  return {
    label: p.title,
    ...(p.company && { company: p.company }),
    ...(p.pay && { salary: p.pay }),
    ...(p.postedOn && { postedAt: p.postedOn }),
    notes: pickNotes(p),
  };
}

/** The signed-in user's picks from the last PICKS_DAYS days (RLS: own rows only). Throws on an
 *  error; the table not there yet reads as one. */
export async function loadPicks(now = new Date()): Promise<DailyPick[]> {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - PICKS_DAYS);
  const sinceDay = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  const db = await loadSupabase();
  const { data, error } = await db
    .from('daily_picks')
    .select('id, picked_on, company, title, employment, pay, posted_on, url, why, note')
    .gte('picked_on', sinceDay)
    .order('picked_on', { ascending: false })
    .order('id', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map(pickFromRow).filter((p): p is DailyPick => p !== null);
}
