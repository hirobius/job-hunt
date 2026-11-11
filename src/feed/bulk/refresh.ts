// The weekly board-discovery refresh's rules (#576 item 2, PR #584 review): how a new discovery run
// is laid over the committed board set (src/feed/data/boards.json) so a refresh never drops a board
// on a bad week, and so the weekly diff only shows boards that really changed. Pure.
//
//   - Every board already in the set is asked again (`previousCandidates`).
//   - A board that answers live keeps its line, unless its open roles moved a step (`jobsBucket`).
//   - A board that answers unknown (a timeout, a 5xx, a 429, a blocked host), that no source lists
//     any more, or that was not asked (a source that failed, --limit, --cached-only) is carried
//     forward as it is.
//   - A board that answers none (a 404) gets a miss; it is dropped only at `MAX_MISSES` weekly
//     misses in a row. Misses live in boards.json (`misses`, omitted when 0), because a GitHub runner
//     starts with no probe cache.
//   - `serializeBoardSet` writes one board per line, so an unchanged board is an unchanged line.
import { setBoardKey, type BoardSet, type SetBoard } from '../boardSet.ts';
import type { Candidate } from './harvest.ts';

/** Weekly 404s in a row before a board leaves the set. */
export const MAX_MISSES = 3;
/** A run within this many days of the set's `generated` day counts no new miss (a re-run in the
 *  same week, or a hand run between two weekly ones, must not age a board twice). */
export const MIN_DAYS_BETWEEN_MISSES = 6;

const STEPS = [1, 1.5, 2, 3, 5, 7];

/** Open roles rounded UP to the next step of 1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, …: the
 *  rotation packs batches by this count (rotation.ts `jobsBudget`), so rounding up keeps a batch
 *  inside its time box, and a board's line only changes when its count moves a step. */
export function jobsBucket(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const want = Math.ceil(n);
  for (let p = 1; ; p *= 10)
    for (const s of STEPS) {
      const v = Math.round(s * p);
      if (v >= want) return v;
    }
}

/** The set's boards as candidates, so each one is asked again this run. */
export const previousCandidates = (prev: Pick<BoardSet, 'boards'>): Candidate[] =>
  prev.boards.map((b) => ({
    board: { kind: b.kind, slug: b.slug, ...(b.eu && { eu: true as const }) },
    company: b.company ?? '',
    ...(b.website && { website: b.website }),
    sources: [],
  }));

/** One board with its keys in the file's order (a stable line). */
function ordered(b: SetBoard): SetBoard {
  return {
    kind: b.kind,
    slug: b.slug,
    ...(b.eu && { eu: true as const }),
    company: b.company,
    ...(b.website && { website: b.website }),
    ...(typeof b.jobs === 'number' && { jobs: b.jobs }),
    lastChecked: b.lastChecked,
    evidence: b.evidence,
    ...(b.misses && { misses: b.misses }),
  };
}

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

export interface CarryResult {
  boards: SetBoard[];
  /** Boards dropped this run: `MAX_MISSES` weekly 404s in a row. */
  dropped: SetBoard[];
  /** Boards that answered none this run and stay (their `misses` below the limit). */
  missed: SetBoard[];
  /** Boards kept with no answer this run (unknown, not asked, or no longer listed). */
  carried: number;
}

/** Lay one run's answers over the committed set. `run.boards` are this run's live boards (as
 *  discover.ts `toSetBoard` writes them), `run.noneKeys` the keys that answered none. */
export function carryForward(
  prev: { generated?: string; boards: SetBoard[] },
  run: { boards: SetBoard[]; noneKeys: readonly string[] },
  today: string,
): CarryResult {
  const live = new Map(run.boards.map((b) => [setBoardKey(b), b]));
  const none = new Set(run.noneKeys);
  const countsMiss =
    !prev.generated || !(dayMs(today) - dayMs(prev.generated) < MIN_DAYS_BETWEEN_MISSES * 86400e3);
  const out = new Map<string, SetBoard>();
  const dropped: SetBoard[] = [];
  const missed: SetBoard[] = [];
  let carried = 0;
  for (const old of prev.boards) {
    const key = setBoardKey(old);
    if (out.has(key)) continue;
    const now = live.get(key);
    if (now) {
      // Live again: the misses go; the line moves only when the roles move a step, or a website
      // turns up for a board that had none.
      const jobs = typeof now.jobs === 'number' ? jobsBucket(now.jobs) : undefined;
      const moved =
        jobs !== undefined && (typeof old.jobs !== 'number' || jobsBucket(old.jobs) !== jobs);
      const { misses: _gone, ...rest } = old;
      const next: SetBoard = {
        ...rest,
        ...(!old.website && now.website && { website: now.website }),
        ...(moved && { jobs, lastChecked: now.lastChecked || today }),
      };
      out.set(key, old.misses || moved || next.website !== old.website ? ordered(next) : old);
      continue;
    }
    if (none.has(key)) {
      const misses = (old.misses ?? 0) + (countsMiss ? 1 : 0);
      if (misses >= MAX_MISSES) {
        dropped.push(old);
        continue;
      }
      const next = misses === (old.misses ?? 0) ? old : ordered({ ...old, misses });
      out.set(key, next);
      if (next.misses) missed.push(next);
      continue;
    }
    carried++;
    out.set(key, old);
  }
  for (const [key, b] of live)
    if (!out.has(key))
      out.set(
        key,
        ordered({ ...b, ...(typeof b.jobs === 'number' && { jobs: jobsBucket(b.jobs) }) }),
      );
  const boards = [...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, b]) => b);
  return { boards, dropped, missed, carried };
}

