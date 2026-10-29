// The bulk board set (#src-bulk): every public company job board `npm run boards:discover` found
// and confirmed live, committed as src/feed/data/boards.json. The server's scan rotation
// (supabase/functions/sync-postings, src/tracks/rotation.ts) reads all of them in turns; Today
// counts them in "Scanning N sources". This module is the one reader of the snapshot: it checks
// every entry (a known board kind, a slug the board URL parser accepts) and drops the rest, and
// keys boards the way the sync does (`boardOf`), so a board listed twice is read once. Pure, with
// explicit `.ts` specifiers so Deno and Node load it.
import type { BoardKind } from './sources/ats.ts';

/** One confirmed live board. */
export interface SetBoard {
  kind: BoardKind;
  slug: string;
  /** Lever's EU host. */
  eu?: true;
  /** The company's name as the source or the board states it. */
  company: string;
  /** The company's own site (a bare domain), when a source or the board names it. */
  website?: string;
  /** Open roles at the last check. */
  jobs?: number;
  /** YYYY-MM-DD of the last live check. */
  lastChecked: string;
  /** Why the board is the company's: where its URL was found, or how its name matched. */
  evidence: string;
}

export interface BoardSetSource {
  id: string;
  label: string;
  url: string;
  licence: string;
  /** Board URLs (or names) the source gave before merging. */
  candidates: number;
  /** '' when it read; else why not. */
  error: string;
}

export interface BoardSet {
  generated: string;
  note: string;
  sources: BoardSetSource[];
  counts: Record<string, number>;
  boards: SetBoard[];
}

export const BOARD_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Every board kind the probe asks (probe.ts `PROBE_KINDS`; kept here so Deno never loads the
 *  probe's browser storage; boardSet.test.ts pins the two lists equal). */
export const BOARD_KINDS: readonly BoardKind[] = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'recruitee',
  'smartrecruiters',
  'teamtailor',
  'personio',
  'bamboohr',
  'rippling',
  'gem',
  'pinpoint',
  'breezy',
];
const KINDS: ReadonlySet<string> = new Set(BOARD_KINDS);

/** The sync's board key: `${kind}:${slug}` lowercased, Lever EU `lever.eu:${slug}`. */
export const setBoardKey = (b: Pick<SetBoard, 'kind' | 'slug' | 'eu'>) =>
  `${b.kind === 'lever' && b.eu ? 'lever.eu' : b.kind}:${b.slug.toLowerCase()}`;

const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** One entry, checked; null when it is not a board this app can read. */
export function parseSetBoard(raw: unknown): SetBoard | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = text(o.kind);
  const slug = text(o.slug);
  if (!KINDS.has(kind) || !BOARD_SLUG.test(slug)) return null;
  const website = text(o.website).toLowerCase();
  const lastChecked = text(o.lastChecked);
  return {
    kind: kind as BoardKind,
    slug,
    ...(o.eu === true && kind === 'lever' && { eu: true as const }),
    company: text(o.company) || slug,
    ...(website && { website }),
    ...(typeof o.jobs === 'number' && o.jobs >= 0 && { jobs: Math.floor(o.jobs) }),
    lastChecked: DAY.test(lastChecked) ? lastChecked : '',
    evidence: text(o.evidence, 300),
  };
}

/** The snapshot, checked: bad entries dropped, each board once (the first entry wins), sorted by
 *  key so the rotation's cursor walks the same order on every run. */
export function parseBoardSet(raw: unknown): BoardSet {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const boards: SetBoard[] = [];
  for (const entry of Array.isArray(o.boards) ? o.boards : []) {
    const b = parseSetBoard(entry);
    if (!b) continue;
    const key = setBoardKey(b);
    if (seen.has(key)) continue;
    seen.add(key);
    boards.push(b);
  }
  boards.sort((a, b) => (setBoardKey(a) < setBoardKey(b) ? -1 : 1));
  const counts: Record<string, number> = {};
  if (o.counts && typeof o.counts === 'object')
    for (const [k, v] of Object.entries(o.counts)) if (typeof v === 'number') counts[k] = v;
  const sources = (Array.isArray(o.sources) ? o.sources : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      id: text(s.id),
      label: text(s.label),
      url: text(s.url, 500),
      licence: text(s.licence),
      candidates: typeof s.candidates === 'number' ? s.candidates : 0,
      error: text(s.error, 300),
    }));
  return { generated: text(o.generated), note: text(o.note, 1000), sources, counts, boards };
}

/** Every board's key, in rotation order. */
export const boardSetKeys = (set: BoardSet) => set.boards.map(setBoardKey);