/** boards.json as it is committed: one board per line, so a re-run's diff shows only the boards
 *  that changed. */
export function serializeBoardSet(set: BoardSet): string {
  return [
    '{',
    ` "generated": ${JSON.stringify(set.generated)},`,
    ` "note": ${JSON.stringify(set.note)},`,
    ` "sources": ${JSON.stringify(set.sources)},`,
    ` "counts": ${JSON.stringify(set.counts)},`,
    ' "boards": [',
    set.boards.map((b) => `  ${JSON.stringify(b)}`).join(',\n'),
    ' ]',
    '}',
    '',
  ].join('\n');
}

// ---- The refresh script's arguments (scripts/discover-boards-refresh.mjs) ----

export const SOURCE_IDS = ['hn', 'github', 'aggregator', 'commoncrawl', 'seed'] as const;
const SWITCHES = new Set(['--dry', '--cached-only', '--reuse-harvest']);
const NUMBERS = new Set(['--limit', '--from-year', '--cc-indexes']);

export const REFRESH_USAGE = `Usage: npm run discover:boards [-- <options>]

The weekly board-discovery refresh. Runs the full discovery (scripts/discover-boards.mjs: harvest
the public sources, then probe every board, the committed ones too), lays the answers over
src/feed/data/boards.json (a board is dropped only after ${MAX_MISSES} weekly 404s in a row; an unknown
answer keeps it), and checks the result. It never commits, pushes or opens a PR. A full run takes
20 to 60 minutes and reads the network.

Options (passed to discover-boards.mjs):
  --only=<ids>        Sources to read, comma separated: ${SOURCE_IDS.join(', ')}
  --limit=<n>         Probe at most n candidates (the rest are not asked; set boards are kept)
  --from-year=<yyyy>  First year of Hacker News comments (default 2014)
  --cc-indexes=<n>    Common Crawl indexes to read (default 2)
  --cached-only       Answer from the probe cache alone; ask nothing (offline)
  --reuse-harvest     Probe the last run's harvest again instead of reading the sources
  --dry               Print counts, write nothing (always ends with "no change")
  -h, --help          Print this and exit

Exit codes:
  0  a change that is safe to propose; the PR body is in node_modules/.cache/boards-refresh.md
  1  discovery failed, or a bad option; the old files are kept
  2  no change; the old files are kept, open no PR
  3  blocked as unsafe (a source failed, a kind lost over 25%, over 10% removed, or an empty
     set); the old files are kept, open no PR

Offline check: npm run discover:boards -- --only=seed --cached-only   (exits 2 with no change)`;

export type RefreshArgs = { help: true } | { error: string } | { args: string[] };

/** The refresh script's arguments, checked: `--help`, an unknown option, or what to pass on. */
export function parseRefreshArgs(argv: readonly string[]): RefreshArgs {
  if (argv.some((a) => a === '--help' || a === '-h')) return { help: true };
  for (const a of argv) {
    if (SWITCHES.has(a)) continue;
    const eq = a.indexOf('=');
    const name = eq > 0 ? a.slice(0, eq) : a;
    const value = eq > 0 ? a.slice(eq + 1) : '';
    if (name === '--only' && eq > 0) {
      const bad = value.split(',').filter((id) => !(SOURCE_IDS as readonly string[]).includes(id));
      if (!value || bad.length)
        return { error: `--only: unknown source ${bad.join(', ') || "''"}` };
      continue;
    }
    if (NUMBERS.has(name) && eq > 0) {
      if (!/^\d+$/.test(value)) return { error: `${name} needs a whole number, not '${value}'` };
      continue;
    }
    return { error: `unknown option ${a}` };
  }
  return { args: [...argv] };
}
